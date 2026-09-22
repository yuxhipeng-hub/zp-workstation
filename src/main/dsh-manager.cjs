const EventEmitter = require('node:events')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const semver = require('semver')
const { CHANNELS, DEFAULT_REGISTRY, DSH_PACKAGE } = require('./constants.cjs')
const { ProcessRunner } = require('./process-runner.cjs')

function replaceAsar(pathname) {
  return pathname.replace(/app\.asar(?=\/|\\|$)/, 'app.asar.unpacked')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function uniqueVersionList(versions) {
  return [
    ...new Set(
      versions.filter(
        (version) => semver.valid(version) || semver.valid(version.replace(/^v/, '')),
      ),
    ),
  ]
}

function extractDshWebUrl(value) {
  const match = String(value || '').match(/\bdsh web:\s*(https?:\/\/\S+)/i)
  if (!match) return null
  try {
    return new URL(match[1]).toString()
  } catch {
    return null
  }
}

function parseScalar(value) {
  const trimmed = String(value || '').trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed.replace(/\s+#.*$/, '')
}

function readNestedScalar(text, sectionName, fieldName) {
  const lines = String(text || '').split(/\r?\n/)
  let inSection = false
  for (const line of lines) {
    if (new RegExp(`^${sectionName}:\\s*$`).test(line)) {
      inSection = true
      continue
    }
    if (inSection && /^\S/.test(line)) break
    if (!inSection) continue
    const match = line.match(new RegExp(`^\\s{2}${fieldName}:\\s*(.+?)\\s*$`))
    if (match) return parseScalar(match[1]) || null
  }
  return null
}

function extractDefaultModel(text) {
  return {
    provider: readNestedScalar(text, 'agent-default-model', 'provider'),
    model: readNestedScalar(text, 'agent-default-model', 'model'),
    reasoningEffort: readNestedScalar(text, 'agent-default-model', 'reasoningEffort'),
  }
}

function extractCredentialRefs(text) {
  const refs = new Set()
  let inRefs = false
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^refs:\s*$/.test(line)) {
      inRefs = true
      continue
    }
    if (inRefs && /^\S/.test(line)) break
    if (!inRefs) continue
    const match = line.match(/^\s{2}([A-Za-z_][A-Za-z0-9_.-]*):\s*/)
    if (match) refs.add(match[1])
  }
  return [...refs].sort((left, right) => left.localeCompare(right))
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function fileInfo(filePath) {
  try {
    const stats = fs.statSync(filePath)
    return {
      exists: true,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    }
  } catch {
    return {
      exists: false,
      size: 0,
      modifiedAt: null,
    }
  }
}

function responseCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const value = headers.get('set-cookie')
  return value ? [value] : []
}

function cookieHeader(headers) {
  return responseCookies(headers)
    .map((value) => String(value).split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}

function validateDeepseekApiKey(value) {
  const key = String(value || '').trim()
  if (
    key.length < 16 ||
    key.length > 256 ||
    /[\s\u0000-\u001f]/.test(key) ||
    !key.startsWith('sk-')
  ) {
    throw new Error('请输入以 sk- 开头的有效 DeepSeek API Key。')
  }
  return key
}

class DshManager extends EventEmitter {
  constructor({ app, settings, logger }) {
    super()
    this.app = app
    this.settings = settings
    this.logger = logger
    this.runner = new ProcessRunner(logger)
    this.webProcess = null
    this.webTaskId = null
    this.webUrl = null
    this.dshAuthCookie = null
    this.dshAuthBaseUrl = null
    this.dshSessionPromise = null
    this.busyTask = null
    this.registryCache = null
    this.nodeVersionCache = null
    this.npmVersionCache = null
    this.systemNodeCache = null
  }

  paths() {
    const userData = this.app.getPath('userData')
    const runtimeDir = path.join(userData, 'runtime')
    const shimDir = path.join(runtimeDir, '.bin')
    const dshPackageDir = path.join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh')
    return {
      userData,
      runtimeDir,
      shimDir,
      dshPackageDir,
      dshPackageJson: path.join(dshPackageDir, 'package.json'),
      dshBin: path.join(dshPackageDir, 'lib', 'bin.js'),
      npmCache: path.join(this.app.getPath('cache'), 'DeepSeek-Harness-Launcher', 'npm'),
      pnpmStore: path.join(this.app.getPath('cache'), 'DeepSeek-Harness-Launcher', 'pnpm-store'),
      logsDir: path.join(userData, 'logs'),
    }
  }

  resourcesPath(relative) {
    const appPath = this.app.getAppPath()
    const candidates = [
      path.join(replaceAsar(appPath), relative),
      path.join(appPath, relative),
      path.join(process.resourcesPath, 'app.asar.unpacked', relative),
      path.join(process.resourcesPath, relative),
    ]
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
  }

  npmCliPath() {
    const candidates = [
      path.join(process.resourcesPath, 'vendor', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      this.resourcesPath(path.join('vendor', 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js')),
      this.resourcesPath(path.join('node_modules', 'npm', 'bin', 'npm-cli.js')),
    ]
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
  }

  pnpmExecutablePath() {
    return this.resourcesPath(path.join('node_modules', '@pnpm', 'exe.win32-x64', 'pnpm.exe'))
  }

  nodeExecutablePath() {
    const candidates = [
      path.join(process.resourcesPath, 'vendor', 'node', 'node.exe'),
      path.join(this.app.getAppPath(), 'vendor', 'node', 'node.exe'),
    ]
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[1]
  }

  getDshHome() {
    const configured = this.settings.get().dshHome
    return path.resolve(configured || path.join(os.homedir(), '.dsh'))
  }

  getModelConfig() {
    const dshHome = this.getDshHome()
    const settingsPath = path.join(dshHome, 'settings.yaml')
    const credentialsPath = path.join(dshHome, '.credentials.yaml')
    const profileDir = this.profileDir('web')
    const settingsText = safeReadText(settingsPath) || ''
    const credentialsText = safeReadText(credentialsPath) || ''
    const defaults = extractDefaultModel(settingsText)
    const credentialRefs = extractCredentialRefs(credentialsText)

    return {
      dshHome,
      settings: {
        path: settingsPath,
        ...fileInfo(settingsPath),
      },
      credentials: {
        path: credentialsPath,
        ...fileInfo(credentialsPath),
        refs: credentialRefs,
        deepseekStored: credentialRefs.includes('DEEPSEEK_API_KEY'),
      },
      profile: {
        path: profileDir,
        ...fileInfo(profileDir),
      },
      defaultModel: defaults,
    }
  }

  dshApiBaseUrl() {
    if (!this.webUrl) return null
    const url = new URL(this.webUrl)
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  }

  async ensureDshSession() {
    const baseUrl = this.dshApiBaseUrl()
    if (!baseUrl || !this.webUrl) throw new Error('DSH Web 服务尚未就绪。')
    if (this.dshAuthCookie && this.dshAuthBaseUrl === baseUrl) return this.dshAuthCookie
    if (this.dshSessionPromise) return this.dshSessionPromise

    this.dshSessionPromise = (async () => {
      const response = await fetch(this.webUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      })
      const cookie = cookieHeader(response.headers)
      if (!cookie) throw new Error('无法建立 DSH 配置会话，请刷新后重试。')
      this.dshAuthCookie = cookie
      this.dshAuthBaseUrl = baseUrl
      return cookie
    })().finally(() => {
      this.dshSessionPromise = null
    })

    return this.dshSessionPromise
  }

  async requestDsh(method, args = {}, { autoStart = true } = {}) {
    if (!this.webProcess || this.webProcess.killed) {
      if (!autoStart) throw new Error('DSH 尚未启动。')
      await this.startWeb()
    }

    const send = async () => {
      const baseUrl = this.dshApiBaseUrl()
      if (!baseUrl) throw new Error('DSH Web 服务尚未就绪。')
      const cookie = await this.ensureDshSession()
      const response = await fetch(`${baseUrl}/api/${String(method).replace(/^\/+/, '')}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: randomUUID(),
          method,
          payload: { args },
        }),
        signal: AbortSignal.timeout(15000),
      })
      const text = await response.text()
      let payload = null
      try {
        payload = JSON.parse(text)
      } catch {
        throw new Error(`DSH 返回了无法识别的响应（HTTP ${response.status}）。`)
      }
      return { response, payload }
    }

    let result = await send()
    if ([401, 403].includes(result.response.status)) {
      this.dshAuthCookie = null
      this.dshAuthBaseUrl = null
      result = await send()
    }

    const { response, payload } = result
    if (!response.ok) {
      throw new Error(payload?.error?.message || `DSH 请求失败（HTTP ${response.status}）。`)
    }
    const remoteResult = payload?.result
    if (!remoteResult || remoteResult.ok !== true) {
      const message =
        remoteResult?.error?.message ||
        remoteResult?.error?.data?.message ||
        remoteResult?.error?.code ||
        'DSH 拒绝了本次配置操作。'
      throw new Error(message)
    }
    return remoteResult.value
  }

  async getDshModelState({ autoStart = false } = {}) {
    const local = this.getModelConfig()
    const fallback = {
      available: false,
      credential: {
        configured: Boolean(local.credentials.deepseekStored),
        writable: true,
        source: local.credentials.deepseekStored ? 'file' : undefined,
      },
      defaultModel: local.defaultModel,
      writable: false,
      error: null,
    }

    if ((!this.webProcess || this.webProcess.killed) && !autoStart) return fallback

    try {
      const credentials = await this.requestDsh(
        'credentials/describe',
        { refs: ['DEEPSEEK_API_KEY'] },
        { autoStart },
      )
      const settings = await this.requestDsh('settings/describe', {}, { autoStart })
      const namespace = (settings?.namespaces || []).find(
        (item) => item.ns === 'agent-default-model',
      )
      const defaultModel =
        namespace?.value && typeof namespace.value === 'object'
          ? {
              provider: namespace.value.provider || null,
              model: namespace.value.model || null,
              reasoningEffort: namespace.value.reasoningEffort || null,
            }
          : local.defaultModel
      return {
        available: true,
        credential: credentials?.DEEPSEEK_API_KEY || {
          configured: Boolean(local.credentials.deepseekStored),
          writable: false,
        },
        defaultModel,
        writable: Boolean(settings?.writable),
        error: null,
      }
    } catch (error) {
      return {
        ...fallback,
        error: error.message,
      }
    }
  }

  async setDeepseekApiKey(value) {
    await this.requestDsh(
      'credentials/set',
      {
        ref: 'DEEPSEEK_API_KEY',
        value: validateDeepseekApiKey(value),
      },
      { autoStart: true },
    )
    return this.getDshModelState({ autoStart: true })
  }

  async clearDeepseekApiKey() {
    await this.requestDsh('credentials/unset', { ref: 'DEEPSEEK_API_KEY' }, { autoStart: true })
    return this.getDshModelState({ autoStart: true })
  }

  buildEnvironment() {
    const paths = this.paths()
    const settings = this.settings.get()
    const env = { ...process.env }
    const nodeExecutable = this.nodeExecutablePath()
    delete env.ELECTRON_RUN_AS_NODE
    env.DSH_HOME = this.getDshHome()
    env.npm_config_registry = settings.npmRegistry || DEFAULT_REGISTRY
    env.npm_config_cache = paths.npmCache
    env.npm_config_prefix = paths.runtimeDir
    env.PNPM_HOME = paths.shimDir
    env.PNPM_STORE_DIR = paths.pnpmStore
    env.PATH = [paths.shimDir, path.dirname(nodeExecutable), env.PATH]
      .filter(Boolean)
      .join(path.delimiter)
    return env
  }

  async ensurePnpmShim() {
    const paths = this.paths()
    await fsp.mkdir(paths.shimDir, { recursive: true })
    const pnpmExecutable = this.pnpmExecutablePath()
    const command = ['@ECHO OFF', `"${pnpmExecutable}" %*`, ''].join('\r\n')
    await fsp.writeFile(path.join(paths.shimDir, 'pnpm.cmd'), command, 'utf8')
  }

  async runNodeScript(script, args, options = {}) {
    if (!fs.existsSync(script)) throw new Error(`找不到运行文件：${script}`)
    await fsp.mkdir(this.paths().npmCache, { recursive: true })
    const node = this.nodeExecutablePath()
    if (!fs.existsSync(node)) throw new Error(`找不到内置 Node.js：${node}`)
    return this.runner.run(node, [script, ...args], {
      ...options,
      env: this.buildEnvironment(),
    })
  }

  async getBundledNodeVersion() {
    if (this.nodeVersionCache) return this.nodeVersionCache
    const node = this.nodeExecutablePath()
    if (!fs.existsSync(node)) throw new Error(`找不到内置 Node.js：${node}`)
    let output = ''
    await this.runner.run(node, ['--version'], {
      scope: 'node',
      taskId: 'node-version',
      env: this.buildEnvironment(),
      onOutput: ({ line }) => {
        output = line.trim() || output
      },
    })
    this.nodeVersionCache = output.replace(/^v/, '') || 'unknown'
    return this.nodeVersionCache
  }

  async getNpmVersion() {
    if (this.npmVersionCache) return this.npmVersionCache
    let output = ''
    await this.runNodeScript(this.npmCliPath(), ['--version'], {
      scope: 'npm',
      taskId: 'npm-version',
      onOutput: ({ line }) => {
        output = line.trim() || output
      },
    })
    this.npmVersionCache = output || 'unknown'
    return this.npmVersionCache
  }

  async getSystemNode() {
    if (this.systemNodeCache !== null) return this.systemNodeCache
    return new Promise((resolve) => {
      const executable = process.platform === 'win32' ? 'where.exe' : 'which'
      this.runner
        .run(executable, ['node'], { scope: 'system-check', taskId: 'system-node' })
        .then(() => {
          this.systemNodeCache = true
          resolve(true)
        })
        .catch(() => {
          this.systemNodeCache = false
          resolve(false)
        })
    })
  }

  async getRegistryInfo(force = false) {
    if (!force && this.registryCache && Date.now() - this.registryCache.fetchedAt < 60_000) {
      return this.registryCache
    }
    const registryUrl = this.registryUrl()
    this.logger.info('registry', `检查 ${registryUrl}`)
    const response = await fetch(registryUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DeepSeek-Harness-Launcher',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`npm Registry 请求失败：HTTP ${response.status}`)
    const data = /** @type {{
      'dist-tags'?: Record<string, string>,
      versions?: Record<string, unknown>,
      time?: Record<string, string>
    }} */ (await response.json())
    const channels = {}
    for (const [id, channel] of Object.entries(CHANNELS)) {
      const version = data['dist-tags']?.[channel.registryTag]
      if (version) channels[id] = version
    }
    this.registryCache = {
      fetchedAt: Date.now(),
      channels,
      versions: Object.keys(data.versions || {}),
      times: data.time || {},
    }
    return this.registryCache
  }

  registryUrl() {
    const registry = this.settings.get().npmRegistry || DEFAULT_REGISTRY
    return `${String(registry).replace(/\/+$/, '')}/${encodeURIComponent(DSH_PACKAGE)}`
  }

  getInstalledVersion() {
    const { dshPackageJson } = this.paths()
    try {
      return readJson(dshPackageJson).version || null
    } catch (error) {
      if (error.code !== 'ENOENT')
        this.logger.warn('runtime', `读取已安装版本失败：${error.message}`)
      return null
    }
  }

  getSelectedVersion(registry = this.registryCache) {
    const channel = this.settings.get().channel
    return registry?.channels?.[channel] || null
  }

  async checkForUpdate({ force = false, silent = false } = {}) {
    const settings = this.settings.get()
    const installedVersion = this.getInstalledVersion()
    let registry
    let error = null
    try {
      registry = await this.getRegistryInfo(force)
    } catch (caught) {
      error = caught
      if (!silent) this.logger.error('update', caught.message)
    }

    const selectedVersion = this.getSelectedVersion(registry)
    let state = 'unknown'
    if (installedVersion && selectedVersion) {
      const comparison = semver.compare(selectedVersion, installedVersion)
      state = comparison > 0 ? 'update-available' : comparison === 0 ? 'current' : 'ahead'
    } else if (!installedVersion && selectedVersion) {
      state = 'not-installed'
    } else if (error) {
      state = 'error'
    }

    const result = {
      installed: Boolean(installedVersion),
      channel: settings.channel,
      channelLabel: CHANNELS[settings.channel]?.label || settings.channel,
      installedVersion,
      selectedVersion,
      latestVersion: registry?.channels?.latest || null,
      nextVersion: registry?.channels?.next || null,
      alphaVersion: registry?.channels?.alpha || null,
      state,
      updateAvailable: state === 'update-available',
      error: error?.message || null,
      checkedAt: new Date().toISOString(),
    }

    if (!silent) {
      this.settings.patch({
        lastCheckAt: result.checkedAt,
        lastKnownVersion: selectedVersion || settings.lastKnownVersion,
      })
    }
    this.emit('update-state', result)
    return result
  }

  taskState(taskId, state, label, detail = '') {
    const payload = { taskId, state, label, detail, at: new Date().toISOString() }
    this.emit('task-state', payload)
    return payload
  }

  async install(target = null, options = {}) {
    if (this.busyTask) throw new Error(`已有任务正在执行：${this.busyTask.label}`)
    const paths = this.paths()
    const settings = this.settings.get()
    const registry = await this.getRegistryInfo(true)
    const targetVersion = target || registry.channels[settings.channel]
    if (!targetVersion) throw new Error('没有找到目标版本，请检查 npm Registry 或版本通道。')

    const installedVersion = this.getInstalledVersion()
    if (installedVersion && !options.force && !semver.gt(targetVersion, installedVersion)) {
      if (semver.eq(targetVersion, installedVersion)) {
        return {
          success: true,
          skipped: true,
          version: installedVersion,
          message: '当前已经是最新版本。',
        }
      }
      throw new Error(
        `目标版本 ${targetVersion} 低于当前版本 ${installedVersion}，请明确使用切换版本操作。`,
      )
    }

    const taskId = `dsh-install-${Date.now()}`
    this.busyTask = {
      taskId,
      label: installedVersion ? '更新 DeepSeek Harness' : '安装 DeepSeek Harness',
    }
    this.taskState(taskId, 'running', this.busyTask.label, targetVersion)

    try {
      await fsp.mkdir(paths.runtimeDir, { recursive: true })
      await this.runNodeScript(
        this.npmCliPath(),
        [
          'install',
          `${DSH_PACKAGE}@${targetVersion}`,
          '--prefix',
          paths.runtimeDir,
          '--omit=dev',
          '--no-audit',
          '--no-fund',
          '--prefer-offline',
          '--fetch-retries=3',
          '--fetch-timeout=120000',
          '--install-strategy=hoisted',
          '--loglevel=info',
        ],
        {
          cwd: paths.runtimeDir,
          scope: 'dsh-install',
          taskId,
          onOutput: ({ line }) => this.taskState(taskId, 'running', this.busyTask.label, line),
        },
      )

      // npm 12 blocks dependency lifecycle scripts until they are explicitly
      // approved. DSH uses postinstall helpers for native process support, so
      // pin the official dependency tree, then rebuild after approval.
      await this.runNodeScript(
        this.npmCliPath(),
        ['approve-scripts', '--all', '--prefix', paths.runtimeDir],
        {
          cwd: paths.runtimeDir,
          scope: 'dsh-install',
          taskId,
          onOutput: ({ line }) => this.taskState(taskId, 'running', this.busyTask.label, line),
        },
      )
      await this.runNodeScript(
        this.npmCliPath(),
        ['rebuild', '--prefix', paths.runtimeDir, '--no-audit', '--no-fund'],
        {
          cwd: paths.runtimeDir,
          scope: 'dsh-install',
          taskId,
          onOutput: ({ line }) => this.taskState(taskId, 'running', this.busyTask.label, line),
        },
      )

      const version = this.getInstalledVersion()
      const history = this.settings.get().updateHistory || []
      history.unshift({
        at: new Date().toISOString(),
        from: installedVersion,
        to: version,
        channel: settings.channel,
        result: 'success',
      })
      this.settings.patch({ updateHistory: history.slice(0, 20), lastKnownVersion: version })
      this.taskState(taskId, 'success', installedVersion ? '更新完成' : '安装完成', version)
      this.emit('installed', { version })
      return { success: true, version }
    } catch (error) {
      this.logger.error('dsh-install', error.message)
      this.taskState(taskId, 'error', '安装或更新失败', error.message)
      throw error
    } finally {
      this.busyTask = null
    }
  }

  async getStatus({ quick = false } = {}) {
    const settings = this.settings.get()
    const paths = this.paths()
    const installedVersion = this.getInstalledVersion()
    let registry = this.registryCache
    let registryError = null
    if (!quick) {
      try {
        registry = await this.getRegistryInfo(false)
      } catch (error) {
        registryError = error.message
      }
    }
    const selectedVersion = this.getSelectedVersion(registry)
    let updateState = 'unknown'
    if (installedVersion && selectedVersion) {
      const comparison = semver.compare(selectedVersion, installedVersion)
      updateState = comparison > 0 ? 'update-available' : comparison === 0 ? 'current' : 'ahead'
    } else if (!installedVersion && selectedVersion) {
      updateState = 'not-installed'
    } else if (registryError) {
      updateState = 'error'
    }

    return {
      launcherVersion: this.app.getVersion(),
      installed: Boolean(installedVersion),
      installedVersion,
      selectedVersion,
      updateState,
      updateAvailable: updateState === 'update-available',
      registryError,
      channels: registry?.channels || {},
      channel: settings.channel,
      channelLabel: CHANNELS[settings.channel]?.label || settings.channel,
      dshHome: this.getDshHome(),
      runtimeDir: paths.runtimeDir,
      logsDir: paths.logsDir,
      nodeVersion: await this.getBundledNodeVersion().catch(() => 'unknown'),
      npmVersion: await this.getNpmVersion().catch(() => 'unknown'),
      systemNode: await this.getSystemNode(),
      process: this.getProcessState(),
    }
  }

  getProcessState() {
    return {
      running: Boolean(this.webProcess && !this.webProcess.killed),
      pid: this.webProcess?.pid || null,
      url: this.webUrl,
    }
  }

  isPortAvailable(port, host) {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.unref()
      server.once('error', () => resolve(false))
      server.listen({ port, host, exclusive: true }, () => {
        server.close(() => resolve(true))
      })
    })
  }

  async waitForHttp(getUrl, timeoutMs = 90000) {
    const startedAt = Date.now()
    let readyAt = null
    while (Date.now() - startedAt < timeoutMs) {
      if (!this.webProcess || this.webProcess.killed)
        throw new Error('DeepSeek Harness 进程已退出。')
      const url = typeof getUrl === 'function' ? getUrl() : getUrl
      if (!url) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        continue
      }
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
        if (response.ok || response.status < 500) {
          readyAt ||= Date.now()
          if (Date.now() - readyAt >= 1200) {
            if (!this.webProcess || this.webProcess.killed) {
              throw new Error('DeepSeek Harness 进程已退出。')
            }
            return url
          }
        } else {
          readyAt = null
        }
      } catch {
        // Service startup is still in progress.
        readyAt = null
      }
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
    throw new Error('等待 DeepSeek Harness Web UI 启动超时。')
  }

  async startWeb() {
    if (this.webProcess && !this.webProcess.killed) {
      return this.getProcessState()
    }
    if (!this.getInstalledVersion()) {
      await this.install()
    }
    await this.ensurePnpmShim()

    const dshHome = this.getDshHome()
    await fsp.mkdir(dshHome, { recursive: true })

    const settings = this.settings.get()
    const host = settings.host || '127.0.0.1'
    const port = Number(settings.port) || 3080
    if (!(await this.isPortAvailable(port, host))) {
      throw new Error(`端口 ${port} 已被占用，请在设置中更换监听端口。`)
    }

    const baseUrl = `http://${host}:${port}`
    const taskId = `dsh-web-${Date.now()}`
    this.webTaskId = taskId
    this.webUrl = baseUrl
    this.dshAuthCookie = null
    this.dshAuthBaseUrl = null
    let readyUrl = null
    this.logger.info('dsh', `启动 DeepSeek Harness Web UI：${baseUrl}`)

    const args = [
      '--expose-internals',
      this.paths().dshBin,
      'web',
      '--no-open',
      '--host',
      host,
      '--port',
      String(port),
    ]
    const child = this.runner.active.get(taskId)
    if (child) child.kill()

    const node = this.nodeExecutablePath()
    if (!fs.existsSync(node)) throw new Error(`找不到内置 Node.js：${node}`)
    const exitPromise = this.runner.run(node, args, {
      cwd: dshHome,
      scope: 'dsh',
      taskId,
      env: this.buildEnvironment(),
      onOutput: ({ line }) => {
        const matchedUrl = extractDshWebUrl(line)
        if (matchedUrl && !readyUrl) {
          readyUrl = matchedUrl
          this.webUrl = matchedUrl
          this.emit('process-state', this.getProcessState())
        }
        this.emit('process-log', { line, at: new Date().toISOString() })
      },
    })

    const childProcess = this.runner.active.get(taskId)
    this.webProcess = childProcess
    this.emit('process-state', this.getProcessState())

    exitPromise
      .catch((error) => {
        if (!this.webProcess?.killed) this.logger.error('dsh', error.message)
      })
      .finally(() => {
        if (this.webTaskId === taskId) {
          this.webProcess = null
          this.webTaskId = null
          this.webUrl = null
          this.dshAuthCookie = null
          this.dshAuthBaseUrl = null
          this.emit('process-state', this.getProcessState())
        }
      })

    const url = await this.waitForHttp(() => readyUrl)
    this.webUrl = url
    this.emit('web-ready', { url })
    return this.getProcessState()
  }

  async stopWeb() {
    if (!this.webProcess) return { success: true, stopped: false }
    const pid = this.webProcess.pid
    this.logger.info('dsh', `停止 DeepSeek Harness（PID ${pid || 'unknown'}）`)
    this.webProcess.kill()
    if (process.platform === 'win32' && pid) {
      try {
        await this.runner.run('taskkill.exe', ['/pid', String(pid), '/T', '/F'], {
          scope: 'dsh-stop',
          taskId: `dsh-stop-${Date.now()}`,
        })
      } catch {
        // Process already exited or taskkill could not find it.
      }
    }
    this.webProcess = null
    this.webTaskId = null
    this.webUrl = null
    this.dshAuthCookie = null
    this.dshAuthBaseUrl = null
    this.emit('process-state', this.getProcessState())
    return { success: true, stopped: true }
  }

  async runHeadlessTask(
    task,
    { taskId = `dsh-headless-${Date.now()}`, cwd = '', timeoutMs = 300_000 } = {},
  ) {
    const text = String(task || '').trim()
    if (!text) throw new Error('一次性任务内容不能为空。')
    if (!this.getInstalledVersion()) throw new Error('还没有安装 DeepSeek Harness。')
    const node = this.nodeExecutablePath()
    if (!fs.existsSync(node)) throw new Error(`找不到内置 Node.js：${node}`)
    const workingDirectory = cwd ? path.resolve(cwd) : this.getDshHome()
    await fsp.mkdir(workingDirectory, { recursive: true })

    const args = ['--expose-internals', this.paths().dshBin, '--profile', 'headless', text]
    let stdout = ''
    let stderr = ''
    this.taskState(taskId, 'running', 'DSH 正在整理资料', '')
    const execution = this.runner.run(node, args, {
      cwd: workingDirectory,
      scope: 'dsh-headless',
      taskId,
      env: this.buildEnvironment(),
      onOutput: ({ stream, line }) => {
        if (stream === 'stdout') stdout += `${line}\n`
        if (stream === 'stderr') stderr += `${line}\n`
      },
    })
    const timer = setTimeout(() => {
      this.runner.kill(taskId)
      this.taskState(taskId, 'error', 'DSH 任务超时', `超过 ${Math.round(timeoutMs / 1000)} 秒`)
    }, timeoutMs)
    timer.unref?.()

    try {
      await execution
      const result = stdout.trim()
      if (!result) throw new Error('DSH 没有返回可用结果。')
      this.taskState(taskId, 'success', 'DSH 整理完成', '')
      return result
    } catch (error) {
      let message = error.message
      if (/MISSING_CREDENTIAL|no API key/i.test(stderr)) {
        message = 'DSH 还没有配置 DeepSeek API Key，请先到“模型连接”页面完成配置。'
      } else {
        const detail = stderr
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-2)
          .join(' ')
        if (detail && !/^dsh: reasoning:/i.test(detail)) message = detail
      }
      this.taskState(taskId, 'error', 'DSH 整理失败', message)
      const wrapped = new Error(message)
      wrapped.cause = error
      throw wrapped
    } finally {
      clearTimeout(timer)
    }
  }

  profileDir(profile) {
    const safeProfile = String(profile || 'web').replace(/[^a-zA-Z0-9_-]/g, '')
    return path.join(this.getDshHome(), 'profiles', safeProfile || 'web')
  }

  async listPlugins(profile = 'web') {
    const directory = this.profileDir(profile)
    const manifestPath = path.join(directory, 'package.json')
    if (!fs.existsSync(manifestPath)) {
      return { profile, initialized: false, plugins: [] }
    }
    try {
      const manifest = readJson(manifestPath)
      const activeBundles = new Set(manifest.dsh?.profile?.bundles || [])
      const plugins = Object.entries(manifest.dependencies || {}).map(([name, version]) => ({
        name,
        version,
        active: activeBundles.has(name),
      }))
      return { profile, initialized: true, path: directory, plugins }
    } catch (error) {
      throw new Error(`读取插件清单失败：${error.message}`)
    }
  }

  validatePackageSpec(spec) {
    const value = String(spec || '').trim()
    if (!value || value.length > 300 || /[\u0000-\u001f]/.test(value)) {
      throw new Error('请输入有效的 npm 包名或插件规格。')
    }
    return value
  }

  async managePlugin(profile, action, spec = null) {
    const safeProfile = String(profile || 'web').replace(/[^a-zA-Z0-9_-]/g, '')
    if (!safeProfile) throw new Error('插件配置名称无效。')
    await this.ensurePnpmShim()
    const args = ['plugin', '--profile', safeProfile, action]
    if (spec) args.push(this.validatePackageSpec(spec))
    const taskId = `dsh-plugin-${Date.now()}`
    this.taskState(taskId, 'running', `插件 ${action}`, spec || safeProfile)
    try {
      await this.runNodeScript(this.paths().dshBin, args, {
        cwd: this.getDshHome(),
        scope: 'dsh-plugin',
        taskId,
        onOutput: ({ line }) => this.taskState(taskId, 'running', `插件 ${action}`, line),
      })
      this.taskState(taskId, 'success', '插件操作完成', spec || safeProfile)
      return this.listPlugins(safeProfile)
    } catch (error) {
      this.taskState(taskId, 'error', '插件操作失败', error.message)
      throw error
    }
  }

  history() {
    return this.settings.get().updateHistory || []
  }

  async shutdown() {
    await this.stopWeb()
    this.runner.killAll()
  }
}

module.exports = {
  DshManager,
  extractCredentialRefs,
  extractDefaultModel,
  extractDshWebUrl,
  uniqueVersionList,
}

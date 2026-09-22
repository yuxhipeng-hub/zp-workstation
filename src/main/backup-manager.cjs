const crypto = require('node:crypto')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const JSZip = require('jszip')
const { DEFAULT_SETTINGS } = require('./constants.cjs')

const MAGIC = Buffer.from('ZPWBACKUP1\n', 'utf8')
const ARCHIVE_EXTENSION = '.zpbackup'
const DEFAULT_REMOTE_DIR = 'ZP-Workbench'
const MAX_MATERIAL_FILES = 30_000
const MAX_MATERIAL_BYTES = 5 * 1024 * 1024 * 1024
const BACKUP_SETTING_KEYS = new Set([
  'backupEnabled',
  'backupIntervalHours',
  'backupRetention',
  'backupIncludeMaterials',
  'syncProvider',
  'syncLocalDir',
  'syncWebdavUrl',
  'syncWebdavRemoteDir',
  'syncWebdavUsername',
  'syncAutoUpload',
  'syncIntervalHours',
  'syncLastAt',
])
const MACHINE_SETTING_KEYS = new Set([
  'dshHome',
  'experimentDir',
  'syncProvider',
  'syncLocalDir',
  'syncWebdavUrl',
  'syncWebdavRemoteDir',
  'syncWebdavUsername',
  'syncAutoUpload',
  'syncLastAt',
  'jevApiBaseUrl',
  'jevLastModel',
  'jevLastAlias',
  'jevLatestReleaseDate',
  'jevLastCheckedAt',
  'jevLastError',
  'jevCompatibilityPassed',
])

function cleanText(value, maxLength = 500) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength)
}

function safeSegment(value, fallback = 'backup') {
  return (
    cleanText(value, 80)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  )
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`
}

async function pathExists(target) {
  try {
    await fsp.access(target)
    return true
  } catch {
    return false
  }
}

async function listFilesRecursive(root, prefix = '') {
  const entries = await fsp.readdir(root, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(root, entry.name)
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolute, relative)))
      continue
    }
    if (entry.isFile()) files.push({ absolute, relative: relative.replaceAll('\\', '/') })
  }
  return files
}

async function addDirectoryToZip(zip, root, prefix, counters) {
  if (!root || !(await pathExists(root))) return
  const files = await listFilesRecursive(root)
  for (const file of files) {
    counters.files += 1
    if (counters.files > MAX_MATERIAL_FILES) {
      throw new Error(`资料文件超过 ${MAX_MATERIAL_FILES} 个，已停止备份。`)
    }
    const content = await fsp.readFile(file.absolute)
    counters.bytes += content.length
    if (counters.bytes > MAX_MATERIAL_BYTES) {
      throw new Error('资料文件超过 5 GB，请关闭“包含资料文件”后重试。')
    }
    zip.file(`${prefix}/${file.relative}`, content)
  }
}

function encryptBuffer(buffer, password, metadata) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const iterations = 310_000
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
  const tag = cipher.getAuthTag()
  const header = Buffer.from(
    `${JSON.stringify({ salt: salt.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64'), iterations, metadata })}\n`,
    'utf8',
  )
  return Buffer.concat([MAGIC, header, encrypted])
}

function decryptBuffer(buffer, password) {
  if (!buffer.subarray(0, MAGIC.length).equals(MAGIC)) return buffer
  const newline = buffer.indexOf(0x0a, MAGIC.length)
  if (newline < 0) throw new Error('加密备份文件头损坏。')
  let header
  try {
    header = JSON.parse(buffer.subarray(MAGIC.length, newline).toString('utf8'))
  } catch {
    throw new Error('加密备份文件头无效。')
  }
  if (!password) throw new Error('这个备份已加密，请输入备份密码。')
  const salt = Buffer.from(header.salt || '', 'base64')
  const iv = Buffer.from(header.iv || '', 'base64')
  const tag = Buffer.from(header.tag || '', 'base64')
  const iterations = Number(header.iterations) || 310_000
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(buffer.subarray(newline + 1)), decipher.final()])
  } catch {
    throw new Error('备份密码错误，或文件已经损坏。')
  }
}

function archiveHeaderMetadata(filePath) {
  try {
    const file = fs.openSync(filePath, 'r')
    try {
      const magic = Buffer.alloc(MAGIC.length)
      if (fs.readSync(file, magic, 0, magic.length, 0) !== magic.length) return null
      if (!magic.equals(MAGIC)) return null
      const chunk = Buffer.alloc(16 * 1024)
      const bytes = fs.readSync(file, chunk, 0, chunk.length, MAGIC.length)
      const newline = chunk.subarray(0, bytes).indexOf(0x0a)
      if (newline < 0) return null
      return JSON.parse(chunk.subarray(0, newline).toString('utf8')).metadata || null
    } finally {
      fs.closeSync(file)
    }
  } catch {
    return null
  }
}

function workspaceSummary(workspace) {
  return {
    assignments: Array.isArray(workspace?.assignments) ? workspace.assignments.length : 0,
    knowledge: Array.isArray(workspace?.knowledge) ? workspace.knowledge.length : 0,
    experiments: Array.isArray(workspace?.experiments) ? workspace.experiments.length : 0,
    courses: Array.isArray(workspace?.courses) ? workspace.courses.length : 0,
  }
}

class BackupManager {
  constructor({
    userDataDir,
    appVersion = '',
    workspace,
    settings,
    safeStorage = null,
    logger = null,
    dshHomeProvider = () => settings.get().dshHome,
    skillRegistryFile = '',
    fetchImpl = fetch,
  }) {
    this.userDataDir = path.resolve(userDataDir)
    this.appVersion = appVersion
    this.workspace = workspace
    this.settings = settings
    this.safeStorage = safeStorage
    this.logger = logger
    this.dshHomeProvider = dshHomeProvider
    this.skillRegistryFile = skillRegistryFile
      ? path.resolve(skillRegistryFile)
      : path.join(this.userDataDir, 'skill-registry.json')
    this.fetchImpl = fetchImpl
    this.backupRoot = path.join(this.userDataDir, 'backups')
    this.secretFile = path.join(this.userDataDir, 'sync-secrets.bin')
    this.timer = null
    this.running = false
    this.lastError = ''
  }

  config() {
    const settings = this.settings.get()
    return {
      backupEnabled: settings.backupEnabled !== false,
      backupIntervalHours: Math.max(1, Number(settings.backupIntervalHours) || 24),
      backupRetention: Math.min(100, Math.max(3, Number(settings.backupRetention) || 20)),
      backupIncludeMaterials: settings.backupIncludeMaterials === true,
      syncProvider: ['local', 'webdav'].includes(settings.syncProvider)
        ? settings.syncProvider
        : 'none',
      syncLocalDir: cleanText(settings.syncLocalDir, 2048),
      syncWebdavUrl: cleanText(settings.syncWebdavUrl, 2048),
      syncWebdavRemoteDir:
        cleanText(settings.syncWebdavRemoteDir, 120).replace(/^\/+|\/+$/g, '') ||
        DEFAULT_REMOTE_DIR,
      syncWebdavUsername: cleanText(settings.syncWebdavUsername, 160),
      syncAutoUpload: settings.syncAutoUpload === true,
      syncIntervalHours: Math.max(1, Number(settings.syncIntervalHours) || 24),
      syncLastAt: cleanText(settings.syncLastAt, 40),
    }
  }

  patchConfig(patch = {}) {
    const next = {}
    for (const [key, value] of Object.entries(patch)) {
      if (BACKUP_SETTING_KEYS.has(key)) next[key] = value
    }
    const settings = this.settings.patch(next)
    this.startAuto()
    return this.status(settings)
  }

  loadSecrets() {
    try {
      const encrypted = fs.readFileSync(this.secretFile)
      if (!this.safeStorage?.isEncryptionAvailable?.()) return {}
      return JSON.parse(this.safeStorage.decryptString(encrypted))
    } catch (error) {
      if (error.code !== 'ENOENT') this.logger?.warn?.('backup-secret', error.message)
      return {}
    }
  }

  saveSecrets(secrets) {
    if (!this.safeStorage?.isEncryptionAvailable?.()) {
      throw new Error('当前系统无法使用安全凭据存储，不能保存 WebDAV 密码。')
    }
    const encrypted = this.safeStorage.encryptString(JSON.stringify(secrets))
    fs.mkdirSync(path.dirname(this.secretFile), { recursive: true })
    const temporary = `${this.secretFile}.tmp`
    fs.writeFileSync(temporary, encrypted)
    fs.renameSync(temporary, this.secretFile)
  }

  setSecret(key, value) {
    const secrets = this.loadSecrets()
    if (value) secrets[key] = String(value)
    else delete secrets[key]
    this.saveSecrets(secrets)
  }

  getSecret(key) {
    return this.loadSecrets()[key] || ''
  }

  hasWebdavPassword() {
    return Boolean(this.getSecret('webdavPassword'))
  }

  async listArchives() {
    await fsp.mkdir(this.backupRoot, { recursive: true })
    const entries = await fsp.readdir(this.backupRoot, { withFileTypes: true })
    const archives = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(ARCHIVE_EXTENSION)) continue
      try {
        archives.push(await this.describeArchive(entry.name))
      } catch (error) {
        this.logger?.warn?.('backup-describe', error.message)
      }
    }
    return archives.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async describeArchive(fileName) {
    const safeName = safeSegment(path.basename(fileName), 'backup')
    const filePath = path.join(this.backupRoot, safeName)
    const stat = await fsp.stat(filePath)
    const encryptedMetadata = archiveHeaderMetadata(filePath)
    if (encryptedMetadata) {
      return {
        fileName: safeName,
        filePath,
        size: stat.size,
        createdAt: encryptedMetadata.createdAt || stat.mtime.toISOString(),
        label: encryptedMetadata.label || 'backup',
        encrypted: true,
        includeMaterials: encryptedMetadata.includeMaterials === true,
        summary: encryptedMetadata.summary || null,
      }
    }
    const zip = await JSZip.loadAsync(await fsp.readFile(filePath))
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'))
    return {
      fileName: safeName,
      filePath,
      size: stat.size,
      createdAt: manifest.createdAt || stat.mtime.toISOString(),
      label: manifest.label || 'backup',
      encrypted: false,
      includeMaterials: manifest.includeMaterials === true,
      summary: manifest.summary || workspaceSummary(this.workspace.get()),
    }
  }

  async buildArchive({ label = 'manual', includeMaterials = false, password = '' } = {}) {
    const createdAt = new Date().toISOString()
    const workspace = this.workspace.get()
    const settings = this.settings.get()
    const experimentDir = cleanText(settings.experimentDir, 2048)
    const workspaceForArchive = structuredClone(workspace)
    if (experimentDir) {
      for (const item of workspaceForArchive.experiments || []) {
        const relative = path.relative(experimentDir, cleanText(item.filePath, 2048))
        if (
          relative &&
          relative !== '..' &&
          !relative.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relative)
        ) {
          item.relativePath = relative.replaceAll('\\', '/')
        }
      }
    }
    const manifest = {
      format: 'zp-workbench-backup',
      formatVersion: 1,
      appVersion: this.appVersion,
      createdAt,
      label: safeSegment(label, 'manual'),
      includeMaterials: Boolean(includeMaterials),
      experimentRoot: experimentDir,
      summary: workspaceSummary(workspace),
      encrypted: Boolean(password),
    }
    const zip = new JSZip()
    zip.file('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
    zip.file('workspace.json', `${JSON.stringify(workspaceForArchive, null, 2)}\n`)
    zip.file('settings.json', `${JSON.stringify(settings, null, 2)}\n`)
    if (this.skillRegistryFile && (await pathExists(this.skillRegistryFile))) {
      zip.file('skill-registry.json', await fsp.readFile(this.skillRegistryFile))
    }

    const dshHome = this.dshHomeProvider()
    const registry = (() => {
      try {
        return JSON.parse(fs.readFileSync(this.skillRegistryFile, 'utf8'))
      } catch {
        return { skills: {} }
      }
    })()
    for (const entry of Object.values(registry.skills || {})) {
      const directory = path.join(dshHome, 'skills', entry.name)
      await addDirectoryToZip(zip, directory, `skills/${entry.name}`, { files: 0, bytes: 0 })
    }
    if (includeMaterials) {
      const counters = { files: 0, bytes: 0 }
      await addDirectoryToZip(zip, experimentDir, 'materials', counters)
    }

    const raw = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
      platform: 'DOS',
    })
    const output = password ? encryptBuffer(raw, password, manifest) : raw
    return { buffer: output, manifest, rawSize: raw.length }
  }

  async createArchive(options = {}) {
    const result = await this.buildArchive(options)
    await fsp.mkdir(this.backupRoot, { recursive: true })
    const fileName = `workstation-${timestampForFile()}-${safeSegment(options.label, 'manual')}${ARCHIVE_EXTENSION}`
    const filePath = path.join(this.backupRoot, fileName)
    await fsp.writeFile(filePath, result.buffer)
    await this.pruneArchives()
    this.lastError = ''
    return {
      ...(await this.describeArchive(fileName)),
      rawSize: result.rawSize,
    }
  }

  async pruneArchives() {
    const retention = this.config().backupRetention
    const archives = await this.listArchives()
    for (const archive of archives.slice(retention)) {
      await fsp.rm(archive.filePath, { force: true })
    }
  }

  async exportArchive(targetPath, options = {}) {
    const rawTarget = cleanText(targetPath, 2048)
    if (!rawTarget) throw new Error('缺少导出位置。')
    const target = path.resolve(rawTarget)
    const result = await this.buildArchive(options)
    await fsp.mkdir(path.dirname(target), { recursive: true })
    const temporary = `${target}.tmp`
    await fsp.writeFile(temporary, result.buffer)
    await fsp.rename(temporary, target)
    return { filePath: target, size: result.buffer.length, manifest: result.manifest }
  }

  async restoreArchiveSource(sourcePath, password = '', { fileName = '' } = {}) {
    const source = path.resolve(sourcePath)
    if (!(await pathExists(source))) throw new Error('没有找到要恢复的备份。')
    const buffer = decryptBuffer(await fsp.readFile(source), password)
    const zip = await JSZip.loadAsync(buffer)
    const manifestFile = zip.file('manifest.json')
    const workspaceFile = zip.file('workspace.json')
    if (!manifestFile || !workspaceFile) throw new Error('这个文件不是有效的 ZP Workbench 备份。')
    const manifest = JSON.parse(await manifestFile.async('string'))
    if (manifest.format !== 'zp-workbench-backup') throw new Error('备份格式不受支持。')

    const workspace = JSON.parse(await workspaceFile.async('string'))
    if (!workspace || typeof workspace !== 'object' || !Array.isArray(workspace.assignments)) {
      throw new Error('备份中的工作站数据无效。')
    }

    const settingsFile = zip.file('settings.json')
    let restoredSettings = null
    if (settingsFile) {
      const parsed = JSON.parse(await settingsFile.async('string'))
      restoredSettings = Object.fromEntries(
        Object.entries(parsed).filter(
          ([key]) => Object.hasOwn(DEFAULT_SETTINGS, key) && !MACHINE_SETTING_KEYS.has(key),
        ),
      )
    }

    const skillEntries = Object.keys(zip.files).filter((name) => name.startsWith('skills/'))
    for (const entryName of skillEntries) {
      const entry = zip.files[entryName]
      if (entry.dir) continue
      const relative = entryName.slice('skills/'.length)
      if (
        !relative ||
        relative.split('/').some((segment) => !segment || segment === '.' || segment === '..')
      ) {
        throw new Error('备份包含不安全的 Skill 路径。')
      }
    }

    const materialEntries = Object.keys(zip.files).filter((name) => name.startsWith('materials/'))
    for (const entryName of materialEntries) {
      const entry = zip.files[entryName]
      if (entry.dir) continue
      const relative = entryName.slice('materials/'.length)
      if (
        !relative ||
        relative.split('/').some((segment) => !segment || segment === '.' || segment === '..')
      ) {
        throw new Error('备份包含不安全的资料路径。')
      }
    }

    await this.createArchive({ label: 'before-restore', includeMaterials: false })
    if (restoredSettings) this.settings.patch(restoredSettings)

    const registryFile = zip.file('skill-registry.json')
    if (registryFile) {
      await fsp.mkdir(path.dirname(this.skillRegistryFile), { recursive: true })
      await fsp.writeFile(this.skillRegistryFile, await registryFile.async('nodebuffer'))
    }

    const dshHome = this.dshHomeProvider()
    for (const entryName of skillEntries) {
      const entry = zip.files[entryName]
      if (entry.dir) continue
      const relative = entryName.slice('skills/'.length)
      const target = path.join(dshHome, 'skills', ...relative.split('/'))
      await fsp.mkdir(path.dirname(target), { recursive: true })
      await fsp.writeFile(target, await entry.async('nodebuffer'))
    }

    if (materialEntries.length) {
      const experimentDir = cleanText(this.settings.get().experimentDir, 2048)
      const materialPaths = new Map()
      for (const entryName of materialEntries) {
        const entry = zip.files[entryName]
        if (entry.dir) continue
        const relative = entryName.slice('materials/'.length)
        const target = path.join(experimentDir, ...relative.split('/'))
        await fsp.mkdir(path.dirname(target), { recursive: true })
        await fsp.writeFile(target, await entry.async('nodebuffer'))
        materialPaths.set(relative.replaceAll('\\', '/'), target)
      }
      for (const item of workspace.experiments || []) {
        const relative = cleanText(item.relativePath, 2048)
        if (!relative) continue
        const restored = materialPaths.get(relative.replaceAll('\\', '/'))
        if (restored) item.filePath = restored
      }
    }

    const restoredWorkspace = this.workspace.importWorkspaceData(workspace)
    return {
      fileName: fileName || path.basename(source),
      manifest,
      workspace: restoredWorkspace,
      settings: this.settings.get(),
    }
  }

  async restoreArchive(fileName, password = '') {
    const safeName = safeSegment(path.basename(fileName), 'backup')
    const filePath = path.join(this.backupRoot, safeName)
    return this.restoreArchiveSource(filePath, password, { fileName: safeName })
  }

  status(settings = this.settings.get()) {
    return {
      config: this.config(),
      webdavPasswordStored: this.hasWebdavPassword(),
      syncPasswordStored: Boolean(this.getSecret('syncPassword')),
      running: this.running,
      lastError: this.lastError,
      lastSyncAt: cleanText(settings.syncLastAt, 40),
    }
  }

  resolveLocalSyncDir() {
    const rawDirectory = cleanText(this.config().syncLocalDir, 2048)
    if (!rawDirectory) throw new Error('请先选择同步文件夹。')
    return path.resolve(rawDirectory)
  }

  webdavHeaders(extra = {}) {
    const config = this.config()
    if (!config.syncWebdavUrl) throw new Error('请先填写 WebDAV 地址。')
    const password = this.getSecret('webdavPassword')
    return {
      Authorization: basicAuth(config.syncWebdavUsername || 'zp', password),
      ...extra,
    }
  }

  remoteUrl(fileName = '') {
    const config = this.config()
    const base = ensureTrailingSlash(config.syncWebdavUrl)
    const directory = ensureTrailingSlash(config.syncWebdavRemoteDir)
    return new URL(`${directory}${fileName}`.replace(/\/+/g, '/'), base).toString()
  }

  async ensureWebdavDirectory() {
    const response = await this.fetchImpl(this.remoteUrl(), {
      method: 'MKCOL',
      headers: this.webdavHeaders(),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok && ![405, 409].includes(response.status)) {
      throw new Error(`无法创建 WebDAV 目录（${response.status}）。`)
    }
  }

  async testSyncTarget() {
    const config = this.config()
    if (config.syncProvider === 'local') {
      const directory = this.resolveLocalSyncDir()
      await fsp.mkdir(directory, { recursive: true })
      const probe = path.join(directory, '.zp-workbench-write-test')
      await fsp.writeFile(probe, 'ok', 'utf8')
      await fsp.rm(probe, { force: true })
      return { ok: true, provider: 'local', message: directory }
    }
    if (config.syncProvider === 'webdav') {
      await this.ensureWebdavDirectory()
      return { ok: true, provider: 'webdav', message: this.remoteUrl() }
    }
    throw new Error('请先选择同步方式。')
  }

  syncPassword() {
    const password = this.getSecret('syncPassword') || this.getSecret('syncEncryptionKey') || ''
    if (!password) {
      throw new Error('请先设置至少 8 位的同步密码，换电脑恢复时需要输入同一密码。')
    }
    return password
  }

  async uploadLatest() {
    this.running = true
    this.lastError = ''
    try {
      await this.testSyncTarget()
      const key = this.syncPassword()
      const archive = await this.buildArchive({
        label: 'sync',
        includeMaterials: this.config().backupIncludeMaterials,
        password: key,
      })
      const fileName = `ZP-Workbench-${timestampForFile()}${ARCHIVE_EXTENSION}`
      const config = this.config()
      if (config.syncProvider === 'local') {
        const target = path.join(this.resolveLocalSyncDir(), fileName)
        await fsp.writeFile(target, archive.buffer)
      } else {
        const response = await this.fetchImpl(this.remoteUrl(fileName), {
          method: 'PUT',
          headers: {
            ...this.webdavHeaders(),
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(archive.buffer.length),
          },
          body: archive.buffer,
          signal: AbortSignal.timeout(120_000),
        })
        if (!response.ok) throw new Error(`WebDAV 上传失败（${response.status}）。`)
      }
      const settings = this.settings.patch({ syncLastAt: new Date().toISOString() })
      return { fileName, size: archive.buffer.length, settings }
    } catch (error) {
      this.lastError = error.message
      throw error
    } finally {
      this.running = false
    }
  }

  async latestRemoteFile() {
    const config = this.config()
    if (config.syncProvider === 'local') {
      const directory = this.resolveLocalSyncDir()
      const entries = await fsp.readdir(directory, { withFileTypes: true })
      return (
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(ARCHIVE_EXTENSION))
          .map((entry) => ({
            name: entry.name,
            path: path.join(directory, entry.name),
            modifiedAt: fs.statSync(path.join(directory, entry.name)).mtimeMs,
          }))
          .sort((left, right) => right.modifiedAt - left.modifiedAt)[0] || null
      )
    }
    if (config.syncProvider === 'webdav') {
      await this.ensureWebdavDirectory()
      const response = await this.fetchImpl(this.remoteUrl(), {
        method: 'PROPFIND',
        headers: { ...this.webdavHeaders(), Depth: '1' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`WebDAV 列表读取失败（${response.status}）。`)
      const xml = await response.text()
      const hrefs = [...xml.matchAll(/<[^>]*href[^>]*>([^<]+)</gi)]
        .map((match) => decodeURIComponent(match[1]))
        .filter((href) => href.endsWith(ARCHIVE_EXTENSION))
        .sort()
      const href = hrefs.at(-1)
      if (!href) return null
      return { name: path.posix.basename(href), url: new URL(href, this.remoteUrl()).toString() }
    }
    throw new Error('请先选择同步方式。')
  }

  async downloadLatest() {
    const latest = await this.latestRemoteFile()
    if (!latest) throw new Error('同步位置中没有可恢复的备份。')
    const password = this.syncPassword()
    if (this.config().syncProvider === 'local') {
      if (!('path' in latest)) throw new Error('本地同步返回了无效文件。')
      return this.restoreArchiveSource(latest.path, password, { fileName: latest.name })
    }
    if (!('url' in latest)) throw new Error('WebDAV 同步返回了无效文件。')
    const response = await this.fetchImpl(latest.url, {
      headers: this.webdavHeaders(),
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`WebDAV 下载失败（${response.status}）。`)
    const temporary = path.join(
      this.userDataDir,
      'backups',
      `sync-download-${timestampForFile()}${ARCHIVE_EXTENSION}`,
    )
    await fsp.writeFile(temporary, Buffer.from(await response.arrayBuffer()))
    try {
      return await this.restoreArchiveSource(temporary, password, { fileName: latest.name })
    } finally {
      await fsp.rm(temporary, { force: true })
    }
  }

  startAuto() {
    this.stopAuto()
    const config = this.config()
    if (!config.backupEnabled && !config.syncAutoUpload) return
    const intervalMs =
      Math.min(config.backupIntervalHours, config.syncIntervalHours) * 60 * 60 * 1000
    this.timer = setInterval(
      () => {
        this.autoTick().catch((error) => {
          this.lastError = error.message
          this.logger?.warn?.('backup-auto', error.message)
        })
      },
      Math.max(intervalMs, 60 * 60 * 1000),
    )
    if (this.timer.unref) this.timer.unref()
  }

  stopAuto() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async autoTick() {
    const settings = this.settings.get()
    const config = this.config()
    if (config.backupEnabled) {
      const archives = await this.listArchives()
      const newest = archives[0] ? Date.parse(archives[0].createdAt) : 0
      if (Date.now() - newest >= config.backupIntervalHours * 60 * 60 * 1000) {
        await this.createArchive({
          label: 'auto',
          includeMaterials: config.backupIncludeMaterials,
        })
      }
    }
    const lastSync = Date.parse(cleanText(settings.syncLastAt, 40)) || 0
    if (
      config.syncAutoUpload &&
      config.syncProvider !== 'none' &&
      Date.now() - lastSync >= config.syncIntervalHours * 60 * 60 * 1000
    ) {
      await this.uploadLatest()
    }
  }
}

module.exports = {
  ARCHIVE_EXTENSION,
  BackupManager,
  decryptBuffer,
  encryptBuffer,
}

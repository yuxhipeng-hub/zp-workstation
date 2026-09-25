const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { AppActionLog } = require('./app-action-log.cjs')
const { ACTION_SCRIPT, ComputerDriver, INSPECTION_SCRIPT } = require('./computer-driver.cjs')
const { PersistentComputerService } = require('./persistent-computer-service.cjs')
const { ProcessRunner } = require('./process-runner.cjs')
const { WINDOW_PROCESS_SCRIPT, WindowProcessResolver } = require('./window-process-resolver.cjs')

const DISCOVERY_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

$items = New-Object System.Collections.Generic.List[object]

function Add-Candidate {
  param(
    [string]$ExecutablePath,
    [string]$ShortcutName,
    [string]$WorkingDirectory,
    [string]$Source,
    [string]$IconPath
  )

  $ExecutablePath = Resolve-ExecutablePath $ExecutablePath
  if ([string]::IsNullOrWhiteSpace($ExecutablePath)) { return }
  if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) { return }
  if ([IO.Path]::GetExtension($ExecutablePath).ToLowerInvariant() -ne '.exe') { return }

  $versionInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo($ExecutablePath)
  $script:items.Add([PSCustomObject]@{
    shortcutName = $ShortcutName
    executablePath = [IO.Path]::GetFullPath($ExecutablePath)
    workingDirectory = $WorkingDirectory
    source = $Source
    iconPath = $IconPath
    productName = $versionInfo.ProductName
    fileDescription = $versionInfo.FileDescription
    companyName = $versionInfo.CompanyName
    fileVersion = $versionInfo.FileVersion
    productVersion = $versionInfo.ProductVersion
  })
}

function Resolve-ExecutablePath {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  $candidate = [Environment]::ExpandEnvironmentVariables($Value.Trim())
  if ($candidate.StartsWith('"')) {
    $closingQuote = $candidate.IndexOf('"', 1)
    if ($closingQuote -gt 1) { $candidate = $candidate.Substring(1, $closingQuote - 1) }
  } else {
    $exeIndex = $candidate.IndexOf('.exe', [StringComparison]::OrdinalIgnoreCase)
    if ($exeIndex -ge 0) { $candidate = $candidate.Substring(0, $exeIndex + 4) }
  }
  return $candidate.Trim()
}

$startMenuRoots = @(
  [IO.Path]::Combine($env:ProgramData, 'Microsoft\Windows\Start Menu\Programs'),
  [IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs')
)

$shell = New-Object -ComObject WScript.Shell
foreach ($root in $startMenuRoots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  foreach ($shortcutFile in Get-ChildItem -LiteralPath $root -Filter '*.lnk' -File -Recurse) {
    $shortcut = $shell.CreateShortcut($shortcutFile.FullName)
    Add-Candidate $shortcut.TargetPath $shortcutFile.BaseName $shortcut.WorkingDirectory 'start-menu' $shortcutFile.FullName
  }
}

$appPathRoots = @(
  'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\App Paths',
  'Registry::HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\App Paths',
  'Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths'
)

foreach ($root in $appPathRoots) {
  if (-not (Test-Path -LiteralPath $root)) { continue }
  foreach ($entry in Get-ChildItem -LiteralPath $root) {
    $properties = Get-ItemProperty -LiteralPath $entry.PSPath
    $executablePath = Resolve-ExecutablePath $properties.'(default)'
    $workingDirectory = ''
    if (-not [string]::IsNullOrWhiteSpace($executablePath)) {
      try {
        $workingDirectory = [IO.Path]::GetDirectoryName($executablePath)
      } catch {
        $workingDirectory = ''
      }
    }
    Add-Candidate $executablePath ([IO.Path]::GetFileNameWithoutExtension($entry.PSChildName)) $workingDirectory 'app-paths' $executablePath
  }
}

foreach ($item in $items) {
  $item | ConvertTo-Json -Compress -Depth 4
}
`

const BLOCKED_EXECUTABLES = new Set([
  'cmd.exe',
  'conhost.exe',
  'cscript.exe',
  'mshta.exe',
  'powershell.exe',
  'pwsh.exe',
  'regedt32.exe',
  'regedit.exe',
  'wscript.exe',
])

const BLOCKED_NAME_PATTERN =
  /(crash|crashpad|helper|install|installer|report|service|setup|unins\d*|uninstall|update|updater)/i

const SOURCE_LABELS = {
  'app-paths': '应用路径',
  manual: '手动添加',
  'start-menu': '开始菜单',
}

const CATEGORY_META = {
  engineering: { label: '工程与开发', order: 0 },
  productivity: { label: '办公与效率', order: 1 },
  other: { label: '其他应用', order: 2 },
  entertainment: { label: '娱乐应用', order: 3 },
}

const ENGINEERING_PATTERN =
  /(autocad|acad\.exe|revit|inventor|fusion ?360|solidworks|catia|siemens nx|ugraf|nx\.exe|creo|solid edge|matlab|simulink|multisim|labview|proteus|keil|iar |stm32|quartus|vivado|modelsim|ansys|abaqus|comsol|originlab|tecplot|altium|kicad|eagle|intellij|idea64|visual studio|code\.exe|vscode|eclipse|android studio|pycharm|datagrip|rstudio|dbeaver|anaconda|python|julia|octave|codex|工程|仿真|开发|编程|代码|数据分析|建模)/i

const PRODUCTIVITY_PATTERN =
  /(microsoft office|winword|excel|powerpoint|wps|notion|obsidian|onenote|acrobat|reader|pdf|typora|feishu|飞书|钉钉|腾讯会议|zoom)/i

const ENTERTAINMENT_PATTERN =
  /(steam|battle\.net|epic games|riot|game|gaming|5eclient|对战平台|抖音|哔哩哔哩|爱奇艺|优酷|腾讯视频|网易云|qqmusic|kugou|music|spotify|迅雷|douyin)/i

const APP_LAUNCH_ARGUMENTS = {
  'code.exe': ['--force-renderer-accessibility'],
}

function launchArgumentsForApp(app) {
  const executableName = String(app?.executableName || '').toLocaleLowerCase('en-US')
  return [...(APP_LAUNCH_ARGUMENTS[executableName] || [])]
}

function isVSCodeApp(app) {
  return String(app?.executableName || '').toLocaleLowerCase('en-US') === 'code.exe'
}

function categorizeApp(app) {
  const haystack = [app?.displayName, app?.publisher, app?.executableName, app?.executablePath]
    .filter(Boolean)
    .join(' ')
  const id = ENGINEERING_PATTERN.test(haystack)
    ? 'engineering'
    : PRODUCTIVITY_PATTERN.test(haystack)
      ? 'productivity'
      : ENTERTAINMENT_PATTERN.test(haystack)
        ? 'entertainment'
        : 'other'
  return {
    id,
    ...CATEGORY_META[id],
  }
}

function adapterForApp(app) {
  if (isVSCodeApp(app)) {
    return {
      id: 'vscode',
      label: '深度适配',
      tier: 'deep',
    }
  }
  return {
    id: 'generic',
    label: '通用控制',
    tier: 'generic',
  }
}

function processExists(processId) {
  const pid = Number(processId)
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function isCommandPaletteEntry(node, query = '') {
  if (node?.controlType !== 'ControlType.ListItem' || !node.name || node.offscreen) return false
  if (!/monaco-list-row/.test(node.className || '')) return false
  if (/^([a-z]:|users|appdata|temp|小zp)/i.test(node.name)) return false
  if (node.name === '没有匹配的结果') return false
  const normalized = String(query || '')
    .trim()
    .toLocaleLowerCase('zh-CN')
  return !normalized || node.name.toLocaleLowerCase('zh-CN').includes(normalized)
}

function normalizeCommandQuery(value) {
  return String(value || '')
    .replace(/^>\s*/, '')
    .trim()
    .toLocaleLowerCase('zh-CN')
}

function commandCandidateScore(name, query) {
  const command = String(name || '').toLocaleLowerCase('zh-CN')
  const normalized = normalizeCommandQuery(query)
  if (!command || !normalized) return 0
  if (command === normalized) return 1000
  if (command.startsWith(normalized)) return 320
  if (command.includes(normalized)) return 180
  const terms = normalized.split(/\s+/).filter(Boolean)
  if (terms.length > 1 && terms.every((term) => command.includes(term))) return 120
  return 0
}

function isDangerousVSCodeCommand(name) {
  return /(delete|remove|uninstall|reset|clear|overwrite|publish|terminate|kill|format|删除|移除|卸载|重置|清空|覆盖|发布|终止|格式化)/i.test(
    String(name || ''),
  )
}

function selectVSCodeCommand(commands, query) {
  const ranked = (commands || [])
    .map((command, index) => ({
      command,
      index,
      score: commandCandidateScore(command.name, query),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
  if (!ranked.length) return { kind: 'none', candidates: [] }
  const best = ranked[0]
  if (best.score >= 1000)
    return { kind: 'exact', command: best.command, candidates: [best.command] }
  const tied = ranked.filter((item) => item.score === best.score).slice(0, 8)
  if (tied.length > 1 && best.score <= 320) {
    return { kind: 'ambiguous', candidates: tied.map((item) => item.command) }
  }
  return { kind: 'selected', command: best.command, candidates: [best.command] }
}

function taskVerification(status, method, evidence, reason = '') {
  return {
    status,
    method,
    evidence: String(evidence || '').slice(0, 800),
    reason: String(reason || '').slice(0, 800),
  }
}

function textFingerprint(value) {
  return createHash('sha256')
    .update(String(value || ''))
    .digest('hex')
    .slice(0, 16)
}

function inspectionFingerprint(inspection) {
  const evidence = (inspection?.nodes || [])
    .filter((node) => node.name || node.automationId)
    .map((node) => [node.name, node.automationId, node.controlType, node.selected].join('|'))
    .join('\n')
  return textFingerprint(evidence)
}

function sessionLivePid(session, checkProcess = processExists) {
  const candidates = [
    ...(Array.isArray(session?.processIds) ? session.processIds : []),
    session?.pid,
  ]
    .map(Number)
    .filter(
      (pid, index, values) => Number.isInteger(pid) && pid > 0 && values.indexOf(pid) === index,
    )
  return candidates.find((pid) => checkProcess(pid)) || null
}

function cleanText(value, maxLength = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength)
}

function createAppId(executablePath) {
  const normalized = path.resolve(executablePath).toLocaleLowerCase('en-US')
  return createHash('sha1').update(normalized).digest('hex').slice(0, 20)
}

function parseDiscoveryOutput(output) {
  const text = String(output || '')
    .replace(/^\uFEFF/, '')
    .trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (!parsed) return []
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    const parsed = []
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const item = JSON.parse(trimmed)
      if (item && typeof item === 'object') parsed.push(item)
    }
    return parsed
  }
}

function isSystemExecutable(executablePath) {
  const windowsDirectory = process.env.SystemRoot || process.env.WINDIR
  if (!windowsDirectory) return false
  const relative = path.relative(windowsDirectory, executablePath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function displayNameFor(entry, executablePath) {
  return (
    cleanText(entry.productName, 100) ||
    cleanText(entry.fileDescription, 100) ||
    cleanText(entry.shortcutName, 100) ||
    path.basename(executablePath, path.extname(executablePath))
  )
}

function normalizeDiscoveredApps(
  entries,
  { fileExists = fs.existsSync, resolveRealPath = (value) => fs.realpathSync.native(value) } = {},
) {
  const normalized = new Map()

  for (const entry of entries || []) {
    const rawPath = cleanText(entry?.executablePath, 1024)
    if (!rawPath || !path.isAbsolute(rawPath)) continue

    let executablePath
    try {
      executablePath = resolveRealPath(rawPath)
    } catch {
      executablePath = path.resolve(rawPath)
    }
    if (!fileExists(executablePath)) continue
    if (path.extname(executablePath).toLocaleLowerCase('en-US') !== '.exe') continue

    const executableName = path.basename(executablePath)
    const executableKey = executableName.toLocaleLowerCase('en-US')
    if (BLOCKED_EXECUTABLES.has(executableKey)) continue
    if (BLOCKED_NAME_PATTERN.test(executableName)) continue
    if (isSystemExecutable(executablePath)) continue

    const id = createAppId(executablePath)
    const source = cleanText(entry.source, 40) || 'start-menu'
    const displayName = displayNameFor(entry, executablePath)
    if (
      /卸载|uninstall|setup|updater/i.test(
        [entry.shortcutName, entry.fileDescription, displayName, executableName].join(' '),
      )
    ) {
      continue
    }
    const candidate = {
      id,
      displayName,
      publisher: cleanText(entry.companyName, 100),
      version: cleanText(entry.productVersion, 80) || cleanText(entry.fileVersion, 80),
      executableName,
      executablePath,
      workingDirectory: cleanText(entry.workingDirectory, 1024) || path.dirname(executablePath),
      iconPath: cleanText(entry.iconPath, 1024) || executablePath,
      source,
      sourceLabel: SOURCE_LABELS[source] || source,
    }

    const existing = normalized.get(executableKey)
    if (!existing) {
      normalized.set(executableKey, candidate)
      continue
    }

    if (
      existing.displayName === existing.executableName.replace(/\.exe$/i, '') &&
      candidate.displayName !== candidate.executableName.replace(/\.exe$/i, '')
    ) {
      existing.displayName = candidate.displayName
    }
    existing.publisher ||= candidate.publisher
    existing.version ||= candidate.version
    if (existing.source !== candidate.source) {
      existing.sourceLabel = [
        ...new Set(
          [existing.sourceLabel, candidate.sourceLabel]
            .flatMap((label) => String(label || '').split('、'))
            .filter(Boolean),
        ),
      ].join('、')
    }
  }

  return [...normalized.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName, 'zh-CN'),
  )
}

function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\s._-]+/g, ' ')
    .trim()
}

function captureSourceHandle(sourceId) {
  const match = String(sourceId || '').match(/^window:(\d+):/)
  return match ? Number(match[1]) : 0
}

function chooseCaptureSource(
  app,
  sources,
  previousSourceIds = new Set(),
  allowedHandles = new Set(),
) {
  const appName = normalizeMatchText(app?.displayName)
  const executableName = normalizeMatchText(
    String(app?.executableName || '').replace(/\.exe$/i, ''),
  )
  const appTokens = appName.split(' ').filter((token) => token.length >= 2)
  let best = null
  let bestScore = 0

  for (const source of sources || []) {
    if (!source?.id?.startsWith('window:')) continue
    const handle = captureSourceHandle(source.id)
    if (allowedHandles.size && !allowedHandles.has(handle)) continue
    const title = normalizeMatchText(source.name)
    if (!title) continue
    if (/zp workbench|deepseek harness|program manager|task switching/.test(title)) continue

    let score = previousSourceIds.has(source.id) ? 0 : 32
    if (allowedHandles.has(handle)) score += 240
    if (appName && title.includes(appName)) score += 120
    if (executableName && title.includes(executableName)) score += 72
    score += appTokens.filter((token) => title.includes(token)).length * 18
    if (score > bestScore) {
      best = source
      bestScore = score
    }
  }

  return bestScore >= 32 ? best : null
}

function normalizeStoredState(value) {
  const source = value && typeof value === 'object' ? value : {}
  const preferences = {}
  for (const [id, preference] of Object.entries(source.preferences || {})) {
    if (!/^[a-f0-9]{20}$/.test(id) || !preference || typeof preference !== 'object') continue
    preferences[id] = {
      favorite: Boolean(preference.favorite),
      lastLaunchedAt: cleanText(preference.lastLaunchedAt, 40),
    }
  }
  return {
    schemaVersion: 1,
    catalog: {
      scannedAt: cleanText(source.catalog?.scannedAt, 40),
      apps: Array.isArray(source.catalog?.apps) ? source.catalog.apps : [],
    },
    preferences,
  }
}

class AppHostStore {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, 'app-host.json')
    this.data = this.load()
  }

  load() {
    try {
      return normalizeStoredState(JSON.parse(fs.readFileSync(this.filePath, 'utf8')))
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to read app host store, using defaults:', error)
      }
      return normalizeStoredState(null)
    }
  }

  getCatalog() {
    return {
      scannedAt: this.data.catalog.scannedAt,
      apps: this.data.catalog.apps.map((app) => ({ ...app })),
    }
  }

  getPreferences() {
    return Object.fromEntries(
      Object.entries(this.data.preferences).map(([id, value]) => [id, { ...value }]),
    )
  }

  setCatalog(apps) {
    this.data.catalog = {
      scannedAt: new Date().toISOString(),
      apps: apps.map((app) => ({ ...app })),
    }
    this.save()
    return this.getCatalog()
  }

  setFavorite(id, favorite) {
    const current = this.data.preferences[id] || {}
    this.data.preferences[id] = {
      favorite: Boolean(favorite),
      lastLaunchedAt: current.lastLaunchedAt || '',
    }
    this.save()
  }

  recordLaunch(id) {
    const current = this.data.preferences[id] || {}
    this.data.preferences[id] = {
      favorite: Boolean(current.favorite),
      lastLaunchedAt: new Date().toISOString(),
    }
    this.save()
  }

  removePreference(id) {
    delete this.data.preferences[id]
    this.save()
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    fs.renameSync(temporary, this.filePath)
  }
}

class AppHostManager {
  constructor({
    app,
    logger,
    desktopCapturer,
    runner = new ProcessRunner(logger),
    spawnImpl = spawn,
    delayImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    computerDriver = null,
    actionLog = null,
    windowResolver = null,
    persistentService = null,
    platform = process.platform,
  }) {
    this.app = app
    this.logger = logger
    this.desktopCapturer = desktopCapturer
    this.runner = runner
    this.persistentService =
      persistentService ||
      new PersistentComputerService({
        logger,
        inspectionScript: INSPECTION_SCRIPT,
        actionScript: ACTION_SCRIPT,
        windowScript: WINDOW_PROCESS_SCRIPT,
      })
    this.computerDriver =
      computerDriver ||
      new ComputerDriver({
        logger,
        runner,
        persistentService: this.persistentService,
      })
    this.actionLog = actionLog || new AppActionLog(app.getPath('userData'))
    this.windowResolver =
      windowResolver ||
      new WindowProcessResolver({
        logger,
        runner,
        persistentService: this.persistentService,
      })
    this.spawnImpl = spawnImpl
    this.delayImpl = delayImpl
    this.platform = platform
    this.store = new AppHostStore(app.getPath('userData'))
    this.catalog = this.store.getCatalog().apps
    this.sessions = new Map()
    this.pendingCaptureSources = new Map()
    this.iconCache = new Map()
    this.iconPromises = new Map()
    this.sequence = 0
  }

  async pruneSessions() {
    for (const [sessionId, session] of this.sessions.entries()) {
      const livePid = sessionLivePid(session)
      if (livePid) {
        session.pid = livePid
        continue
      }
      const windows = session.pid ? await this.windowResolver.resolve(session.pid) : []
      const liveWindow = windows.find((window) => processExists(window.processId))
      if (liveWindow) {
        session.pid = liveWindow.processId
        session.processIds = [...new Set([...(session.processIds || []), liveWindow.processId])]
        continue
      }
      this.sessions.delete(sessionId)
    }
  }

  async scan() {
    if (this.platform !== 'win32') return []
    const encodedCommand = Buffer.from(DISCOVERY_SCRIPT, 'utf16le').toString('base64')
    const result = await this.runner.run(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
      {
        scope: 'app-catalog',
        taskId: `app-catalog-${Date.now()}`,
        captureOutput: true,
      },
    )
    const apps = normalizeDiscoveredApps(parseDiscoveryOutput(result.stdout))
    const manualApps = this.catalog.filter((app) => app.source === 'manual')
    const merged = new Map(apps.map((app) => [app.id, app]))
    for (const app of manualApps) {
      if (!merged.has(app.id)) merged.set(app.id, app)
    }
    this.catalog = [...merged.values()]
    this.store.setCatalog(this.catalog)
    this.logger.info('app-catalog', `发现 ${this.catalog.length} 个可启动工具`)
    return this.catalog
  }

  serializeApp(app) {
    const preference = this.store.getPreferences()[app.id] || {}
    const session = [...this.sessions.values()].find((item) => item.appId === app.id)
    const adapter = adapterForApp(app)
    const category = categorizeApp(app)
    return {
      id: app.id,
      displayName: app.displayName,
      publisher: app.publisher,
      version: app.version,
      executableName: app.executableName,
      sourceLabel: app.sourceLabel,
      favorite: Boolean(preference.favorite),
      lastLaunchedAt: preference.lastLaunchedAt || '',
      running: Boolean(session),
      sessionId: session?.id || null,
      adapter: adapter.id,
      adapterLabel: adapter.label,
      adapterTier: adapter.tier,
      category: category.id,
      categoryLabel: category.label,
      categoryOrder: category.order,
    }
  }

  async addManualApp(executablePath) {
    const resolved = path.resolve(String(executablePath || ''))
    const apps = normalizeDiscoveredApps([
      {
        executablePath: resolved,
        shortcutName: path.basename(resolved, path.extname(resolved)),
        source: 'manual',
      },
    ])
    const app = apps[0]
    if (!app) throw new Error('所选文件不是可用的 Windows 可执行程序。')
    const existingIndex = this.catalog.findIndex((item) => item.id === app.id)
    if (existingIndex >= 0) this.catalog[existingIndex] = app
    else this.catalog.push(app)
    this.store.setCatalog(this.catalog)
    this.logger.info('app-catalog', `手动添加工具：${app.displayName}`)
    return this.serializeApp(app)
  }

  removeApp(id) {
    const app = this.findApp(id)
    if (!app) throw new Error('没有找到这个工具。')
    const running = [...this.sessions.values()].some((session) => session.appId === id)
    if (running) throw new Error('请先停止这个工具，再从工具台移除。')
    this.catalog = this.catalog.filter((item) => item.id !== id)
    this.store.setCatalog(this.catalog)
    this.store.removePreference(id)
    return true
  }

  async list({ refresh = false } = {}) {
    await this.pruneSessions()
    if ((!this.catalog.length && !this.store.getCatalog().scannedAt) || refresh) {
      await this.scan()
    }
    return this.catalog
      .map((app) => this.serializeApp(app))
      .sort((left, right) => {
        if (left.categoryOrder !== right.categoryOrder) {
          return left.categoryOrder - right.categoryOrder
        }
        if (left.favorite !== right.favorite) return left.favorite ? -1 : 1
        const leftTime = Date.parse(left.lastLaunchedAt) || 0
        const rightTime = Date.parse(right.lastLaunchedAt) || 0
        if (leftTime !== rightTime) return rightTime - leftTime
        return left.displayName.localeCompare(right.displayName, 'zh-CN')
      })
  }

  findApp(id) {
    return this.catalog.find((app) => app.id === id) || null
  }

  async getIcon(id) {
    if (this.iconCache.has(id)) return this.iconCache.get(id)
    if (this.iconPromises.has(id)) return this.iconPromises.get(id)

    const promise = (async () => {
      const app = this.findApp(id)
      if (!app || !this.app?.getFileIcon) return null
      const sources = [
        app.iconPath,
        app.executablePath,
        ...(app.source === 'start-menu' ? [app.executablePath] : []),
      ].filter((value, index, values) => value && values.indexOf(value) === index)

      for (const source of sources) {
        try {
          const image = await this.app.getFileIcon(source, { size: 'large' })
          if (!image || image.isEmpty()) continue
          const resized = image.resize({ width: 48, height: 48, quality: 'best' })
          if (resized.isEmpty()) continue
          const dataUrl = `data:image/png;base64,${resized.toPNG().toString('base64')}`
          this.iconCache.set(id, dataUrl)
          return dataUrl
        } catch {
          // Try the executable path when a shortcut icon cannot be resolved.
        }
      }
      this.iconCache.set(id, null)
      return null
    })().finally(() => {
      this.iconPromises.delete(id)
    })

    this.iconPromises.set(id, promise)
    return promise
  }

  async windowSources() {
    if (!this.desktopCapturer) return []
    return this.desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    })
  }

  async findCaptureSource(app, previousSourceIds, timeoutMs = 6000, processId = null) {
    const deadline = Date.now() + timeoutMs
    let latestWindows = []
    while (Date.now() <= deadline) {
      const sources = await this.windowSources()
      const windows = processId ? await this.windowResolver.resolve(processId) : []
      if (windows.length) latestWindows = windows
      const allowedHandles = new Set(
        windows.filter((window) => window.visible).map((window) => Number(window.handle)),
      )
      const source = chooseCaptureSource(app, sources, previousSourceIds, allowedHandles)
      if (source) {
        const sourceHandle = captureSourceHandle(source.id)
        const matchingWindow = windows.find((window) => Number(window.handle) === sourceHandle)
        return {
          sourceId: source.id,
          sourceName: source.name,
          processId: matchingWindow?.processId || processId || null,
          processIds: windows
            .filter((window) => window.visible)
            .map((window) => Number(window.processId))
            .filter(
              (pid, index, values) =>
                Number.isInteger(pid) && pid > 0 && values.indexOf(pid) === index,
            ),
        }
      }
      if (Date.now() < deadline) await this.delayImpl(350)
    }
    const visibleWindows = latestWindows.filter((window) => window.visible)
    if (visibleWindows.length) {
      return {
        sourceId: null,
        sourceName: '',
        processId: visibleWindows[0].processId,
        processIds: visibleWindows
          .map((window) => Number(window.processId))
          .filter(
            (pid, index, values) =>
              Number.isInteger(pid) && pid > 0 && values.indexOf(pid) === index,
          ),
      }
    }
    return null
  }

  spawnApplication(app, args = launchArgumentsForApp(app)) {
    return new Promise((resolve, reject) => {
      const child = this.spawnImpl(app.executablePath, args, {
        cwd: app.workingDirectory || path.dirname(app.executablePath),
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolve(child)
      })
    })
  }

  async launch(appId) {
    const app = this.findApp(appId)
    if (!app) throw new Error('没有找到这个工具，请重新扫描。')
    if (!fs.existsSync(app.executablePath)) {
      throw new Error(`${app.displayName} 的安装路径已经失效，请重新扫描。`)
    }

    const previousSources = await this.windowSources()
    const previousSourceIds = new Set(previousSources.map((source) => source.id))
    const child = await this.spawnApplication(app)
    const session = {
      id: `tool-session-${Date.now()}-${++this.sequence}`,
      appId: app.id,
      displayName: app.displayName,
      pid: child.pid || null,
      executableName: app.executableName,
      startedAt: new Date().toISOString(),
      capture: null,
      processIds: child.pid ? [child.pid] : [],
    }
    this.sessions.set(session.id, session)
    this.store.recordLaunch(app.id)
    const resolution = await this.findCaptureSource(app, previousSourceIds, 6000, session.pid)
    session.capture = resolution?.sourceId ? resolution : null
    if (resolution?.processId) session.pid = resolution.processId
    if (resolution?.processIds?.length) {
      session.processIds = [...new Set([...(session.processIds || []), ...resolution.processIds])]
    }
    this.actionLog.append({
      appId: app.id,
      sessionId: session.id,
      displayName: app.displayName,
      kind: 'launch',
      action: 'launch',
      effect: 'confirmed',
      confirmed: true,
      detail: { executableName: app.executableName },
    })
    return { session: { ...session }, capture: session.capture }
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId)
    return session ? { ...session } : null
  }

  async inspectSessionProcess(session, options = {}) {
    if (!session) throw new Error('工具会话尚未运行。')
    const processIds = [...new Set([session.pid, ...(session.processIds || [])].filter(Boolean))]
    let lastError = null
    for (const processId of processIds) {
      try {
        const inspection = await this.computerDriver.inspectProcess(processId, options)
        if (inspection.available) {
          session.pid = Number(processId)
          return inspection
        }
      } catch (error) {
        lastError = error
      }
    }
    const appName = normalizeMatchText(session.displayName)
    const executableName = normalizeMatchText(
      String(session.executableName || '').replace(/\.exe$/i, ''),
    )
    const titleWindows = (await this.windowResolver.resolveAll())
      .filter((window) => window.visible)
      .filter((window) => {
        const title = normalizeMatchText(window.title)
        if (!title) return false
        return (
          (appName && title.includes(appName)) || (executableName && title.includes(executableName))
        )
      })
    for (const processId of [...new Set(titleWindows.map((window) => Number(window.processId)))]) {
      if (!processId || processIds.includes(processId)) continue
      try {
        const inspection = await this.computerDriver.inspectProcess(processId, options)
        if (inspection.available) {
          session.pid = processId
          session.processIds = [...new Set([...(session.processIds || []), processId])]
          return inspection
        }
      } catch (error) {
        lastError = error
      }
    }
    throw lastError || new Error('没有找到可访问的目标窗口。')
  }

  async prepareCapture(sessionId, senderId) {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('工具会话已经结束。')
    const app = this.findApp(session.appId)
    if (!session.capture?.sourceId && app) {
      const resolution = await this.findCaptureSource(app, new Set(), 2500, session.pid)
      session.capture = resolution?.sourceId ? resolution : null
      if (resolution?.processId) session.pid = resolution.processId
      if (resolution?.processIds?.length) {
        session.processIds = [...new Set([...(session.processIds || []), ...resolution.processIds])]
      }
    }
    if (!session.capture?.sourceId) return null
    this.pendingCaptureSources.set(senderId, session.capture.sourceId)
    return { ...session.capture }
  }

  async inspectSession(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session?.pid) throw new Error('工具会话尚未运行。')
    const inspection = await this.inspectSessionProcess(session)
    return {
      sessionId,
      appId: session.appId,
      displayName: session.displayName,
      ...inspection,
    }
  }

  async executeSessionAction(sessionId, request = {}) {
    const session = this.sessions.get(sessionId)
    if (!session?.pid) throw new Error('工具会话尚未运行。')
    await this.inspectSessionProcess(session, { maxDepth: 1, maxNodes: 10 })
    const result = await this.computerDriver.executeAction(session.pid, request)
    this.actionLog.append({
      appId: session.appId,
      sessionId,
      displayName: session.displayName,
      kind: 'element',
      action: String(request.action || ''),
      selector: request.selector || null,
      effect: result.effect,
      confirmed: result.confirmed,
      error: result.error || '',
    })
    return {
      sessionId,
      appId: session.appId,
      displayName: session.displayName,
      ...result,
    }
  }

  async openSessionPath(sessionId, targetPath, line = 1) {
    const session = this.sessions.get(sessionId)
    const app = session ? this.findApp(session.appId) : null
    if (!session || !app) throw new Error('工具会话尚未运行。')
    if (!isVSCodeApp(app)) throw new Error('当前只有 VS Code 支持直接打开路径。')
    const resolved = path.resolve(String(targetPath || ''))
    if (!fs.existsSync(resolved)) throw new Error('目标文件或目录不存在。')
    const stats = fs.statSync(resolved)
    const beforeInspection = await this.inspectSessionProcess(session, {
      maxDepth: 16,
      maxNodes: 1800,
    })
    const beforeFingerprint = inspectionFingerprint(beforeInspection)
    const args = stats.isDirectory()
      ? ['--reuse-window', resolved]
      : ['--reuse-window', '--goto', `${resolved}:${Math.max(1, Number(line) || 1)}:1`]
    await this.spawnApplication(app, args)
    await this.delayImpl(700)
    const expectedName = path.basename(resolved)
    const inspection = await this.inspectSessionProcess(session, {
      maxDepth: 16,
      maxNodes: 1800,
    })
    const afterFingerprint = inspectionFingerprint(inspection)
    const evidenceNode = inspection.nodes.find(
      (node) =>
        node.name &&
        (node.name.includes(resolved) ||
          node.name.toLocaleLowerCase('zh-CN').includes(expectedName.toLocaleLowerCase('zh-CN'))) &&
        !node.offscreen,
    )
    const evidenceChanged = beforeFingerprint !== afterFingerprint
    const verification =
      evidenceNode && evidenceChanged
        ? taskVerification(
            'VERIFIED',
            'vscode-uia-before-after',
            evidenceNode.name,
            `界面证据发生变化并出现了 ${expectedName}`,
          )
        : evidenceNode
          ? taskVerification(
              'COMPLETED_UNVERIFIED',
              'vscode-uia-before-after',
              evidenceNode.name,
              `界面中已有 ${expectedName}，但无法确认本次打开造成了变化`,
            )
          : taskVerification(
              'COMPLETED_UNVERIFIED',
              'vscode-uia-before-after',
              '',
              `没有在界面中找到 ${expectedName}`,
            )
    this.actionLog.append({
      appId: app.id,
      sessionId,
      displayName: app.displayName,
      kind: 'open-path',
      action: `open-${stats.isDirectory() ? 'directory' : 'file'}`,
      effect: verification.status,
      detail: {
        path: resolved,
        line: Math.max(1, Number(line) || 1),
        verification,
        beforeFingerprint,
        afterFingerprint,
      },
    })
    return {
      opened: true,
      path: resolved,
      kind: stats.isDirectory() ? 'directory' : 'file',
      status: verification.status,
      verification,
    }
  }

  async listVSCodeCommands(sessionId, query = '') {
    const session = this.sessions.get(sessionId)
    const app = session ? this.findApp(session.appId) : null
    if (!session || !app || !isVSCodeApp(app)) {
      throw new Error('当前会话不是 VS Code。')
    }

    let inspection = await this.inspectSessionProcess(session, {
      maxDepth: 16,
      maxNodes: 1800,
    })
    const findCommandInput = (nodes) =>
      nodes.find(
        (node) =>
          node.controlType === 'ControlType.Edit' &&
          /命令|command/i.test(node.name || '') &&
          (node.patterns || []).some((pattern) => pattern.includes('ValuePattern')),
      )
    let input = findCommandInput(inspection.nodes)
    if (!input) {
      const viewMenu = inspection.nodes.find(
        (node) =>
          node.controlType === 'ControlType.MenuItem' &&
          /^(查看|View)$/i.test(node.name || '') &&
          (node.patterns || []).some((pattern) => pattern.includes('ExpandCollapsePattern')),
      )
      if (viewMenu) {
        await this.computerDriver.executeAction(session.pid, {
          action: 'expand',
          selector: {
            name: viewMenu.name,
            controlType: viewMenu.controlType,
          },
        })
        await this.delayImpl(350)
        inspection = await this.inspectSessionProcess(session, {
          maxDepth: 16,
          maxNodes: 2000,
        })
      }
      const paletteItem = inspection.nodes.find(
        (node) =>
          node.controlType === 'ControlType.MenuItem' &&
          /命令面板|command palette/i.test(node.name || '') &&
          (node.patterns || []).some((pattern) => pattern.includes('InvokePattern')),
      )
      if (paletteItem) {
        await this.computerDriver.executeAction(session.pid, {
          action: 'invoke',
          selector: {
            name: paletteItem.name,
            controlType: paletteItem.controlType,
          },
        })
        await this.delayImpl(500)
      }
    }

    inspection = await this.inspectSessionProcess(session, {
      maxDepth: 16,
      maxNodes: 1800,
    })
    input = findCommandInput(inspection.nodes)
    if (!input) throw new Error('没有找到 VS Code 命令输入框。')

    if (String(query || '').trim()) {
      await this.computerDriver.executeAction(session.pid, {
        action: 'setValue',
        selector: {
          path: input.path,
          name: input.name,
          controlType: input.controlType,
        },
        value: `>${String(query).replace(/^>\s*/, '').slice(0, 240)}`,
      })
      await this.delayImpl(1200)
      inspection = await this.inspectSessionProcess(session, {
        maxDepth: 16,
        maxNodes: 2200,
      })
    }

    return {
      input: {
        path: input.path,
        name: input.name,
        controlType: input.controlType,
      },
      commands: inspection.nodes
        .filter((node) => isCommandPaletteEntry(node, query))
        .slice(0, 30)
        .map((node) => ({
          path: node.path,
          name: node.name,
          automationId: node.automationId,
          controlType: node.controlType,
          patterns: node.patterns || [],
        })),
    }
  }

  async runVSCodeCommand(sessionId, query, { confirmed = false } = {}) {
    const session = this.sessions.get(sessionId)
    const app = session ? this.findApp(session.appId) : null
    if (!session || !app || !isVSCodeApp(app)) {
      throw new Error('当前会话不是 VS Code。')
    }
    const result = await this.listVSCodeCommands(sessionId, query)
    const selected = selectVSCodeCommand(result.commands, query)
    if (selected.kind === 'none') throw new Error(`没有找到匹配“${query}”的 VS Code 命令。`)
    if (selected.kind === 'ambiguous') {
      this.actionLog.append({
        appId: app.id,
        sessionId,
        displayName: app.displayName,
        kind: 'command',
        action: String(query),
        effect: 'selection-required',
        detail: { candidates: selected.candidates.slice(0, 8) },
      })
      return {
        needsSelection: true,
        query: String(query),
        candidates: selected.candidates,
      }
    }
    const command = selected.command
    if (isDangerousVSCodeCommand(command.name) && !confirmed) {
      this.actionLog.append({
        appId: app.id,
        sessionId,
        displayName: app.displayName,
        kind: 'command',
        action: command.name,
        effect: 'confirmation-required',
      })
      return {
        requiresConfirmation: true,
        command: command.name,
      }
    }
    const patterns = (command.patterns || []).join(' ')
    const beforeInspection = await this.inspectSessionProcess(session, {
      maxDepth: 18,
      maxNodes: 2400,
    })
    const beforeFingerprint = inspectionFingerprint(beforeInspection)
    let beforeOutput = null
    if (/show output|显示输出|输出:/i.test(command.name)) {
      try {
        beforeOutput = await this.readVSCodeOutput(sessionId)
      } catch {
        beforeOutput = null
      }
    }
    let actionResult
    if (patterns.includes('InvokePattern')) {
      actionResult = await this.computerDriver.executeAction(session.pid, {
        action: 'invoke',
        selector: command,
      })
    } else if (patterns.includes('SelectionItemPattern')) {
      actionResult = await this.computerDriver.executeAction(session.pid, {
        action: 'select',
        selector: command,
      })
      await this.computerDriver.executeAction(session.pid, {
        action: 'sendKeys',
        selector: {
          path: result.input.path,
          name: result.input.name,
          controlType: result.input.controlType,
        },
        value: '{ENTER}',
      })
    } else {
      throw new Error('匹配到的命令无法通过当前接口调用。')
    }
    await this.delayImpl(350)
    let verification = taskVerification(
      'COMPLETED_UNVERIFIED',
      'vscode-command-executed',
      command.name,
      '命令已发送，但没有配置专用结果检查。',
    )
    if (/show output|显示输出|输出:/i.test(command.name)) {
      try {
        const output = await this.readVSCodeOutput(sessionId)
        const changed =
          textFingerprint(beforeOutput?.text || '') !== textFingerprint(output.text || '')
        if (output.source === 'output' && output.text && changed) {
          verification = taskVerification(
            'VERIFIED',
            'vscode-output-before-after',
            output.text.slice(-500),
            '输出面板内容在命令执行后发生了变化。',
          )
        } else if (output.source === 'output') {
          verification = taskVerification(
            'COMPLETED_UNVERIFIED',
            'vscode-output-before-after',
            output.activePanel,
            '输出面板已打开，但没有检测到新的输出文本。',
          )
        }
      } catch {
        // Keep the unverified default when readback fails.
      }
    } else if (/terminal|终端/i.test(command.name)) {
      const inspection = await this.inspectSessionProcess(session, {
        maxDepth: 18,
        maxNodes: 2200,
      })
      const terminalTab = inspection.nodes.find(
        (node) =>
          node.controlType === 'ControlType.TabItem' &&
          /终端|Terminal/i.test(node.name || '') &&
          node.selected,
      )
      const wasSelected = beforeInspection.nodes.some(
        (node) =>
          node.controlType === 'ControlType.TabItem' &&
          /终端|Terminal/i.test(node.name || '') &&
          node.selected,
      )
      if (terminalTab && !wasSelected) {
        verification = taskVerification(
          'VERIFIED',
          'vscode-terminal-before-after',
          terminalTab.name,
          '终端标签由未选中变为选中。',
        )
      }
    }
    this.actionLog.append({
      appId: app.id,
      sessionId,
      displayName: app.displayName,
      kind: 'command',
      action: command.name,
      effect: verification.status,
      confirmed: Boolean(actionResult.confirmed),
      error: actionResult.error || verification.reason,
      detail: {
        verification,
        beforeFingerprint,
        afterFingerprint: inspectionFingerprint(
          await this.inspectSessionProcess(session, {
            maxDepth: 18,
            maxNodes: 2400,
          }),
        ),
      },
    })
    return {
      command: command.name,
      effect: actionResult.effect || 'unverifiable',
      confirmed: Boolean(actionResult.confirmed),
      status: verification.status,
      verification,
    }
  }

  async readVSCodeOutput(sessionId) {
    const session = this.sessions.get(sessionId)
    const app = session ? this.findApp(session.appId) : null
    if (!session || !app || !isVSCodeApp(app)) {
      throw new Error('当前会话不是 VS Code。')
    }
    const inspection = await this.inspectSessionProcess(session, {
      maxDepth: 18,
      maxNodes: 2400,
    })
    const panelTabs = inspection.nodes.filter(
      (node) =>
        node.controlType === 'ControlType.TabItem' &&
        /问题|输出|调试控制台|终端|端口|Problems|Output|Debug Console|Terminal|Ports/i.test(
          node.name || '',
        ),
    )
    const activePanel =
      panelTabs.find((node) => node.selected)?.name ||
      panelTabs.find((node) => /checked|selected|active/i.test(node.className || ''))?.name ||
      panelTabs[0]?.name ||
      '未知面板'
    const source = /终端|Terminal/i.test(activePanel)
      ? 'terminal'
      : /输出|Output/i.test(activePanel)
        ? 'output'
        : 'unknown'
    const candidates = inspection.nodes
      .filter(
        (node) =>
          (node.patterns || []).some((pattern) => pattern.includes('TextPattern')) &&
          (/xterm|terminal|panel|output/i.test(
            [node.name, node.className, node.automationId].join(' '),
          ) ||
            node.controlType === 'ControlType.Document'),
      )
      .slice(0, 8)
    const fragments = []
    for (const node of candidates) {
      const result = await this.computerDriver.executeAction(session.pid, {
        action: 'readText',
        selector: {
          path: node.path,
          name: node.name,
          automationId: node.automationId,
          controlType: node.controlType,
        },
      })
      const text = String(result.text || '').trim()
      if (text) fragments.push(text)
    }
    let text = [...new Set(fragments)].join('\n').trim()
    let contentLines = text.replace(/\uFFFC/g, ' ').split(/\r?\n/)
    const portsIndex = contentLines.findIndex((line) => /^(端口|Ports)$/i.test(line.trim()))
    if (portsIndex >= 0) {
      contentLines = contentLines.slice(portsIndex + 1)
    } else {
      const panelMatch = /输出\s+调试控制台\s+终端\s+端口/.exec(text)
      if (panelMatch) {
        text = text.slice(panelMatch.index + panelMatch[0].length)
      } else {
        const outputMarker = text.lastIndexOf('Python Debugger - 输出')
        if (outputMarker >= 0) text = text.slice(outputMarker)
      }
      contentLines = text.split(/\r?\n/)
    }
    const filteredLines = contentLines
      .map((line) =>
        line
          .replace(/[\uE000-\uF8FF]/g, '')
          .replace(/[ \t]+/g, ' ')
          .trim(),
      )
      .filter(Boolean)
      .filter(
        (line) =>
          !/^(切换输出|关闭自动滚动|设置日志级别|视图和更多操作|更多筛选器|Toggle Output|Set Log Level)/i.test(
            line,
          ),
      )
      .filter(
        (line) =>
          !/^(纯文本|CRLF|UTF-8|空格: ?\d+|行 \d+，列 \d+|Ln \d+, Col \d+|已为屏幕阅读器优化|Screen Reader Optimized)$/i.test(
            line,
          ),
      )
    const outputText = filteredLines.join('\n').slice(-12000)
    const exitCodeMatch = outputText.match(
      /(?:process exited with code|exit code|退出代码)[:：\s]+(-?\d+)/i,
    )
    return {
      text: outputText,
      lines: filteredLines.slice(-500).map((line) => ({
        text: line,
        kind: /error|exception|traceback|错误|失败|exception/i.test(line) ? 'stderr' : 'stdout',
      })),
      source,
      activePanel,
      exitCode: exitCodeMatch ? Number(exitCodeMatch[1]) : null,
      truncated: filteredLines.length > 500,
      candidates: candidates.length,
    }
  }

  getPendingCaptureSource(senderId) {
    return this.pendingCaptureSources.get(senderId) || null
  }

  async stop(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return { stopped: false }
    const processIds = [...new Set([...(session.processIds || []), session.pid].filter(Boolean))]
    for (const processId of processIds) {
      try {
        await this.runner.run('taskkill.exe', ['/pid', String(processId), '/T', '/F'], {
          scope: 'app-host-stop',
          taskId: `app-host-stop-${session.id}-${processId}`,
          timeoutMs: 8000,
        })
      } catch {
        // The target process may already have exited.
      }
    }
    this.sessions.delete(sessionId)
    this.actionLog.append({
      appId: session.appId,
      sessionId,
      displayName: session.displayName,
      kind: 'stop',
      action: 'stop',
      effect: 'confirmed',
      confirmed: true,
    })
    for (const [senderId, sourceId] of this.pendingCaptureSources.entries()) {
      if (sourceId === session.capture?.sourceId) this.pendingCaptureSources.delete(senderId)
    }
    return { stopped: true }
  }

  setFavorite(id, favorite) {
    if (!this.findApp(id)) throw new Error('没有找到这个工具。')
    this.store.setFavorite(id, Boolean(favorite))
    return true
  }

  listActionLog(options = {}) {
    return this.actionLog.list(options)
  }

  clearActionLog() {
    return this.actionLog.clear()
  }

  async shutdown() {
    this.runner.killAll()
    await this.persistentService.stop()
  }
}

module.exports = {
  AppHostManager,
  AppHostStore,
  CATEGORY_META,
  DISCOVERY_SCRIPT,
  adapterForApp,
  categorizeApp,
  captureSourceHandle,
  chooseCaptureSource,
  commandCandidateScore,
  isCommandPaletteEntry,
  isDangerousVSCodeCommand,
  isVSCodeApp,
  launchArgumentsForApp,
  normalizeDiscoveredApps,
  normalizeStoredState,
  parseDiscoveryOutput,
  sessionLivePid,
  selectVSCodeCommand,
}

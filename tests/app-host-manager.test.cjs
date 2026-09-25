const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  AppHostManager,
  AppHostStore,
  adapterForApp,
  captureSourceHandle,
  categorizeApp,
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
} = require('../src/main/app-host-manager.cjs')

function createTempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zp-app-host-test-'))
}

test('parses PowerShell JSON lines and arrays', () => {
  assert.deepEqual(parseDiscoveryOutput('{"executablePath":"C:\\\\A.exe"}\n'), [
    { executablePath: 'C:\\A.exe' },
  ])
  assert.deepEqual(parseDiscoveryOutput('[{"executablePath":"C:\\\\A.exe"}]'), [
    { executablePath: 'C:\\A.exe' },
  ])
})

test('filters installers and merges duplicate shortcuts', () => {
  const apps = normalizeDiscoveredApps(
    [
      {
        executablePath: 'C:\\Tools\\MATLAB\\bin\\matlab.exe',
        shortcutName: 'MATLAB R2024b',
        productName: 'MATLAB',
        companyName: 'MathWorks',
        source: 'start-menu',
      },
      {
        executablePath: 'C:\\Tools\\MATLAB\\bin\\matlab.exe',
        shortcutName: 'MATLAB',
        productName: 'MATLAB',
        companyName: 'MathWorks',
        source: 'app-paths',
      },
      {
        executablePath: 'C:\\Tools\\Vendor\\uninstall.exe',
        shortcutName: '卸载工具',
        productName: 'Vendor',
        source: 'start-menu',
      },
    ],
    {
      fileExists: () => true,
      resolveRealPath: (value) => path.resolve(value),
    },
  )

  assert.equal(apps.length, 1)
  assert.equal(apps[0].displayName, 'MATLAB')
  assert.equal(apps[0].publisher, 'MathWorks')
  assert.equal(apps[0].sourceLabel, '开始菜单、应用路径')
})

test('prefers a newly opened window matching the selected application', () => {
  const app = {
    displayName: 'MATLAB',
    executableName: 'matlab.exe',
  }
  const source = chooseCaptureSource(
    app,
    [
      { id: 'window:10:0', name: 'MATLAB R2024b' },
      { id: 'window:11:0', name: '通知' },
    ],
    new Set(['window:10:0']),
  )

  assert.equal(source.id, 'window:10:0')
})

test('requires a capture source handle from the target process tree', () => {
  const app = {
    displayName: 'Visual Studio Code',
    executableName: 'Code.exe',
  }
  const sources = [
    { id: 'window:100:0', name: 'Visual Studio Code' },
    { id: 'window:200:0', name: 'Visual Studio Code' },
  ]

  assert.equal(captureSourceHandle('window:200:0'), 200)
  assert.equal(chooseCaptureSource(app, sources, new Set(), new Set([200])).id, 'window:200:0')
})

test('normalizes stored preferences and keeps only bounded fields', () => {
  const normalized = normalizeStoredState({
    preferences: {
      '0123456789abcdef0123': {
        favorite: true,
        lastLaunchedAt: '2026-09-24T02:00:00.000Z',
        unexpected: 'ignored',
      },
      invalid: { favorite: true },
    },
  })

  assert.deepEqual(normalized.preferences, {
    '0123456789abcdef0123': {
      favorite: true,
      lastLaunchedAt: '2026-09-24T02:00:00.000Z',
    },
  })
})

test('persists the tool catalog and launch preference atomically', () => {
  const directory = createTempDirectory()
  try {
    const store = new AppHostStore(directory)
    store.setCatalog([
      {
        id: '0123456789abcdef0123',
        displayName: 'MATLAB',
        executablePath: 'C:\\MATLAB\\matlab.exe',
      },
    ])
    store.recordLaunch('0123456789abcdef0123')
    store.setFavorite('0123456789abcdef0123', true)

    const reloaded = new AppHostStore(directory)
    assert.equal(reloaded.getCatalog().apps[0].displayName, 'MATLAB')
    assert.equal(reloaded.getPreferences()['0123456789abcdef0123'].favorite, true)
    assert.ok(reloaded.getPreferences()['0123456789abcdef0123'].lastLaunchedAt)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('extracts and caches the official application icon', async () => {
  const directory = createTempDirectory()
  try {
    const id = '0123456789abcdef0123'
    const store = new AppHostStore(directory)
    store.setCatalog([
      {
        id,
        displayName: 'MATLAB',
        executablePath: 'C:\\MATLAB\\matlab.exe',
        iconPath: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\MATLAB.lnk',
      },
    ])
    const requestedPaths = []
    const nativeImage = {
      isEmpty: () => false,
      resize: () => ({
        isEmpty: () => false,
        toPNG: () => Buffer.from('icon'),
      }),
    }
    const manager = new AppHostManager({
      app: {
        getPath: () => directory,
        getFileIcon: async (filePath) => {
          requestedPaths.push(filePath)
          return nativeImage
        },
      },
      logger: { info() {}, warn() {} },
    })

    assert.equal(
      await manager.getIcon(id),
      `data:image/png;base64,${Buffer.from('icon').toString('base64')}`,
    )
    assert.equal(await manager.getIcon(id), await manager.getIcon(id))
    assert.deepEqual(requestedPaths, [
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\MATLAB.lnk',
    ])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('enables Electron accessibility when launching VS Code', () => {
  assert.deepEqual(launchArgumentsForApp({ executableName: 'Code.exe' }), [
    '--force-renderer-accessibility',
  ])
  assert.deepEqual(launchArgumentsForApp({ executableName: 'idea64.exe' }), [])
  assert.equal(adapterForApp({ executableName: 'Code.exe' }).tier, 'deep')
  assert.equal(adapterForApp({ executableName: 'idea64.exe' }).tier, 'generic')
})

test('classifies engineering applications ahead of productivity and entertainment', () => {
  for (const app of [
    { executableName: 'Code.exe' },
    { displayName: 'AutoCAD 2024', executableName: 'acad.exe' },
    { displayName: 'MATLAB R2024b', executableName: 'matlab.exe' },
    { displayName: 'IntelliJ IDEA', executableName: 'idea64.exe' },
  ]) {
    assert.equal(categorizeApp(app).id, 'engineering')
  }

  assert.equal(categorizeApp({ displayName: 'Microsoft Excel' }).id, 'productivity')
  assert.equal(categorizeApp({ displayName: 'WPS Office' }).id, 'productivity')
  assert.equal(
    categorizeApp({ displayName: '抖音', executableName: 'douyin.exe' }).id,
    'entertainment',
  )
  assert.equal(
    categorizeApp({ displayName: '5E对战平台', executableName: '5EClient.exe' }).id,
    'entertainment',
  )
})

test('sorts engineering applications before entertainment even when entertainment is pinned', async () => {
  const directory = createTempDirectory()
  try {
    const store = new AppHostStore(directory)
    store.setCatalog([
      {
        id: '11111111111111111111',
        displayName: 'Steam',
        executableName: 'steam.exe',
        executablePath: 'C:\\Games\\Steam\\steam.exe',
      },
      {
        id: '22222222222222222222',
        displayName: 'MATLAB R2024b',
        executableName: 'matlab.exe',
        executablePath: 'C:\\MATLAB\\matlab.exe',
      },
      {
        id: '33333333333333333333',
        displayName: 'Microsoft Excel',
        executableName: 'excel.exe',
        executablePath: 'C:\\Office\\excel.exe',
      },
    ])
    store.setFavorite('11111111111111111111', true)
    const manager = new AppHostManager({
      app: {
        getPath: () => directory,
        getFileIcon: async () => ({ isEmpty: () => true }),
      },
      logger: { info() {}, warn() {} },
    })

    const tools = await manager.list()
    assert.deepEqual(
      tools.map((tool) => tool.category),
      ['engineering', 'productivity', 'entertainment'],
    )
    assert.equal(tools[0].displayName, 'MATLAB R2024b')
    assert.equal(tools[2].displayName, 'Steam')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('adds and removes a manually selected application', async () => {
  const directory = createTempDirectory()
  try {
    const executablePath = path.join(directory, 'manual-tool.exe')
    fs.writeFileSync(executablePath, '', 'utf8')
    const manager = new AppHostManager({
      app: {
        getPath: () => directory,
        getFileIcon: async () => ({ isEmpty: () => true }),
      },
      logger: { info() {}, warn() {} },
    })

    const tool = await manager.addManualApp(executablePath)
    assert.equal(tool.executableName, 'manual-tool.exe')
    assert.equal(tool.sourceLabel, '手动添加')
    assert.equal(manager.removeApp(tool.id), true)
    assert.equal(manager.findApp(tool.id), null)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('recognizes VS Code command palette entries without breadcrumbs', () => {
  assert.equal(isVSCodeApp({ executableName: 'Code.exe' }), true)
  assert.equal(isVSCodeApp({ executableName: 'idea64.exe' }), false)
  assert.equal(
    isCommandPaletteEntry({
      controlType: 'ControlType.ListItem',
      name: 'Python Debugger: Show Output',
      className: 'monaco-list-row',
      offscreen: false,
    }),
    true,
  )
  assert.equal(
    isCommandPaletteEntry({
      controlType: 'ControlType.ListItem',
      name: 'C:\\Users\\student\\project',
      className: 'folder monaco-breadcrumb-item',
      offscreen: false,
    }),
    false,
  )
})

test('selects exact VS Code commands and marks broad matches as ambiguous', () => {
  const commands = [
    {
      name: 'Python Debugger: Show Output',
      path: '0.1',
      patterns: ['InvokePatternIdentifiers.Pattern'],
    },
    {
      name: 'Python: Run Python File',
      path: '0.2',
      patterns: ['InvokePatternIdentifiers.Pattern'],
    },
    {
      name: 'View: Show Python',
      path: '0.3',
      patterns: ['InvokePatternIdentifiers.Pattern'],
    },
  ]

  assert.equal(commandCandidateScore(commands[0].name, commands[0].name), 1000)
  assert.equal(selectVSCodeCommand(commands, commands[0].name).kind, 'exact')
  assert.equal(selectVSCodeCommand(commands, 'Python').kind, 'ambiguous')
  assert.equal(isDangerousVSCodeCommand('File: Delete File'), true)
  assert.equal(isDangerousVSCodeCommand('Python: Run Python File'), false)
})

test('finds a live process anywhere in the recorded process chain', () => {
  const session = {
    pid: 10,
    processIds: [10, 20, 30],
  }
  assert.equal(
    sessionLivePid(session, (pid) => pid === 30),
    30,
  )
  assert.equal(
    sessionLivePid(session, () => false),
    null,
  )
})

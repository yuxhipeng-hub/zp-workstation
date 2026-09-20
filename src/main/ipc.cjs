const fsp = require('node:fs/promises')
const { BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } = require('electron')
const { CHANNELS, DOCS_URL, RELEASE_URL, THEME_VALUES } = require('./constants.cjs')

function isSafeExternalUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

async function pathExists(target) {
  try {
    await fsp.access(target)
    return true
  } catch {
    return false
  }
}

function registerIpc({
  app,
  settings,
  workspace,
  experimentLibrary,
  logger,
  dshManager,
  launcherUpdater,
  getMainWindow,
}) {
  const send = (channel, payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channel, payload)
    }
  }

  logger.on('entry', (entry) => send('log:entry', entry))
  dshManager.on('task-state', (state) => send('task:update', state))
  dshManager.on('update-state', (state) => send('update:state', state))
  dshManager.on('process-state', (state) => send('process:state', state))
  dshManager.on('process-log', (payload) => send('process:log', payload))

  ipcMain.handle('app:bootstrap', async () => {
    const [status, launcherUpdate] = await Promise.all([
      dshManager.getStatus(),
      launcherUpdater.check().catch((error) => ({ supported: false, message: error.message })),
    ])
    return {
      settings: settings.get(),
      status,
      channels: CHANNELS,
      release: {
        htmlUrl: RELEASE_URL,
        docsUrl: DOCS_URL,
      },
      launcherUpdate,
      logs: logger.list(160),
      history: dshManager.history(),
      modelConfig: dshManager.getModelConfig(),
      workspace: workspace.get(),
    }
  })

  ipcMain.handle('dsh:status', () => dshManager.getStatus())
  ipcMain.handle('dsh:check-update', (_event, options = {}) => dshManager.checkForUpdate(options))
  ipcMain.handle('dsh:install', (_event, target, options) => dshManager.install(target, options))
  ipcMain.handle('dsh:launch', () => dshManager.startWeb())
  ipcMain.handle('dsh:stop', () => dshManager.stopWeb())
  ipcMain.handle('dsh:plugins', (_event, profile) => dshManager.listPlugins(profile))
  ipcMain.handle('dsh:plugin-action', (_event, profile, action, spec) =>
    dshManager.managePlugin(profile, action, spec),
  )
  ipcMain.handle('dsh:model-config', () => dshManager.getModelConfig())
  ipcMain.handle('workspace:get', () => workspace.get())
  ipcMain.handle('workspace:assignment-create', (_event, input) => workspace.createAssignment(input))
  ipcMain.handle('workspace:assignment-update', (_event, id, patch) =>
    workspace.updateAssignment(id, patch),
  )
  ipcMain.handle('workspace:assignment-delete', (_event, id) => workspace.deleteAssignment(id))
  ipcMain.handle('workspace:knowledge-create', (_event, input) => workspace.createKnowledge(input))
  ipcMain.handle('workspace:knowledge-update', (_event, id, patch) =>
    workspace.updateKnowledge(id, patch),
  )
  ipcMain.handle('workspace:knowledge-delete', (_event, id) => workspace.deleteKnowledge(id))
  ipcMain.handle('workspace:experiments-import', (_event, entries) =>
    experimentLibrary.importEntries(entries),
  )
  ipcMain.handle('workspace:experiment-update', (_event, id, patch) =>
    experimentLibrary.updateExperiment(id, patch),
  )
  ipcMain.handle('workspace:experiment-rename-group', (_event, currentGroup, nextGroup) =>
    experimentLibrary.renameGroup(currentGroup, nextGroup),
  )
  ipcMain.handle('workspace:experiment-delete', (_event, id) =>
    experimentLibrary.removeExperiment(id),
  )
  ipcMain.handle('clipboard:write', (_event, value) => {
    clipboard.writeText(String(value ?? ''))
    return true
  })

  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:patch', (_event, patch) => {
    const allowed = {}
    const keys = [
      'channel',
      'dshHome',
      'experimentDir',
      'host',
      'port',
      'openMode',
      'autoCheckDsh',
      'autoCheckLauncher',
      'minimizeToTray',
      'launchAtLogin',
      'theme',
    ]
    for (const key of keys) {
      if (Object.hasOwn(patch || {}, key)) allowed[key] = patch[key]
    }
    if (allowed.channel && !CHANNELS[allowed.channel]) throw new Error('未知版本通道。')
    if (allowed.theme && !THEME_VALUES.has(allowed.theme)) throw new Error('未知主题设置。')
    if (allowed.experimentDir !== undefined) {
      allowed.experimentDir = String(allowed.experimentDir || '').trim()
      if (!allowed.experimentDir) throw new Error('实验资料目录不能为空。')
    }
    if (allowed.port) {
      allowed.port = Number(allowed.port)
      if (!Number.isInteger(allowed.port) || allowed.port < 1024 || allowed.port > 65535) {
        throw new Error('端口必须在 1024 到 65535 之间。')
      }
    }
    const updated = settings.patch(allowed)
    if (allowed.theme) nativeTheme.themeSource = allowed.theme
    send('settings:changed', updated)
    return updated
  })

  ipcMain.handle('dialog:choose-dsh-home', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择 DeepSeek Harness 数据目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: settings.get().dshHome,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:choose-experiment-dir', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择实验资料存储目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: settings.get().experimentDir,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:choose-experiment-pdfs', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择实验 PDF',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF 实验文件', extensions: ['pdf'] }],
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('experiments:open-file', async (_event, id) => {
    const experiment = experimentLibrary.getExperiment(id)
    if (!(await pathExists(experiment.filePath))) throw new Error('实验文件已不在原位置。')
    const error = await shell.openPath(experiment.filePath)
    if (error) throw new Error(error)
    return true
  })

  ipcMain.handle('experiments:reveal-file', (_event, id) => {
    const experiment = experimentLibrary.getExperiment(id)
    shell.showItemInFolder(experiment.filePath)
    return true
  })

  ipcMain.handle('experiments:open-directory', async (_event, group = '') => {
    const directory = experimentLibrary.resolveDirectory(group)
    await fsp.mkdir(directory, { recursive: true })
    const error = await shell.openPath(directory)
    if (error) throw new Error(error)
    return true
  })

  ipcMain.handle('path:open', async (_event, target) => {
    const allowed = {
      dshHome: dshManager.getDshHome(),
      runtime: dshManager.paths().runtimeDir,
      logs: dshManager.paths().logsDir,
      experiments: settings.get().experimentDir,
      userData: app.getPath('userData'),
    }
    const resolved = allowed[target]
    if (!resolved) throw new Error('不允许打开该路径。')
    const error = await shell.openPath(resolved)
    if (error) throw new Error(error)
    return true
  })

  ipcMain.handle('external:open', async (_event, url) => {
    if (!isSafeExternalUrl(url)) throw new Error('不允许打开该链接。')
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle('logs:clear', () => {
    logger.clear()
    send('logs:cleared')
    return true
  })

  ipcMain.handle('launcher:check-update', () => launcherUpdater.check())
  ipcMain.handle('launcher:download-update', async (_event, asset) => {
    const file = await launcherUpdater.download(asset)
    await shell.openPath(file)
    setTimeout(() => app.quit(), 800)
    return file
  })
}

module.exports = { registerIpc }

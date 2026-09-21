const fsp = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
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
  scheduleManager,
  logger,
  dshManager,
  launcherUpdater,
  skillsManager,
  knowledgeManager,
  reminderManager,
  getMainWindow,
}) {
  const send = (channel, payload) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channel, payload)
    }
  }

  logger.on('entry', (entry) => send('log:entry', entry))
  launcherUpdater.on('state', (state) => send('launcher:update-state', state))
  launcherUpdater.on('download-progress', (progress) =>
    send('launcher:download-progress', progress),
  )
  dshManager.on('task-state', (state) => send('task:update', state))
  dshManager.on('update-state', (state) => send('update:state', state))
  dshManager.on('process-state', (state) => send('process:state', state))
  dshManager.on('process-log', (payload) => send('process:log', payload))
  if (reminderManager) {
    const forwardReminder = reminderManager.onReminder
    reminderManager.onReminder = (reminder) => {
      send('reminder:due', reminder)
      if (forwardReminder) forwardReminder(reminder)
    }
  }

  ipcMain.handle('app:bootstrap', async () => {
    const status = await dshManager.getStatus({ quick: true })
    return {
      settings: settings.get(),
      status,
      channels: CHANNELS,
      release: {
        htmlUrl: RELEASE_URL,
        docsUrl: DOCS_URL,
      },
      launcherUpdate: launcherUpdater.getState(),
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
  ipcMain.handle('skills:list', (_event, options = {}) => skillsManager.list(options))
  ipcMain.handle('skills:open-directory', async (_event, id) => {
    const directory = await skillsManager.getDirectory(id)
    const error = await shell.openPath(directory)
    if (error) throw new Error(error)
    return true
  })
  ipcMain.handle('skills:open-root', async () => {
    const data = await skillsManager.list()
    await fsp.mkdir(data.skillsRoot, { recursive: true })
    const error = await shell.openPath(data.skillsRoot)
    if (error) throw new Error(error)
    return true
  })
  ipcMain.handle('workspace:get', () => workspace.get())
  ipcMain.handle('workspace:courses', () => workspace.listCourses())
  ipcMain.handle('workspace:course-create', (_event, input) => workspace.createCourse(input))
  ipcMain.handle('workspace:course-rename', async (_event, id, name) => {
    const result = workspace.renameCourse(id, name)
    const failures = []
    for (const rename of result.groupRenames || []) {
      try {
        await experimentLibrary.renameGroup(rename.from, rename.to)
      } catch (error) {
        failures.push({ ...rename, message: error.message })
      }
    }
    return { ...result, workspace: workspace.get(), failures }
  })
  ipcMain.handle('workspace:backup-list', () => workspace.listBackups())
  ipcMain.handle('workspace:backup-create', (_event, label) => workspace.createBackup(label))
  ipcMain.handle('workspace:backup-restore', (_event, fileName) => workspace.restoreBackup(fileName))
  ipcMain.handle('workspace:health-check', () => workspace.healthCheck())
  ipcMain.handle('workspace:reminders', () => ({
    enabled: settings.get().notificationsEnabled !== false,
    summary: reminderManager ? reminderManager.summary() : null,
  }))
  ipcMain.handle('workspace:reminder-test', () => {
    reminderManager?.testNotification()
    return true
  })
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
  ipcMain.handle('workspace:knowledge-generate', (_event, experimentId) =>
    knowledgeManager.generateFromExperiment(experimentId),
  )
  ipcMain.handle('workspace:knowledge-review', (_event, id, rating) =>
    knowledgeManager.reviewKnowledge(id, rating),
  )
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
  ipcMain.handle('schedule:import', (_event, filePath) => scheduleManager.importFile(filePath))
  ipcMain.handle('schedule:course-create', (_event, input) =>
    scheduleManager.createCourse(input),
  )
  ipcMain.handle('schedule:course-update', (_event, id, patch) =>
    scheduleManager.updateCourse(id, patch),
  )
  ipcMain.handle('schedule:course-delete', (_event, id) =>
    scheduleManager.deleteCourse(id),
  )
  ipcMain.handle('schedule:clear', () => scheduleManager.clear())
  ipcMain.handle('clipboard:write', (_event, value) => {
    clipboard.writeText(String(value ?? ''))
    return true
  })
  ipcMain.handle('file:stage-drop', async (_event, payload = {}) => {
    const originalName = path.basename(String(payload.name || '').trim())
    const safeName =
      originalName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 160) ||
      'dropped-file'
    const data = payload.data
    if (!data) throw new Error('拖入的文件没有可读取的内容。')
    const buffer = Buffer.from(data)
    if (!buffer.length) throw new Error('拖入的文件内容为空。')
    if (buffer.length > 200 * 1024 * 1024) {
      throw new Error('拖入的单个文件超过 200 MB，请先保存到本地后再导入。')
    }
    const directory = path.join(app.getPath('temp'), 'ZP-Workbench-Drops', randomUUID())
    const filePath = path.join(directory, safeName)
    await fsp.mkdir(directory, { recursive: true })
    await fsp.writeFile(filePath, buffer)
    return { path: filePath, name: safeName, size: buffer.length }
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
      'termStartDate',
      'notificationsEnabled',
      'classReminderMinutes',
      'assignmentReminderDays',
      'reviewReminderEnabled',
      'dailyDigestTime',
      'reviewReminderTime',
      'onboarding',
    ]
    for (const key of keys) {
      if (Object.hasOwn(patch || {}, key)) allowed[key] = patch[key]
    }
    if (allowed.channel && !CHANNELS[allowed.channel]) throw new Error('未知版本通道。')
    if (allowed.theme && !THEME_VALUES.has(allowed.theme)) throw new Error('未知主题设置。')
    if (allowed.termStartDate !== undefined) {
      allowed.termStartDate = String(allowed.termStartDate || '').trim()
      if (allowed.termStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(allowed.termStartDate)) {
        throw new Error('开学日期需要形如 2026-09-01。')
      }
    }
    if (allowed.classReminderMinutes !== undefined) {
      allowed.classReminderMinutes = Number(allowed.classReminderMinutes)
      if (
        !Number.isInteger(allowed.classReminderMinutes) ||
        allowed.classReminderMinutes < 1 ||
        allowed.classReminderMinutes > 180
      ) {
        throw new Error('课前提醒需要在 1 到 180 分钟之间。')
      }
    }
    if (allowed.assignmentReminderDays !== undefined) {
      allowed.assignmentReminderDays = Number(allowed.assignmentReminderDays)
      if (
        !Number.isInteger(allowed.assignmentReminderDays) ||
        allowed.assignmentReminderDays < 0 ||
        allowed.assignmentReminderDays > 14
      ) {
        throw new Error('作业提前提醒需要在 0 到 14 天之间。')
      }
    }
    for (const key of ['dailyDigestTime', 'reviewReminderTime']) {
      if (allowed[key] === undefined) continue
      allowed[key] = String(allowed[key] || '').trim()
      if (allowed[key] && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(allowed[key])) {
        throw new Error('提醒时间需要形如 08:00。')
      }
    }
    if (allowed.onboarding !== undefined) {
      const source =
        allowed.onboarding && typeof allowed.onboarding === 'object' ? allowed.onboarding : {}
      const guideVersion = Number(source.guideVersion)
      allowed.onboarding = {
        welcomeSeen: Boolean(source.welcomeSeen),
        guideVersion: Number.isInteger(guideVersion) && guideVersion > 0 ? guideVersion : 1,
        completedSteps: (Array.isArray(source.completedSteps) ? source.completedSteps : [])
          .map((step) => String(step ?? '').trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 30),
        dismissedAt: source.dismissedAt ? String(source.dismissedAt).slice(0, 40) : null,
        completedAt: source.completedAt ? String(source.completedAt).slice(0, 40) : null,
      }
    }
    if (allowed.experimentDir !== undefined) {
      allowed.experimentDir = String(allowed.experimentDir || '').trim()
      if (!allowed.experimentDir) throw new Error('实验资料目录不能为空。')
    }
    if (allowed.dshHome !== undefined) {
      allowed.dshHome = String(allowed.dshHome || '').trim()
      if (!allowed.dshHome) throw new Error('DSH 数据目录不能为空。')
    }
    if (allowed.port) {
      allowed.port = Number(allowed.port)
      if (!Number.isInteger(allowed.port) || allowed.port < 1024 || allowed.port > 65535) {
        throw new Error('端口必须在 1024 到 65535 之间。')
      }
    }
    const updated = settings.patch(allowed)
    if (allowed.dshHome !== undefined) skillsManager.setDshHome(updated.dshHome)
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

  const chooseExperimentFiles = async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择资料库文件',
      properties: ['openFile', 'multiSelections'],
    })
    return result.canceled ? [] : result.filePaths
  }

  ipcMain.handle('dialog:choose-experiment-files', chooseExperimentFiles)
  ipcMain.handle('dialog:choose-experiment-pdfs', chooseExperimentFiles)

  ipcMain.handle('dialog:export-snapshot', async () => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: '导出工作站快照',
      defaultPath: `zp-workbench-snapshot-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: '工作站快照', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return null
    const exported = workspace.exportSnapshot(result.filePath)
    return { ...exported, workspace: undefined }
  })

  ipcMain.handle('dialog:import-snapshot', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '导入工作站快照',
      properties: ['openFile'],
      filters: [{ name: '工作站快照', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePaths.length) return null
    return workspace.importSnapshot(result.filePaths[0])
  })

  ipcMain.handle('dialog:choose-schedule-file', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择课表文件',
      properties: ['openFile'],
      filters: [
        {
          name: '课表文件',
          extensions: [
            'xlsx',
            'xls',
            'xlsm',
            'et',
            'ett',
            'csv',
            'tsv',
            'ics',
            'txt',
            'html',
            'htm',
            'pdf',
            'docx',
            'pptx',
            'rtf',
            'md',
            'markdown',
          ],
        },
        { name: '所有文件', extensions: ['*'] },
      ],
    })
    return result.canceled ? null : result.filePaths[0] || null
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

  ipcMain.handle('schedule:reveal-source', async () => {
    const sourcePath = workspace.get().schedule?.source?.path
    if (!sourcePath || !(await pathExists(sourcePath))) throw new Error('原始课表文件已不在原位置。')
    shell.showItemInFolder(sourcePath)
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
    const result = await launcherUpdater.download(asset)
    launcherUpdater.markOpening(result.filePath)
    const error = await shell.openPath(result.filePath)
    if (error) {
      launcherUpdater.setState({
        error,
        message: `无法启动安装程序：${error}`,
      })
      throw new Error(error)
    }
    setTimeout(() => app.quit(), 2400)
    return result
  })
}

module.exports = { registerIpc }

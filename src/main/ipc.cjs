const fsp = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } = require('electron')
const { THEME_VALUES } = require('./constants.cjs')
const { collectDiagnostics } = require('./diagnostics.cjs')
const { resolveDropReferences } = require('./drop-reference.cjs')

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

function defaultDownloadDir(app) {
  try {
    return app.getPath('downloads')
  } catch {
    return app.getPath('temp')
  }
}

function registerIpc({
  app,
  settings,
  workspace,
  experimentLibrary,
  scheduleManager,
  logger,
  aihotClient,
  aiService,
  launcherUpdater,
  backupManager,
  reminderManager,
  startupTimer,
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
  if (reminderManager) {
    const forwardReminder = reminderManager.onReminder
    reminderManager.onReminder = (reminder) => {
      send('reminder:due', reminder)
      if (forwardReminder) forwardReminder(reminder)
    }
  }

  ipcMain.handle('app:bootstrap', async () => ({
    settings: settings.get(),
    status: {
      logsDir: logger.logDir,
      launcherVersion: app.getVersion(),
    },
    launcherUpdate: launcherUpdater.getState(),
    ai: aiService.getConfig(),
    logs: logger.list(160),
    workspace: workspace.get(),
  }))

  ipcMain.handle('ai:config', () => aiService.getConfig())
  ipcMain.handle('ai:profile-save', (_event, profile, apiKey, clearKey) =>
    aiService.saveProfile(profile, apiKey, clearKey === true),
  )
  ipcMain.handle('ai:profile-delete', (_event, id) => aiService.deleteProfile(id))
  ipcMain.handle('ai:profile-activate', (_event, id) => aiService.activateProfile(id))
  ipcMain.handle('ai:profile-test', (_event, id) => aiService.testProfile(id))
  ipcMain.handle('ai:assignment-plan', async (_event, assignmentId) => {
    const assignment = workspace
      .get()
      .assignments.find((item) => item.id === String(assignmentId || ''))
    if (!assignment) throw new Error('没有找到这条作业。')
    const result = await aiService.generateAssignmentPlan(assignment)
    const nextWorkspace = workspace.updateAssignment(assignment.id, { aiPlan: result.plan })
    return { ...result, workspace: nextWorkspace }
  })
  ipcMain.handle('ai:extract-assignments', (_event, text) => {
    if (typeof text !== 'string') throw new Error('请先粘贴通知内容。')
    return aiService.extractAssignments(text)
  })

  ipcMain.handle('aihot:daily', (_event, options = {}) => {
    if (options && typeof options !== 'object') throw new Error('参数无效。')
    return aihotClient.getLatestDaily({ force: options.force === true })
  })
  ipcMain.handle('aihot:items', (_event, options = {}) => {
    if (options && typeof options !== 'object') throw new Error('参数无效。')
    return aihotClient.getItems(options)
  })
  ipcMain.handle('aihot:hot', (_event, options = {}) => {
    if (options && typeof options !== 'object') throw new Error('参数无效。')
    return aihotClient.getHotTopics({ force: options.force === true })
  })
  ipcMain.handle('aihot:story', (_event, publicId, options = {}) => {
    if (options && typeof options !== 'object') throw new Error('参数无效。')
    return aihotClient.getStory(publicId, { force: options.force === true })
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
  ipcMain.handle('workspace:backup-restore', (_event, fileName) =>
    workspace.restoreBackup(fileName),
  )
  ipcMain.handle('backup:archives', () => backupManager.listArchives())
  ipcMain.handle('backup:create', (_event, options = {}) => backupManager.createArchive(options))
  ipcMain.handle('backup:restore', (_event, fileName, password) =>
    backupManager.restoreArchive(fileName, password),
  )
  ipcMain.handle('backup:status', () => backupManager.status())
  ipcMain.handle('backup:sync-config', (_event, payload = {}) => {
    const webdavPassword = Object.hasOwn(payload, 'webdavPassword')
      ? payload.webdavPassword
      : Object.hasOwn(payload, 'password')
        ? payload.password
        : undefined
    if (webdavPassword !== undefined) {
      backupManager.setSecret('webdavPassword', webdavPassword || '')
    }
    if (Object.hasOwn(payload, 'syncPassword')) {
      const syncPassword = String(payload.syncPassword || '')
      if (syncPassword && syncPassword.length < 8) {
        throw new Error('同步密码至少需要 8 位。')
      }
      backupManager.setSecret('syncPassword', syncPassword)
    }
    const status = backupManager.patchConfig(payload.config || {})
    send('settings:changed', settings.get())
    return status
  })
  ipcMain.handle('backup:sync-test', () => backupManager.testSyncTarget())
  ipcMain.handle('backup:sync-upload', () => backupManager.uploadLatest())
  ipcMain.handle('backup:sync-download', () => backupManager.downloadLatest())
  ipcMain.handle('workspace:health-check', () => workspace.healthCheck())
  ipcMain.handle('workspace:reminders', () => ({
    enabled: settings.get().notificationsEnabled !== false,
    summary: reminderManager ? reminderManager.summary() : null,
  }))
  ipcMain.handle('workspace:reminder-test', () => {
    reminderManager?.testNotification()
    return true
  })
  ipcMain.handle('workspace:assignment-create', (_event, input) =>
    workspace.createAssignment(input),
  )
  ipcMain.handle('workspace:assignment-update', (_event, id, patch) =>
    workspace.updateAssignment(id, patch),
  )
  ipcMain.handle('workspace:assignment-delete', (_event, id) => workspace.deleteAssignment(id))
  ipcMain.handle('workspace:experiments-suggest', (_event, entries) =>
    experimentLibrary.suggestEntries(entries),
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
  ipcMain.handle('workspace:experiment-group-create', (_event, name) =>
    experimentLibrary.createGroup(name),
  )
  ipcMain.handle('workspace:experiment-group-remove', (_event, name) =>
    experimentLibrary.removeGroup(name),
  )
  ipcMain.handle('workspace:experiment-delete', (_event, id) =>
    experimentLibrary.removeExperiment(id),
  )
  ipcMain.handle('experiments:change-root', async (_event, nextRoot) => {
    const result = await experimentLibrary.changeRoot(nextRoot)
    send('settings:changed', settings.get())
    logger.info(
      'experiments',
      `资料库根目录已迁移：${result.oldRoot} -> ${result.newRoot}，文件 ${result.copiedFiles} 个。`,
    )
    return result
  })
  ipcMain.handle('schedule:import', (_event, filePath) => scheduleManager.importFile(filePath))
  ipcMain.handle('schedule:course-create', (_event, input) => scheduleManager.createCourse(input))
  ipcMain.handle('schedule:course-update', (_event, id, patch) =>
    scheduleManager.updateCourse(id, patch),
  )
  ipcMain.handle('schedule:course-delete', (_event, id) => scheduleManager.deleteCourse(id))
  ipcMain.handle('schedule:period-times-update', (_event, periodTimes) =>
    scheduleManager.updatePeriodTimes(periodTimes),
  )
  ipcMain.handle('schedule:clear', () => scheduleManager.clear())
  ipcMain.handle('clipboard:write', (_event, value) => {
    clipboard.writeText(String(value ?? ''))
    return true
  })
  ipcMain.handle('file:stage-drop', async (_event, payload = {}) => {
    const originalName = path.basename(String(payload.name || '').trim())
    const safeName =
      originalName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 160) || 'dropped-file'
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
  ipcMain.handle('file:resolve-drop-references', (_event, values) => resolveDropReferences(values))

  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:patch', (_event, patch) => {
    const allowed = {}
    const keys = [
      'dshHome',
      'autoCheckLauncher',
      'minimizeToTray',
      'launchAtLogin',
      'theme',
      'termStartDate',
      'notificationsEnabled',
      'classReminderMinutes',
      'assignmentReminderDays',
      'dailyDigestTime',
      'onboarding',
    ]
    for (const key of keys) {
      if (Object.hasOwn(patch || {}, key)) allowed[key] = patch[key]
    }
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
    if (allowed.dailyDigestTime !== undefined) {
      allowed.dailyDigestTime = String(allowed.dailyDigestTime || '').trim()
      if (allowed.dailyDigestTime && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(allowed.dailyDigestTime)) {
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
          .map((step) =>
            String(step ?? '')
              .trim()
              .slice(0, 40),
          )
          .filter(Boolean)
          .slice(0, 30),
        dismissedAt: source.dismissedAt ? String(source.dismissedAt).slice(0, 40) : null,
        completedAt: source.completedAt ? String(source.completedAt).slice(0, 40) : null,
      }
    }
    if (allowed.dshHome !== undefined) {
      allowed.dshHome = String(allowed.dshHome || '').trim()
      if (!allowed.dshHome) throw new Error('DSH 数据目录不能为空。')
    }
    settings.patch(allowed)
    const current = settings.get()
    if (allowed.theme) nativeTheme.themeSource = allowed.theme
    send('settings:changed', current)
    return current
  })

  ipcMain.handle('dialog:choose-experiment-dir', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择资料库迁移目标',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: settings.get().experimentDir,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:choose-log-dir', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择日志迁移目标',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: logger.logDir,
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

  ipcMain.handle('dialog:export-backup', async (_event, options = {}) => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: '导出完整工作站备份',
      defaultPath: `ZP-Workbench-${new Date().toISOString().slice(0, 10)}.zpbackup`,
      filters: [{ name: 'ZP Workbench 备份', extensions: ['zpbackup'] }],
    })
    if (result.canceled || !result.filePath) return null
    return backupManager.exportArchive(result.filePath, options)
  })

  ipcMain.handle('dialog:import-backup', async (_event, password = '') => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '导入完整工作站备份',
      properties: ['openFile'],
      filters: [{ name: 'ZP Workbench 备份', extensions: ['zpbackup'] }],
    })
    if (result.canceled || !result.filePaths.length) return null
    return backupManager.restoreArchiveSource(result.filePaths[0], password)
  })

  ipcMain.handle('dialog:choose-sync-dir', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '选择同步文件夹',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: settings.get().syncLocalDir || undefined,
    })
    return result.canceled ? null : result.filePaths[0] || null
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
    if (!sourcePath || !(await pathExists(sourcePath)))
      throw new Error('原始课表文件已不在原位置。')
    shell.showItemInFolder(sourcePath)
    return true
  })

  ipcMain.handle('path:open', async (_event, target) => {
    const allowed = {
      logs: logger.logDir,
      experiments: settings.get().experimentDir,
      userData: app.getPath('userData'),
      backups: backupManager.backupRoot,
    }
    const resolved = allowed[target]
    if (!resolved) throw new Error('不允许打开该路径。')
    await fsp.mkdir(resolved, { recursive: true })
    const error = await shell.openPath(resolved)
    if (error) throw new Error(error)
    return true
  })

  ipcMain.handle('external:open', async (_event, url) => {
    if (!isSafeExternalUrl(url)) throw new Error('不允许打开该链接。')
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle('perf:report-startup', (_event, payload = {}) => {
    if (!startupTimer) return { ok: false }
    startupTimer.mark('first-render')
    const summary = startupTimer.summary()
    logger.info('perf', startupTimer.describe())
    return {
      ok: true,
      totalMs: summary.totalMs,
      slow: summary.slow,
      rendererMs: Number(payload?.firstRenderMs) || 0,
    }
  })

  ipcMain.handle('logs:clear', () => {
    logger.clear()
    send('logs:cleared')
    return true
  })

  ipcMain.handle('diagnostics:export', async () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const options = {
      title: '导出诊断信息',
      defaultPath: path.join(defaultDownloadDir(app), `ZP-Workbench-diagnostics-${stamp}.zip`),
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
    }
    const parent = getMainWindow()
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { canceled: true }
    const { buffer } = await collectDiagnostics({
      appInfo: {
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        locale: app.getLocale(),
      },
      settings: settings.get(),
      workspace: workspace.get(),
      logFile: logger.logFile,
    })
    await fsp.writeFile(result.filePath, buffer)
    logger.info('diagnostics', '诊断包已导出。')
    return { canceled: false, filePath: result.filePath, size: buffer.length }
  })

  ipcMain.handle('logs:change-directory', async (_event, nextDir) => {
    const requested = String(nextDir || '').trim()
    if (!requested) throw new Error('日志目录不能为空。')
    const result = await logger.changeDirectory(requested)
    try {
      settings.patch({ logDir: result.newDir })
    } catch (error) {
      await logger.changeDirectory(result.oldDir).catch(() => {})
      throw error
    }
    send('settings:changed', settings.get())
    logger.info('logs', `日志目录已迁移：${result.oldDir} -> ${result.newDir}。`)
    return { ...result, settings: settings.get() }
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

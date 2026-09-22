const path = require('node:path')
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  safeStorage,
  shell,
} = require('electron')
const { APP_ID, APP_NAME } = require('./constants.cjs')
const { SettingsStore } = require('./settings-store.cjs')
const { WorkspaceStore } = require('./workspace-store.cjs')
const {
  ExperimentLibrary,
  inferExperimentGroup,
  resolveExperimentGroup,
} = require('./experiment-library.cjs')
const { JevManager } = require('./jev-manager.cjs')
const { ScheduleManager } = require('./schedule-manager.cjs')
const { Logger } = require('./logger.cjs')
const { DshManager } = require('./dsh-manager.cjs')
const { LauncherUpdater } = require('./launcher-updater.cjs')
const { SkillsManager } = require('./skills-manager.cjs')
const { BackupManager } = require('./backup-manager.cjs')
const { KnowledgeManager } = require('./knowledge-manager.cjs')
const { ReminderManager } = require('./reminder-manager.cjs')
const { registerIpc } = require('./ipc.cjs')

const userDataOverride = process.env.ZP_WORKBENCH_USER_DATA
if (userDataOverride) app.setPath('userData', path.resolve(userDataOverride))

app.setName(APP_NAME)

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

// Keep the established data directory so changing the visible product name does
// not orphan the installed runtime or force users to download it again.
if (!userDataOverride) {
  app.setPath('userData', path.join(app.getPath('appData'), 'deepseek-harness-launcher'))
}
app.setAppUserModelId(APP_ID)
if (process.env.DSH_LAUNCHER_REMOTE_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.DSH_LAUNCHER_REMOTE_DEBUG)
}

let mainWindow = null
let workbenchWindow = null
let tray = null
let quitting = false
let settings
let workspace
let experimentLibrary
let jevManager
let scheduleManager
let logger
let dshManager
let launcherUpdater
let skillsManager
let backupManager
let knowledgeManager
let reminderManager

function iconPath() {
  const candidates = [
    path.join(process.resourcesPath, 'build', 'icon.ico'),
    path.join(process.resourcesPath, 'build', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
  ]
  const { existsSync } = require('node:fs')
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0]
}

function appIcon() {
  const image = nativeImage.createFromPath(iconPath())
  return image.isEmpty() ? undefined : image
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    icon: appIcon(),
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  const icon = appIcon()
  if (icon) mainWindow.setIcon(icon)
  mainWindow.setTitle(APP_NAME)
  mainWindow.setMenuBarVisibility(false)

  const devServer = process.env.VITE_DEV_SERVER_URL
  if (devServer) {
    mainWindow.loadURL(devServer)
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (event) => {
    if (!quitting && settings?.get().minimizeToTray) {
      event.preventDefault()
      mainWindow.hide()
      return
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  return mainWindow
}

function openWorkbench(url) {
  if (workbenchWindow && !workbenchWindow.isDestroyed()) {
    workbenchWindow.loadURL(url)
    workbenchWindow.show()
    workbenchWindow.focus()
    return
  }
  workbenchWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    icon: appIcon(),
    title: `${APP_NAME} - DeepSeek Harness`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const icon = appIcon()
  if (icon) workbenchWindow.setIcon(icon)
  workbenchWindow.setMenuBarVisibility(false)
  workbenchWindow.loadURL(url)
  workbenchWindow.on('closed', () => {
    workbenchWindow = null
  })
}

function createTray() {
  const image = (appIcon() || nativeImage.createEmpty()).resize({ width: 20, height: 20 })
  tray = new Tray(image)
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开启动器', click: () => createMainWindow() },
      {
        label: '启动 DeepSeek Harness',
        click: async () => {
          try {
            const processState = await dshManager.startWeb()
            if (processState.url && settings.get().openMode === 'embedded')
              openWorkbench(processState.url)
            if (processState.url && settings.get().openMode === 'browser')
              shell.openExternal(processState.url)
          } catch (error) {
            logger.error('launch', error.message)
            createMainWindow()
          }
        },
      },
      {
        label: '停止 DeepSeek Harness',
        click: () => dshManager.stopWeb().catch((error) => logger.error('stop', error.message)),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('double-click', () => createMainWindow())
}

async function bootstrap() {
  const userData = app.getPath('userData')
  settings = new SettingsStore(userData)
  workspace = new WorkspaceStore(userData)
  logger = new Logger(userData)
  jevManager = new JevManager({
    userDataDir: userData,
    settings,
    safeStorage,
    logger,
    fallbackClassifier: ({ fileName, existingGroups }) => {
      const matchedGroup = resolveExperimentGroup(fileName, existingGroups)
      return {
        group: matchedGroup || inferExperimentGroup(fileName),
        confidence: matchedGroup ? 0.7 : 0.35,
        reason: matchedGroup ? '匹配到了已有的课程文件夹。' : '根据文件名生成新的课程分类。',
      }
    },
  })
  experimentLibrary = new ExperimentLibrary({ settings, workspace, jevManager })
  scheduleManager = new ScheduleManager({ workspace })
  nativeTheme.themeSource = settings.get().theme || 'system'
  dshManager = new DshManager({ app, settings, logger })
  const skillRegistryFile = path.join(userData, 'skill-registry.json')
  skillsManager = new SkillsManager({
    dshHome: settings.get().dshHome,
    registryFile: skillRegistryFile,
    backupRoot: path.join(userData, 'skill-backups'),
  })
  backupManager = new BackupManager({
    userDataDir: userData,
    appVersion: app.getVersion(),
    settings,
    workspace,
    safeStorage,
    logger,
    skillRegistryFile,
  })
  knowledgeManager = new KnowledgeManager({ app, workspace, dshManager, logger })
  reminderManager = new ReminderManager({
    settings,
    workspace,
    logger,
    onReminder: (reminder) => {
      if (reminder.activated) createMainWindow()
    },
  })
  const packageJson = require('../../package.json')
  launcherUpdater = new LauncherUpdater({
    app,
    logger,
    releaseConfig: packageJson.launcherRelease,
    currentVersion: app.getVersion(),
  })

  dshManager.on('web-ready', ({ url }) => {
    if (settings.get().openMode === 'embedded') openWorkbench(url)
    if (settings.get().openMode === 'browser') shell.openExternal(url)
  })
  registerIpc({
    app,
    settings,
    workspace,
    experimentLibrary,
    jevManager,
    scheduleManager,
    logger,
    dshManager,
    launcherUpdater,
    skillsManager,
    backupManager,
    knowledgeManager,
    reminderManager,
    getMainWindow: () => mainWindow,
  })
  createMainWindow()
  createTray()
  reminderManager.start()
  jevManager.start()
  backupManager.startAuto()

  mainWindow.webContents.once('did-finish-load', () => {
    if (!settings.get().autoCheckLauncher) return
    setTimeout(() => {
      launcherUpdater.check().catch((error) => logger.warn('launcher-update', error.message))
    }, 1000)
  })

  if (settings.get().autoCheckDsh) {
    setTimeout(() => {
      dshManager
        .checkForUpdate({ silent: true })
        .catch((error) => logger.warn('update', error.message))
    }, 1200)
  }
}

app.whenReady().then(bootstrap)

app.on('second-instance', () => {
  createMainWindow()
})

app.on('activate', () => {
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  if (!settings?.get().minimizeToTray) app.quit()
})

app.on('before-quit', async (event) => {
  quitting = true
  backupManager?.stopAuto()
  jevManager?.stop()
  if (dshManager) {
    event.preventDefault()
    try {
      await dshManager.shutdown()
    } finally {
      app.exit(0)
    }
  }
})

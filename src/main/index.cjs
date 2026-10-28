const path = require('node:path')
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  safeStorage,
  dialog,
} = require('electron')
const { APP_ID, APP_NAME } = require('./constants.cjs')
const { SettingsStore } = require('./settings-store.cjs')
const { WorkspaceStore } = require('./workspace-store.cjs')
const { ExperimentLibrary } = require('./experiment-library.cjs')
const { ScheduleManager } = require('./schedule-manager.cjs')
const { Logger } = require('./logger.cjs')
const { AihotClient } = require('./aihot-client.cjs')
const { AiService } = require('./ai-service.cjs')
const { LauncherUpdater } = require('./launcher-updater.cjs')
const { BackupManager } = require('./backup-manager.cjs')
const { ReminderManager } = require('./reminder-manager.cjs')
const { createStartupTimer } = require('./startup-timer.cjs')
const { registerIpc } = require('./ipc.cjs')

const startupTimer = createStartupTimer()

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
let tray = null
let quitting = false
let presentationDirty = false

function confirmPresentationClose() {
  if (!presentationDirty) return true
  const response = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    title: 'PPT 作品尚未保存',
    message: '当前作品有未保存的修改。',
    detail: '返回工作室保存作品，或放弃本次修改后退出。',
    buttons: ['返回保存', '放弃修改并退出'],
    defaultId: 0,
    cancelId: 0,
  })
  if (response !== 1) {
    quitting = false
    mainWindow?.show()
    return false
  }
  presentationDirty = false
  return true
}
let settings
let workspace
let experimentLibrary
let scheduleManager
let logger
let aihotClient
let aiService
let launcherUpdater
let backupManager
let reminderManager

function iconPath() {
  const preferred = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const fallback = process.platform === 'win32' ? 'icon.png' : 'icon.ico'
  const candidates = [
    path.join(process.resourcesPath, 'build', preferred),
    path.join(app.getAppPath(), 'build', preferred),
    path.join(process.resourcesPath, 'build', fallback),
    path.join(app.getAppPath(), 'build', fallback),
  ]
  const { existsSync } = require('node:fs')
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0]
}

function shellIconPath() {
  const candidates = [
    path.join(process.resourcesPath, 'build', 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
  ]
  const { existsSync } = require('node:fs')
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0]
}

function appIcon() {
  const image = nativeImage.createFromPath(iconPath())
  return image.isEmpty() ? undefined : image
}

function applyWindowIdentity(window, title = APP_NAME) {
  if (!window || window.isDestroyed()) return
  const icon = appIcon()
  if (icon) window.setIcon(icon)
  window.setTitle(title)
  if (process.platform !== 'win32') return
  try {
    window.setAppDetails({
      appId: APP_ID,
      appIconPath: shellIconPath(),
      appIconIndex: 0,
      relaunchCommand: process.execPath,
      relaunchDisplayName: APP_NAME,
    })
  } catch (error) {
    logger?.warn?.('window-icon', error.message)
  }
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
  applyWindowIdentity(mainWindow)
  mainWindow.setMenuBarVisibility(false)
  startupTimer.mark('window-created')
  mainWindow.webContents.on('page-favicon-updated', () => {
    applyWindowIdentity(mainWindow)
  })

  const devServer = process.env.VITE_DEV_SERVER_URL
  if (devServer) {
    mainWindow.loadURL(devServer)
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'))
  }
  mainWindow.webContents.once('did-finish-load', () => startupTimer.mark('window-loaded'))

  mainWindow.once('ready-to-show', () => {
    applyWindowIdentity(mainWindow)
    mainWindow.show()
  })
  mainWindow.on('show', () => applyWindowIdentity(mainWindow))
  mainWindow.on('focus', () => applyWindowIdentity(mainWindow))
  mainWindow.on('close', (event) => {
    if (!quitting && settings?.get().minimizeToTray) {
      event.preventDefault()
      mainWindow.hide()
      return
    }
    if (!quitting && !confirmPresentationClose()) event.preventDefault()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  return mainWindow
}

function createTray() {
  const image = (appIcon() || nativeImage.createEmpty()).resize({ width: 20, height: 20 })
  tray = new Tray(image)
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开工作台', click: () => createMainWindow() },
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
  startupTimer.mark('app-ready')
  const userData = app.getPath('userData')
  settings = new SettingsStore(userData)
  workspace = new WorkspaceStore(userData)
  logger = new Logger(userData, settings.get().logDir)
  aiService = new AiService({
    userDataDir: userData,
    settings,
    safeStorage,
    logger,
  })
  experimentLibrary = new ExperimentLibrary({ settings, workspace })
  scheduleManager = new ScheduleManager({ workspace })
  nativeTheme.themeSource = settings.get().theme || 'system'
  aihotClient = new AihotClient({ userDataDir: userData, logger })
  backupManager = new BackupManager({
    userDataDir: userData,
    appVersion: app.getVersion(),
    settings,
    workspace,
    safeStorage,
    logger,
  })
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

  registerIpc({
    onPresentationDirty: (value) => {
      presentationDirty = value
    },
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
    getMainWindow: () => mainWindow,
  })
  createMainWindow()
  createTray()
  reminderManager.start()
  backupManager.startAuto()

  mainWindow.webContents.once('did-finish-load', () => {
    if (!settings.get().autoCheckLauncher) return
    setTimeout(() => {
      launcherUpdater.check().catch((error) => logger.warn('launcher-update', error.message))
    }, 1000)
  })
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

app.on('before-quit', (event) => {
  if (!confirmPresentationClose()) {
    event.preventDefault()
    return
  }
  quitting = true
  backupManager?.stopAuto()
})

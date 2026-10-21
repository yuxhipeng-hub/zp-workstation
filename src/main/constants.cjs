const os = require('node:os')
const path = require('node:path')

const APP_NAME = 'ZP Workbench'
const APP_ID = 'com.zp.workbench'
const THEME_VALUES = new Set(['system', 'light', 'dark'])

const DEFAULT_SETTINGS = {
  dshHome: path.join(os.homedir(), '.dsh'),
  experimentDir: path.join(os.homedir(), 'ZP Workbench', '实验资料'),
  logDir: '',
  host: '127.0.0.1',
  port: 3080,
  openMode: 'embedded',
  autoCheckLauncher: true,
  minimizeToTray: true,
  launchAtLogin: false,
  theme: 'system',
  termStartDate: '',
  notificationsEnabled: true,
  classReminderMinutes: 15,
  assignmentReminderDays: 1,
  dailyDigestTime: '08:00',
  backupEnabled: true,
  backupIntervalHours: 24,
  backupRetention: 20,
  backupIncludeMaterials: false,
  syncProvider: 'none',
  syncLocalDir: '',
  syncWebdavUrl: '',
  syncWebdavRemoteDir: 'ZP-Workbench',
  syncWebdavUsername: '',
  syncAutoUpload: false,
  syncIntervalHours: 24,
  syncLastAt: null,
  aiProfiles: [],
  activeAiProfileId: '',
  reminderLog: {},
  onboarding: {
    welcomeSeen: false,
    guideVersion: 1,
    completedSteps: [],
    dismissedAt: null,
    completedAt: null,
  },
  lastCheckAt: null,
  lastKnownVersion: null,
  updateHistory: [],
}

module.exports = {
  APP_ID,
  APP_NAME,
  DEFAULT_SETTINGS,
  THEME_VALUES,
}

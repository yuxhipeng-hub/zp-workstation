const os = require('node:os')
const path = require('node:path')

const DSH_PACKAGE = '@deepseek-ai/dsh'
const DEFAULT_REGISTRY = process.env.ZP_NPM_REGISTRY || 'https://registry.npmmirror.com'
const REGISTRY_URL = `${DEFAULT_REGISTRY}/${encodeURIComponent(DSH_PACKAGE)}`
const RELEASE_URL = 'https://github.com/deepseek-ai/deepseek-harness/releases'
const DOCS_URL = 'https://deepseek-harness.github.io/deepseek-harness/'
const APP_NAME = 'zp的工作站'
const APP_ID = 'com.zp.workstation'
const THEME_VALUES = new Set(['system', 'light', 'dark'])

const CHANNELS = {
  latest: {
    id: 'latest',
    label: '稳定版',
    registryTag: 'latest',
    description: '推荐日常使用，跟随 npm latest 标签。',
  },
  next: {
    id: 'next',
    label: '预览版',
    registryTag: 'next',
    description: '提前体验候选版本，可能包含兼容性变化。',
  },
  alpha: {
    id: 'alpha',
    label: '开发版',
    registryTag: 'alpha',
    description: '开发预览通道，适合主动测试和反馈问题。',
  },
}

const DEFAULT_SETTINGS = {
  channel: 'latest',
  npmRegistry: DEFAULT_REGISTRY,
  dshHome: path.join(os.homedir(), '.dsh'),
  host: '127.0.0.1',
  port: 3080,
  openMode: 'embedded',
  autoCheckDsh: true,
  autoCheckLauncher: true,
  minimizeToTray: true,
  launchAtLogin: false,
  theme: 'system',
  lastCheckAt: null,
  lastKnownVersion: null,
  updateHistory: [],
}

module.exports = {
  APP_ID,
  APP_NAME,
  CHANNELS,
  DEFAULT_REGISTRY,
  DEFAULT_SETTINGS,
  DOCS_URL,
  DSH_PACKAGE,
  REGISTRY_URL,
  RELEASE_URL,
  THEME_VALUES,
}

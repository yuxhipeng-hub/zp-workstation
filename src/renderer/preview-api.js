const listeners = new Map()

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function emit(channel, payload) {
  for (const listener of listeners.get(channel) || []) listener(clone(payload))
}

function subscribe(channel, callback) {
  const channelListeners = listeners.get(channel) || new Set()
  channelListeners.add(callback)
  listeners.set(channel, channelListeners)
  return () => channelListeners.delete(callback)
}

function createPreviewState() {
  const now = Date.now()
  const dshHome = 'C:\\Users\\小zp\\.dsh'
  const requestedTheme = new URLSearchParams(window.location.search).get('theme')
  const theme = ['system', 'dark', 'light'].includes(requestedTheme) ? requestedTheme : 'dark'
  return {
    settings: {
      channel: 'latest',
      npmRegistry: 'https://registry.npmmirror.com',
      dshHome,
      host: '127.0.0.1',
      port: 3080,
      openMode: 'embedded',
      autoCheckDsh: true,
      autoCheckLauncher: true,
      minimizeToTray: true,
      launchAtLogin: false,
      theme,
      updateHistory: [],
    },
    status: {
      installed: true,
      installedVersion: '0.1.4-rc.2',
      selectedVersion: '0.1.4-rc.2',
      updateState: 'current',
      updateAvailable: false,
      channel: 'latest',
      channelLabel: '稳定版',
      registryError: null,
      dshHome,
      runtimeDir: 'D:\\dsh壳\\vendor',
      logsDir: 'C:\\Users\\小zp\\AppData\\Roaming\\deepseek-harness-launcher\\logs',
      nodeVersion: '24.18.0',
      npmVersion: '12.0.2',
      systemNode: true,
      launcherVersion: '0.1.4',
      channels: {
        latest: '0.1.4-rc.2',
        next: '0.1.5-rc.1',
        alpha: '0.1.6-alpha.1',
      },
      process: {
        running: false,
        pid: null,
        url: '127.0.0.1:3080',
      },
    },
    channels: {
      latest: {
        id: 'latest',
        label: '稳定版',
        description: '推荐日常使用，跟随 npm latest 标签。',
      },
      next: {
        id: 'next',
        label: '预览版',
        description: '提前体验候选版本，可能包含兼容性变化。',
      },
      alpha: {
        id: 'alpha',
        label: '开发版',
        description: '开发预览通道，适合主动测试和反馈问题。',
      },
    },
    release: {
      htmlUrl: 'https://github.com/deepseek-ai/deepseek-harness/releases',
      docsUrl: 'https://deepseek-harness.github.io/deepseek-harness/',
    },
    launcherUpdate: {
      supported: false,
      currentVersion: '0.1.4',
      latestVersion: null,
      message: '尚未配置启动器更新源。',
      asset: null,
    },
    logs: [
      {
        at: new Date(now - 1000 * 45).toISOString(),
        scope: 'preview',
        level: 'info',
        message: '浏览器预览已连接，所有操作均为模拟。',
      },
      {
        at: new Date(now - 1000 * 180).toISOString(),
        scope: 'update',
        level: 'success',
        message: 'DeepSeek Harness 已是最新版本。',
      },
    ],
    history: [],
    plugins: {
      profile: 'web',
      initialized: true,
      plugins: [
        {
          name: '@deepseek-ai/dsh-web-profile',
          version: '0.1.4-rc.2',
          active: true,
        },
      ],
    },
    modelConfig: {
      dshHome,
      defaultModel: {
        provider: 'DeepSeek',
        model: 'deepseek-chat',
        reasoningEffort: 'medium',
      },
      credentials: {
        exists: true,
        refs: ['DEEPSEEK_API_KEY'],
        deepseekStored: true,
        path: `${dshHome}\\.credentials.yaml`,
      },
      settings: {
        exists: true,
        path: `${dshHome}\\settings.yaml`,
      },
      profile: {
        exists: true,
        path: `${dshHome}\\profiles\\web`,
      },
    },
  }
}

export function createPreviewLauncherApi() {
  const state = createPreviewState()

  return {
    on: subscribe,
    async bootstrap() {
      return clone(state)
    },
    async getStatus() {
      return clone(state.status)
    },
    async getSettings() {
      return clone(state.settings)
    },
    async patchSettings(patch) {
      state.settings = { ...state.settings, ...patch }
      emit('settings:changed', state.settings)
      return clone(state.settings)
    },
    async checkUpdate() {
      state.status.updateState = 'current'
      state.status.updateAvailable = false
      state.status.selectedVersion = state.status.installedVersion
      emit('update:state', {
        installedVersion: state.status.installedVersion,
        selectedVersion: state.status.selectedVersion,
        state: state.status.updateState,
        updateAvailable: false,
        channel: state.status.channel,
        channelLabel: state.status.channelLabel,
      })
      return clone(state.status)
    },
    async install() {
      emit('task:update', { visible: true, title: '安装 Harness', detail: '浏览器预览模式' })
      setTimeout(
        () => emit('task:update', { visible: false, title: '安装完成', detail: '预览数据已更新' }),
        900,
      )
      return clone(state.status)
    },
    async launch() {
      state.status.process = {
        running: true,
        pid: 24816,
        url: `${state.settings.host}:${state.settings.port}`,
      }
      emit('process:state', state.status.process)
      return clone(state.status.process)
    },
    async stop() {
      state.status.process = {
        running: false,
        pid: null,
        url: `${state.settings.host}:${state.settings.port}`,
      }
      emit('process:state', state.status.process)
      return clone(state.status.process)
    },
    async listPlugins() {
      return clone(state.plugins)
    },
    async pluginAction(_profile, action, spec) {
      if (action === 'add' && spec) {
        state.plugins.plugins.push({ name: spec, version: 'preview', active: false })
      }
      if (action === 'remove') {
        state.plugins.plugins = state.plugins.plugins.filter((plugin) => plugin.name !== spec)
      }
      return clone(state.plugins)
    },
    async getModelConfig() {
      return clone(state.modelConfig)
    },
    async chooseDshHome() {
      return `${state.settings.dshHome}-preview`
    },
    async openPath() {
      return true
    },
    async openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    },
    async clearLogs() {
      state.logs = []
      return true
    },
    async checkLauncherUpdate() {
      return clone(state.launcherUpdate)
    },
    async downloadLauncherUpdate() {
      return true
    },
  }
}

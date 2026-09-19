const { contextBridge, ipcRenderer } = require('electron')

const allowedEvents = new Set([
  'log:entry',
  'logs:cleared',
  'task:update',
  'update:state',
  'process:state',
  'process:log',
  'settings:changed',
])

contextBridge.exposeInMainWorld('launcher', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  getStatus: () => ipcRenderer.invoke('dsh:status'),
  checkUpdate: (options) => ipcRenderer.invoke('dsh:check-update', options),
  install: (target, options) => ipcRenderer.invoke('dsh:install', target, options),
  launch: () => ipcRenderer.invoke('dsh:launch'),
  stop: () => ipcRenderer.invoke('dsh:stop'),
  listPlugins: (profile) => ipcRenderer.invoke('dsh:plugins', profile),
  pluginAction: (profile, action, spec) => ipcRenderer.invoke('dsh:plugin-action', profile, action, spec),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  patchSettings: (patch) => ipcRenderer.invoke('settings:patch', patch),
  getModelConfig: () => ipcRenderer.invoke('dsh:model-config'),
  chooseDshHome: () => ipcRenderer.invoke('dialog:choose-dsh-home'),
  openPath: (target) => ipcRenderer.invoke('path:open', target),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  checkLauncherUpdate: () => ipcRenderer.invoke('launcher:check-update'),
  downloadLauncherUpdate: (asset) => ipcRenderer.invoke('launcher:download-update', asset),
  on: (channel, callback) => {
    if (!allowedEvents.has(channel)) throw new Error(`不允许监听事件：${channel}`)
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})

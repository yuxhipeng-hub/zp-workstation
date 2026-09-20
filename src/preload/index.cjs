const { contextBridge, ipcRenderer, webUtils } = require('electron')

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
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  createAssignment: (input) => ipcRenderer.invoke('workspace:assignment-create', input),
  updateAssignment: (id, patch) => ipcRenderer.invoke('workspace:assignment-update', id, patch),
  deleteAssignment: (id) => ipcRenderer.invoke('workspace:assignment-delete', id),
  createKnowledge: (input) => ipcRenderer.invoke('workspace:knowledge-create', input),
  updateKnowledge: (id, patch) => ipcRenderer.invoke('workspace:knowledge-update', id, patch),
  deleteKnowledge: (id) => ipcRenderer.invoke('workspace:knowledge-delete', id),
  importExperiments: (entries) => ipcRenderer.invoke('workspace:experiments-import', entries),
  updateExperiment: (id, patch) => ipcRenderer.invoke('workspace:experiment-update', id, patch),
  deleteExperiment: (id) => ipcRenderer.invoke('workspace:experiment-delete', id),
  copyText: (value) => ipcRenderer.invoke('clipboard:write', value),
  chooseDshHome: () => ipcRenderer.invoke('dialog:choose-dsh-home'),
  chooseExperimentDir: () => ipcRenderer.invoke('dialog:choose-experiment-dir'),
  chooseExperimentPdfs: () => ipcRenderer.invoke('dialog:choose-experiment-pdfs'),
  openExperimentFile: (id) => ipcRenderer.invoke('experiments:open-file', id),
  revealExperimentFile: (id) => ipcRenderer.invoke('experiments:reveal-file', id),
  openExperimentDirectory: (group) => ipcRenderer.invoke('experiments:open-directory', group),
  getPathForFile: (file) => webUtils.getPathForFile(file),
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

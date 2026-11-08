const path = require('node:path')
const { AiSecretStore } = require('./ai-secret-store.cjs')
const { VideoManager } = require('./video-manager.cjs')
function registerVideoIpc({
  ipcMain,
  workspace,
  creation,
  dialog,
  getMainWindow,
  safeStorage,
  send = (_channel, _payload) => {},
  app,
}) {
  const secrets = new AiSecretStore(path.dirname(workspace.filePath), safeStorage)
  const manager = new VideoManager({
    workspace,
    creation,
    secrets,
    root: path.join(path.dirname(workspace.filePath), 'creation-video'),
    changed: (id) => send('creation:video-changed', { projectId: id }),
  })
  const validate = (id) => {
    if (typeof id !== 'string' || id.length > 100) throw new Error('项目身份无效。')
    manager.video(id)
  }
  ipcMain.handle('creation:video-command', async (_e, input) => {
    if (input?.action === 'resolve-unknown') {
      validate(input.projectId)
      const result = await dialog.showMessageBox(getMainWindow(), {
        type: 'question',
        title: '核查未知提交',
        message:
          '只有在火山方舟控制台确认没有创建本次任务，才能释放预留。若任务已创建，请取消并补录任务 ID。',
        buttons: ['取消', '我已核查，确认未创建任务'],
        defaultId: 0,
        cancelId: 0,
      })
      if (result.response !== 1) return workspace.get()
    }
    return manager.command(input)
  })
  ipcMain.handle('creation:video-state', (_e, id) => {
    validate(id)
    return manager.state(id)
  })
  ipcMain.handle('creation:video-connect', (_e, id) => {
    validate(id)
    return manager.connect(id)
  })
  ipcMain.handle('creation:video-start', (_e, id, input) => {
    validate(id)
    return manager.start(id, input)
  })
  ipcMain.handle('creation:video-key', (_e, key) => {
    if (typeof key !== 'string' || key.length > 4096) throw new Error('凭证格式无效。')
    secrets.set('creation-seedance', key)
    return { configured: true }
  })
  ipcMain.handle('creation:video-check', async (_e, id) => {
    validate(id)
    await manager.provider.check()
    return { connected: true }
  })
  ipcMain.handle('creation:video-tools', async (_e, id) => {
    validate(id)
    return {
      ffmpeg: await manager.post.check(),
      imageAdapter: '手动导入；尚未验证 Codex app-server 生图与文件取得。',
    }
  })
  ipcMain.handle('creation:video-prepare', (_e, id, shotId) => {
    validate(id)
    return manager.prepare(id, shotId)
  })
  ipcMain.handle('creation:video-submit', async (_e, id, token) => {
    validate(id)
    const pre = manager.previews.get(token)
    if (!pre || pre.projectId !== id) throw new Error('提交预览已失效。')
    const j = pre.job
    const result = await dialog.showMessageBox(getMainWindow(), {
      type: 'question',
      title: '确认本次付费视频生成',
      message: `提交镜头 ${j.shotId} 至火山方舟\n模型 ${j.model} · ${j.duration}秒 · ${j.resolution} · ${j.ratio}\n估算 ¥${j.estimate.toFixed(2)} · 保守预留 ¥${j.reserve.toFixed(2)}\n估算不是账单上界；Codex 与生图费用另计。`,
      detail: `首帧：${j.request.firstFrame}\n尾帧：${j.request.lastFrame}\n${j.request.prompt}`,
      buttons: ['取消', '确认本次提交'],
      defaultId: 0,
      cancelId: 0,
    })
    if (result.response !== 1) return workspace.get()
    return manager.submit(id, token)
  })
  ipcMain.handle('creation:video-render', (_e, id) => {
    validate(id)
    return manager.render(id)
  })
  manager
    .recover()
    .then(() => manager.startPolling())
    .catch(() => {})
  app?.on('before-quit', () => manager.close())
  return manager
}
module.exports = { registerVideoIpc }

const path = require('node:path')
const { CreationManager, localUrl, within } = require('./creation-manager.cjs')
const fs = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')

function registerCreationIpc({
  ipcMain,
  workspace,
  dialog,
  shell,
  clipboard,
  protocol,
  net,
  getMainWindow,
}) {
  const manager = new CreationManager(workspace)
  const media = new Map()
  let queue = Promise.resolve()
  const serialized = (fn) => {
    const result = queue.then(fn)
    queue = result.catch(() => {})
    return result
  }
  protocol.handle('studio-media', async (request) => {
    const token = new URL(request.url).hostname
    const entry = media.get(token)
    if (!entry || !['GET', 'HEAD'].includes(request.method))
      return new Response('Unavailable', { status: 404 })
    try {
      const stat = await fs.stat(entry.path)
      if (stat.size !== entry.size || stat.mtimeMs !== entry.mtimeMs)
        return new Response('File changed', { status: 409 })
      const owner = manager.project(entry.projectId)
      const a = owner.artifacts.find((x) => x.id === entry.artifactId)
      if (!a || a.digest !== entry.digest || a.path !== entry.path)
        return new Response('Unavailable', { status: 404 })
      if (a.source === 'external')
        await within(owner.directory, path.relative(owner.directory, a.path))
      return net.fetch(pathToFileURL(entry.path).href, {
        method: request.method,
        headers: request.headers,
      })
    } catch {
      return new Response('Unavailable', { status: 404 })
    }
  })
  ipcMain.handle('creation:confirm-removal', async (_e, id) => {
    manager.project(id)
    const result = await dialog.showMessageBox(getMainWindow(), {
      type: 'question',
      title: '移除工作室记录',
      message: '仅移除项目、版本索引、意见和发布记录。外部目录与原始文件不会删除。',
      buttons: ['取消', '移除记录'],
      defaultId: 0,
      cancelId: 0,
    })
    return result.response === 1
  })
  ipcMain.handle('creation:command', (_e, input) => serialized(() => manager.command(input)))
  ipcMain.handle('creation:details', (_e, id) => manager.details(id))
  ipcMain.handle('creation:document', async (_e, id, name) => {
    const p = manager.project(id)
    if (!p.directory || !['BRIEF.md', 'HANDOFF.md', 'QA.md', 'README.md'].includes(name))
      throw new Error('资料名称无效或目录未连接。')
    const file = await within(p.directory, name)
    const stat = await fs.stat(file)
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error('资料须为不超过 1 MB 的文字文件。')
    return fs.readFile(file, 'utf8')
  })
  ipcMain.handle('creation:refresh', (_e, id) => serialized(() => manager.refresh(id)))
  ipcMain.handle('creation:connect', async (_e, id) => {
    manager.project(id)
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '关联制作项目目录',
      properties: ['openDirectory'],
    })
    return result.canceled ? null : serialized(() => manager.connect(id, result.filePaths[0]))
  })
  ipcMain.handle('creation:import', async (_e, id, label, family) => {
    manager.project(id)
    if (
      typeof label !== 'string' ||
      label.length > 100 ||
      typeof family !== 'string' ||
      family.length > 100
    )
      throw new Error('版本信息无效。')
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: '导入作品（保留原文件）',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '作品与资料', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'md', 'txt'] },
      ],
    })
    return result.canceled
      ? null
      : serialized(() => manager.importFiles(id, result.filePaths, label, family))
  })
  ipcMain.handle('creation:preview', async (_e, id, artifactId) => {
    const owner = manager.project(id)
    const a = owner.artifacts.find((x) => x.id === artifactId)
    if (!a) throw new Error('产物不存在。')
    const health = await manager.health(a, owner)
    if (health.status !== 'available' || a.type === 'interactive') return health
    if (a.type === 'text') {
      if (health.size > 1024 * 1024) return { ...health, message: '文字超过 1 MB，请在外部查看。' }
      return { ...health, text: await fs.readFile(a.path, 'utf8') }
    }
    const stat = await fs.stat(a.path)
    const token = randomUUID()
    if (media.size >= 200) media.delete(media.keys().next().value)
    media.set(token, {
      path: a.path,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      digest: a.digest,
      projectId: id,
      artifactId,
    })
    return { ...health, url: `studio-media://${token}/media` }
  })
  ipcMain.handle('creation:open', async (_e, id, artifactId) => {
    const owner = manager.project(id)
    const a = owner.artifacts.find((x) => x.id === artifactId)
    if (!a) throw new Error('产物不存在。')
    if (a.type === 'interactive') {
      if (!localUrl(a.url)) throw new Error('仅支持无凭据、无查询参数的本机 HTTP 地址。')
      return shell.openExternal(a.url)
    }
    if ((await manager.health(a, owner)).status !== 'available')
      throw new Error('文件不可用或已改变，请先重新导入。')
    const error = await shell.openPath(a.path)
    if (error) throw new Error(error)
  })
  ipcMain.handle('creation:feedback', async (_e, id, filters = {}, exportFile = false) => {
    const content = manager.feedback(id, filters)
    if (exportFile === true) {
      const result = await dialog.showSaveDialog(getMainWindow(), {
        title: '导出修改要求',
        defaultPath: '修改要求.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (!result.canceled) await fs.writeFile(result.filePath, content, 'utf8')
    } else clipboard.writeText(content)
    return content
  })
  return manager
}
module.exports = { registerCreationIpc }

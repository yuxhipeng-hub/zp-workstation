const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { registerCreationIpc } = require('../src/main/creation-ipc.cjs')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')
test('creation IPC limits filesystem access to selected records and streams capability URLs', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-creation-ipc-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const workspace = new WorkspaceStore(path.join(dir, 'user'))
  const handlers = new Map()
  let serve,
    copied,
    opened,
    response = { canceled: false, filePaths: [dir] }
  const ipcMain = { handle: (key, fn) => handlers.set(key, fn) }
  registerCreationIpc({
    ipcMain,
    workspace,
    dialog: {
      showOpenDialog: async () => response,
      showMessageBox: async () => ({ response: 1 }),
      showSaveDialog: async () => ({ canceled: false, filePath: path.join(dir, 'feedback.md') }),
    },
    shell: {
      openExternal: async (url) => {
        opened = url
      },
      openPath: async (file) => {
        opened = file
        return ''
      },
    },
    clipboard: {
      writeText: (value) => {
        copied = value
      },
    },
    protocol: {
      handle: (_key, fn) => {
        serve = fn
      },
    },
    net: { fetch: async (url) => new Response(url) },
    getMainWindow: () => null,
  })
  const call = (key, ...args) => handlers.get(`creation:${key}`)(null, ...args)
  const p = (await call('command', { action: 'create', name: 'IPC测试', stage: '选题' }))
    .creationProjects[0]
  await call('connect', p.id)
  assert.equal((await call('details', p.id)).directoryStatus, 'connected')
  assert.equal(await call('confirm-removal', p.id), true)
  fs.writeFileSync(path.join(dir, 'README.md'), 'read only')
  assert.equal(await call('document', p.id, 'README.md'), 'read only')
  fs.writeFileSync(
    path.join(dir, 'workbench-record.json'),
    JSON.stringify({
      schemaVersion: 1,
      projectId: 'external-ipc',
      updatedAt: new Date().toISOString(),
      tasks: [],
      runs: [],
      artifacts: [{ id: 'doc', type: 'text', label: 'v1', path: 'README.md' }],
    }),
  )
  await call('refresh', p.id)
  const external = workspace.get().creationProjects[0].artifacts[0]
  await call('open', p.id, external.id)
  assert.equal(opened, path.join(dir, 'README.md'))
  await assert.rejects(call('document', p.id, '../secret'), /名称/)
  fs.writeFileSync(path.join(dir, 'v.mp4'), require('./fixtures/creation-video.cjs'))
  response = { canceled: false, filePaths: [path.join(dir, 'v.mp4')] }
  await assert.rejects(call('import', p.id, {}, '作品'), /信息/)
  await call('import', p.id, 'v1', '作品')
  const a = workspace.get().creationProjects[0].artifacts.find((a) => a.source === 'manual')
  const preview = await call('preview', p.id, a.id)
  assert.match(preview.url, /^studio-media:/)
  assert.equal((await serve({ url: preview.url, method: 'GET', headers: {} })).status, 200)
  assert.equal((await serve({ url: 'studio-media://unknown/file', method: 'GET' })).status, 404)
  await call('open', p.id, a.id)
  assert.equal(opened, path.join(dir, 'v.mp4'))
  fs.writeFileSync(path.join(dir, 'v.mp4'), 'changed')
  assert.equal((await serve({ url: preview.url, method: 'GET', headers: {} })).status, 409)
  await assert.rejects(call('open', p.id, a.id), /不可用/)
  assert.equal((await call('preview', p.id, a.id)).status, 'unavailable')
  await assert.rejects(call('preview', p.id, 'missing'), /不存在/)
  await assert.rejects(call('open', p.id, 'missing'), /不存在/)
  await call('feedback', p.id)
  assert.match(copied, /暂无/)
  await call('feedback', p.id, {}, true)
  assert.match(fs.readFileSync(path.join(dir, 'feedback.md'), 'utf8'), /暂无/)
  response = { canceled: true, filePaths: [] }
  assert.equal(await call('connect', p.id), null)
  assert.equal(await call('import', p.id, 'v2', '作品'), null)
})

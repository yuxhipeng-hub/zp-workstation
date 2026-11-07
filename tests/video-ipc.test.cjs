const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')
const { CreationManager } = require('../src/main/creation-manager.cjs')
const { registerVideoIpc } = require('../src/main/video-ipc.cjs')
test('video IPC keeps credentials encrypted, validates scope, requires native confirmation and stops lifecycle', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-video-ipc-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const workspace = new WorkspaceStore(dir),
    creation = new CreationManager(workspace),
    handlers = new Map(),
    lifecycle = new Map()
  let answer = 0,
    submitted = 0
  const transform = (b) => Buffer.from(b).map((x) => x ^ 91)
  const manager = registerVideoIpc({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    workspace,
    creation,
    dialog: { showMessageBox: async () => ({ response: answer }) },
    getMainWindow: () => null,
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => transform(s),
      decryptString: (b) => transform(b).toString(),
    },
    app: { on: (name, fn) => lifecycle.set(name, fn) },
  })
  t.after(() => manager.close())
  const call = (key, ...args) => handlers.get('creation:' + key)(null, ...args)
  const id = (await creation.command({ action: 'create', name: 'IPC', stage: '简报' }))
    .creationProjects[0].id
  await call('video-command', { projectId: id, action: 'enable' })
  await call('video-key', 'credential-never-export')
  assert.equal(JSON.stringify(workspace.get()).includes('credential'), false)
  assert.equal(
    (await fs.readFile(path.join(dir, 'ai-secrets.bin'))).includes(Buffer.from('credential')),
    false,
  )
  assert.throws(() => call('video-key', {}), /格式/)
  assert.throws(() => call('video-state', '../outside'), /不存在/)
  await assert.rejects(
    call('video-command', { projectId: id, action: 'exec', command: 'not-allowed' }),
    /不支持/,
  )
  await assert.rejects(call('video-start', id, { role: 'admin', message: 'bad' }), /有效/)
  manager.previews.set('preview', {
    projectId: id,
    job: {
      shotId: 'shot',
      model: 'model',
      duration: 5,
      estimate: 1,
      reserve: 2,
      request: { prompt: 'prompt', firstFrame: 'a', lastFrame: 'b' },
    },
  })
  manager.submit = async () => {
    submitted++
    return workspace.get()
  }
  await call('video-submit', id, 'preview')
  assert.equal(submitted, 0)
  answer = 1
  await call('video-submit', id, 'preview')
  assert.equal(submitted, 1)
  await assert.rejects(call('video-submit', id, 'missing'), /失效/)
  manager.provider.check = async () => ({})
  assert.deepEqual(await call('video-check', id), { connected: true })
  lifecycle.get('before-quit')()
  assert.equal(manager.closed, true)
})

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { registerGitHubDiscoveryIpc } = require('../src/main/github-discovery-ipc.cjs')

test('GitHub IPC whitelists periods, flags and favorites without exposing URL fetches', () => {
  const handlers = new Map(),
    calls = []
  registerGitHubDiscoveryIpc({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    client: {
      getSnapshot: (options) => calls.push(options),
      findRepo: (name) => (name === 'example/tool' ? { fullName: name } : null),
    },
    workspace: {
      get: () => ({ githubFavorites: [] }),
      setGitHubFavorite: (name, repo) => calls.push([name, repo]),
    },
  })
  const snapshot = handlers.get('github:snapshot')
  for (const options of [
    null,
    [],
    'weekly',
    { period: 'yearly' },
    { force: 'true' },
    { cacheOnly: 1 },
    { url: 'http://localhost/' },
  ])
    assert.throws(() => snapshot(null, options), /参数/)
  snapshot(null, { period: 'weekly', cacheOnly: true })
  assert.equal(calls.length, 1)
  const favorite = handlers.get('github:favorite-set')
  for (const input of [
    null,
    {},
    { fullName: '../tool', saved: true },
    { fullName: 'example/tool', saved: 1 },
    { fullName: 'example/tool', saved: true, url: 'file:///secret' },
  ])
    assert.throws(() => favorite(null, input), /参数/)
  assert.throws(() => favorite(null, { fullName: 'unknown/tool', saved: true }), /先加载/)
  favorite(null, { fullName: 'example/tool', saved: true })
  assert.deepEqual(calls[1], ['example/tool', { fullName: 'example/tool' }])
  favorite(null, { fullName: 'unknown/tool', saved: false })
  assert.deepEqual(calls[2], ['unknown/tool', null])
})

test('preload exposes only the three specific GitHub operations', () => {
  let api
  const calls = []
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/preload/index.cjs'), 'utf8'), {
    require: () => ({
      contextBridge: {
        exposeInMainWorld: (_name, value) => {
          api = value
        },
      },
      ipcRenderer: { invoke: (...args) => calls.push(args) },
      webUtils: {},
    }),
  })
  api.getGitHubSnapshot({ period: 'monthly' })
  api.getGitHubFavorites()
  api.setGitHubFavorite({ fullName: 'example/tool', saved: true })
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['github:snapshot', 'github:favorites', 'github:favorite-set'],
  )
  assert.equal(api.ipcRenderer, undefined)
  assert.equal(api.fetch, undefined)
})

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const { createPresentation } = require('../src/shared/presentation.mjs')
const { registerPresentationIpc } = require('../src/main/presentation-ipc.cjs')

function harness(overrides = {}) {
  const handlers = new Map()
  const calls = []
  const mock = {
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: {
      showSaveDialog: async () => {
        calls.push('dialog')
        return { canceled: true }
      },
    },
  }
  registerPresentationIpc({
    ipcMain: mock.ipcMain,
    dialog: mock.dialog,
    workspace: {
      savePresentation: (deck) => {
        calls.push('save')
        return deck
      },
      deletePresentation: (id) => {
        if (typeof id !== 'string' || !id || id.length > 80) throw new Error('作品编号无效。')
        calls.push('delete')
      },
    },
    aiService: {
      generatePresentation: (brief) => {
        calls.push('generate')
        return brief
      },
    },
    onPresentationDirty: (value) => calls.push(`dirty:${value}`),
    getMainWindow: () => null,
    getExportDirectory: () => 'unused',
    ...overrides,
  })
  return { handlers, calls }
}

test('PPT IPC validates renderer data before persistence, model calls or a save dialog', async () => {
  const { handlers, calls } = harness()
  for (const name of ['presentation:save', 'presentation:generate', 'presentation:export']) {
    await assert.rejects(async () => handlers.get(name)(null, { slides: [] }))
  }
  assert.deepEqual(calls, [])
  assert.throws(() => handlers.get('presentation:delete')(null, {}), /编号无效/)
  assert.deepEqual(calls, [])
})

test('canceling PPTX export never writes and releases the export lock', async () => {
  const { handlers, calls } = harness()
  const deck = createPresentation()
  const handler = handlers.get('presentation:export')
  assert.equal((await handler(null, deck)).canceled, true)
  assert.equal((await handler(null, deck)).canceled, true)
  assert.deepEqual(calls, ['dialog', 'dialog'])
})

test('PPT IPC routes valid saves, deletes and draft generation to their bounded services', () => {
  const { handlers, calls } = harness()
  const deck = createPresentation()
  assert.equal(handlers.get('presentation:save')(null, deck).title, deck.title)
  handlers.get('presentation:delete')(null, deck.id)
  assert.equal(
    handlers.get('presentation:generate')(null, { title: '提案', scene: 'proposal', pageCount: 3 })
      .pageCount,
    3,
  )
  assert.deepEqual(calls, ['save', 'delete', 'generate'])
})

test('PPT IPC uses only the selected dialog path, sanitizes suggested names and appends the extension', async () => {
  const written = []
  let suggested
  const { handlers } = harness({
    dialog: {
      showSaveDialog: async (_window, options) => {
        suggested = options.defaultPath
        return { canceled: false, filePath: 'chosen' }
      },
    },
    writePresentation: async (_deck, target) => {
      written.push(target)
      return { filePath: target, size: 100 }
    },
  })
  const deck = createPresentation({ title: 'A/B:提案' })
  deck.filePath = 'untrusted-renderer-path'
  assert.equal((await handlers.get('presentation:export')(null, deck)).filePath, 'chosen.pptx')
  assert.equal(path.basename(suggested), 'A_B_提案.pptx')
  assert.deepEqual(written, ['chosen.pptx'])
})

test('PPT IPC rejects overfull pages before opening a dialog and blocks concurrent exports', async () => {
  let resolveDialog
  let dialogs = 0
  const { handlers } = harness({
    dialog: {
      showSaveDialog: () => {
        dialogs += 1
        return new Promise((resolve) => {
          resolveDialog = resolve
        })
      },
    },
  })
  const exportDeck = handlers.get('presentation:export')
  const deck = createPresentation()
  deck.slides[0].body = '文字'.repeat(600)
  await assert.rejects(exportDeck(null, deck), /超出版式容量/)
  assert.equal(dialogs, 0)
  deck.slides[0].body = ''
  const pending = exportDeck(null, deck)
  await assert.rejects(exportDeck(null, deck), /正在导出/)
  resolveDialog({ canceled: true })
  assert.equal((await pending).canceled, true)
})

test('a failed PPT export releases the lock so the user can retry', async () => {
  let attempts = 0
  const { handlers } = harness({
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: 'chosen.PPTX' }) },
    writePresentation: async (_deck, target) => {
      attempts += 1
      if (attempts === 1) throw new Error('磁盘写入失败')
      return { filePath: target, size: 100 }
    },
  })
  const handler = handlers.get('presentation:export')
  await assert.rejects(handler(null, createPresentation()), /磁盘写入失败/)
  assert.equal((await handler(null, createPresentation())).filePath, 'chosen.PPTX')
})

test('only accepts a boolean unsaved-state signal from the renderer', () => {
  const { handlers, calls } = harness()
  assert.throws(() => handlers.get('presentation:dirty')(null, 'true'), /状态无效/)
  handlers.get('presentation:dirty')(null, true)
  handlers.get('presentation:dirty')(null, false)
  assert.deepEqual(calls, ['dirty:true', 'dirty:false'])
})

test('PPT preload exposes only the specific presentation operations', () => {
  let exposed
  const calls = []
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/preload/index.cjs'), 'utf8'), {
    require: () => ({
      contextBridge: {
        exposeInMainWorld: (_name, value) => {
          exposed = value
        },
      },
      ipcRenderer: { invoke: (...args) => calls.push(args) },
      webUtils: {},
    }),
  })
  exposed.savePresentation({ title: 'test' })
  exposed.generatePresentation({ title: 'brief' })
  exposed.exportPresentation({ title: 'deck' })
  exposed.deletePresentation('id')
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['presentation:save', 'presentation:generate', 'presentation:export', 'presentation:delete'],
  )
  assert.equal(exposed.ipcRenderer, undefined)
})

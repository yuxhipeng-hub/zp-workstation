const assert = require('node:assert/strict')
const test = require('node:test')
const { createPptStudioPage } = require('../src/renderer/pages/ppt-studio.js')
const { createPresentation } = require('../src/shared/presentation.mjs')

test('background model and save completions keep the app unsaved-state signal accurate', async (t) => {
  const previousDocument = globalThis.document
  globalThis.document = { querySelector: () => null }
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  })
  const dirtySignals = []
  const state = { page: 'ppt', workspace: { presentations: [] } }
  let finish
  const page = createPptStudioPage({
    state,
    api: {
      chatPresentation: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
      savePresentation: async (deck) => ({ presentations: [deck] }),
      setPresentationDirty: async (value) => {
        dirtySignals.push(value)
      },
    },
    escapeHtml: (value) => String(value),
    render: () => {},
    toast: () => {},
    openChoiceDialog: async () => 'keep',
    openSaveChangesDialog: async () => 'cancel',
    activeAiProfile: () => ({ label: '测试模型' }),
  })
  page.handleInput({ dataset: { pptScope: 'chat', pptField: 'message' }, value: '按材料直接制作' })
  const pending = page.handleAction('ppt-send', {})
  state.page = 'today'
  finish({ action: 'create', message: '已生成', deck: createPresentation() })
  await pending
  assert.deepEqual(dirtySignals, [true])
  assert.equal(state.workspace.presentations.length, 0)
  await page.handleAction('ppt-save', {})
  assert.deepEqual(dirtySignals, [true, false])
  assert.equal(state.workspace.presentations.length, 1)
})

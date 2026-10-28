const assert = require('node:assert/strict')
const test = require('node:test')
const { createPptStudioPage } = require('../src/renderer/pages/ppt-studio.js')
const { createPresentation } = require('../src/shared/presentation.mjs')

test('background model and save completions keep the app unsaved-state signal accurate', async (t) => {
  const previousDocument = globalThis.document
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [] }
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
      designPresentation: () =>
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

test('background visual checks never overwrite user edits or block saving the newer draft', async (t) => {
  const previousDocument = globalThis.document
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [] }
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  })
  const source = createPresentation(),
    state = { page: 'today', workspace: { presentations: [] } }
  let finishVisual, saved
  const page = createPptStudioPage({
    state,
    api: {
      designPresentation: async (input) =>
        input.action === 'samples'
          ? { action: 'samples', deck: source, plan: { pages: source.slides }, message: '样稿' }
          : { action: 'create', deck: source, message: '整套', autoInspect: true },
      inspectPresentation: () =>
        new Promise((resolve) => {
          finishVisual = resolve
        }),
      savePresentation: async (deck) => {
        saved = structuredClone(deck)
        return { presentations: [deck] }
      },
      setPresentationDirty: async () => {},
    },
    escapeHtml: (v) => String(v),
    render: () => {},
    toast: () => {},
    openChoiceDialog: async () => null,
    openSaveChangesDialog: async () => null,
    activeAiProfile: () => ({ label: '测试' }),
  })
  page.handleInput({ dataset: { pptScope: 'chat', pptField: 'message' }, value: '制作' })
  await page.handleAction('ppt-send', {})
  await page.handleAction('ppt-complete-design', {})
  assert.equal(typeof finishVisual, 'function')
  page.handleInput({
    dataset: { pptScope: 'slide', pptField: 'title' },
    value: '用户在视觉检查期间修改的标题',
  })
  await page.handleAction('ppt-save', {})
  finishVisual({
    deck: source,
    report: { status: 'pass', issues: [], checkedPageIds: source.slides.map((s) => s.id) },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(saved.slides[0].title, '用户在视觉检查期间修改的标题')
  assert.match(page.renderPage(), /用户在视觉检查期间修改的标题/)
  assert.match(page.renderPage(), /作品已修改|未自动应用/)
})

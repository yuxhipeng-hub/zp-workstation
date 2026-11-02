const assert = require('node:assert/strict')
const test = require('node:test')
const { createPptStudioPage } = require('../src/renderer/pages/ppt-studio.js')
const { createPresentation } = require('../src/shared/presentation.mjs')
const { materializeDesign } = require('../src/shared/presentation-design.mjs')

test('selecting existing artwork keeps AI conversation available and does not change the saved deck', async (t) => {
  const previousDocument = globalThis.document
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [] }
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  })
  const source = materializeDesign(createPresentation())
  let stored
  const page = createPptStudioPage({
    state: { page: 'ppt', workspace: { presentations: [source] } },
    api: {
      setPresentationDirty: async () => {},
      savePresentation: async (deck) => {
        stored = deck
        return { presentations: [deck] }
      },
    },
    escapeHtml: (v) => String(v),
    render: () => {},
    toast: () => {},
    openChoiceDialog: async () => null,
    openSaveChangesDialog: async () => null,
    activeAiProfile: () => ({ label: '测试' }),
  })
  await page.handleAction('ppt-open', { dataset: { id: source.id } })
  page.handleInput({
    dataset: { pptScope: 'chat', pptField: 'message' },
    value: '把选中的元素改得更简洁',
  })
  const before = page.renderPage()
  assert.doesNotMatch(before, /ppt-canvas-mode|ppt-canvas-add-rect|ppt-side-tabs/)
  const scene = require('../src/shared/presentation.mjs').buildSlideScene(
    source.slides[0],
    source.theme,
    0,
    source.slides.length,
  )
  for (const item of scene.nodes) {
    await page.handleAction('ppt-canvas-pick', { dataset: { nodeId: item.id } })
    const html = page.renderPage()
    assert.match(html, /aria-label="对象编辑"/)
    assert.match(html, /id="ppt-message"/)
    assert.match(html, /把选中的元素改得更简洁/)
    assert.match(html, /取消选择/)
  }
  await page.handleAction('ppt-canvas-clear', {})
  assert.doesNotMatch(page.renderPage(), /aria-label="对象编辑"/)
  await page.handleAction('ppt-save', {})
  assert.deepEqual(stored, source)
})

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

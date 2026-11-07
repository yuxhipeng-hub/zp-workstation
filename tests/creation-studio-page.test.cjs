const test = require('node:test')
const assert = require('node:assert/strict')
const { createCreationStudioPage } = require('../src/renderer/pages/creation-studio.js')
const { cleanProject } = require('../src/main/creation-schema.cjs')

function canvas(t, enabled = false) {
  const oldDocument = globalThis.document,
    oldCSS = globalThis.CSS
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [] }
  globalThis.CSS = { escape: String }
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    globalThis.document = oldDocument
    globalThis.CSS = oldCSS
  })
  const video = enabled
    ? {
        schemaVersion: 1,
        content: {
          shots: [
            { id: 'shot', purpose: '检查分镜' },
            { id: 'second', purpose: '第二镜头' },
          ],
        },
      }
    : null
  const records = [
    cleanProject({ id: 'group', name: '系列', kind: 'project' }),
    ...['a', 'b'].map((id) => cleanProject({ id, name: id, parentId: 'group', video })),
  ]
  let renders = 0
  const page = createCreationStudioPage({
    state: { page: 'creation', workspace: { creationProjects: records } },
    api: {},
    escapeHtml: String,
    render: () => renders++,
    toast: () => {},
  })
  return {
    page,
    renders: () => renders,
    click: (action, id, video) => page.handleAction('cs-' + action, { dataset: { id, video } }),
  }
}

test('video tree expansion is independent from the selected inline editor', async (t) => {
  const { page, click } = canvas(t, true)
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  await click('project', 'b')
  assert.equal((page.renderPage().match(/class="cc-roles"/g) || []).length, 2)
  await click('stage', 'story', 'a')
  const html = page.renderPage()
  assert.equal((html.match(/class="cc-workpage"/g) || []).length, 1)
  const start = html.indexOf('data-cc-stage="a:story"'),
    next = html.indexOf('data-cc-stage="a:shots"')
  assert.ok(start >= 0 && html.indexOf('class="cc-workpage"', start) < next)
  await click('project', 'b')
  assert.match(page.renderPage(), /data-cs-step="story"/)
  await click('toggle', 'group')
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage"/)
})

test('object actions toggle closed without opening a second editor', async (t) => {
  const { page, click } = canvas(t, true)
  page.renderPage()
  await click('toggle', 'group')
  for (const action of ['group-menu', 'new-video', 'edit']) {
    await click(action, 'group')
    assert.match(
      page.renderPage(),
      action === 'group-menu' ? /class="cc-group-menu"/ : /class="cs-editor cc-composer"/,
    )
    await click(action, 'group')
    assert.doesNotMatch(page.renderPage(), /class="cc-group-menu"|class="cs-editor cc-composer"/)
  }
  await click('edit', 'a')
  await click('edit', 'a')
  assert.doesNotMatch(page.renderPage(), /class="cs-editor cc-composer"/)
  await click('open-work', 'a')
  assert.match(page.renderPage(), /data-cs-step="all"/)
  await click('open-work', 'a')
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage"/)
})

test('storyboard branches use actual shots and a leaf opens only its own shot editor', async (t) => {
  const { page, click } = canvas(t, true)
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  assert.doesNotMatch(page.renderPage(), /data-cc-shot=/)
  await click('shots-toggle', 'a')
  assert.equal((page.renderPage().match(/data-cc-shot=/g) || []).length, 2)
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage"/)
  await click('shot-open', 'second', 'a')
  const html = page.renderPage()
  assert.match(html, /data-cs-step="shots"/)
  assert.match(html, /value="第二镜头"/)
  assert.doesNotMatch(html, /全片分镜总览/)
  assert.doesNotMatch(html, /class="cv-shot-nav"/)
  await click('shots-toggle', 'a')
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage"/)
})

test('canvas reveals only the requested level and selecting a stage renders once', async (t) => {
  const { page, click, renders } = canvas(t)
  assert.doesNotMatch(page.renderPage(), /data-cc-video=/)
  await click('toggle', 'group')
  assert.equal((page.renderPage().match(/data-cc-video=/g) || []).length, 2)
  assert.doesNotMatch(page.renderPage(), /class="cc-roles"/)
  await click('project', 'a')
  assert.equal((page.renderPage().match(/class="cc-roles"/g) || []).length, 1)
  const before = renders()
  await click('stage', 'story', 'a')
  assert.equal(renders() - before, 1)
  assert.match(page.renderPage(), /data-cs-step="story"/)
  assert.doesNotMatch(page.renderPage(), /从创意到成片/)
  await click('stage', 'story', 'a')
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage"/)
})

test('audit and generation have separate content, and editing requirements closes the step', async (t) => {
  const { page, click } = canvas(t, true)
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  await click('stage', 'audit', 'a')
  const audit = page.renderPage()
  assert.match(audit, /data-cs-step="audit"/)
  assert.match(audit, /data-action="cs-v-review"/)
  assert.doesNotMatch(audit, /供应商配置与预算/)
  await click('stage', 'generate', 'a')
  const generate = page.renderPage()
  assert.match(generate, /供应商配置与预算/)
  assert.doesNotMatch(generate, /data-v-form="prompt"/)
  await click('edit', 'a')
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage"/)
  assert.match(page.renderPage(), /aria-label="调整需求"/)
})

test('version comparison responds before asynchronous media hydration starts', async (t) => {
  const previous = globalThis.document
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [] }
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
    globalThis.document = previous
  })
  const artifacts = ['v1', 'v2'].map((id) => ({ id, family: '封面', label: id }))
  const project = {
    id: 'p',
    name: '项目',
    stage: '验收',
    archived: false,
    artifacts,
    reviews: [],
    tasks: [],
    runs: [],
    activity: [],
    publications: [],
  }
  const page = createCreationStudioPage({
    state: { page: 'creation', workspace: { creationProjects: [project] } },
    api: {},
    escapeHtml: String,
    render: () => {},
    toast: () => {},
  })
  page.renderPage()
  await page.handleAction('cs-toggle', { dataset: { id: 'p' } })
  await page.handleAction('cs-project', { dataset: { id: 'p' } })
  await page.handleAction('cs-tab', { dataset: { id: 'works' } })
  assert.equal(page.handleChange({ dataset: { csField: 'compare' }, value: 'v1' }), true)
  assert.match(page.renderPage(), /data-cs-preview="compare"/)
})

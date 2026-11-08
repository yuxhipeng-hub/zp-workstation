const test = require('node:test')
const assert = require('node:assert/strict')
const { createCreationStudioPage } = require('../src/renderer/pages/creation-studio.js')
const { cleanProject } = require('../src/main/creation-schema.cjs')

function canvas(t, enabled = false, api = {}) {
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
    api,
    escapeHtml: String,
    render: () => renders++,
    toast: () => {},
  })
  return {
    page,
    records,
    renders: () => renders,
    click: (action, id, video) => page.handleAction('cs-' + action, { dataset: { id, video } }),
  }
}

test('focused steps expose only their own editing and task actions', async (t) => {
  const { page, click, records } = canvas(t, true)
  records.find((p) => p.id === 'a').artifacts.push({ id: 'film', type: 'video', label: '成片' })
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  const expected = {
    story: ['save-story', 'confirm-story'],
    shots: ['save-shot', 'save-prompt', 'add-shot', 'split-shot', 'delete-shot'],
    design: ['save-design', 'save-frames'],
    audit: ['review', 'connect'],
    generate: ['prepare', 'save-provider'],
    edit: ['save-edit', 'render', 'tools', 'connect'],
  }
  const exclusive = Object.values(expected).flat()
  for (const [step, actions] of Object.entries(expected)) {
    await click('edit-step', step, 'a')
    const html = page.renderPage()
    for (const action of exclusive) {
      if (actions.includes(action)) assert.match(html, new RegExp(`data-action="cs-v-${action}"`))
      else
        assert.doesNotMatch(html, new RegExp(`data-action="cs-v-${action}"`), `${step}: ${action}`)
    }
    assert.doesNotMatch(html, /class="cs-tabs"|class="cv-stages"|全部制作工具|调整需求/)
    if (!['design', 'edit'].includes(step)) assert.doesNotMatch(html, /data-action="cs-import"/)
    assert.doesNotMatch(html, /data-action="cs-v-step"|data-action="cs-v-inspect-shot"/)
  }
  await click('edit-step', 'works', 'a')
  const acceptance = page.renderPage()
  assert.match(acceptance, /data-action="cs-approve"/)
  assert.doesNotMatch(acceptance, /data-action="cs-v-|class="cs-tabs"|全部制作工具|调整需求/)
})

test('step clicks open a reading tree and editing is an explicit secondary action', async (t) => {
  const { page, click, records } = canvas(t, true)
  records.find((p) => p.id === 'a').video.content.story = '只在展开后读取的故事'
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  await click('stage', 'story', 'a')
  const closed = page.renderPage()
  assert.match(closed, /cc-step-tree/)
  assert.match(closed, /创作简报|故事正文/)
  assert.doesNotMatch(closed, /<textarea|<input|只在展开后读取的故事/)
  await click('function-toggle', 'a:story:story')
  assert.match(page.renderPage(), /只在展开后读取的故事/)
  await click('edit-step', 'story', 'a')
  assert.match(page.renderPage(), /<textarea/)
  await click('read-step')
  assert.doesNotMatch(page.renderPage(), /<textarea/)
  assert.match(page.renderPage(), /只在展开后读取的故事/)
})

test('step context keeps unrelated content and unbound media out of each branch', async (t) => {
  const { page, click, records } = canvas(t, true)
  const p = records.find((p) => p.id === 'a')
  p.video.content.story = 'STORY_ONLY'
  p.video.content.style = 'DESIGN_ONLY'
  p.video.content.shots[0].story = 'SHOT_ONLY'
  p.video.content.shots[0].prompt.action = 'PROMPT_ONLY'
  p.artifacts.push({ id: 'unbound', type: 'image', label: 'UNBOUND_IMAGE', family: '图片' })
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  for (const step of ['story', 'shots', 'design', 'audit', 'generate', 'edit']) {
    await click('edit-step', step, 'a')
    const html = page.renderPage()
    assert.doesNotMatch(html, /data-cs-preview="content-unbound"/)
    if (step !== 'story') assert.doesNotMatch(html, /STORY_ONLY/)
    if (!['design', 'audit'].includes(step)) assert.doesNotMatch(html, /DESIGN_ONLY/)
    if (['story', 'design', 'edit'].includes(step))
      assert.doesNotMatch(html, /SHOT_ONLY|PROMPT_ONLY/)
    if (step === 'audit') {
      assert.match(html, /PROMPT_ONLY/)
      assert.doesNotMatch(html, /data-v-form="prompt"/)
    }
  }
})

test('a failed shot deletion keeps the selected leaf and project content intact', async (t) => {
  const { page, click, records } = canvas(t, true, {
    creationVideoCommand: async () => {
      throw new Error('disk full')
    },
  })
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  await click('shots-toggle', 'a')
  await click('shot-open', 'second', 'a')
  const before = structuredClone(records)
  await click('v-delete-shot')
  assert.deepEqual(records, before)
  assert.match(page.renderPage(), /value="第二镜头"/)
  assert.match(page.renderPage(), /data-action="cs-v-delete-shot"/)
})

test('creation steps omit instructional filler and repeated workspace captions', async (t) => {
  const { page, click, records } = canvas(t, true)
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  const filler =
    /添加第一个镜头，先确定叙事目的|逐秒描述表达意图|色块用于检查构图|先导入少量样图确认画风|检查人数、道具|使用已保存的提示词和具体首尾帧版本|按分镜顺序选择具体视频版本|低分辨率素材放大|保留原文件，新增版本|手动记录；不会登录平台/
  for (const step of ['story', 'shots', 'design', 'audit', 'generate', 'edit', 'works']) {
    await click('edit-step', step, 'a')
    const html = page.renderPage()
    assert.doesNotMatch(html, filler, step)
    assert.doesNotMatch(html, /data-cs-latest/, step)
  }
  records.find((p) => p.id === 'a').video.content.shots = []
  await click('edit-step', 'shots', 'a')
  const empty = page.renderPage()
  assert.doesNotMatch(empty, /添加第一个镜头|全片分镜总览/)
  assert.match(empty, /data-action="cs-v-add-shot"/)
})

test('video tree expansion is independent from the selected inline editor', async (t) => {
  const { page, click } = canvas(t, true)
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  await click('project', 'b')
  assert.equal((page.renderPage().match(/class="cc-roles"/g) || []).length, 2)
  await click('stage', 'story', 'a')
  const html = page.renderPage()
  assert.equal((html.match(/class="cc-workpage(?: cc-step-tree)?"/g) || []).length, 1)
  const start = html.indexOf('data-cc-stage="a:story"'),
    next = html.indexOf('data-cc-stage="a:shots"')
  assert.ok(start >= 0 && html.indexOf('class="cc-workpage(?: cc-step-tree)?"', start) < next)
  await click('project', 'b')
  assert.match(page.renderPage(), /data-cs-step="story"/)
  await click('toggle', 'group')
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage(?: cc-step-tree)?"/)
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
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage(?: cc-step-tree)?"/)
})

test('storyboard branches use actual shots and a leaf opens only its own shot editor', async (t) => {
  const { page, click } = canvas(t, true)
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  assert.doesNotMatch(page.renderPage(), /data-cc-shot=/)
  await click('shots-toggle', 'a')
  assert.equal((page.renderPage().match(/data-cc-shot=/g) || []).length, 2)
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage(?: cc-step-tree)?"/)
  await click('shot-open', 'second', 'a')
  const html = page.renderPage()
  assert.match(html, /data-cs-step="shots"/)
  assert.match(html, /value="第二镜头"/)
  assert.doesNotMatch(html, /全片分镜总览/)
  assert.doesNotMatch(html, /class="cv-shot-nav"/)
  await click('shots-toggle', 'a')
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage(?: cc-step-tree)?"/)
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
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage(?: cc-step-tree)?"/)
})

test('audit and generation have separate content, and editing requirements closes the step', async (t) => {
  const { page, click } = canvas(t, true)
  page.renderPage()
  await click('toggle', 'group')
  await click('project', 'a')
  await click('edit-step', 'audit', 'a')
  const audit = page.renderPage()
  assert.match(audit, /data-cs-step="audit"/)
  assert.match(audit, /data-action="cs-v-review"/)
  assert.doesNotMatch(audit, /供应商配置与预算/)
  await click('edit-step', 'generate', 'a')
  const generate = page.renderPage()
  assert.match(generate, /供应商配置与预算/)
  assert.doesNotMatch(generate, /data-v-form="prompt"/)
  await click('edit', 'a')
  assert.doesNotMatch(page.renderPage(), /class="cc-workpage(?: cc-step-tree)?"/)
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

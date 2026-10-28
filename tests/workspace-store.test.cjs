const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')
const { createPresentation } = require('../src/shared/presentation.mjs')

function createStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-workbench-'))
  return {
    directory,
    store: new WorkspaceStore(directory),
  }
}

test('canvas objects, images and locks survive workspace reload and backup restore', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const { canvasFromScene } = require('../src/shared/presentation-canvas.mjs')
  const { buildSlideScene } = require('../src/shared/presentation.mjs')
  const deck = createPresentation()
  deck.slides[0].canvas = canvasFromScene(buildSlideScene(deck.slides[0]), deck.slides[0])
  deck.slides[0].canvas[0].locked = true
  deck.slides[0].canvas.push({
    id: 'photo',
    type: 'image',
    x: 100,
    y: 300,
    w: 200,
    h: 100,
    fit: 'cover',
    locked: false,
    hidden: false,
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  })
  deck.slides[0].background = 'F7F6F2'
  store.savePresentation(deck)
  const saved = new WorkspaceStore(directory).get().presentations[0]
  assert.deepEqual(saved.slides[0].canvas, deck.slides[0].canvas)
  const backup = store.createBackup('canvas-ppt')
  store.deletePresentation(deck.id)
  store.restoreBackup(backup.fileName)
  assert.deepEqual(store.get().presentations[0].slides[0].canvas, saved.slides[0].canvas)
})

test('structured PPT data and planning survive reload, backups and old-snapshot compatibility', (t) => {
  const { referenceDeck, planningReply } = require('./fixtures/presentation-reference.cjs')
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const deck = referenceDeck('proposal')
  deck.strategy = planningReply(deck).plan.strategy
  store.savePresentation(deck)
  const saved = new WorkspaceStore(directory).get().presentations[0]
  assert.deepEqual(saved.slides[2].chart.series[0].values, [3, 4, 1])
  assert.deepEqual(saved.slides[3].comparison, deck.slides[3].comparison)
  assert.deepEqual(saved.strategy, deck.strategy)
  const backup = store.createBackup('structured-ppt')
  store.deletePresentation(deck.id)
  store.restoreBackup(backup.fileName)
  assert.deepEqual(store.get().presentations[0].slides[5].items, saved.slides[5].items)
  const old = createPresentation({ title: '旧版作品' })
  const migrated = store.normalizeData({
    presentations: [old, { ...deck, slides: [{ ...deck.slides[2], chart: { type: 'bad' } }] }],
  })
  assert.equal(migrated.presentations[0].slides[1].layout, 'split')
  assert.equal(migrated.presentations[0].strategy, undefined)
  assert.equal(migrated.presentations[1].slides[0].chart, undefined)
})

test('persists PPT projects, updates without duplicates and preserves them through snapshot import', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  store.createAssignment({ title: '已有作业' })
  const deck = createPresentation({ title: '商业提案' })
  store.savePresentation(deck)
  deck.title = '修改后的提案'
  deck.slides[1].notes = '核实数据来源'
  store.savePresentation(deck)
  const reloaded = new WorkspaceStore(directory)
  assert.equal(reloaded.get().presentations.length, 1)
  assert.equal(reloaded.get().presentations[0].title, deck.title)
  assert.equal(reloaded.get().presentations[0].slides[1].notes, '核实数据来源')
  assert.equal(reloaded.get().assignments[0].title, '已有作业')
  const snapshot = path.join(directory, 'snapshot.json')
  reloaded.exportSnapshot(snapshot)
  reloaded.deletePresentation(deck.id)
  assert.equal(reloaded.get().presentations.length, 0)
  reloaded.importSnapshot(snapshot)
  assert.equal(reloaded.get().presentations[0].id, deck.id)
  const oldBackup = reloaded.createBackup('ppt')
  reloaded.deletePresentation(deck.id)
  reloaded.restoreBackup(oldBackup.fileName)
  assert.equal(reloaded.get().presentations[0].id, deck.id)
})

test('old workspaces default to no PPT projects and failed saves retain the previous deck', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  assert.deepEqual(store.normalizeData({ assignments: [] }).presentations, [])
  const deck = createPresentation({ title: '原始作品' })
  store.savePresentation(deck)
  const before = store.get().presentations
  store.save = () => {
    throw new Error('模拟磁盘写入失败')
  }
  assert.throws(() => store.savePresentation({ ...deck, title: '未能保存的修改' }), /模拟磁盘/)
  assert.deepEqual(store.get().presentations, before)
  assert.throws(() => store.deletePresentation(deck.id), /模拟磁盘/)
  assert.deepEqual(store.get().presentations, before)
  assert.equal(new WorkspaceStore(directory).get().presentations[0].title, '原始作品')
})

test('persists assignments as local data', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  store.createAssignment({
    title: '线性代数第 3 章作业',
    course: '线性代数',
    dueAt: '2026-09-24',
    priority: 'high',
    status: 'inbox',
  })

  const reloaded = new WorkspaceStore(directory).get()
  assert.equal(reloaded.assignments.length, 1)
  assert.equal(reloaded.assignments[0].title, '线性代数第 3 章作业')
})

test('keeps legacy knowledge data when loading an older workspace file', (t) => {
  const { directory } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  fs.writeFileSync(
    path.join(directory, 'workspace.json'),
    JSON.stringify(
      {
        version: 2,
        courses: [],
        assignments: [],
        knowledge: [{ id: 'legacy-1', title: '矩阵的秩', course: '线性代数', tags: ['矩阵'] }],
        experiments: [],
        schedule: null,
      },
      null,
      2,
    ),
    'utf8',
  )

  const store = new WorkspaceStore(directory)
  const ids = (workspace) => workspace.knowledge.map((item) => item.id)
  assert.deepEqual(ids(store.get()), ['legacy-1'])
  const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'workspace.json'), 'utf8'))
  assert.deepEqual(ids(persisted), ['legacy-1'])
})

test('normalizes invalid assignment fields and supports updates', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const created = store.createAssignment({
    title: '实验报告',
    status: 'unknown',
    priority: 'urgent',
  })
  const assignment = created.assignments[0]
  assert.equal(assignment.status, 'inbox')
  assert.equal(assignment.priority, 'medium')

  const updated = store.updateAssignment(assignment.id, { status: 'done' })
  assert.equal(updated.assignments[0].status, 'done')
  assert.throws(() => store.createAssignment({ title: '   ' }), /标题不能为空/)
})

test('persists a structured AI execution plan with an assignment', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const workspace = store.createAssignment({
    title: '操作系统实验',
    course: '操作系统',
    aiPlan: {
      generatedAt: '2026-10-21T12:00:00.000Z',
      provider: 'DeepSeek',
      model: 'deepseek-chat',
      summary: '完成进程调度实验',
      prerequisites: ['阅读实验要求'],
      steps: ['分析需求', '实现调度算法', '运行测试'],
      risks: ['忽略边界条件'],
      checklist: ['提交实验报告'],
    },
  })
  const assignment = workspace.assignments[0]
  assert.equal(assignment.aiPlan.steps.length, 3)
  assert.equal(assignment.aiPlan.provider, 'DeepSeek')

  const reloaded = new WorkspaceStore(directory).get()
  assert.deepEqual(reloaded.assignments[0].aiPlan.prerequisites, ['阅读实验要求'])

  const removed = store.updateAssignment(assignment.id, { aiPlan: null })
  assert.equal(removed.assignments[0].aiPlan, null)
})

test('links assignments, experiments, and schedule entries to one course entity', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  store.createAssignment({ title: '第 3 章作业', course: '线性代数' })
  store.addExperiments([
    {
      title: '线性代数实验',
      originalName: '线性代数实验.pdf',
      filePath: 'D:\\资料\\线性代数实验.pdf',
      group: '线性代数实验',
    },
  ])
  store.replaceSchedule({
    courses: [
      {
        id: 'course-1',
        name: '线性代数',
        weekday: 3,
        startPeriod: 7,
        endPeriod: 8,
        weeks: [1, 2, 3],
      },
    ],
  })
  store.replaceSchedule(store.get().schedule)

  const workspace = store.get()
  const course = workspace.courses.find((item) => item.name === '线性代数')
  assert.ok(course, 'expected a course entity to be created')
  assert.equal(workspace.assignments[0].courseId, course.id)
  assert.equal(workspace.schedule.courses[0].courseId, course.id)

  const counts = store.listCourses().find((item) => item.id === course.id).counts
  assert.equal(counts.assignments, 1)
  assert.equal(counts.schedule, 1)
})

test('renames a course everywhere and reports experiment folders to move', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  store.createAssignment({ title: '实验报告', course: '算法设计与分析' })
  store.addExperiments([
    {
      title: '算法实验',
      originalName: '算法实验.pdf',
      filePath: 'D:\\资料\\算法设计与分析实验\\算法实验.pdf',
      group: '算法设计与分析实验',
    },
  ])
  const before = store.get()
  const course = before.courses.find((item) => item.name === '算法设计与分析')
  assert.ok(course)
  assert.equal(before.experiments[0].courseId, course.id)

  const result = store.renameCourse(course.id, '算法分析')
  assert.equal(result.course.name, '算法分析')
  assert.ok(result.groupRenames.length >= 1)
  assert.equal(result.groupRenames[0].to, '算法分析')
  assert.equal(result.workspace.assignments[0].course, '算法分析')
  const reloaded = new WorkspaceStore(directory).get()
  assert.equal(reloaded.courses.filter((item) => item.name === '算法分析').length, 1)
})

test('persists course colors and custom experiment libraries', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  store.createExperimentGroup('课程资料')
  store.replaceSchedule({
    courses: [
      {
        id: 'course-color-1',
        name: '线性代数',
        weekday: 3,
        startPeriod: 7,
        endPeriod: 8,
        weeks: [1, 2, 3],
        color: '#4f7cd9',
      },
    ],
  })

  const reloaded = new WorkspaceStore(directory).get()
  assert.equal(reloaded.experimentGroups[0].name, '课程资料')
  assert.equal(reloaded.schedule.courses[0].color, '#4F7CD9')
  assert.equal(reloaded.courses.find((item) => item.name === '线性代数').color, '#4F7CD9')
})

test('creates, lists, restores backups and reports missing files', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  store.createAssignment({ title: '备份前作业', course: '高等数学' })
  const backup = store.createBackup('manual')
  assert.ok(backup.fileName.startsWith('workspace-'))
  assert.equal(backup.summary.assignments, 1)
  assert.equal(store.listBackups().length >= 1, true)

  store.createAssignment({ title: '备份后作业', course: '大学英语' })
  assert.equal(store.get().assignments.length, 2)
  store.restoreBackup(backup.fileName)
  assert.equal(store.get().assignments.length, 1)
  assert.equal(store.get().assignments[0].title, '备份前作业')

  store.addExperiments([
    {
      title: '丢失的资料',
      originalName: '丢失的资料.pdf',
      filePath: path.join(directory, 'not-there.pdf'),
      group: '高等数学',
    },
  ])
  const health = store.healthCheck()
  assert.equal(health.healthy, false)
  assert.equal(health.missing.length, 1)
  assert.equal(health.missing[0].title, '丢失的资料')
})

test('exports and imports a portable snapshot', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  store.createAssignment({ title: '快照作业', course: '数据结构' })
  const target = path.join(directory, 'snapshot.json')
  const exported = store.exportSnapshot(target)
  assert.equal(exported.filePath, target)
  assert.ok(exported.size > 0)

  const otherDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-workbench-import-'))
  t.after(() => fs.rmSync(otherDirectory, { recursive: true, force: true }))
  const other = new WorkspaceStore(otherDirectory)
  const imported = other.importSnapshot(target)
  assert.equal(imported.assignments.length, 1)
  assert.equal(imported.assignments[0].title, '快照作业')
  assert.equal(
    imported.courses.some((item) => item.name === '数据结构'),
    true,
  )
})

test('keeps a recoverable copy when the workspace file is corrupt', (t) => {
  const { directory } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'workspace.json')
  fs.writeFileSync(filePath, '{ broken json')

  const store = new WorkspaceStore(directory)
  assert.equal(store.get().assignments.length, 0)

  const copies = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith('workspace.corrupt-') && name.endsWith('.json'))
  assert.equal(copies.length, 1)
  assert.equal(fs.readFileSync(path.join(directory, copies[0]), 'utf8'), '{ broken json')
})

test('ignores a stale temporary file and clears it on the next save', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  store.createAssignment({ title: '正式数据', course: '离散数学' })

  const filePath = path.join(directory, 'workspace.json')
  const temporary = `${filePath}.tmp`
  fs.writeFileSync(temporary, '{ stale write')

  const reloaded = new WorkspaceStore(directory)
  assert.equal(reloaded.get().assignments[0].title, '正式数据')
  reloaded.save()

  assert.equal(fs.existsSync(temporary), false)
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(filePath, 'utf8')))
})

test('keeps the previous file when a save fails', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  store.createAssignment({ title: '保存失败前的作业', course: '概率论' })

  const temporary = path.join(directory, 'workspace.json.tmp')
  fs.mkdirSync(temporary)
  try {
    assert.throws(() => store.save(), /EISDIR|EPERM|EACCES|EEXIST/)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }

  const reloaded = new WorkspaceStore(directory).get()
  assert.equal(reloaded.assignments.length, 1)
  assert.equal(reloaded.assignments[0].title, '保存失败前的作业')
})

test('keeps the workspace file valid across many rapid saves', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  for (let index = 0; index < 50; index += 1) {
    store.createAssignment({ title: `作业 ${index}`, course: '算法设计与分析' })
  }

  const filePath = path.join(directory, 'workspace.json')
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  assert.equal(parsed.assignments.length, 50)
  assert.equal(parsed.assignments[0].title, '作业 49')
  assert.equal(fs.existsSync(`${filePath}.tmp`), false)
})

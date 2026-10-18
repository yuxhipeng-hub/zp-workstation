const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')

function createStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-workbench-'))
  return {
    directory,
    store: new WorkspaceStore(directory),
  }
}

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

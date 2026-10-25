const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const moduleUrl = pathToFileURL(
  path.join(__dirname, '..', 'src', 'renderer', 'lib', 'assignment-duplicates.js'),
).href

const load = () => import(moduleUrl)

test('normalizes width, case, whitespace and punctuation in assignment titles', async () => {
  const { assignmentTitleKey } = await load()

  assert.equal(assignmentTitleKey('概率论 第 5 章习题'), assignmentTitleKey('概率论第5章习题'))
  assert.equal(assignmentTitleKey('Ｃ语言作业。'), assignmentTitleKey('c语言作业'))
  assert.equal(assignmentTitleKey('【实验】报告'), assignmentTitleKey('实验报告'))
  assert.equal(assignmentTitleKey(''), '')
})

test('finds an existing assignment with the same title, course and due date', async () => {
  const { findDuplicateAssignment } = await load()
  const existing = {
    id: 'a1',
    title: '概率论第 5 章习题',
    course: '概率论',
    dueAt: '2026-11-01',
  }

  const match = findDuplicateAssignment(
    { title: '概率论第5章习题', course: '概率论', dueAt: '2026-11-01' },
    [existing],
  )

  assert.equal(match?.assignment, existing)
  assert.equal(match?.confidence, 'high')
})

test('does not treat the same title with a different due date as a duplicate', async () => {
  const { findDuplicateAssignment } = await load()
  const existing = { id: 'a1', title: '高数作业', course: '高数', dueAt: '2026-11-01' }

  assert.equal(
    findDuplicateAssignment({ title: '高数作业', course: '高数', dueAt: '2026-11-08' }, [existing]),
    null,
  )
})

test('does not treat the same title in another course as a duplicate', async () => {
  const { findDuplicateAssignment } = await load()
  const existing = { id: 'a1', title: '实验报告', course: '物理', dueAt: '2026-11-01' }

  assert.equal(
    findDuplicateAssignment({ title: '实验报告', course: '化学', dueAt: '2026-11-01' }, [existing]),
    null,
  )
})

test('marks a match as medium confidence when the draft has no due date', async () => {
  const { findDuplicateAssignment } = await load()
  const existing = { id: 'a1', title: '概率论习题', course: '概率论', dueAt: '2026-11-01' }

  const match = findDuplicateAssignment({ title: '概率论习题', course: '概率论' }, [existing])

  assert.equal(match?.assignment, existing)
  assert.equal(match?.confidence, 'medium')
})

test('treats unclassified and missing courses as unknown', async () => {
  const { findDuplicateAssignment } = await load()
  const existing = { id: 'a1', title: '读书笔记', course: '未分类', dueAt: '2026-11-01' }

  const match = findDuplicateAssignment({ title: '读书笔记', course: '', dueAt: '2026-11-01' }, [
    existing,
  ])

  assert.equal(match?.confidence, 'high')
})

test('returns the most recent matching assignment when several qualify', async () => {
  const { findDuplicateAssignment } = await load()
  const newest = { id: 'a2', title: '概率论习题', course: '概率论', dueAt: '2026-11-01' }
  const older = { id: 'a1', title: '概率论习题', course: '概率论', dueAt: '2026-11-01' }

  const match = findDuplicateAssignment(
    { title: '概率论习题', course: '概率论', dueAt: '2026-11-01' },
    [newest, older],
  )

  assert.equal(match?.assignment, newest)
})

test('merges only fields that are empty on the existing assignment', async () => {
  const { buildAssignmentMergePatch } = await load()
  const existing = {
    title: '概率论习题',
    course: '概率论',
    dueAt: '',
    notes: '老师给的提示',
  }

  const patch = buildAssignmentMergePatch(existing, {
    title: '概率论习题（补交）',
    course: '概率论',
    dueAt: '2026-11-01',
    notes: '新的备注不应覆盖旧备注',
  })

  assert.deepEqual(patch, { dueAt: '2026-11-01' })
})

test('fills course and notes when the existing assignment has neither', async () => {
  const { buildAssignmentMergePatch } = await load()
  const patch = buildAssignmentMergePatch(
    { title: '概率论习题', course: '', dueAt: '2026-11-01', notes: '  ' },
    { course: '概率论', dueAt: '', notes: '拍照上传' },
  )

  assert.deepEqual(patch, { course: '概率论', notes: '拍照上传' })
})

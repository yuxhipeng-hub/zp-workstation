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

test('persists assignments and knowledge cards as separate local data', (t) => {
  const { directory, store } = createStore()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  store.createAssignment({
    title: '线性代数第 3 章作业',
    course: '线性代数',
    dueAt: '2026-09-24',
    priority: 'high',
    status: 'inbox',
  })
  store.createKnowledge({
    title: '矩阵秩的判定',
    course: '线性代数',
    tags: ['矩阵', '期末复习'],
    content: '行阶梯形矩阵中非零行的数量就是矩阵的秩。',
  })

  const reloaded = new WorkspaceStore(directory).get()
  assert.equal(reloaded.assignments.length, 1)
  assert.equal(reloaded.assignments[0].title, '线性代数第 3 章作业')
  assert.equal(reloaded.knowledge.length, 1)
  assert.deepEqual(reloaded.knowledge[0].tags, ['矩阵', '期末复习'])
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

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')
const { CreationManager, within, localUrl } = require('../src/main/creation-manager.cjs')
async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-creation-unit-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const store = new WorkspaceStore(path.join(dir, 'user'))
  const manager = new CreationManager(store)
  const p = (
    await manager.command({ action: 'create', name: '隔离测试', goal: '审片', stage: '简报' })
  ).creationProjects[0]
  const file = path.join(dir, 'v1.txt')
  fs.writeFileSync(file, 'version one')
  return { dir, store, manager, p, file }
}
test('external refresh is idempotent, transactional and preserves immutable versions', async (t) => {
  const { dir, manager, p, file, store } = await setup(t)
  await manager.connect(p.id, dir)
  const record = {
    schemaVersion: 1,
    projectId: 'external-demo',
    sourceVersion: 'src1',
    updatedAt: new Date().toISOString(),
    tasks: [{ id: 't', goal: 'render', status: 'review', artifactId: 'a' }],
    runs: [
      {
        id: 'r',
        taskId: 't',
        status: 'running',
        updatedAt: new Date().toISOString(),
        frames: 10,
        totalFrames: 100,
      },
    ],
    artifacts: [{ id: 'a', type: 'text', label: 'v1', path: 'v1.txt', taskId: 't', runId: 'r' }],
  }
  const write = () =>
    fs.writeFileSync(path.join(dir, 'workbench-record.json'), JSON.stringify(record))
  write()
  await manager.refresh(p.id)
  await manager.refresh(p.id)
  assert.equal(manager.project(p.id).artifacts.length, 1)
  assert.equal((await manager.details(p.id)).runs[0].displayStatus, 'running')
  assert.equal((await new CreationManager(store).details(p.id)).runs[0].displayStatus, 'unknown')
  const externalArtifact = manager.project(p.id).artifacts[0]
  await manager.command({
    action: 'review-add',
    projectId: p.id,
    artifactId: externalArtifact.id,
    problem: '外部版本复查',
    expected: '用户确认',
  })
  await manager.command({
    action: 'review-update',
    projectId: p.id,
    reviewId: manager.project(p.id).reviews[0].id,
    status: 'resolved',
    resolvedArtifactId: externalArtifact.id,
  })
  await manager.command({ action: 'approve', projectId: p.id, artifactId: externalArtifact.id })
  const valid = structuredClone(manager.project(p.id))
  fs.writeFileSync(path.join(dir, 'workbench-record.json'), '{')
  await assert.rejects(manager.refresh(p.id), /JSON/)
  assert.deepEqual(manager.project(p.id), valid)
  record.artifacts[0].path = '../escape.txt'
  write()
  await assert.rejects(manager.refresh(p.id), /路径/)
  record.artifacts[0].path = 'v1.txt'
  fs.writeFileSync(file, 'replaced')
  write()
  await assert.rejects(manager.refresh(p.id), /新的产物 id/)
  assert.equal(manager.project(p.id).artifacts[0].digest, valid.artifacts[0].digest)
  record.artifacts[0].id = 'a2'
  record.tasks[0].artifactId = 'a2'
  record.sourceVersion = 'src2'
  write()
  await manager.refresh(p.id)
  assert.equal(manager.project(p.id).artifacts.length, 2)
  record.runs[0].frames = 200
  write()
  await assert.rejects(manager.refresh(p.id), /帧数/)
  record.runs[0].frames = 20
  record.projectId = 'wrong'
  write()
  await assert.rejects(manager.refresh(p.id), /身份/)
})
test('reviews bind to version and time, user recheck and approval require unchanged files', async (t) => {
  const { manager, p, file, dir } = await setup(t)
  await manager.importFiles(p.id, [file], 'v1')
  const a = manager.project(p.id).artifacts[0]
  await manager.command({
    action: 'review-add',
    projectId: p.id,
    artifactId: a.id,
    time: 6.2,
    problem: '落地太轻',
    expected: '增加挤压回弹，字幕不变',
    priority: 'required',
  })
  const r = manager.project(p.id).reviews[0]
  assert.equal(r.time, 6.2)
  assert.match(manager.feedback(p.id), /v1[\s\S]*6.2 秒[\s\S]*挤压回弹/)
  await assert.rejects(
    manager.command({ action: 'approve', projectId: p.id, artifactId: a.id }),
    /必须修改/,
  )
  const fixed = path.join(dir, 'v2.txt')
  fs.writeFileSync(fixed, 'fixed')
  await manager.importFiles(p.id, [fixed], 'v2')
  const b = manager.project(p.id).artifacts[1]
  await manager.command({
    action: 'review-update',
    projectId: p.id,
    reviewId: r.id,
    status: 'resolved',
    resolvedArtifactId: b.id,
  })
  await manager.command({ action: 'approve', projectId: p.id, artifactId: b.id })
  assert.equal(manager.project(p.id).artifacts[1].acceptance, 'approved')
  assert.equal(manager.project(p.id).reviews[0].problem, '落地太轻')
  fs.writeFileSync(fixed, 'changed')
  assert.equal((await manager.health(manager.project(p.id).artifacts[1])).status, 'changed')
  await assert.rejects(
    manager.command({ action: 'approve', projectId: p.id, artifactId: b.id }),
    /替换/,
  )
  fs.unlinkSync(fixed)
  assert.equal((await manager.health(b)).status, 'missing')
  const other = (await manager.command({ action: 'create', name: '另一个项目', stage: '选题' }))
    .creationProjects[0]
  await assert.rejects(
    manager.command({
      action: 'review-add',
      projectId: other.id,
      artifactId: a.id,
      problem: 'x',
      expected: 'y',
    }),
    /产物/,
  )
})
test('publication snapshots preserve unknown metrics, archive and delete never touch files', async (t) => {
  const { manager, p, file } = await setup(t)
  await manager.importFiles(p.id, [file], 'final')
  const a = manager.project(p.id).artifacts[0]
  await manager.command({
    action: 'publication',
    projectId: p.id,
    artifactId: a.id,
    platform: '手动平台',
    publishedAt: new Date().toISOString(),
    hours: '',
    cost: '',
  })
  const pub = manager.project(p.id).publications[0]
  for (const views of ['', '100'])
    await manager.command({
      action: 'observation',
      projectId: p.id,
      publicationId: pub.id,
      observedAt: new Date().toISOString(),
      views,
    })
  assert.equal(manager.project(p.id).publications[0].observations[0].views, null)
  assert.equal(manager.project(p.id).publications[0].observations[1].views, 100)
  await manager.command({ action: 'archive', projectId: p.id, archived: true })
  assert.equal(manager.project(p.id).archived, true)
  await manager.command({ action: 'archive', projectId: p.id, archived: false })
  await manager.command({ action: 'delete', projectId: p.id })
  assert.equal(fs.existsSync(file), true)
})
test('safe local addresses and symlinks cannot escape the selected directory', async (t) => {
  const { dir } = await setup(t)
  assert.equal(localUrl('http://127.0.0.1:3000/project'), true)
  for (const u of [
    'https://example.com',
    'file:///C:/a.html',
    'http://user:password@localhost',
    'http://localhost/?token=secret',
    'javascript:alert(1)',
  ])
    assert.equal(localUrl(u), false)
  await assert.rejects(within(dir, '..\\file.mp4'), /路径/)
  await assert.rejects(within(dir, 'C:\\file.mp4'), /路径/)
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-outside-'))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.symlinkSync(outside, path.join(dir, 'link'), 'junction')
  await assert.rejects(within(dir, 'link/missing.mp4'), /越界/)
})

test('permission failures, binary disguises and oversized files give explicit errors', async (t) => {
  const { manager, p, dir, file } = await setup(t)
  const fsp = require('node:fs/promises')
  const realStat = fsp.stat
  t.mock.method(fsp, 'stat', async (target) => {
    if (target === file) throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
    return realStat(target)
  })
  assert.equal((await manager.health({ type: 'text', path: file })).status, 'unavailable')
  await assert.rejects(manager.importFiles(p.id, [file], 'v1'), /permission denied/)
  t.mock.restoreAll()
  const disguised = path.join(dir, 'bad.mp4')
  fs.writeFileSync(disguised, 'not video')
  await assert.rejects(manager.importFiles(p.id, [disguised], 'bad'), /类型|内容/)
  const big = path.join(dir, 'large.txt')
  fs.writeFileSync(big, Buffer.alloc(1024 * 1024 + 1))
  await assert.rejects(manager.importFiles(p.id, [big], 'big'), /大小|超过/)
})

test('external artifacts cannot escape when a directory becomes a junction after import', async (t) => {
  const { manager, p, dir } = await setup(t)
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-creation-outside-'))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.mkdirSync(path.join(dir, 'output'))
  fs.writeFileSync(path.join(dir, 'output', 'a.txt'), 'original')
  fs.writeFileSync(path.join(outside, 'a.txt'), 'original')
  await manager.connect(p.id, dir)
  fs.writeFileSync(
    path.join(dir, 'workbench-record.json'),
    JSON.stringify({
      schemaVersion: 1,
      projectId: 'junction-test',
      updatedAt: new Date().toISOString(),
      tasks: [],
      runs: [],
      artifacts: [{ id: 'a', type: 'text', label: 'v1', path: 'output/a.txt' }],
    }),
  )
  await manager.refresh(p.id)
  const saved = manager.project(p.id),
    a = saved.artifacts[0]
  fs.renameSync(path.join(dir, 'output'), path.join(dir, 'old-output'))
  fs.symlinkSync(outside, path.join(dir, 'output'), 'junction')
  assert.equal((await manager.health(a, saved)).status, 'unavailable')
})

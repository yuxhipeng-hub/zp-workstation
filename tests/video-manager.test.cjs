const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { WorkspaceStore } = require('../src/main/workspace-store.cjs')
const { CreationManager } = require('../src/main/creation-manager.cjs')
const { VideoManager } = require('../src/main/video-manager.cjs')
const V = require('../src/main/video-schema.cjs')
const video = require('./fixtures/creation-video.cjs')
const { execute } = require('../src/main/video-post.cjs')
async function setup(t, provider = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-video-test-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const workspace = new WorkspaceStore(path.join(dir, 'user')),
    creation = new CreationManager(workspace)
  const p = (await creation.command({ action: 'create', name: '制作测试', stage: '简报' }))
    .creationProjects[0]
  const manager = new VideoManager({
    workspace,
    creation,
    secrets: { get: () => '' },
    root: path.join(dir, 'media'),
    provider,
  })
  await manager.command({ projectId: p.id, action: 'enable' })
  const image = path.join(dir, 'frame.png')
  await require('sharp')({ create: { width: 640, height: 360, channels: 3, background: '#888' } })
    .png()
    .toFile(image)
  await creation.importFiles(p.id, [image], '首帧', '设定')
  const a = creation.project(p.id).artifacts[0]
  const content = V.content({
    brief: { idea: '测试' },
    story: '球滚向桌边，角色依次反应。',
    style: '素描',
    references: [a.id],
    shots: [
      {
        id: 'shot-1',
        firstFrame: a.id,
        lastFrame: a.id,
        duration: 2,
        generationDuration: 5,
        prompt: Object.fromEntries(V.promptKeys.map((k) => [k, '明确动作与数量'])),
      },
    ],
  })
  await manager.command({ projectId: p.id, action: 'save-content', content })
  await manager.command({ projectId: p.id, action: 'confirm-story' })
  await manager.command({ projectId: p.id, action: 'confirm-design' })
  await manager.command({
    projectId: p.id,
    action: 'config',
    budget: 100,
    config: {
      model: 'test-model',
      capability: 'seedance-2.0',
      resolution: '720p',
      ratio: 'adaptive',
      rate: 1,
      rateSource: '测试估算',
      reserveFactor: 1.5,
      audio: false,
    },
  })
  const pass = () =>
    manager.change(p.id, (v, p) =>
      v.audits.push({
        id: 'audit-' + v.audits.length,
        shotId: 'shot-1',
        digest: V.shotDigest(v, v.content.shots[0], p),
        status: 'pass',
        at: V.now(),
        checks: [],
        summary: '受控测试审核',
      }),
    )
  pass()
  return { dir, id: p.id, manager, workspace, creation, image, pass }
}
test('video workflow is opt-in, preserves old snapshots, revisions and rolls back failed writes', async (t) => {
  const x = await setup(t),
    p = x.creation.project(x.id)
  assert.equal(x.workspace.normalizeData({}).creationProjects.length, 0)
  const restored = x.workspace.normalizeData({ creationProjects: [p] })
  assert.equal(restored.creationProjects[0].video.history.length, 1)
  const legacy = { ...p }
  delete legacy.video
  assert.equal(
    x.workspace.normalizeData({ creationProjects: [legacy] }).creationProjects[0].video,
    null,
  )
  const original = x.workspace.save
  x.workspace.save = () => {
    throw new Error('disk full')
  }
  await assert.rejects(
    x.manager.command({
      projectId: x.id,
      action: 'save-content',
      content: { ...p.video.content, story: 'changed' },
    }),
    /disk full/,
  )
  assert.equal(x.creation.project(x.id).video.content.story, p.video.content.story)
  x.workspace.save = original
})
test('audit digest invalidates dependencies and file replacement cannot enter paid submission', async (t) => {
  const x = await setup(t)
  const prepared = await x.manager.prepare(x.id, 'shot-1')
  assert.equal(prepared.estimate, 5)
  let content = x.creation.project(x.id).video.content
  content.shots[0].prompt.camera = '新运镜'
  await x.manager.command({ projectId: x.id, action: 'save-content', content })
  await assert.rejects(x.manager.prepare(x.id, 'shot-1'), /审核/)
  await assert.rejects(x.manager.submit(x.id, prepared.token), /变化/)
  x.pass()
  await fs.writeFile(x.image, 'changed')
  await assert.rejects(x.manager.prepare(x.id, 'shot-1'), /素材/)
})
test('single authorization survives double clicks, submits both identical frame bindings, reserves budget', async (t) => {
  let calls = 0,
    received
  const x = await setup(t, {
    submit: async (_job, images) => {
      calls++
      received = images
      return { id: 'task-1' }
    },
  })
  const a = await x.manager.prepare(x.id, 'shot-1'),
    b = await x.manager.prepare(x.id, 'shot-1')
  const results = await Promise.allSettled([
    x.manager.submit(x.id, a.token),
    x.manager.submit(x.id, b.token),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(calls, 1)
  assert.equal(received.length, 2)
  assert.equal((await x.manager.state(x.id)).ledger.reserved, 7.5)
  await assert.rejects(x.manager.submit(x.id, a.token), /已使用/)
})
test('submission revalidates input inside atomic budget reservation after asynchronous health check', async (t) => {
  let calls = 0
  const x = await setup(t, {
    submit: async () => {
      calls++
      return { id: 'bad-task' }
    },
  })
  const pre = await x.manager.prepare(x.id, 'shot-1'),
    files = x.manager.files.bind(x.manager)
  x.manager.files = async (...args) => {
    const result = await files(...args)
    x.manager.change(x.id, (v) => {
      v.content.shots[0].prompt.camera = 'changed during await'
    })
    return result
  }
  await assert.rejects(x.manager.submit(x.id, pre.token), /变化|审核/)
  assert.equal(calls, 0)
})
test('unknown POST holds reservation, blocks retry, known task recovers without POST and downloads once', async (t) => {
  let submits = 0,
    queries = 0,
    downloads = 0
  const x = await setup(t, {
    submit: async () => {
      submits++
      throw new Error('secret-key-network-error')
    },
    query: async () => {
      queries++
      return { status: 'succeeded', content: { video_url: 'https://example.invalid/result' } }
    },
    download: async (_url, file) => {
      downloads++
      await fs.writeFile(file, video)
    },
  })
  await x.manager.submit(x.id, (await x.manager.prepare(x.id, 'shot-1')).token)
  let j = x.creation.project(x.id).video.jobs[0]
  assert.equal(j.status, 'unknown')
  assert.equal(j.error.includes('secret-key'), false)
  await assert.rejects(x.manager.prepare(x.id, 'shot-1'), /结果不明/)
  await x.manager.recover()
  assert.equal((await x.manager.state(x.id)).ledger.reserved, 7.5)
  await x.manager.command({
    projectId: x.id,
    action: 'attach-task',
    jobId: j.id,
    taskId: 'known-task',
  })
  await x.manager.poll(x.id, j.id)
  await x.manager.poll(x.id, j.id)
  j = x.creation.project(x.id).video.jobs[0]
  assert.equal(j.status, 'succeeded')
  assert.ok(j.artifactId)
  assert.equal(downloads, 1)
  assert.equal(queries, 2)
  assert.equal(submits, 1)
  const a = x.creation.project(x.id).artifacts.find((a) => a.id === j.artifactId)
  assert.equal((await x.creation.health(a)).status, 'available')
  await x.manager.command({ projectId: x.id, action: 'settle', jobId: j.id, cost: 9 })
  assert.equal((await x.manager.state(x.id)).ledger.settled, 9)
})
test('model capability rejects unsupported tail frames, durations and audio before spending', async (t) => {
  const x = await setup(t)
  x.manager.change(x.id, (v) => {
    v.config.capability = 'seedance-1.0-fast'
  })
  await assert.rejects(x.manager.prepare(x.id, 'shot-1'), /尾帧/)
  x.manager.change(x.id, (v) => {
    v.config.capability = 'seedance-2.0'
    v.content.shots[0].generationDuration = 30
  })
  x.pass()
  await assert.rejects(x.manager.prepare(x.id, 'shot-1'), /时长/)
  x.manager.change(x.id, (v) => {
    v.config.capability = 'seedance-2.0-fast'
    v.config.resolution = '1080p'
    v.content.shots[0].generationDuration = 5
  })
  x.pass()
  await assert.rejects(x.manager.prepare(x.id, 'shot-1'), /480p或720p/)
  x.manager.change(x.id, (v) => {
    v.config.resolution = '720p'
  })
  x.manager.post.probe = async () => ({
    streams: [{ codec_type: 'video', width: 100, height: 100 }],
  })
  await assert.rejects(x.manager.prepare(x.id, 'shot-1'), /300/)
})
test('export performs real FFmpeg decode, sampling, subtitles and preserves source versions', async (t) => {
  const x = await setup(t),
    file = path.join(x.dir, 'clip.mp4')
  await fs.writeFile(file, video)
  await x.creation.importFiles(x.id, [file], '片段', '镜头')
  const soundtrack = path.join(x.dir, 'music.wav')
  await execute('ffmpeg', [
    '-nostdin',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    soundtrack,
  ])
  await x.creation.importFiles(x.id, [soundtrack], '配乐', '音轨')
  const audio = x.creation.project(x.id).artifacts.find((a) => a.type === 'audio')
  const a = x.creation.project(x.id).artifacts.find((a) => a.type === 'video')
  await x.manager.command({
    projectId: x.id,
    action: 'save-edit',
    edit: {
      width: 320,
      height: 256,
      fps: 24,
      audioArtifactId: audio.id,
      audioMode: 'mix',
      audioVolume: 0.2,
      audioIn: 0,
      audioFade: 0.1,
      clips: [
        {
          shotId: 'shot-1',
          artifactId: a.id,
          in: 0,
          out: 1,
          volume: 1,
          fade: 0.1,
          subtitle: '真实字幕验证',
          saturation: 1,
        },
      ],
    },
  })
  await x.manager.render(x.id)
  const p = x.creation.project(x.id),
    r = p.video.exports[0],
    report = JSON.parse(r.report)
  assert.equal(r.status, 'review')
  assert.equal(report.frames.length, 3)
  assert.equal(report.sheets.length, 1)
  assert.ok(report.sheets[0].artifactId)
  assert.equal(report.audio, true)
  assert.equal(report.sources[0].upscaled, true)
  assert.equal(p.artifacts.find((a) => a.id === r.artifactId).acceptance, 'pending')
  assert.deepEqual(await fs.readFile(file), video)
  const original = x.manager.post.render
  x.manager.post.render = async () => {
    throw new Error('render failed')
  }
  await assert.rejects(x.manager.render(x.id), /render failed/)
  assert.equal(x.creation.project(x.id).video.exports.at(-1).status, 'failed')
  assert.ok(await fs.stat(p.artifacts.find((a) => a.id === r.artifactId).path))
  x.manager.post.render = original
})
test('director buffers startup events, rejects late turns and duplicates, isolates audit without accepting media', async (t) => {
  const x = await setup(t)
  let number = 0,
    client
  client = {
    info: async () => ({ authenticated: true, models: [{ id: 'model' }] }),
    thread: async () => ({ thread: { id: 'shared-thread' } }),
    close() {},
    request: async (method) => {
      if (method !== 'turn/start') return {}
      const n = ++number,
        turnId = 'turn-' + n
      if (n === 2) {
        client.onEvent({
          method: 'item/completed',
          params: {
            threadId: 'shared-thread',
            turnId: 'turn-1',
            item: { type: 'agentMessage', text: 'OLD' },
          },
        })
        client.onEvent({
          method: 'turn/completed',
          params: { threadId: 'shared-thread', turn: { id: 'turn-1', status: 'completed' } },
        })
      }
      client.onEvent({
        method: 'turn/started',
        params: { threadId: 'shared-thread', turn: { id: turnId } },
      })
      client.onEvent({
        method: 'item/completed',
        params: {
          threadId: 'shared-thread',
          turnId,
          item: {
            type: 'agentMessage',
            text: JSON.stringify({
              message: 'new-' + n,
              content: x.creation.project(x.id).video.content,
            }),
          },
        },
      })
      client.onEvent({
        method: 'turn/completed',
        params: { threadId: 'shared-thread', turn: { id: turnId, status: 'completed' } },
      })
      return { turn: { id: turnId } }
    },
  }
  x.manager.codexFactory = () => client
  await x.manager.start(x.id, { message: 'first', model: 'model' })
  await x.manager.start(x.id, { message: 'second', model: 'model' })
  const sessions = x.creation.project(x.id).video.sessions
  assert.equal(sessions.length, 2)
  assert.equal(sessions[1].status, 'completed')
  assert.ok(sessions[1].result.includes('new-2'))
  assert.equal(sessions[1].result.includes('OLD'), false)
  const auditBefore = x.creation.project(x.id).video.audits.length
  x.manager.event(x.id, {
    method: 'turn/completed',
    params: { threadId: 'shared-thread', turn: { id: 'turn-1', status: 'completed' } },
  })
  assert.equal(x.creation.project(x.id).video.audits.length, auditBefore)
  client.request = async () => {
    throw new Error('RPC failed')
  }
  await assert.rejects(x.manager.start(x.id, { message: 'fail', model: 'model' }), /RPC failed/)
  assert.equal(x.creation.project(x.id).video.sessions.at(-1).status, 'failed')
  assert.equal(x.manager.active.has(x.id), false)
})
test('neighbor changes and reorder invalidate audit; concurrent shots cannot over-reserve project budget', async (t) => {
  let submits = 0
  const x = await setup(t, { submit: async () => ({ id: 'provider-' + ++submits }) })
  x.manager.change(x.id, (v) => {
    v.content.shots.push({ ...v.content.shots[0], id: 'shot-2' })
    v.budget = 10
  })
  const p = x.creation.project(x.id),
    before = V.shotDigest(p.video, p.video.content.shots[0], p)
  x.manager.change(x.id, (v) => {
    v.content.shots[1].story = 'new neighbor'
  })
  let current = x.creation.project(x.id)
  assert.notEqual(V.shotDigest(current.video, current.video.content.shots[0], current), before)
  x.manager.change(x.id, (v, p) => {
    v.audits = v.content.shots.map((s) => ({
      id: s.id,
      shotId: s.id,
      digest: V.shotDigest(v, s, p),
      status: 'pass',
    }))
  })
  const a = await x.manager.prepare(x.id, 'shot-1'),
    b = await x.manager.prepare(x.id, 'shot-2')
  const results = await Promise.allSettled([
    x.manager.submit(x.id, a.token),
    x.manager.submit(x.id, b.token),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(submits, 1)
})

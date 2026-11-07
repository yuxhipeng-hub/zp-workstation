const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { SeedanceAdapter, ENDPOINT } = require('../src/main/seedance-adapter.cjs')
test('Seedance official request, identical frames, capability-aware sound and redacted credential errors', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-seedance-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'a.png')
  await fs.writeFile(file, 'synthetic-request-bytes')
  const calls = [],
    adapter = new SeedanceAdapter({
      key: () => 'secret',
      fetchImpl: async (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify({ id: 'id', status: 'queued' }), { status: 200 })
      },
    })
  const job = {
    model: 'user-model',
    capability: 'seedance-1.0-pro',
    request: { prompt: '七段提示词' },
    duration: 5,
    resolution: '720p',
    ratio: '16:9',
    audio: false,
  }
  await adapter.submit(job, [file, file])
  let body = JSON.parse(calls[0].init.body)
  assert.equal(calls[0].url, ENDPOINT)
  assert.equal(body.content.length, 3)
  assert.equal(body.content[2].role, 'last_frame')
  assert.equal(body.generate_audio, undefined)
  await adapter.submit({ ...job, capability: 'seedance-2.0', audio: true }, [file, file])
  body = JSON.parse(calls[1].init.body)
  assert.equal(body.generate_audio, true)
  const beforeCancel = calls.length
  await assert.rejects(adapter.cancel('id'), /无法原子/)
  assert.equal(calls.length, beforeCancel)
  assert.throws(() => adapter.query('../path'), /无效/)
  await assert.rejects(adapter.download('http://127.0.0.1/a', path.join(dir, 'bad')), /HTTPS/)
  await assert.rejects(adapter.download('https://example.com/a', path.join(dir, 'bad')), /范围/)
  const errorAdapter = new SeedanceAdapter({
    key: () => 'secret',
    fetchImpl: async () => new Response('secret prompt response', { status: 401 }),
  })
  await assert.rejects(
    errorAdapter.check(),
    (e) => e.message.includes('凭证') && !e.message.includes('secret') && e.definitive,
  )
  const running = new SeedanceAdapter({
    key: () => 'secret',
    fetchImpl: async () => new Response(JSON.stringify({ status: 'running' })),
  })
  await assert.rejects(running.cancel('id'), /未取消/)
  const wrong = { ...job, images: [{ digest: 'wrong' }] }
  await assert.rejects(adapter.submit(wrong, [file, file]), /替换/)
})

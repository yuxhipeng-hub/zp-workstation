const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const load = () =>
  import(
    pathToFileURL(path.join(__dirname, '../src/renderer/components/smart-entry-batches.js')).href
  )
const images = (count) =>
  Array.from({ length: count }, (_, i) => ({ name: String(i + 1), dataUrl: 'image-' + i }))

test('twenty pictures can produce twenty-one assignments in five requests with global sources', async () => {
  const { createSmartEntrySession } = await load()
  const calls = []
  const updates = []
  const session = createSmartEntrySession(
    { images: images(20), noticeDate: '2026-10-20' },
    async (input) => {
      calls.push(input)
      return {
        assignments: input.images.flatMap((image, i) => [
          { title: '作业' + image.name, sourceImage: i + 1 },
          ...(image.name === '20' ? [{ title: '额外作业', sourceImage: i + 1 }] : []),
        ]),
      }
    },
    (progress) => updates.push(progress.doneImages),
  )
  await session.run()
  assert.equal(calls.length, 5)
  assert.equal(session.snapshot().drafts.length, 21)
  assert.equal(session.snapshot().drafts.at(-1).sourceImage, 20)
  assert.equal(session.snapshot().complete, true)
  assert.equal(session.snapshot().doneImages, 20)
  assert.ok(updates.includes(4))
  assert.ok(calls.every((input) => input.images.length === 4 && input.noticeDate === '2026-10-20'))
})

test('truncated batches shrink to single pictures; unresolved pictures stay incomplete', async () => {
  const { createSmartEntrySession } = await load()
  let calls = 0
  const session = createSmartEntrySession(
    { images: images(4) },
    async (input) => {
      calls += 1
      return input.images.length > 1 || input.images[0].name === '4'
        ? { incomplete: true }
        : { assignments: [{ title: input.images[0].name, sourceImage: 1 }] }
    },
    () => {},
  )
  await session.run()
  assert.equal(calls, 7)
  assert.equal(session.snapshot().doneImages, 3)
  assert.equal(session.snapshot().complete, false)
  const failed = session.snapshot().jobs.find((job) => job.status === 'incomplete')
  assert.match(failed.error, /裁剪/)
  session.replaceImage(failed.id, { name: 'cropped', dataUrl: 'crop' })
  await session.run(failed.id)
  assert.equal(calls, 8)
  assert.equal(session.snapshot().drafts.at(-1).sourceImage, 4)
  assert.equal(session.snapshot().complete, true)
})

test('retry preserves successful edited drafts and unchecked selections without repeating requests', async () => {
  const { createSmartEntrySession } = await load()
  let fail = true
  const calls = []
  const session = createSmartEntrySession(
    { images: images(8) },
    async (input) => {
      calls.push(input.images[0].name)
      if (input.images[0].name === '5' && fail) throw new Error('网络失败')
      return { assignments: [{ title: '作业' + input.images[0].name }] }
    },
    () => {},
  )
  await session.run()
  const draft = session.snapshot().drafts[0]
  draft.title = '人工修改'
  draft.selected = false
  fail = false
  await session.run(session.snapshot().jobs[1].id)
  assert.deepEqual(calls, ['1', '5', '5'])
  assert.equal(session.snapshot().drafts[0], draft)
  assert.equal(draft.title, '人工修改')
  assert.equal(draft.selected, false)
  session.discardDrafts(new Set([draft]))
  assert.equal(session.snapshot().drafts.length, 1)
})

test('only identical drafts are combined; differing requirements remain available for review', async () => {
  const { createSmartEntrySession } = await load()
  const session = createSmartEntrySession(
    { images: images(8) },
    async () => ({
      assignments: [
        { title: '实验报告', notes: '上传PDF', sourceImage: 1 },
        { title: '实验报告', notes: '附源码', sourceImage: 2 },
      ],
    }),
    () => {},
  )
  await session.run()
  assert.equal(session.snapshot().drafts.length, 2)
  assert.deepEqual(session.snapshot().drafts[0].sourceImages, [1, 5])
  assert.equal(session.snapshot().drafts[1].notes, '附源码')
  const draft = session.snapshot().drafts[0]
  draft.notes = '人工修正'
  assert.equal(session.snapshot().drafts.length, 2)
  session.discardDrafts(new Set([draft]))
  assert.equal(session.snapshot().drafts.length, 1)
})

test('cancel ignores late results and never starts another request', async () => {
  const { createSmartEntrySession } = await load()
  let resolve
  let calls = 0
  const session = createSmartEntrySession(
    { images: images(8) },
    () => {
      calls += 1
      return new Promise((done) => {
        resolve = done
      })
    },
    () => {},
  )
  const running = session.run()
  session.cancel()
  resolve({ assignments: [{ title: '迟到结果' }] })
  await running
  assert.equal(calls, 1)
  assert.equal(session.snapshot().drafts.length, 0)
})

test('empty successful batch is complete; malformed text output has bounded splitting', async () => {
  const { createSmartEntrySession } = await load()
  const empty = createSmartEntrySession(
    { text: '无作业通知' },
    async () => ({ assignments: [] }),
    () => {},
  )
  await empty.run()
  assert.equal(empty.snapshot().complete, true)
  assert.equal(empty.snapshot().drafts.length, 0)
  let calls = 0
  const text = createSmartEntrySession(
    { text: 'a'.repeat(600) + '\n' + 'b'.repeat(600) },
    async () => {
      calls += 1
      return { incomplete: true }
    },
    () => {},
  )
  await text.run()
  assert.equal(calls, 3)
  assert.equal(text.snapshot().jobs.length, 2)
  assert.equal(text.snapshot().complete, false)
})

const assert = require('node:assert/strict')
const test = require('node:test')
const { PresentationQuality, parseVisualReview } = require('../src/main/presentation-quality.cjs')
const { materializeDesign } = require('../src/shared/presentation-design.mjs')
const { createPresentation } = require('../src/shared/presentation.mjs')
const { visionProbe } = require('../src/main/vision-probe.cjs')
const deck = () => materializeDesign(createPresentation())
test('visual repair rejects text/data changes, unknown objects, locked objects and invalid geometry', () => {
  const source = deck(),
    slide = source.slides[0],
    node = slide.canvas.find((n) => n.field === 'title')
  const patch = { pageId: slide.id, objectId: node.id, x: node.x + 10 }
  const apply = (p) =>
    parseVisualReview(JSON.stringify({ issues: [], patches: [p] }), source, [slide.id])
  assert.equal(apply(patch).deck.slides[0].canvas.find((n) => n.id === node.id).x, node.x + 10)
  for (const p of [
    { ...patch, text: '改事实' },
    { ...patch, chart: { series: [] } },
    { ...patch, x: -1 },
    { ...patch, objectId: 'unknown' },
  ])
    assert.throws(() => apply(p))
  node.locked = true
  assert.throws(() => apply(patch), /锁定/)
  assert.throws(() => parseVisualReview('not json', source, [slide.id]), /JSON/)
})
test('inspection renders the repaired PPTX again, checks only the requested pages and leaves facts untouched', async () => {
  const source = deck(),
    original = structuredClone(source),
    slide = source.slides[0],
    node = slide.canvas.find((n) => n.field === 'title')
  let rendered = 0,
    requested = 0
  const quality = new PresentationQuality({
    aiService: {
      getConfig: () => ({ visionProfileId: 'vision' }),
      resolveProfile: () => ({ model: 'vision-test', supportsVision: true }),
      requestVision: async (_profile, _prompt, images) => {
        requested++
        assert.equal(images.length, 1)
        return JSON.stringify(
          requested === 1
            ? {
                issues: [
                  {
                    pageId: slide.id,
                    objectId: node.id,
                    severity: 'warning',
                    message: '标题位置需要调整',
                  },
                ],
                patches: [{ pageId: slide.id, objectId: node.id, x: 90 }],
              }
            : { issues: [], patches: [] },
        )
      },
    },
    renderPages: async (current, { indices }) => {
      rendered++
      assert.deepEqual(indices, [0])
      if (rendered === 2) assert.equal(current.slides[0].canvas.find((n) => n.id === node.id).x, 90)
      return [{ pageId: slide.id, page: 1, data: visionProbe().images[0] }]
    },
  })
  const result = await quality.inspect({ deck: source, pageId: slide.id })
  assert.equal(result.report.status, 'pass')
  assert.equal(result.report.correctionCount, 1)
  assert.equal(rendered, 2)
  assert.deepEqual(source, original)
  assert.equal(result.deck.slides[0].title, source.slides[0].title)
  assert.deepEqual(result.deck.slides.slice(1), source.slides.slice(1))
})
test('visual task errors release the lock and never claim that an unconfigured model passed', async () => {
  const quality = new PresentationQuality({ aiService: { getConfig: () => ({}) } })
  await assert.rejects(quality.inspect({ deck: deck() }), /指定/)
  let finish
  quality.ai = {
    getConfig: () => ({ visionProfileId: 'v' }),
    resolveProfile: () => ({ model: 'v', supportsVision: true }),
    requestVision: async () => '{"issues":[]}',
  }
  quality.renderPages = () =>
    new Promise((_, reject) => {
      finish = reject
    })
  const pending = quality.inspect({ deck: deck() })
  await assert.rejects(quality.inspect({ deck: deck() }), /正在进行/)
  finish(new Error('render failed'))
  await assert.rejects(pending, /render failed/)
  quality.renderPages = async (d) =>
    d.slides.map((s, i) => ({ pageId: s.id, page: i + 1, data: visionProbe().images[0] }))
  assert.equal((await quality.inspect({ deck: deck() })).report.status, 'pass')
})

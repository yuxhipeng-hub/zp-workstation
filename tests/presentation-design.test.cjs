const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { materializeDesign, samplePageIndices } = require('../src/shared/presentation-design.mjs')
const {
  getPresentationIssues,
  validatePresentationInput,
} = require('../src/shared/presentation.mjs')
const { referenceDeck, planningReply } = require('./fixtures/presentation-reference.cjs')
const { AiService } = require('../src/main/ai-service.cjs')
const { SettingsStore } = require('../src/main/settings-store.cjs')

test('two design directions preserve all facts, native chart data and existing edited objects', () => {
  const source = referenceDeck('proposal'),
    original = structuredClone(source)
  const precision = materializeDesign(source, 'precision'),
    story = materializeDesign(source, 'story')
  assert.equal(precision.designDirection, 'precision')
  assert.notEqual(precision.slides[0].background, story.slides[0].background)
  assert.deepEqual(source, original)
  assert.equal(getPresentationIssues(precision).filter((i) => i.blocking).length, 0)
  assert.equal(getPresentationIssues(story).filter((i) => i.blocking).length, 0)
  assert.deepEqual(
    precision.slides[2].canvas.find((n) => n.type === 'chart').chart.series[0].values,
    [3, 4, 1],
  )
  precision.slides[0].canvas[0].locked = true
  assert.deepEqual(
    materializeDesign(precision, 'story').slides[0].canvas,
    precision.slides[0].canvas,
  )
  assert.notEqual(
    materializeDesign(precision, 'story', { replace: true }).slides[0].background,
    precision.slides[0].background,
  )
  assert.throws(() => materializeDesign(source, 'unknown'), /方向/)
  assert.throws(
    () => validatePresentationInput({ ...precision, designDirection: 'unknown' }),
    /方向/,
  )
})
test('sample pages represent cover, explanation and available structured data without duplicating pages', () => {
  const plan = planningReply(referenceDeck('proposal')).plan
  assert.deepEqual(samplePageIndices(plan), [0, 6, 2])
  assert.equal(
    new Set(
      samplePageIndices({
        pages: [{ layout: 'cover' }, { layout: 'chart' }, { layout: 'closing' }],
      }),
    ).size,
    3,
  )
})
test('samples precede the full deck and the chosen design reuses the validated full plan', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-design-model-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const source = referenceDeck('proposal'),
    requests = []
  const service = new AiService({
    userDataDir: directory,
    settings: new SettingsStore(directory),
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s),
      decryptString: (b) => b.toString(),
    },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body),
        context = JSON.parse(body.messages.at(-1).content.split('\n').slice(1).join('\n'))
      requests.push(context.phase)
      const result =
        context.phase === 'plan'
          ? planningReply(source)
          : context.phase === 'review'
            ? { action: 'accept', message: '材料一致' }
            : {
                action: 'create',
                message: '已制作',
                deck:
                  context.phase === 'samples'
                    ? { ...source, slides: context.sampleIndices.map((i) => source.slides[i]) }
                    : source,
              }
      return {
        ok: true,
        text: async () =>
          JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }),
      }
    },
  })
  service.saveProfile({ label: '测试', model: 'test', baseUrl: 'http://localhost:5432/v1' })
  const preview = await service.designPresentation({
    action: 'samples',
    message: '按合成材料做提案',
    direction: 'precision',
  })
  assert.equal(preview.action, 'samples')
  assert.equal(preview.deck.slides.length, 3)
  assert.equal(preview.plan.pages.length, 8)
  const full = await service.designPresentation({
    action: 'complete',
    message: '按合成材料做提案',
    plan: preview.plan,
    direction: 'story',
  })
  assert.equal(full.deck.slides.length, 8)
  assert.equal(full.deck.designDirection, 'story')
  assert.deepEqual(requests, ['plan', 'samples', 'review', 'compose', 'review'])
  assert.ok(full.deck.slides.every((s) => s.canvas.length))
  await assert.rejects(
    service.designPresentation({
      action: 'complete',
      message: '制作',
      plan: { pages: [] },
      direction: 'precision',
    }),
    /策划/,
  )
})

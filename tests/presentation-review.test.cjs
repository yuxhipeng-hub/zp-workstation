const assert = require('node:assert/strict')
const test = require('node:test')
const { createPresentation, getPresentationIssues } = require('../src/shared/presentation.mjs')
const { planningReply } = require('./fixtures/presentation-reference.cjs')
const {
  parsePresentationReview,
  presentationReviewMessages,
} = require('../src/main/presentation-review.cjs')
const { allocateSlideSeconds } = require('../src/main/presentation-planner.cjs')

test('material review can remove an unsupported completed-action claim without altering other pages', () => {
  const deck = createPresentation()
  deck.slides[1].body = '收到反馈后已完成修改。'
  const original = structuredClone(deck)
  const request = { message: '仅收到教师反馈，未提供修改证据。' }
  const messages = presentationReviewMessages(request, deck)
  assert.match(messages[0].content, /收到反馈写成已按反馈修改/)
  const result = parsePresentationReview(
    JSON.stringify({
      action: 'edit',
      message: '移除无证据的完成断言。',
      changes: {
        slides: [{ id: deck.slides[1].id, body: '已收到教师反馈；【待补充：是否已据此修改】' }],
      },
    }),
    request,
    deck,
  )
  assert.match(result.deck.slides[1].body, /待补充/)
  assert.deepEqual(result.deck.slides[0], deck.slides[0])
  assert.deepEqual(deck, original)
})

test('material review accepts bounded replies and refuses replacement, creation and arbitrary operations', () => {
  const deck = createPresentation()
  assert.equal(
    parsePresentationReview(
      '{"action":"accept","message":"未发现明显不一致"}',
      { message: '材料' },
      deck,
    ).deck,
    deck,
  )
  for (const content of [
    '{',
    '{"action":"accept","message":""}',
    '{"action":"create"}',
    '{"action":"edit","changes":{"replacementSlides":[]}}',
  ])
    assert.throws(() => parsePresentationReview(content, { message: '材料' }, deck))
})

test('suggested page timings exactly fit the provided total and mismatches block delivery', () => {
  const deck = createPresentation()
  const { plan } = planningReply(deck)
  plan.strategy.durationSeconds = 420
  const seconds = allocateSlideSeconds(plan)
  assert.equal(
    seconds.reduce((a, b) => a + b),
    420,
  )
  assert.ok(seconds.every((value) => Number.isInteger(value) && value > 0))
  deck.strategy = plan.strategy
  deck.slides.forEach((slide, i) => {
    slide.seconds = seconds[i]
  })
  assert.equal(getPresentationIssues(deck).filter((issue) => issue.blocking).length, 0)
  deck.slides[1].seconds++
  assert.match(getPresentationIssues(deck)[0].message, /总时长不一致/)
})

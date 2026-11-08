const assert = require('node:assert/strict')
const test = require('node:test')
const { planningReply, referenceDeck } = require('./fixtures/presentation-reference.cjs')
const {
  presentationPlanningMessages,
  parsePresentationPlan,
} = require('../src/main/presentation-planner.cjs')

test('planning extracts a bounded narrative and page purposes before composition', () => {
  const reply = planningReply(referenceDeck('competition'))
  const result = parsePresentationPlan(JSON.stringify(reply))
  assert.equal(result.plan.pages.length, 8)
  assert.equal(result.plan.pages[0].layout, 'cover')
  assert.equal(result.plan.pages[7].layout, 'closing')
  assert.ok(result.plan.strategy.thesis)
  const messages = presentationPlanningMessages({
    message: '按这份通知做七分钟陈述',
    history: [{ role: 'user', content: '已有事实与材料' }],
    privateLibrary: '不得自动读取',
  })
  assert.match(messages[0].content, /本轮只做内容策划/)
  assert.match(messages[0].content, /不编造/)
  assert.match(JSON.stringify(messages), /已有事实与材料/)
  assert.doesNotMatch(JSON.stringify(messages), /不得自动读取/)
})

test('planning asks only for missing information without returning a half-created deck', () => {
  assert.deepEqual(
    parsePresentationPlan('{"action":"clarify","message":"请补充专业和已有项目。"}'),
    { action: 'clarify', message: '请补充专业和已有项目。' },
  )
  for (const value of ['{', 'null', '{}', '{"action":"clarify","message":""}'])
    assert.throws(() => parsePresentationPlan(value))
})

test('invalid planning metadata, unsupported layouts and excessive page counts are rejected', () => {
  for (const mutate of [
    (p) => {
      p.pages = []
    },
    (p) => {
      p.pages = Array(17).fill(p.pages[0])
    },
    (p) => {
      p.pages[0].layout = 'split'
    },
    (p) => {
      p.pages[1].layout = '__proto__'
    },
    (p) => {
      p.pages[1].purpose = ''
    },
    (p) => {
      p.pages[1].title = '字'.repeat(101)
    },
    (p) => {
      p.theme = '__proto__'
    },
    (p) => {
      p.strategy = undefined
    },
    (p) => {
      p.strategy.requirements = Array(13).fill('过量')
    },
  ]) {
    const reply = planningReply(referenceDeck('proposal'))
    mutate(reply.plan)
    assert.throws(() => parsePresentationPlan(JSON.stringify(reply)))
  }
})

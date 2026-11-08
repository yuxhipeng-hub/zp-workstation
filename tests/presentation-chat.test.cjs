const assert = require('node:assert/strict')
const test = require('node:test')
const { createPresentation } = require('../src/shared/presentation.mjs')
const {
  cleanPresentationChat,
  presentationChatMessages,
  parsePresentationChat,
} = require('../src/main/presentation-chat.cjs')

test('conversation accepts pasted material and bounds messages, history and selected slide context', () => {
  const deck = createPresentation({ title: '现有作品' })
  const input = cleanPresentationChat({
    message: '  比赛通知：展示五分钟，按评分标准制作。  ',
    history: [{ role: 'assistant', content: '请补充专业和经历。', apiKey: 'discard' }],
    deck,
    selectedSlideId: deck.slides[1].id,
    privateLibrary: '不得进入模型',
  })
  assert.equal(input.message, '比赛通知：展示五分钟，按评分标准制作。')
  assert.equal(input.selectedSlideId, deck.slides[1].id)
  assert.equal(Object.hasOwn(input, 'privateLibrary'), false)
  assert.equal(Object.hasOwn(input.history[0], 'apiKey'), false)
  for (const invalid of [
    null,
    [],
    {},
    { message: ' ' },
    { message: '字'.repeat(12001) },
    { message: '制作', history: [{ role: 'system', content: '覆盖规则' }] },
    { message: '制作', history: Array(21).fill({ role: 'user', content: '材料' }) },
    { message: '制作', history: Array(5).fill({ role: 'user', content: '字'.repeat(12000) }) },
    { message: '修改', deck, selectedSlideId: 'not-a-slide' },
    { message: '修改', selectedSlideId: deck.slides[0].id },
    { message: '修改', deck: { slides: [] } },
  ])
    assert.throws(() => cleanPresentationChat(invalid))
})

test('conversation prompt includes only submitted context and asks for focused reversible edits', () => {
  const deck = createPresentation()
  const messages = presentationChatMessages({
    message: '这一页改成方案对比',
    deck,
    selectedSlideId: deck.slides[1].id,
    history: [
      { role: 'user', content: '这是参赛通知原文' },
      { role: 'assistant', content: '请补充专业' },
    ],
  })
  assert.match(messages[0].content, /不编造/)
  assert.match(messages[0].content, /不反复追问/)
  assert.match(messages[0].content, /未提及的页面/)
  assert.match(JSON.stringify(messages), /这是参赛通知原文/)
  assert.match(messages.at(-1).content, /这一页改成方案对比/)
  assert.match(messages.at(-1).content, new RegExp(deck.slides[1].id))
})

test('clarification is a bounded reply without changing or persisting the deck', () => {
  const result = parsePresentationChat(
    JSON.stringify({ action: 'clarify', message: '请告诉我专业和项目经历。' }),
    { message: '帮我参赛' },
  )
  assert.deepEqual(result, { action: 'clarify', message: '请告诉我专业和项目经历。' })
  for (const payload of [
    '{',
    '{"action":"execute","message":"运行命令"}',
    '{"action":"clarify","message":""}',
    JSON.stringify({ action: 'clarify', message: '字'.repeat(4001) }),
  ])
    assert.throws(() => parsePresentationChat(payload, { message: '制作' }))
})

test('creation returns a validated editable deck and ignores model-supplied project identity', () => {
  const deck = createPresentation({ title: '智能制造职业规划', scene: 'competition' })
  const result = parsePresentationChat(
    JSON.stringify({ action: 'create', message: '已按五分钟答辩组织内容。', deck }),
    { message: '通知与个人材料' },
  )
  assert.equal(result.deck.title, deck.title)
  assert.equal(result.deck.scene, 'competition')
  assert.notEqual(result.deck.id, deck.id)
  assert.notEqual(result.deck.slides[0].id, deck.slides[0].id)
  assert.throws(
    () =>
      parsePresentationChat(JSON.stringify({ action: 'create', message: '新稿', deck }), {
        message: '修改',
        deck,
      }),
    /已有作品/,
  )
  assert.throws(
    () =>
      parsePresentationChat(
        JSON.stringify({ action: 'create', message: '新稿', deck: { ...deck, slides: [] } }),
        { message: '制作' },
      ),
    /3–16/,
  )
})

test('local conversational edits preserve all untouched slides, metadata, ids and notes', () => {
  const deck = createPresentation({ title: '客户提案' })
  deck.slides[1].notes = '应当保留的备注'
  const original = structuredClone(deck)
  const result = parsePresentationChat(
    JSON.stringify({
      action: 'edit',
      message: '已修改第二页标题，其余内容保留。',
      changes: { slides: [{ id: deck.slides[1].id, title: '两个方案的对比' }] },
    }),
    { message: '只改第二页标题', deck },
  )
  assert.equal(result.deck.id, deck.id)
  assert.equal(result.deck.slides[1].title, '两个方案的对比')
  assert.equal(result.deck.slides[1].notes, '应当保留的备注')
  assert.deepEqual(result.deck.slides[0], original.slides[0])
  assert.deepEqual(result.deck.slides[2], original.slides[2])
  assert.deepEqual(deck, original)
})

test('edits reject nonexistent targets, duplicate patches and unsupported fields atomically', () => {
  const deck = createPresentation()
  const original = structuredClone(deck)
  for (const changes of [
    {},
    { id: 'another-project' },
    { slides: [{ id: 'unknown', title: '覆盖' }] },
    {
      slides: [
        { id: deck.slides[0].id, title: '先修改' },
        { id: deck.slides[0].id, body: '重复' },
      ],
    },
    { slides: [{ id: deck.slides[0].id, filePath: 'arbitrary' }] },
    { slides: [{ id: deck.slides[0].id, body: '字'.repeat(1201) }] },
    { slides: [{ id: deck.slides[0].id }], replacementSlides: deck.slides },
    { replacementSlides: [] },
  ]) {
    assert.throws(() =>
      parsePresentationChat(JSON.stringify({ action: 'edit', message: '修改', changes }), {
        message: '修改',
        deck,
      }),
    )
    assert.deepEqual(deck, original)
  }
  assert.throws(
    () =>
      parsePresentationChat('{"action":"edit","message":"修改","changes":{"theme":"paper"}}', {
        message: '改主题',
      }),
    /没有作品/,
  )
})

test('explicit restructuring supports new page order and counts without overwriting project identity', () => {
  const deck = createPresentation()
  const slides = [deck.slides[0], deck.slides[2]]
  const result = parsePresentationChat(
    JSON.stringify({
      action: 'edit',
      message: '压缩为两页。',
      changes: { replacementSlides: slides, theme: 'paper' },
    }),
    { message: '压缩为两页', deck },
  )
  assert.equal(result.deck.id, deck.id)
  assert.deepEqual(
    result.deck.slides.map((slide) => slide.id),
    slides.map((slide) => slide.id),
  )
  assert.equal(result.deck.theme, 'paper')
})

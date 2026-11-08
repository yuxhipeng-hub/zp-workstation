const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const JSZip = require('jszip')
const {
  createPresentation,
  cleanPresentation,
  validatePresentationInput,
  buildSlideScene,
  getPresentationIssues,
  PRESENTATION_THEMES,
  PRESENTATION_LAYOUTS,
} = require('../src/shared/presentation.mjs')
const {
  cleanPresentationBrief,
  parsePresentationContent,
  presentationMessages,
} = require('../src/main/presentation-ai.cjs')
const { presentationBuffer, exportPresentation } = require('../src/main/presentation-export.cjs')
const { referenceDeck } = require('./fixtures/presentation-reference.cjs')

test('cleans imported deck metadata, duplicate slide ids and unsupported properties', () => {
  const deck = createPresentation({ title: '演示' })
  deck.slides[1].id = deck.slides[0].id
  const cleaned = cleanPresentation({
    ...deck,
    theme: 'unknown',
    scene: '__proto__',
    apiKey: 'secret',
  })
  assert.equal(cleaned.theme, 'editorial')
  assert.equal(cleaned.scene, 'proposal')
  assert.equal(Object.hasOwn(cleaned, 'apiKey'), false)
  assert.equal(new Set(cleaned.slides.map((slide) => slide.id)).size, 3)
  assert.equal(cleanPresentation(null), null)
  assert.equal(cleanPresentation({ slides: [] }), null)
})

test('rejects oversized and malformed renderer payloads without silent content truncation', () => {
  const deck = createPresentation()
  for (const value of [
    null,
    [],
    'bad',
    { ...deck, title: 'a'.repeat(101) },
    { ...deck, slides: Array(41).fill(deck.slides[0]) },
    { ...deck, theme: '__proto__' },
  ]) {
    assert.throws(() => validatePresentationInput(value))
  }
  deck.slides[0].notes = '备'.repeat(4001)
  assert.throws(() => validatePresentationInput(deck), /4000/)
})

test('all default layouts fit the canvas across every theme and report excessive text', () => {
  for (const theme of Object.keys(PRESENTATION_THEMES)) {
    const deck = createPresentation({ theme })
    for (const layout of Object.keys(PRESENTATION_LAYOUTS)) {
      const structured = referenceDeck('proposal').slides.find((slide) => slide.layout === layout)
      if (structured) Object.assign(deck.slides[1], structured)
      deck.slides[1].layout = layout
      assert.equal(
        getPresentationIssues(deck).some((issue) => issue.blocking),
        false,
        `${theme}/${layout}`,
      )
      const scene = buildSlideScene(deck.slides[1], theme)
      assert.ok(
        scene.nodes.every((n) => n.x >= 0 && n.y >= 0 && n.x + n.w <= 1280 && n.y + n.h <= 720),
      )
    }
  }
  const deck = createPresentation()
  deck.slides[1].body = '内容'.repeat(600)
  assert.equal(
    getPresentationIssues(deck).some((issue) => issue.blocking),
    true,
  )
})

test('AI brief boundaries and JSON completeness are enforced, with facts isolated as data', () => {
  const brief = cleanPresentationBrief({
    title: '职业规划',
    scene: 'competition',
    pageCount: 3,
    material: '仅有大二信息',
  })
  assert.throws(() => cleanPresentationBrief({ ...brief, pageCount: 40 }), /3–16/)
  assert.throws(() => cleanPresentationBrief({ ...brief, material: 'a'.repeat(12001) }), /超长/)
  const messages = presentationMessages(brief)
  assert.match(messages[0].content, /不编造数据/)
  assert.match(messages[1].content, /仅有大二信息/)
  assert.throws(() => parsePresentationContent('{"slides":[', brief), /完整的 JSON/)
  assert.throws(() => parsePresentationContent('{"slides":[]}', brief), /页数不完整/)
  const deck = createPresentation({ title: brief.title })
  const parsed = parsePresentationContent(
    '```json\n' + JSON.stringify({ slides: deck.slides }) + '\n```',
    brief,
  )
  assert.equal(parsed.slides.length, 3)
  assert.equal(Object.hasOwn(parsed, 'material'), false)
})

test('PPTX contains editable text and shapes, speaker notes, theme colors and ordered slides', async () => {
  const deck = createPresentation({ title: '可编辑交付', theme: 'midnight' })
  deck.slides[0].title = '开场 <&> 核对'
  deck.slides[1].title = '第二页重点'
  deck.slides[1].notes = '这里是演讲备注，不进入页面正文。'
  const zip = await JSZip.loadAsync(await presentationBuffer(deck))
  const first = await zip.file('ppt/slides/slide1.xml').async('string')
  const second = await zip.file('ppt/slides/slide2.xml').async('string')
  const notes = await zip.file('ppt/notesSlides/notesSlide2.xml').async('string')
  assert.match(first, /开场 &lt;&amp;&gt; 核对/)
  assert.match(first, /<p:sp>/)
  assert.match(first, /172B2E/)
  assert.match(second, /第二页重点/)
  assert.doesNotMatch(second, /这里是演讲备注/)
  assert.match(notes, /这里是演讲备注/)
  assert.equal(zip.file(/^ppt\/slides\/slide\d+\.xml$/).length, 3)
  assert.equal(zip.file(/^ppt\/media\//).length, 0)
})

test('export refuses overflowing slides and preserves the existing target', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-ppt-export-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const target = path.join(directory, 'existing.pptx')
  fs.writeFileSync(target, 'existing')
  const deck = createPresentation()
  deck.slides[1].body = '多'.repeat(1200)
  await assert.rejects(exportPresentation(deck, target), /内容过多/)
  assert.equal(fs.readFileSync(target, 'utf8'), 'existing')
  deck.slides[1].body = '简明内容'
  const result = await exportPresentation(deck, target)
  assert.ok(result.size > 1000)
  assert.deepEqual(fs.readdirSync(directory), ['existing.pptx'])
})

test('long titles use balanced semantic lines in preview and PPTX without changing editable text', async () => {
  const title = '试点只验证三件事：口径、准确性、耗时变化'
  for (const canvas of [false, true]) {
    const deck = createPresentation()
    const slide = deck.slides[1]
    slide.layout = 'statement'
    slide.title = title
    if (canvas) {
      const { materializeDesign } = require('../src/shared/presentation-design.mjs')
      Object.assign(slide, materializeDesign(deck).slides[1])
    }
    const original = structuredClone(deck)
    const node = buildSlideScene(slide).nodes.find((n) => n.text === title)
    assert.equal(node.displayText, '试点只验证三件事：\n口径、准确性、耗时变化')
    const zip = await JSZip.loadAsync(await presentationBuffer(deck))
    const xml = await zip.file('ppt/slides/slide2.xml').async('string')
    assert.match(xml, /<a:t>试点只验证三件事：<\/a:t>/)
    assert.match(xml, /<a:t>口径、准确性、耗时变化<\/a:t>/)
    assert.deepEqual(deck, original)
    slide.title = '短标题'
    if (canvas) slide.canvas.find((n) => n.field === 'title').text = slide.title
    assert.equal(
      buildSlideScene(slide).nodes.find((n) => n.text === slide.title).displayText,
      undefined,
    )
  }
})

test('title balancing preserves explicit breaks and keeps English words and punctuation intact', () => {
  const { balancedTitle } = require('../src/shared/presentation-text.mjs')
  const node = { w: 520, h: 200, size: 48 }
  assert.equal(balancedTitle({ ...node, text: '手动\n换行' }), '手动\n换行')
  const title = 'PowerPoint presentation design workflow'
  const lines = balancedTitle({ ...node, text: title }).split('\n')
  assert.ok(lines.length > 1)
  assert.equal(lines.join(''), title)
  for (const word of title.split(' ')) assert.ok(lines.some((line) => line.includes(word)))
  const chinese = '用明确的业务边界，验证方案与下一步行动'
  const result = balancedTitle({ ...node, text: chinese })
  assert.equal(result.replaceAll('\n', ''), chinese)
  assert.ok(result.split('\n').every((line) => !/^[，、。！？：；）】》]/u.test(line)))
})

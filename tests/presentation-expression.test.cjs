const assert = require('node:assert/strict')
const test = require('node:test')
const JSZip = require('jszip')
const { referenceDeck } = require('./fixtures/presentation-reference.cjs')
const {
  validatePresentationInput,
  cleanPresentation,
  buildSlideScene,
  getPresentationIssues,
  PRESENTATION_THEMES,
} = require('../src/shared/presentation.mjs')
const { presentationBuffer } = require('../src/main/presentation-export.cjs')

test('structured slides survive validation without losing numeric data, comparisons or milestones', () => {
  const deck = validatePresentationInput(referenceDeck('proposal'))
  assert.deepEqual(deck.slides[2].chart.series[0].values, [3, 4, 1])
  assert.equal(deck.slides[3].comparison.rows[0].values[1], '需梳理数据字段')
  assert.equal(deck.slides[5].items[3].label, '第 4 周')
  assert.equal(deck.slides[1].items[0].value, '8 小时')
  assert.deepEqual(cleanPresentation(deck), deck)
})

test('structured validation rejects mismatched chart arrays and malformed or oversized content', () => {
  for (const change of [
    (s) => {
      s.chart.series[0].values = [3, 4]
    },
    (s) => {
      s.chart.series[0].values[0] = Infinity
    },
    (s) => {
      s.chart.series[0].values[0] = '3'
    },
    (s) => {
      s.chart.type = '__proto__'
    },
    (s) => {
      s.chart.source = ''
    },
    (s) => {
      s.chart.categories = Array(9).fill('超量')
    },
  ]) {
    const deck = referenceDeck('proposal')
    change(deck.slides[2])
    assert.throws(() => validatePresentationInput(deck))
  }
  const deck = referenceDeck('proposal')
  deck.slides[3].comparison.rows[0].values = ['只有一列']
  assert.throws(() => validatePresentationInput(deck))
  const malformed = referenceDeck('proposal')
  malformed.slides[1].items[0].body = '长'.repeat(161)
  assert.throws(() => validatePresentationInput(malformed))
})

test('both reference decks fit every theme and structured data uses distinct visual geometry', () => {
  for (const id of ['competition', 'proposal'])
    for (const theme of Object.keys(PRESENTATION_THEMES)) {
      const deck = validatePresentationInput({ ...referenceDeck(id), theme })
      assert.deepEqual(
        getPresentationIssues(deck).filter((issue) => issue.blocking),
        [],
        `${id}/${theme}`,
      )
      for (const slide of deck.slides) {
        const scene = buildSlideScene(slide, theme)
        const nodes = scene.nodes.flatMap((node) => node.preview || [node])
        assert.ok(
          nodes.every(
            (n) =>
              [n.x, n.y, n.w, n.h].every(Number.isFinite) &&
              n.x >= 0 &&
              n.y >= 0 &&
              n.x + n.w <= 1280 &&
              n.y + n.h <= 720,
          ),
          slide.layout,
        )
        assert.ok(
          nodes.every((n) => !n.overflow),
          slide.layout,
        )
      }
    }
})

test('chart scaling supports mixed negative, zero and decimal values without invalid coordinates', () => {
  const deck = referenceDeck('proposal')
  const chart = deck.slides[2].chart
  for (const values of [
    [0, 0, 0],
    [-3, 4, -1],
    [0.001, 0.004, 0.002],
    [1e-320, 2e-320, 3e-320],
  ]) {
    chart.series[0].values = values
    chart.type = 'line'
    const scene = buildSlideScene(validatePresentationInput(deck).slides[2])
    const node = scene.nodes.find((item) => item.type === 'chart')
    assert.ok(node, 'native chart node')
    assert.ok(node.preview.every((item) => [item.x, item.y, item.w, item.h].every(Number.isFinite)))
    assert.ok(node.preview.some((item) => item.type === 'line'))
  }
})

test('missing structured data blocks export instead of fabricating a chart or comparison', async () => {
  const deck = referenceDeck('proposal')
  delete deck.slides[2].chart
  assert.ok(
    getPresentationIssues(validatePresentationInput(deck)).some(
      (issue) => issue.page === 3 && issue.blocking,
    ),
  )
  await assert.rejects(presentationBuffer(deck))
  const cleaned = cleanPresentation({
    ...deck,
    slides: [{ ...deck.slides[2], chart: { type: 'bar', series: 'bad' } }],
  })
  assert.equal(cleaned.slides[0].chart, undefined)
})

test('PPTX exports native chart objects with editable embedded workbook and exact source values', async () => {
  const zip = await JSZip.loadAsync(await presentationBuffer(referenceDeck('proposal')))
  const charts = zip.file(/^ppt\/charts\/chart\d+\.xml$/)
  assert.equal(charts.length, 1)
  const xml = await charts[0].async('string')
  assert.match(xml, /c:barChart/)
  assert.match(xml, /<c:v>3<\/c:v>/)
  assert.match(xml, /<c:v>4<\/c:v>/)
  assert.match(xml, /<c:v>1<\/c:v>/)
  const workbook = zip.file(/^ppt\/embeddings\/.*\.xlsx$/)
  assert.equal(workbook.length, 1)
  const data = await JSZip.loadAsync(await workbook[0].async('nodebuffer'))
  const sheet = await data.file('xl/worksheets/sheet1.xml').async('string')
  assert.match(sheet, /<v>3<\/v>/)
  const page = await zip.file('ppt/slides/slide3.xml').async('string')
  assert.match(page, /合成访谈记录/)
  assert.match(page, /graphicFrame/)
  const comparison = await zip.file('ppt/slides/slide4.xml').async('string')
  assert.match(comparison, /需梳理数据字段/)
  assert.match(comparison, /<p:sp>/)
})

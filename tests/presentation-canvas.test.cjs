const assert = require('node:assert/strict')
const test = require('node:test')
const {
  createPresentation,
  buildSlideScene,
  validatePresentationInput,
} = require('../src/shared/presentation.mjs')
const {
  canvasFromScene,
  assertCanvasLocks,
  modelPresentation,
} = require('../src/shared/presentation-canvas.mjs')
const {
  parsePresentationChat,
  presentationChatMessages,
  cleanPresentationChat,
} = require('../src/main/presentation-chat.cjs')
const { presentationBuffer } = require('../src/main/presentation-export.cjs')
const JSZip = require('jszip')
const sharp = require('sharp')

test('legacy chart edits remain visible after a page has materialized editable objects', () => {
  const { referenceDeck } = require('./fixtures/presentation-reference.cjs')
  const { materializeDesign } = require('../src/shared/presentation-design.mjs')
  const deck = materializeDesign(referenceDeck('proposal'))
  const slide = deck.slides[2],
    chart = { ...slide.chart, type: 'line' }
  const reply = JSON.stringify({
    action: 'edit',
    message: '改折线图',
    changes: { slides: [{ id: slide.id, chart }] },
  })
  const result = parsePresentationChat(reply, {
    message: '改成折线图',
    deck,
    selectedSlideId: slide.id,
  })
  assert.equal(result.deck.slides[2].canvas.find((n) => n.type === 'chart').chart.type, 'line')
})

test('canvas images export using supported sizing and preserve transparent PNG media', async () => {
  const png = await sharp({
    create: {
      width: 64,
      height: 32,
      channels: 4,
      background: { r: 40, g: 80, b: 120, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer()
  for (const fit of ['cover', 'contain']) {
    const deck = canvasDeck()
    deck.slides[0].canvas.push({
      id: 'photo',
      type: 'image',
      data: `data:image/png;base64,${png.toString('base64')}`,
      fit,
      x: 100,
      y: 300,
      w: 200,
      h: 180,
    })
    const zip = await JSZip.loadAsync(await presentationBuffer(deck))
    const xml = await zip.file('ppt/slides/slide1.xml').async('string')
    assert.match(xml, /<p:pic>/)
    const media = zip.file(/^ppt\/media\/.*\.png$/)[0]
    assert.ok(media)
    assert.deepEqual(await media.async('nodebuffer'), png)
  }
})

function canvasDeck() {
  const deck = createPresentation()
  deck.slides[0].canvas = canvasFromScene(buildSlideScene(deck.slides[0]), deck.slides[0])
  return deck
}

test('image bytes stay local across partial and full model edits and invalid selection is rejected', async () => {
  const png = await sharp({ create: { width: 20, height: 20, channels: 4, background: '#456789' } })
    .png()
    .toBuffer()
  const deck = canvasDeck()
  const photo = {
    id: 'photo',
    type: 'image',
    x: 100,
    y: 300,
    w: 200,
    h: 100,
    fit: 'contain',
    data: `data:image/png;base64,${png.toString('base64')}`,
  }
  deck.slides[0].canvas.push(photo)
  const input = {
    message: '移动这张图片',
    deck,
    selectedSlideId: deck.slides[0].id,
    selectedObjectId: photo.id,
  }
  assert.ok(!JSON.stringify(presentationChatMessages(input)).includes(photo.data))
  assert.throws(() => cleanPresentationChat({ ...input, selectedObjectId: 'unknown' }), /对象编号/)
  const result = parsePresentationChat(
    JSON.stringify({
      action: 'edit',
      message: '已移动',
      changes: { slides: [{ id: deck.slides[0].id, canvasPatches: [{ id: photo.id, x: 200 }] }] },
    }),
    input,
  )
  assert.equal(result.deck.slides[0].canvas.find((n) => n.id === photo.id).data, photo.data)
  const replacements = modelPresentation(result.deck).slides
  const rewritten = parsePresentationChat(
    JSON.stringify({
      action: 'edit',
      message: '调整顺序',
      changes: { replacementSlides: replacements },
    }),
    input,
  )
  assert.equal(rewritten.deck.slides[0].canvas.find((n) => n.id === photo.id).data, photo.data)
  assert.equal(deck.slides[0].canvas.at(-1).x, 100)
})
test('materializing a slide preserves editable objects and durable object identities', () => {
  const deck = canvasDeck()
  const saved = validatePresentationInput(deck)
  assert.ok(saved.slides[0].canvas.some((node) => node.field === 'title'))
  assert.equal(
    new Set(saved.slides[0].canvas.map((node) => node.id)).size,
    saved.slides[0].canvas.length,
  )
  assert.deepEqual(saved.slides[0].canvas, deck.slides[0].canvas)
  const title = saved.slides[0].canvas.find((node) => node.field === 'title')
  title.x = 120
  title.size = 44
  title.text = '直接编辑后的标题'
  assert.equal(buildSlideScene(saved.slides[0]).nodes.find((node) => node.id === title.id).x, 120)
})
test('canvas validates geometry, style, ids and image sources before persistence', () => {
  for (const mutate of [
    (n) => {
      n.x = -1
    },
    (n) => {
      n.w = 2000
    },
    (n) => {
      n.size = Infinity
    },
    (n) => {
      n.color = 'url(javascript:bad)'
    },
    (n) => {
      n.type = 'script'
    },
    (n) => {
      n.text = '字'.repeat(4001)
    },
    (n) => {
      n.locked = 'yes'
    },
  ]) {
    const deck = canvasDeck()
    mutate(deck.slides[0].canvas.find((n) => n.type === 'text'))
    assert.throws(() => validatePresentationInput(deck))
  }
  const duplicate = canvasDeck()
  duplicate.slides[0].canvas.push(duplicate.slides[0].canvas[0])
  assert.throws(() => validatePresentationInput(duplicate))
})
test('model edits patch selected objects and cannot overwrite or remove locked content', () => {
  const deck = canvasDeck()
  const node = deck.slides[0].canvas.find((item) => item.field === 'title')
  const response = {
    action: 'edit',
    message: '调整标题',
    changes: {
      slides: [{ id: deck.slides[0].id, canvasPatches: [{ id: node.id, text: '新标题', x: 100 }] }],
    },
  }
  const result = parsePresentationChat(JSON.stringify(response), {
    message: '修改标题',
    deck,
    selectedSlideId: deck.slides[0].id,
    selectedObjectId: node.id,
  })
  assert.equal(result.deck.slides[0].canvas.find((item) => item.id === node.id).text, '新标题')
  node.locked = true
  assert.throws(
    () => parsePresentationChat(JSON.stringify(response), { message: '修改', deck }),
    /锁定/,
  )
  const removed = structuredClone(deck)
  removed.slides[0].canvas = []
  assert.throws(() => assertCanvasLocks(deck, removed), /锁定/)
  deck.slides[0].locked = true
  assert.throws(
    () =>
      parsePresentationChat(
        JSON.stringify({
          action: 'edit',
          message: '改备注',
          changes: { slides: [{ id: deck.slides[0].id, notes: '偷偷修改' }] },
        }),
        { message: '修改', deck },
      ),
    /锁定/,
  )
})
test('model context strips embedded image bytes and native export keeps customized geometry', async () => {
  const deck = canvasDeck()
  const node = deck.slides[0].canvas.find((item) => item.field === 'title')
  node.text = '可编辑的新文字'
  node.x = 128
  const model = modelPresentation({
    ...deck,
    slides: [
      {
        ...deck.slides[0],
        canvas: [
          { id: 'photo', type: 'image', data: 'private-image-data', x: 0, y: 0, w: 100, h: 100 },
        ],
      },
    ],
  })
  assert.equal(model.slides[0].canvas[0].data, undefined)
  const zip = await JSZip.loadAsync(await presentationBuffer(deck))
  const xml = await zip.file('ppt/slides/slide1.xml').async('string')
  assert.match(xml, /可编辑的新文字/)
  assert.match(xml, /<p:sp>/)
})

const fsp = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
const {
  validatePresentationInput,
  buildSlideScene,
  getPresentationIssues,
} = require('../shared/presentation.mjs')

async function presentationBuffer(input) {
  const deck = validatePresentationInput(input)
  const blocking = getPresentationIssues(deck).filter((issue) => issue.blocking)
  if (blocking.length)
    throw new Error(
      `第 ${blocking.map((issue) => issue.page).join('、')} 页内容过多，请调整后导出。`,
    )
  // v4 的 CommonJS 入口直接返回构造器，声明文件则使用 ESM default。
  const PptxGenJS = /** @type {new () => any} */ (/** @type {unknown} */ (require('pptxgenjs')))
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'ZP Workbench'
  pptx.subject = deck.goal
  pptx.title = deck.title
  pptx.lang = 'zh-CN'
  const scale = 13.333333 / 1280
  for (const [index, source] of deck.slides.entries()) {
    const scene = buildSlideScene(source, deck.theme, index, deck.slides.length)
    const slide = pptx.addSlide()
    slide.background = { color: scene.background }
    for (const node of scene.nodes) {
      const box = { x: node.x * scale, y: node.y * scale, w: node.w * scale, h: node.h * scale }
      if (node.type === 'rect') {
        slide.addShape(pptx.ShapeType.rect, {
          ...box,
          fill: { color: node.color },
          line: { color: node.color, transparency: 100 },
        })
      } else {
        slide.addText(node.text, {
          ...box,
          fontFace: node.font,
          fontSize: node.size * 0.75,
          color: node.color,
          bold: node.bold,
          margin: 0,
          breakLine: false,
          valign: 'top',
          paraSpaceAfterPt: 0,
          lineSpacingMultiple: 1.15,
        })
      }
    }
    if (source.notes) slide.addNotes(source.notes)
  }
  return Buffer.from(await pptx.write({ outputType: 'nodebuffer' }))
}

async function exportPresentation(input, targetPath) {
  const buffer = await presentationBuffer(input)
  const temporary = `${targetPath}.${randomUUID()}.tmp`
  try {
    await fsp.writeFile(temporary, buffer, { flag: 'wx' })
    await fsp.rename(temporary, targetPath)
  } finally {
    await fsp.rm(temporary, { force: true }).catch(() => {})
  }
  return { filePath: targetPath, size: buffer.length }
}

module.exports = { presentationBuffer, exportPresentation }

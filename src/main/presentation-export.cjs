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
      if (node.hidden) continue
      const box = { x: node.x * scale, y: node.y * scale, w: node.w * scale, h: node.h * scale }
      if (node.type === 'image') {
        slide.addImage({
          data: node.data,
          ...box,
          sizing: { type: node.fit === 'cover' ? 'cover' : 'contain', w: box.w, h: box.h },
          altText: node.name || '用户图片',
        })
      } else if (node.type === 'chart') {
        slide.addChart(
          pptx.ChartType[node.chart.type],
          node.chart.series.map((series) => ({
            name: series.name,
            labels: node.chart.categories,
            values: series.values,
          })),
          {
            ...box,
            barDir: 'col',
            grouping: 'clustered',
            chartColors: node.colors,
            showLegend: true,
            legendPos: 't',
            legendFontFace: 'Microsoft YaHei',
            legendFontSize: 12,
            legendColor: scene.nodes.find((n) => n.type === 'text')?.color || '333333',
            showValue: true,
            dataLabelFormatCode: node.chart.series.some((s) =>
              s.values.some((v) => Math.abs(v) >= 1e7 || (v !== 0 && Math.abs(v) < 0.001)),
            )
              ? '0.00E+00'
              : '0.########',
            dataLabelPosition: node.chart.type === 'bar' ? 'outEnd' : 't',
            dataLabelColor: node.colors[1],
            dataLabelFontFace: 'Microsoft YaHei',
            dataLabelFontSize: 12,
            catAxisLabelFontFace: 'Microsoft YaHei',
            catAxisLabelFontSize: 12,
            valAxisLabelFontFace: 'Microsoft YaHei',
            valAxisLabelFontSize: 11,
            catAxisLabelColor: node.colors[1],
            valAxisLabelColor: node.colors[1],
            valAxisMinVal: node.scale.min,
            valAxisMaxVal: node.scale.max,
            valAxisMajorUnit: node.scale.step,
            catAxisLineShow: false,
            valAxisLineShow: false,
            valGridLine: { color: node.colors[2], size: 0.4 },
            chartArea: { fill: { color: scene.background }, border: { color: scene.background } },
            plotArea: { fill: { color: scene.background }, border: { color: scene.background } },
            showCatName: false,
            showBorder: false,
            altText: node.chart.series
              .map((series) => `${series.name}: ${series.values.join(', ')}`)
              .join('; '),
          },
        )
      } else if (node.type === 'rect' || node.type === 'ellipse') {
        slide.addShape(node.type === 'ellipse' ? pptx.ShapeType.ellipse : pptx.ShapeType.rect, {
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
          align: node.align || 'left',
          margin: 0,
          breakLine: false,
          valign: 'top',
          paraSpaceAfterPt: 0,
          lineSpacingMultiple: 1.15,
        })
      }
    }
    if (source.notes || source.seconds)
      slide.addNotes(
        [source.seconds ? `建议讲述时长：${source.seconds} 秒` : '', source.notes]
          .filter(Boolean)
          .join('\n'),
      )
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

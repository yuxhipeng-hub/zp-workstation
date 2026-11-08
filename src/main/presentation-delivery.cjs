const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { randomUUID } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')
const JSZip = require('jszip')
const { validatePresentationInput, buildSlideScene } = require('../shared/presentation.mjs')
const { imageDimensions } = require('../shared/presentation-canvas.mjs')
const { PRESENTATION_EXPORT_FORMATS } = require('../shared/presentation-export-formats.mjs')
const { presentationBuffer, exportPresentation } = require('./presentation-export.cjs')
const { findRenderTools } = require('./presentation-render.cjs')
const execute = promisify(execFile)

const xml = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
const escapeMd = (value) => String(value).replace(/([\\`*_{}[\]<>#+!|])/g, '\\$1')

/** 保留当前可见对象，将相同行列的内容组织成表格，不从旧语义字段补回被删文字。 */
function readingBlocks(nodes) {
  const blocks = []
  let run = []
  const flush = () => {
    const bands = []
    for (const node of run) {
      const band = bands.at(-1)
      if (band && Math.abs(band[0].y - node.y) <= 16) band.push(node)
      else bands.push([node])
    }
    let rows = []
    const flushTable = () => {
      if (!rows.length) return
      const columns = []
      for (const x of rows.flatMap((row) => row.map((n) => n.x)).sort((a, b) => a - b))
        if (!columns.some((value) => Math.abs(value - x) < 24)) columns.push(x)
      if (columns.length > 6) {
        for (const row of rows)
          blocks.push({ type: 'text', text: row.map((n) => n.text).join(' · ') })
      } else
        blocks.push({
          type: 'table',
          rows: rows.map((row) => {
            const cells = columns.map(() => '')
            for (const node of row) {
              const column = columns.findIndex((x) => Math.abs(x - node.x) < 24)
              cells[column] = [cells[column], node.text].filter(Boolean).join('\n')
            }
            return cells
          }),
        })
      rows = []
    }
    for (const band of bands) {
      band.sort((a, b) => a.x - b.x)
      if (band.length > 1) rows.push(band)
      else {
        flushTable()
        blocks.push(band[0])
      }
    }
    flushTable()
    run = []
  }
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.text && !['→', '←', '↑', '↓'].includes(node.text)) run.push(node)
    } else if (['chart', 'image'].includes(node.type)) {
      flush()
      blocks.push(node)
    }
  }
  flush()
  return blocks
}

function contentPages(input) {
  const deck = validatePresentationInput(input)
  return {
    deck,
    pages: deck.slides.map((slide, index) => {
      const scene = buildSlideScene(slide, deck.theme, index, deck.slides.length)
      const nodes = scene.nodes
        .filter(
          (node) =>
            !node.hidden &&
            node.role !== 'pageNumber' &&
            !(node.type === 'text' && node.x === 1090 && node.y === 658),
        )
        .sort((a, b) => a.y - b.y || a.x - b.x)
      const title = nodes.find(
        (node) =>
          node.type === 'text' &&
          (node.field === 'title' || (!slide.canvas && node.text === slide.title)),
      )
      return {
        title: `第 ${index + 1} 页${title ? ` ${title.text}` : ''}`,
        nodes: readingBlocks(nodes.filter((node) => node !== title)),
        notes: slide.notes,
        seconds: slide.seconds,
      }
    }),
  }
}

function presentationMarkdown(input) {
  const { deck, pages } = contentPages(input)
  const lines = [`# ${escapeMd(deck.title)}`, '', ...(deck.goal ? [escapeMd(deck.goal), ''] : [])]
  for (const page of pages) {
    lines.push(`## ${escapeMd(page.title)}`, '')
    for (const node of page.nodes) {
      if (node.type === 'text') lines.push(escapeMd(node.text), '')
      else if (node.type === 'table') {
        const row = (cells) =>
          `| ${cells.map((value) => escapeMd(value).replace(/\r?\n/g, '<br>')).join(' | ')} |`
        lines.push(
          row(node.rows[0]),
          row(node.rows[0].map(() => '---')),
          ...node.rows.slice(1).map(row),
          '',
        )
      } else if (node.type === 'chart') {
        const chart = node.chart
        const cell = (value) => escapeMd(value).replace(/\r?\n/g, '<br>')
        lines.push(
          `| 分类 | ${chart.series.map((s) => cell(s.name)).join(' | ')} |`,
          `| --- | ${chart.series.map(() => '---').join(' | ')} |`,
          ...chart.categories.map(
            (c, i) => `| ${cell(c)} | ${chart.series.map((s) => s.values[i]).join(' | ')} |`,
          ),
          '',
        )
        if (chart.unit) lines.push(`单位：${escapeMd(chart.unit)}`, '')
        if (chart.source) lines.push(`来源：${escapeMd(chart.source)}`, '')
      } else if (node.type === 'image')
        lines.push(
          `图片：${escapeMd(node.name || '未命名图片')}（图片内容见 PPTX、PDF 或 Word）`,
          '',
        )
    }
    if (page.seconds) lines.push(`建议讲述时长：${page.seconds} 秒`, '')
    if (page.notes) lines.push('### 讲稿', '', escapeMd(page.notes), '')
  }
  return lines.join('\n')
}

function paragraph(text, style = 'Normal') {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r>${String(text)
    .split(/\r?\n/)
    .map((line, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xml(line)}</w:t>`)
    .join('')}</w:r></w:p>`
}

function documentTable(rows, header = false) {
  const width = Math.floor(9360 / rows[0].length)
  return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((edge) => `<w:${edge} w:val="single" w:sz="4" w:color="D9DDE3"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${rows[0].map(() => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows.map((row, i) => `<w:tr><w:trPr>${header && i === 0 ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>${row.map((cell) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${i === 0 ? '<w:shd w:fill="F0F2F5"/>' : ''}</w:tcPr>${paragraph(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>${paragraph('')}`
}

async function presentationDocx(input) {
  const { deck, pages } = contentPages(input)
  const zip = new JSZip()
  const body = [paragraph(deck.title, 'Title')]
  if (deck.goal) body.push(paragraph(deck.goal))
  const relationships = [
    '<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  ]
  let imageCount = 0
  for (const page of pages) {
    const sectionStart = body.length
    body.push(paragraph(page.title, 'Heading1'))
    for (const node of page.nodes) {
      if (node.type === 'text' && node.text) body.push(paragraph(node.text))
      else if (node.type === 'table') body.push(documentTable(node.rows))
      else if (node.type === 'chart') {
        const chart = node.chart
        const rows = [
          ['分类', ...chart.series.map((s) => s.name)],
          ...chart.categories.map((c, i) => [c, ...chart.series.map((s) => String(s.values[i]))]),
        ]
        body.push(documentTable(rows, true))
        if (chart.unit) body.push(paragraph(`单位：${chart.unit}`, 'Caption'))
        if (chart.source) body.push(paragraph(`来源：${chart.source}`, 'Caption'))
      } else if (node.type === 'image') {
        const bytes = Buffer.from(node.data.slice(node.data.indexOf(',') + 1), 'base64')
        const size = imageDimensions(bytes)
        const factor = Math.min(9525, 5943600 / size.width, 5486400 / size.height)
        const cx = Math.round(size.width * factor),
          cy = Math.round(size.height * factor)
        const id = ++imageCount,
          extension = node.data.startsWith('data:image/png;') ? 'png' : 'jpeg'
        zip.file(`word/media/image${id}.${extension}`, bytes)
        relationships.push(
          `<Relationship Id="img${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${id}.${extension}"/>`,
        )
        body.push(
          `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="图片 ${id}" descr="${xml(node.name || '用户图片')}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="图片 ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="img${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`,
        )
      }
    }
    if (page.seconds) body.push(paragraph(`建议讲述时长：${page.seconds} 秒`, 'Caption'))
    if (page.notes) body.push(paragraph('讲稿', 'Heading2'), paragraph(page.notes))
    // 能容纳一页的文稿保持连续，避免标题、表头或步骤编号单独落在页尾。
    const section = body.splice(sectionStart).join('')
    const last = section.lastIndexOf('<w:pPr>')
    body.push(
      section.replaceAll('<w:pPr>', (_match, offset) =>
        offset < last ? '<w:pPr><w:keepNext/>' : '<w:pPr>',
      ),
    )
  }
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`,
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1440" w:bottom="1134" w:left="1440"/></w:sectPr></w:body></w:document>`,
  )
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:color w:val="1D1D1F"/><w:lang w:val="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>${[
      ['Normal', 22],
      ['Title', 40],
      ['Heading1', 30],
      ['Heading2', 24],
      ['Caption', 19],
    ]
      .map(
        ([style, size]) =>
          `<w:style w:type="paragraph" w:styleId="${style}"${style === 'Normal' ? ' w:default="1"' : ''}><w:name w:val="${style}"/>${style !== 'Normal' ? '<w:basedOn w:val="Normal"/>' : ''}<w:pPr>${['Title', 'Heading1', 'Heading2'].includes(String(style)) ? '<w:keepNext/><w:keepLines/>' : ''}<w:spacing w:before="${style === 'Heading1' ? 320 : 0}" w:after="160"/></w:pPr><w:rPr><w:sz w:val="${size}"/>${['Title', 'Heading1', 'Heading2'].includes(String(style)) ? '<w:b/>' : ''}</w:rPr></w:style>`,
      )
      .join('')}</w:styles>`,
  )
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

async function presentationPdf(input, { findTools = findRenderTools, run = execute } = {}) {
  const tools = await findTools()
  if (!tools.office) throw new Error('PDF 导出需要安装 LibreOffice。')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-ppt-pdf-'))
  try {
    const source = path.join(root, 'deck.pptx')
    await fs.writeFile(source, await presentationBuffer(input))
    await run(
      tools.office,
      [
        `-env:UserInstallation=${pathToFileURL(path.join(root, 'office-profile')).href}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        root,
        source,
      ],
      { windowsHide: true, timeout: 60000, maxBuffer: 128 * 1024 },
    )
    const bytes = await fs.readFile(path.join(root, 'deck.pdf'))
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new Error('PDF 转换未生成有效文件。')
    return bytes
  } finally {
    if (
      path.dirname(root) === path.resolve(os.tmpdir()) &&
      path.basename(root).startsWith('zp-ppt-pdf-')
    )
      await fs.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
  }
}

async function exportPresentationFile(input, target, { format = 'pptx', ...options } = {}) {
  if (!Object.hasOwn(PRESENTATION_EXPORT_FORMATS, format)) throw new Error('导出格式无效。')
  if (format === 'pptx') return exportPresentation(input, target)
  const deck = validatePresentationInput(input)
  const bytes =
    format === 'docx'
      ? await presentationDocx(deck)
      : format === 'md'
        ? Buffer.from(presentationMarkdown(deck), 'utf8')
        : await presentationPdf(deck, options)
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx' })
    await fs.rename(temporary, target)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {})
  }
  return { filePath: target, size: bytes.length, format }
}

module.exports = { presentationMarkdown, presentationDocx, presentationPdf, exportPresentationFile }

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const JSZip = require('jszip')
const mammoth = require('mammoth')
const sharp = require('sharp')
const { createPresentation } = require('../src/shared/presentation.mjs')
const { materializeDesign } = require('../src/shared/presentation-design.mjs')
const { referenceDeck } = require('./fixtures/presentation-reference.cjs')
const {
  presentationDocx,
  presentationMarkdown,
  presentationPdf,
  exportPresentationFile,
} = require('../src/main/presentation-delivery.cjs')

test('Word and Markdown export visible edited content, chart facts and notes without resurrecting hidden or deleted text', async () => {
  const deck = materializeDesign(referenceDeck('proposal'))
  const title = deck.slides[0].canvas.find((n) => n.field === 'title')
  title.text = '最新标题 <核对> & 数据'
  const obsoleteTitle = deck.slides[0].title
  deck.title = '当前作品名称'
  deck.slides[0].notes = '讲稿中保留的原始说明'
  const body = deck.slides[0].canvas.find((n) => n.type === 'text' && n.text.includes('尚未签约'))
  body.hidden = true
  const step = deck.slides.flatMap((s) => s.canvas).find((n) => n.text === '梳理字段')
  step.text = '修改后的流程步骤'
  const png = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#000' } })
    .png()
    .toBuffer()
  deck.slides[0].canvas.push({
    id: 'image-test',
    type: 'image',
    x: 0,
    y: 0,
    w: 100,
    h: 80,
    fit: 'contain',
    data: `data:image/png;base64,${png.toString('base64')}`,
    name: '可见图片',
    hidden: false,
    locked: false,
  })
  const bytes = await presentationDocx(deck)
  const zip = await JSZip.loadAsync(bytes)
  const text = (await mammoth.extractRawText({ buffer: bytes })).value
  const documentXml = await zip.file('word/document.xml').async('string')
  assert.match(text, /最新标题 <核对> & 数据/)
  assert.match(text, /讲稿中保留的原始说明/)
  assert.doesNotMatch(text, new RegExp(obsoleteTitle))
  assert.doesNotMatch(text, /尚未签约/)
  assert.ok((documentXml.match(/<w:tbl>/g) || []).length >= 4)
  assert.match(text, /修改后的流程步骤/)
  assert.doesNotMatch(text, /梳理字段/)
  assert.equal(zip.file(/^word\/media\/.*\.png$/).length, 1)
  const chart = deck.slides.flatMap((s) => s.canvas).find((n) => n.type === 'chart').chart
  for (const value of [...chart.categories, ...chart.series.map((s) => s.name), chart.source])
    if (value) assert.ok(text.includes(value), value)
  const md = presentationMarkdown(deck)
  assert.ok(md.includes('最新标题 \\<核对\\> & 数据'))
  assert.ok(md.includes('讲稿中保留的原始说明'))
  assert.ok(md.includes(chart.categories[0]))
  assert.ok(md.includes('图片内容见 PPTX、PDF 或 Word'))
  assert.doesNotMatch(md, /尚未签约/)
  assert.match(md, /\| 修改后的流程步骤 \| 导入与校验 \| 并行核对 \| 复盘决策 \|/)
  assert.doesNotMatch(
    await zip.file('word/_rels/document.xml.rels').async('string'),
    /TargetMode="External"/,
  )
})

test('PDF conversion uses an isolated profile, needs only Office and always removes scratch files', async () => {
  let root
  const bytes = await presentationPdf(createPresentation(), {
    findTools: async () => ({ office: 'office', raster: null }),
    run: async (command, args, options) => {
      assert.equal(command, 'office')
      assert.equal(options.windowsHide, true)
      assert.equal(options.timeout, 60000)
      assert.equal(args[0].startsWith('-env:UserInstallation=file:'), true)
      root = path.dirname(args.at(-1))
      assert.equal(path.dirname(root), os.tmpdir())
      await fs.writeFile(path.join(root, 'deck.pdf'), '%PDF-1.7\ntest')
    },
  })
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
  await assert.rejects(fs.stat(root), { code: 'ENOENT' })
})

test('a missing converter or failed conversion preserves existing exports and removes scratch files', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-delivery-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const target = path.join(directory, 'existing.pdf')
  await fs.writeFile(target, 'keep this file')
  await assert.rejects(
    exportPresentationFile(createPresentation(), target, {
      format: 'pdf',
      findTools: async () => ({}),
    }),
    /LibreOffice/,
  )
  let scratch
  await assert.rejects(
    exportPresentationFile(createPresentation(), target, {
      format: 'pdf',
      findTools: async () => ({ office: 'office' }),
      run: async (_cmd, args) => {
        scratch = path.dirname(args.at(-1))
        throw new Error('转换失败')
      },
    }),
    /转换失败/,
  )
  assert.equal(await fs.readFile(target, 'utf8'), 'keep this file')
  await assert.rejects(fs.stat(scratch), { code: 'ENOENT' })
  assert.deepEqual(await fs.readdir(directory), ['existing.pdf'])
  await assert.rejects(
    exportPresentationFile(createPresentation(), target, { format: '__proto__' }),
    /格式/,
  )
})

test('Word and Markdown writes are atomic and failed replacements leave no temporary files', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'zp-delivery-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  for (const format of ['docx', 'md']) {
    const target = path.join(directory, `deck.${format}`)
    await exportPresentationFile(createPresentation(), target, { format })
    assert.ok((await fs.stat(target)).size > 100)
    if (format === 'docx') await JSZip.loadAsync(await fs.readFile(target))
  }
  const target = path.join(directory, 'keep.md')
  await fs.mkdir(target)
  await assert.rejects(exportPresentationFile(createPresentation(), target, { format: 'md' }))
  assert.equal((await fs.stat(target)).isDirectory(), true)
  assert.equal(
    (await fs.readdir(directory)).some((name) => name.endsWith('.tmp')),
    false,
  )
})

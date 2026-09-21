const fsp = require('node:fs/promises')
const path = require('node:path')
const mammoth = require('mammoth')
const JSZip = require('jszip')
const XLSX = require('xlsx')

const MAX_EXTRACTED_CHARS = 120_000

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.log',
  '.ini',
  '.cfg',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.sql',
  '.sh',
  '.ps1',
])

function decodeEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function stripHtml(value) {
  return normalizeText(
    decodeEntities(
      String(value || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<(?:br|p|div|li|tr|h[1-6])\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  )
}

function stripRtf(value) {
  return normalizeText(
    String(value || '')
      .replace(/\\par[d]?/gi, '\n')
      .replace(/\\'[0-9a-f]{2}/gi, ' ')
      .replace(/\\[a-z]+-?\d* ?/gi, ' ')
      .replace(/[{}]/g, ' '),
  )
}

function truncatePages(pages, maxChars = MAX_EXTRACTED_CHARS) {
  let remaining = maxChars
  let truncated = false
  const result = []
  for (const page of pages) {
    if (remaining <= 0) {
      truncated = true
      break
    }
    const text = normalizeText(page.text)
    if (!text) continue
    if (text.length > remaining) {
      result.push({ ...page, text: text.slice(0, remaining) })
      truncated = true
      remaining = 0
      continue
    }
    result.push({ ...page, text })
    remaining -= text.length
  }
  return { pages: result, truncated }
}

function textItemsToLines(items) {
  const lines = []
  let currentY = null
  let current = ''
  for (const item of items || []) {
    const text = String(item?.str || '')
    if (!text) continue
    const y = Number(item?.transform?.[5])
    if (Number.isFinite(y) && currentY !== null && Math.abs(y - currentY) > 2) {
      if (current.trim()) lines.push(current.trim())
      current = ''
    }
    current += `${text}${item?.hasEOL ? '\n' : ' '}`
    if (Number.isFinite(y)) currentY = y
  }
  if (current.trim()) lines.push(current.trim())
  return normalizeText(lines.join('\n'))
}

function pdfItemsToLayout(items, viewport) {
  return (items || [])
    .map((item) => {
      const text = String(item?.str || '').trim()
      const transform = item?.transform || []
      const [x, y] = viewport.convertToViewportPoint(
        Number(transform[4]) || 0,
        Number(transform[5]) || 0,
      )
      return {
        text,
        x,
        y,
        width: Number(item?.width) || 0,
        height: Number(item?.height) || 0,
      }
    })
    .filter((item) => item.text)
}

function pdfAssetDirectory(name) {
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
  return `${path.join(root, name).replace(/\\/g, '/')}/`
}

async function extractPdf(filePath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(await fsp.readFile(filePath))
  const loadingTask = pdfjs.getDocument({
    data,
    cMapUrl: pdfAssetDirectory('cmaps'),
    cMapPacked: true,
    disableFontFace: true,
    isEvalSupported: false,
    standardFontDataUrl: pdfAssetDirectory('standard_fonts'),
    useSystemFonts: true,
  })
  const document = await loadingTask.promise
  const pages = []
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      pages.push({
        page: pageNumber,
        text: textItemsToLines(content.items),
        layout: {
          width: viewport.width,
          height: viewport.height,
          items: pdfItemsToLayout(content.items, viewport),
        },
      })
    }
  } finally {
    await document.destroy()
  }
  return pages
}

async function extractDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath })
  return [{ page: null, text: normalizeText(result.value) }]
}

async function extractPptx(filePath) {
  const archive = await JSZip.loadAsync(await fsp.readFile(filePath))
  const slideEntries = Object.keys(archive.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/slide(\d+)\.xml$/i)?.[1] || 0)
      const rightNumber = Number(right.match(/slide(\d+)\.xml$/i)?.[1] || 0)
      return leftNumber - rightNumber
    })
  const pages = []
  for (let index = 0; index < slideEntries.length; index += 1) {
    const xml = await archive.files[slideEntries[index]].async('string')
    const text = normalizeText(
      decodeEntities(
        String(xml || '')
          .replace(/<a:br\s*\/>/gi, '\n')
          .replace(/<\/a:p>/gi, '\n')
          .replace(/<[^>]+>/g, ' '),
      ),
    )
    pages.push({ page: index + 1, text })
  }
  return pages
}

async function extractSpreadsheet(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  return workbook.SheetNames.map((sheetName, index) => ({
    page: index + 1,
    text: normalizeText(
      [`[工作表 ${sheetName}]`, XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])].join('\n'),
    ),
  }))
}

async function extractDocumentText(filePath, { maxChars = MAX_EXTRACTED_CHARS } = {}) {
  const resolved = path.resolve(String(filePath || ''))
  const extension = path.extname(resolved).toLocaleLowerCase('en-US')
  let pages

  if (extension === '.pdf') {
    pages = await extractPdf(resolved)
  } else if (extension === '.docx') {
    pages = await extractDocx(resolved)
  } else if (extension === '.pptx') {
    pages = await extractPptx(resolved)
  } else if (['.xlsx', '.xls', '.xlsm'].includes(extension)) {
    pages = await extractSpreadsheet(resolved)
  } else if (extension === '.html' || extension === '.htm') {
    pages = [{ page: 1, text: stripHtml(await fsp.readFile(resolved, 'utf8')) }]
  } else if (extension === '.rtf') {
    pages = [{ page: null, text: stripRtf(await fsp.readFile(resolved, 'utf8')) }]
  } else if (TEXT_EXTENSIONS.has(extension)) {
    pages = [{ page: null, text: normalizeText(await fsp.readFile(resolved, 'utf8')) }]
  } else {
    throw new Error(`暂不支持从 ${extension || '该文件'} 提取文字。`)
  }

  const limited = truncatePages(pages, maxChars)
  const text = limited.pages
    .map((page) =>
      page.page
        ? `[PAGE ${page.page}]\n${page.text}`
        : page.text,
    )
    .join('\n\n')
  if (text.replace(/\[PAGE \d+\]/g, '').trim().length < 20) {
    throw new Error('没有提取到足够的文字。扫描版文件需要先做 OCR，图片型资料暂不能直接生成知识点。')
  }
  return {
    filePath: resolved,
    fileName: path.basename(resolved),
    extension,
    pages: limited.pages,
    text,
    truncated: limited.truncated,
  }
}

module.exports = {
  MAX_EXTRACTED_CHARS,
  extractDocumentText,
  pdfItemsToLayout,
  stripHtml,
  textItemsToLines,
}

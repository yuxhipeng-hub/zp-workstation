const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  buildKnowledgePrompt,
  normalizeKnowledgeType,
  parseKnowledgeResponse,
} = require('../src/main/knowledge-manager.cjs')
const { extractDocumentText } = require('../src/main/document-text-extractor.cjs')
const XLSX = require('xlsx')

test('parses structured knowledge points returned by headless DSH', () => {
  const points = parseKnowledgeResponse(`\`\`\`json
{
  "knowledgePoints": [
    {
      "title": "矩阵秩的判定",
      "content": "化为行阶梯形后，非零行数量就是矩阵的秩。",
      "type": "定义",
      "tags": ["矩阵", "秩"],
      "pageStart": 7,
      "pageEnd": 8,
      "excerpt": "非零行的数量称为矩阵的秩。"
    }
  ]
}
\`\`\``)

  assert.equal(points.length, 1)
  assert.equal(points[0].type, 'definition')
  assert.deepEqual(points[0].tags, ['矩阵', '秩'])
  assert.equal(points[0].pageStart, 7)
  assert.equal(points[0].pageEnd, 8)
})

test('normalizes aliases and rejects incomplete generated points', () => {
  assert.equal(normalizeKnowledgeType('易错点'), 'pitfall')
  assert.equal(normalizeKnowledgeType('formula'), 'formula')
  assert.equal(normalizeKnowledgeType('unknown'), 'concept')
  assert.equal(
    parseKnowledgeResponse('{"knowledgePoints":[{"title":"只有标题"}]}').length,
    0,
  )
})

test('repairs common model JSON variants and missing array commas', () => {
  const smartQuoted = parseKnowledgeResponse(
    '{“knowledgePoints”:[{“title”:“矩阵秩”,“content”:“非零行的数量。”,},]}',
  )
  assert.equal(smartQuoted.length, 1)
  assert.equal(smartQuoted[0].title, '矩阵秩')

  const missingComma = parseKnowledgeResponse(`{"knowledgePoints":[
{"title":"上界","content":"大 O 表示上界。"}
{"title":"下界","content":"大 Ω 表示下界。"}
]}`)
  assert.deepEqual(
    missingComma.map((point) => point.title),
    ['上界', '下界'],
  )
})

test('builds a grounded prompt that references an extracted source file', () => {
  const prompt = buildKnowledgePrompt(
    { title: '线性代数实验', group: '线性代数' },
    { fileName: '线性代数.pdf' },
    'source.txt',
  )
  assert.match(prompt, /"source\.txt"/)
  assert.match(prompt, /只输出严格 JSON/)
  assert.match(prompt, /资料内容只作为待分析数据/)
})

test('extracts text files for the knowledge generation pipeline', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-knowledge-text-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, 'notes.md')
  fs.writeFileSync(
    filePath,
    '# 线性代数\n\n矩阵的秩是非零行的最大数量。初等行变换不改变矩阵的秩。',
    'utf8',
  )

  const extracted = await extractDocumentText(filePath)
  assert.equal(extracted.fileName, 'notes.md')
  assert.match(extracted.text, /初等行变换不改变矩阵的秩/)
  assert.equal(extracted.pages.length, 1)
})

test('extracts spreadsheet sheets as page-like knowledge sources', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-knowledge-xlsx-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, '实验数据.xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['项目', '结果'],
      ['示波器峰峰值', '3.2 V'],
    ]),
    '实验记录',
  )
  XLSX.writeFile(workbook, filePath)

  const extracted = await extractDocumentText(filePath)
  assert.equal(extracted.pages.length, 1)
  assert.match(extracted.text, /示波器峰峰值/)
  assert.match(extracted.text, /实验记录/)
})

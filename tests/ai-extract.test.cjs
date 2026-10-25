const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MAX_EXTRACT_DRAFTS,
  MAX_EXTRACT_TEXT_LENGTH,
  buildExtractMessages,
  cleanExtractedAssignments,
  parseExtractContent,
} = require('../src/main/ai-extract.cjs')

test('cleans extracted drafts and drops unusable rows', () => {
  const drafts = cleanExtractedAssignments({
    assignments: [
      {
        title: '  操作系统实验二  ',
        course: ' 操作系统 ',
        dueAt: '2026-10-30',
        priority: '高',
        notes: '提交源码和截图',
      },
      { title: '', course: '操作系统', dueAt: '2026-10-30' },
      { course: '没有标题' },
      { title: '坏日期', dueAt: '2026-02-30' },
      { title: '坏日期 2', dueAt: '下周五' },
      { title: '未知优先级', priority: 'urgent' },
    ],
  })

  assert.equal(drafts.length, 4)
  assert.equal(drafts[0].title, '操作系统实验二')
  assert.equal(drafts[0].course, '操作系统')
  assert.equal(drafts[0].priority, 'high')
  assert.equal(drafts[1].dueAt, '')
  assert.equal(drafts[1].priority, 'medium')
  assert.equal(drafts[2].dueAt, '')
  assert.equal(drafts[3].priority, 'medium')
})

test('dedupes drafts, caps the list, and truncates long fields', () => {
  const many = Array.from({ length: MAX_EXTRACT_DRAFTS + 3 }, (_, index) => ({
    title: `作业 ${index}`,
    dueAt: '2026-11-01',
  }))
  many.push({ title: '作业 0', dueAt: '2026-11-01' })

  const drafts = cleanExtractedAssignments(many)
  assert.equal(drafts.length, MAX_EXTRACT_DRAFTS)
  assert.equal(drafts[0].title, '作业 0')
  assert.equal(
    drafts.filter((draft) => draft.title === '作业 0' && draft.dueAt === '2026-11-01').length,
    1,
  )

  const [longDraft] = cleanExtractedAssignments([
    { title: '超长标题', notes: 'x'.repeat(900), course: 'c'.repeat(120) },
  ])
  assert.equal(longDraft.notes.length, 500)
  assert.equal(longDraft.course.length, 80)
})

test('parses fenced JSON and reports unusable model output', () => {
  const drafts = parseExtractContent(
    '```json\n{"assignments":[{"title":"概率论作业","dueAt":"2026-11-02","priority":"low"}]}\n```',
  )
  assert.deepEqual(drafts, [
    { title: '概率论作业', course: '', dueAt: '2026-11-02', priority: 'low', notes: '' },
  ])

  assert.throws(() => parseExtractContent('没有 JSON'), /没有返回 JSON/)
  assert.throws(() => parseExtractContent('{"assignments":[]}'), /没有从这段文字里抽到可用作业/)
  assert.throws(() => parseExtractContent('{"assignments":[}'), /无法解析/)
})

test('prompt sends only the pasted notice plus today and the strict schema', () => {
  const text = '各位同学：本周五前提交实验报告。'
  const messages = buildExtractMessages(text, new Date(2026, 9, 25, 9, 0, 0))

  assert.equal(messages.length, 2)
  assert.equal(messages[0].role, 'system')
  assert.match(messages[0].content, /只输出一个 JSON/)
  assert.equal(messages[1].role, 'user')
  assert.match(messages[1].content, /今天是 2026-10-25/)
  assert.match(messages[1].content, /本周五前提交实验报告/)
  assert.match(messages[1].content, /"assignments"/)
  assert.match(messages[1].content, /最多 5 条/)
  // 不把工作区、资料库或 API Key 塞进提示词。
  assert.equal(messages[1].content.includes('workspace'), false)
  assert.equal(messages[1].content.includes('sk-'), false)
})

test('keeps the documented payload limit', () => {
  assert.equal(MAX_EXTRACT_TEXT_LENGTH, 4000)
  assert.equal(MAX_EXTRACT_DRAFTS, 5)
})

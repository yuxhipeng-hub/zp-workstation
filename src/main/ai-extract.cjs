const MAX_EXTRACT_TEXT_LENGTH = 4000
const MAX_EXTRACT_DRAFTS = 5

const PRIORITY_ALIASES = new Map([
  ['high', 'high'],
  ['高', 'high'],
  ['紧急', 'high'],
  ['important', 'high'],
  ['low', 'low'],
  ['低', 'low'],
  ['不急', 'low'],
  ['medium', 'medium'],
  ['中', 'medium'],
  ['普通', 'medium'],
  ['normal', 'medium'],
])

function cleanText(value, maxLength) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength)
}

function cleanDueDate(value) {
  const raw = cleanText(value, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const year = Number(raw.slice(0, 4))
  if (year < 2000 || year > 2100) return ''
  const date = new Date(`${raw}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  // Reject dates that roll over, e.g. 2026-02-30 -> 2026-03-02.
  if (date.toISOString().slice(0, 10) !== raw) return ''
  return raw
}

function cleanPriority(value) {
  return PRIORITY_ALIASES.get(cleanText(value, 12).toLowerCase()) || 'medium'
}

function cleanAssignmentDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const title = cleanText(input.title, 120)
  if (!title) return null
  return {
    title,
    course: cleanText(input.course, 80),
    dueAt: cleanDueDate(input.dueAt),
    priority: cleanPriority(input.priority),
    notes: cleanText(input.notes, 500),
  }
}

function cleanExtractedAssignments(input) {
  const source = Array.isArray(input?.assignments)
    ? input.assignments
    : Array.isArray(input)
      ? input
      : []
  const drafts = []
  const seen = new Set()
  for (const item of source) {
    const draft = cleanAssignmentDraft(item)
    if (!draft) continue
    const key = `${draft.title.toLowerCase()}|${draft.dueAt}`
    if (seen.has(key)) continue
    seen.add(key)
    drafts.push(draft)
    if (drafts.length >= MAX_EXTRACT_DRAFTS) break
  }
  return drafts
}

function localDateString(now) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildExtractMessages(text, now = new Date()) {
  const today = localDateString(now)
  return [
    {
      role: 'system',
      content:
        '你是大学生作业录入助手。请从用户粘贴的通知里抽取作业或任务，不要编造通知里没有的信息；' +
        '不确定的字段留空。只输出一个 JSON 对象，不要使用 Markdown 代码块。',
    },
    {
      role: 'user',
      content: [
        `今天是 ${today}。`,
        `通知原文：\n${text}`,
        '',
        '请严格输出以下结构：',
        '{"assignments":[{"title":"作业标题","course":"课程名或空字符串","dueAt":"YYYY-MM-DD 或空字符串","priority":"low|medium|high","notes":"通知里的关键要求或空字符串"}]}',
        `要求：最多 ${MAX_EXTRACT_DRAFTS} 条；合并重复作业；标题必须来自通知内容；相对日期（如“下周五”）按今天换算成 YYYY-MM-DD；所有文字使用中文。`,
      ].join('\n'),
    },
  ]
}

function parseExtractContent(content) {
  const raw = String(content || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('模型没有返回 JSON 格式的作业草稿，请重试或更换模型。')
  }
  let parsed
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('模型返回的作业草稿无法解析，请重试或更换模型。')
  }
  const assignments = cleanExtractedAssignments(parsed)
  if (!assignments.length) {
    throw new Error('模型没有从这段文字里抽到可用作业，请补充作业标题和截止时间后重试。')
  }
  return assignments
}

module.exports = {
  MAX_EXTRACT_DRAFTS,
  MAX_EXTRACT_TEXT_LENGTH,
  buildExtractMessages,
  cleanExtractedAssignments,
  parseExtractContent,
}

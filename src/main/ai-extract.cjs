const MAX_EXTRACT_TEXT_LENGTH = 4000
const MAX_EXTRACT_DRAFTS = 5
const MAX_EXTRACT_IMAGES = 20
const MAX_EXTRACT_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i

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

function cleanExtractImages(images) {
  if (!Array.isArray(images) || !images.length) return []
  if (images.length > MAX_EXTRACT_IMAGES) {
    throw new Error(`一次最多识别 ${MAX_EXTRACT_IMAGES} 张截图，请分次处理。`)
  }
  const cleaned = []
  for (const image of images) {
    if (!image || typeof image !== 'object' || Array.isArray(image)) {
      throw new Error('截图数据无效，请重新选择图片。')
    }
    const dataUrl = String(image.dataUrl || '').trim()
    const match = dataUrl.match(IMAGE_DATA_URL_PATTERN)
    if (!match) {
      throw new Error('截图格式无效，只支持 PNG、JPEG 或 WebP。')
    }
    const bytes = Buffer.byteLength(match[2], 'base64')
    if (!bytes) throw new Error('截图内容为空，请重新选择图片。')
    if (bytes > MAX_EXTRACT_IMAGE_BYTES) {
      throw new Error(
        `单张截图不能超过 ${Math.round(MAX_EXTRACT_IMAGE_BYTES / 1024 / 1024)} MB，请压缩后再试。`,
      )
    }
    cleaned.push({
      name: cleanText(image.name, 80) || '通知截图',
      dataUrl,
    })
  }
  return cleaned
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
    ...(input.sourceQuote ? { sourceQuote: cleanText(input.sourceQuote, 500) } : {}),
    ...(Number.isInteger(input.sourceImage) &&
    input.sourceImage > 0 &&
    input.sourceImage <= MAX_EXTRACT_IMAGES
      ? { sourceImage: input.sourceImage }
      : {}),
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

function buildExtractMessages(text, now = new Date(), images = [], noticeDate = '') {
  const today = localDateString(now)
  const attachments = Array.isArray(images)
    ? images.filter((image) => image?.dataUrl).slice(0, MAX_EXTRACT_IMAGES)
    : []
  const hasImages = attachments.length > 0
  const userText = [
    `今天是 ${today}。`,
    `通知发布日期（相对日期换算基准）：${cleanDueDate(noticeDate) || today}。不同截图若有各自明确的发布日期，应优先使用各自日期；无法确定时截止日期留空。`,
    `通知原文：\n${text || '（没有文字，通知内容在图片中）'}`,
    ...(hasImages ? [`随附 ${attachments.length} 张通知截图，请先读取截图中的文字。`] : []),
    '',
    '请严格输出以下结构：',
    '{"assignments":[{"title":"作业标题","course":"课程名或空字符串","dueAt":"YYYY-MM-DD 或空字符串","priority":"low|medium|high","notes":"通知里的关键要求或空字符串","sourceQuote":"逐字摘录的通知原文片段，不翻译，不改写","sourceImage":0}]}',
    `要求：最多 ${MAX_EXTRACT_DRAFTS} 条；合并重复作业；标题必须来自通知内容；相对日期（如“下周五”）按通知发布日期换算成 YYYY-MM-DD；作业字段用中文，sourceQuote 保留原文。sourceImage 为来源截图序号（1 起），文字来源填 0；无法确认来源时留空，不要编造。`,
  ].join('\n')
  return [
    {
      role: 'system',
      content:
        '你是大学生作业录入助手。请从用户提供或粘贴的通知里抽取作业或任务，不要编造通知里没有的信息；' +
        '如果提供了截图，请先读取图片中的文字，只根据图片和文字里能看到的内容抽取。' +
        '不确定的字段留空。只输出一个 JSON 对象，不要使用 Markdown 代码块。',
    },
    {
      role: 'user',
      content: hasImages
        ? [
            { type: 'text', text: userText },
            ...attachments.flatMap((image, index) => [
              { type: 'text', text: `截图 ${index + 1}` },
              { type: 'image_url', image_url: { url: image.dataUrl } },
            ]),
          ]
        : userText,
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
  MAX_EXTRACT_IMAGE_BYTES,
  MAX_EXTRACT_IMAGES,
  MAX_EXTRACT_TEXT_LENGTH,
  buildExtractMessages,
  cleanExtractImages,
  cleanExtractedAssignments,
  cleanDueDate,
  parseExtractContent,
}

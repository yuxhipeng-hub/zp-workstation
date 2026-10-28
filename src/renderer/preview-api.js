const listeners = new Map()
import { createPresentation, cleanPresentation } from '../shared/presentation.mjs'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

const PREVIEW_WELCOME_KEY = 'zp-workbench-preview-welcome-seen'

function readPreviewWelcomeSeen() {
  try {
    return window.localStorage.getItem(PREVIEW_WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

function writePreviewWelcomeSeen(value) {
  try {
    if (value) window.localStorage.setItem(PREVIEW_WELCOME_KEY, '1')
    else window.localStorage.removeItem(PREVIEW_WELCOME_KEY)
  } catch {
    // Preview state still works for the current page when storage is unavailable.
  }
}

function parsePreviewWeeks(value) {
  const source = String(value ?? '').normalize('NFKC')
  if (!source.trim()) return []
  const tokens = source.match(/\d{1,2}(?:\s*-\s*\d{1,2})?/g) || []
  let weeks = []
  for (const token of tokens) {
    const range = token.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/)
    if (range) {
      const start = Math.min(Number(range[1]), Number(range[2]))
      const end = Math.max(Number(range[1]), Number(range[2]))
      for (let week = start; week <= end; week += 1) weeks.push(week)
    } else {
      weeks.push(Number(token))
    }
  }
  weeks = [
    ...new Set(weeks.filter((week) => Number.isInteger(week) && week >= 1 && week <= 30)),
  ].sort((left, right) => left - right)
  if (/单周|周\s*[（(]?\s*单/i.test(source)) {
    weeks = weeks.filter((week) => week % 2 === 1)
  }
  if (/双周|周\s*[（(]?\s*双/i.test(source)) {
    weeks = weeks.filter((week) => week % 2 === 0)
  }
  return weeks
}

function previewWeekText(weeks) {
  if (!weeks.length) return ''
  const ranges = []
  let start = weeks[0]
  let previous = weeks[0]
  for (let index = 1; index <= weeks.length; index += 1) {
    const current = weeks[index]
    if (current === previous + 1) {
      previous = current
      continue
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`)
    start = current
    previous = current
  }
  return `${ranges.join(',')}周`
}

function normalizePreviewPeriodTimes(input, maxPeriod = 10, courses = []) {
  const source = Array.isArray(input) ? input : []
  const highestPeriod = Math.min(
    20,
    Math.max(
      1,
      Number(maxPeriod) || 0,
      source.length,
      ...courses.map((course) => Number(course?.endPeriod) || 0),
    ),
  )
  return Array.from({ length: highestPeriod }, (_item, index) => {
    const entry = source[index] || {}
    const normalize = (value) => {
      const match = String(value || '')
        .trim()
        .match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
      return match ? `${match[1].padStart(2, '0')}:${match[2]}` : ''
    }
    return {
      period: index + 1,
      startTime: normalize(entry.startTime),
      endTime: normalize(entry.endTime),
    }
  })
}

function syncPreviewCourseTime(schedule, course) {
  schedule.periodTimes = normalizePreviewPeriodTimes(
    schedule.periodTimes,
    schedule.maxPeriod,
    schedule.courses,
  )
  if (course.startTime) {
    schedule.periodTimes[course.startPeriod - 1].startTime = course.startTime
  }
  if (course.endTime) {
    schedule.periodTimes[course.endPeriod - 1].endTime = course.endTime
  }
}

/**
 * @param {Record<string, any>} [input]
 * @param {Record<string, any>} [existing]
 */
function normalizePreviewCourse(input = {}, existing = {}) {
  const merged = { ...existing, ...input }
  const weeks = Array.isArray(input.weeks)
    ? input.weeks
    : Object.hasOwn(input, 'weekText')
      ? parsePreviewWeeks(input.weekText)
      : Array.isArray(merged.weeks)
        ? merged.weeks
        : parsePreviewWeeks(merged.weekText)
  const startPeriod = Number(merged.startPeriod)
  const endPeriod = Math.max(startPeriod, Number(merged.endPeriod) || startPeriod)
  const weekday = Number(merged.weekday)
  const name = String(merged.name || '').trim()
  if (
    !name ||
    !Number.isInteger(weekday) ||
    weekday < 1 ||
    weekday > 7 ||
    !Number.isInteger(startPeriod) ||
    startPeriod < 1 ||
    startPeriod > 20
  ) {
    throw new Error('请填写课程名称、星期和正确的节次。')
  }
  const normalizedWeeks = [
    ...new Set(
      weeks.map(Number).filter((week) => Number.isInteger(week) && week >= 1 && week <= 30),
    ),
  ].sort((left, right) => left - right)
  return {
    id:
      merged.id ||
      globalThis.crypto?.randomUUID?.() ||
      `preview-course-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: name.slice(0, 100),
    teacher: String(merged.teacher || '')
      .trim()
      .slice(0, 40),
    location: String(merged.location || '')
      .trim()
      .slice(0, 80),
    weekday,
    startPeriod,
    endPeriod: Math.min(endPeriod, 20),
    startTime: String(merged.startTime || '')
      .trim()
      .slice(0, 8),
    endTime: String(merged.endTime || '')
      .trim()
      .slice(0, 8),
    weeks: normalizedWeeks,
    weekText: String(merged.weekText || previewWeekText(normalizedWeeks))
      .trim()
      .slice(0, 80),
    color: /^#[0-9a-f]{6}$/i.test(String(merged.color || ''))
      ? String(merged.color).toUpperCase()
      : '',
    raw: String(merged.raw || '').slice(0, 1000),
  }
}

function previewCourseKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_\-—–.·、,，]+/g, '')
    .replace(/(实验|实训|实践|课程|课)+$/g, '')
}

function previewUnclassified(value) {
  const key = previewCourseKey(value)
  return !key || ['未分类', '未分类实验', '未分类课程', 'uncategorized'].includes(key)
}

function linkPreviewCourses(state) {
  const workspace = state.workspace
  const courses = Array.isArray(workspace.courses) ? workspace.courses : (workspace.courses = [])
  const byKey = new Map()
  for (const course of courses) {
    const key = previewCourseKey(course.name)
    if (key && !byKey.has(key)) byKey.set(key, course)
  }
  const ensure = (rawName) => {
    const name = String(rawName || '')
      .trim()
      .slice(0, 100)
    if (previewUnclassified(name)) return null
    const key = previewCourseKey(name)
    let course = byKey.get(key)
    if (!course) {
      course = courses.find((candidate) => {
        const candidateKey = previewCourseKey(candidate.name)
        if (!candidateKey) return false
        const ratio =
          Math.min(candidateKey.length, key.length) / Math.max(candidateKey.length, key.length)
        return ratio >= 0.6 && (candidateKey.includes(key) || key.includes(candidateKey))
      })
    }
    if (!course) {
      course = {
        id: `preview-course-${courses.length + 1}-${Math.random().toString(16).slice(2, 8)}`,
        name,
        aliases: [],
        color: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      courses.push(course)
      byKey.set(key, course)
    }
    return course
  }
  for (const item of workspace.assignments || []) {
    item.courseId = ensure(item.course)?.id || ''
  }
  for (const item of workspace.knowledge || []) {
    item.courseId = ensure(item.course || item.source?.group)?.id || ''
  }
  for (const item of workspace.experiments || []) {
    item.courseId = ensure(item.group)?.id || ''
  }
  for (const course of workspace.schedule?.courses || []) {
    course.courseId = ensure(course.name)?.id || ''
  }
  return courses
}

function previewWeekNumber(termStartDate, now = new Date()) {
  const match = String(termStartDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  if (today.getTime() < start.getTime()) return null
  return Math.min(30, Math.floor((today.getTime() - start.getTime()) / 86400000 / 7) + 1)
}

function previewReminderSummary(state, now = new Date()) {
  const workspace = state.workspace
  const weekday = now.getDay() === 0 ? 7 : now.getDay()
  const week = previewWeekNumber(state.settings.termStartDate, now)
  const courses = (workspace.schedule?.courses || [])
    .filter(
      (course) =>
        course.weekday === weekday &&
        (!course.weeks?.length || week === null || course.weeks.includes(week)),
    )
    .sort((left, right) => String(left.startTime).localeCompare(String(right.startTime)))
  const assignments = (workspace.assignments || [])
    .filter((item) => item.status !== 'done' && item.dueAt)
    .filter((item) => {
      const due = new Date(`${item.dueAt}T23:59:59`)
      return due.getTime() - now.getTime() <= 7 * 86400000
    })
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
  return { at: now.toISOString(), courses, assignments }
}

function inferPreviewExperimentGroup(fileName) {
  const normalized = String(fileName || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_\-—–.·]+/g, '')
  if (normalized.includes('算法设计与分析') || normalized.includes('算法设计')) {
    return '算法设计与分析实验'
  }
  if (normalized.includes('面向对象') || normalized.includes('oop')) {
    return '面向对象程序设计实验'
  }
  if (
    normalized.includes('计算机系统') ||
    normalized.includes('操作系统实验') ||
    normalized.includes('csapp')
  ) {
    return '计算机系统基础'
  }
  const baseName = String(fileName || '').replace(/\.[^.]+$/, '')
  const marker = baseName.search(/实验|作业|报告|lab|experiment/i)
  return (marker > 1 ? baseName.slice(0, marker) : baseName).trim() || '未分类实验'
}

function normalizePreviewGroup(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_\-—–.·]+/g, '')
}

function resolvePreviewExperimentGroup(fileName, existingGroups) {
  const inferred = inferPreviewExperimentGroup(fileName)
  const normalizedInferred = normalizePreviewGroup(inferred)
  if (!normalizedInferred || normalizedInferred === normalizePreviewGroup('未分类实验')) return ''
  for (const candidate of existingGroups) {
    const normalizedCandidate = normalizePreviewGroup(candidate)
    if (
      normalizedCandidate &&
      (normalizedCandidate === normalizedInferred ||
        normalizedCandidate.includes(normalizedInferred) ||
        normalizedInferred.includes(normalizedCandidate))
    ) {
      return candidate
    }
  }
  return ''
}

function emit(channel, payload) {
  for (const listener of listeners.get(channel) || []) listener(clone(payload))
}

function subscribe(channel, callback) {
  const channelListeners = listeners.get(channel) || new Set()
  channelListeners.add(callback)
  listeners.set(channel, channelListeners)
  return () => channelListeners.delete(callback)
}

function createPreviewAihotItems() {
  const now = Date.now()
  const rows = [
    [
      'ai-models',
      'Google 发布 Gemini 4 Argon：面向复杂工程与科研任务的前沿模型',
      'Google 发布 Gemini 4 Argon，面向开发者、企业、科学家和消费者全球开放，可经 Gemini API 与 AI Studio 使用。',
      'Google Blog：AI（RSS）',
      'https://blog.google/innovation-and-ai/models-and-research/gemini-models/',
      42,
      '作者实测了新开放模型在编程、写作和产品体验上的真实表现，读者可以据此判断是否值得订阅。',
    ],
    [
      'ai-models',
      '面壁智能开源 MiniCPM-V 4.7，35B-A3B MoE 模型端侧流畅运行',
      '面壁智能联合 OpenBMB 社区发布并开源 MiniCPM-V 4.7，包含 35B-A3B 和 1B 两个版本，主打端侧多模态。',
      '公众号：面壁智能（MiniCPM）',
      'https://mp.weixin.qq.com/s?__biz=Mzg3Mzg2MTg2NQ%3D%3D',
      95,
      '端侧开源多模态模型的一次实质进步，附带权重和内存占用数据，适合关注本地推理的读者。',
    ],
    [
      'ai-models',
      'Liquid AI 发布 LFM2.5-24B-A2B 端侧推理模型',
      '总参数 24B、每 token 激活 2B，定位端侧快速智能体，权重同步开源。',
      'Liquid AI 模型与工程博客（网页）',
      'https://www.liquid.ai/blog/lfm2-5-24b-a2b',
      190,
      '激活参数只有 2B 却能跑在本地，对推理成本和隐私敏感的场景有直接参考价值。',
    ],
    [
      'ai-products',
      'Gemini 4 Argon 上线 OpenRouter',
      '可通过 Google AI Studio 与 Google Cloud 调用，上线定价为输入 $2/M、输出 $10/M。',
      'X：OpenRouter (@OpenRouter)',
      'https://x.com/OpenRouter/status/2110044453977403412',
      240,
      '给出了明确的定价与基准分数，是判断要不要把新模型接进工作流的直接依据。',
    ],
    [
      'ai-products',
      'Apple 发布 7 英寸智能音箱 HomeView，售价 299 美元',
      '配备 7 英寸 Liquid Retina 显示屏，集娱乐、FaceTime、家庭监控和语音自动化于一体。',
      'The Verge：AI（RSS）',
      'https://www.theverge.com/homeview',
      130,
      '硬件形态变化往往先影响交互习惯，这条适合当作端侧 AI 落地的观察样本。',
    ],
    [
      'ai-products',
      'Cursor 2.3 带来后台 Agent 与并行任务',
      '编辑器开始支持把长任务丢到后台，多个 Agent 可以并行处理不同文件。',
      'Cursor 更新日志（网页）',
      'https://cursor.com/changelog',
      480,
      '编码 Agent 的工作方式在变，并行与后台执行是这一代工具的分水岭。',
    ],
    [
      'industry',
      'OpenAI 工程师涉在会议室装窃听装置被捕',
      '多家媒体跟进报道，OpenAI 官方尚未给出完整说明。',
      'X：OpenAI Newsroom (@OpenAINewsroom)',
      'https://x.com/OpenAINewsroom/status/2110095403198849132',
      300,
      '多来源交叉报道，属于值得单独跟进的行业事件，而不是单条传闻。',
    ],
    [
      'industry',
      'Meta 成立超级智能实验室并扩大招募',
      '新实验室聚焦前沿模型与算力扩张，首批招募覆盖研究与工程岗位。',
      'Artificial Analysis 完整文章（网页）',
      'https://artificialanalysis.ai/articles/meta-superintelligence',
      660,
      '人才与算力的流向往往预示下一年的模型格局，适合放进长期观察。',
    ],
    [
      'paper',
      'Visual Studio Copilot 与 SSMS 远程代码执行漏洞技术分析',
      '作者披露利用文件名末尾多加一个点绕过路径校验，写入受保护配置文件实现任意命令执行的利用链。',
      'Johann Rehberger / Embrace The Red（RSS）',
      'https://embracethered.com/blog/posts/2026/visual-studio-copilot-rce/',
      160,
      '作者亲述漏洞原理与利用链，可以学到 Windows 路径规范化缺陷如何绕过智能体安全检查。',
    ],
    [
      'paper',
      '论文：长上下文检索的稀疏注意力重构',
      '提出把长上下文检索拆成稀疏注意力与缓存复用的组合，在 1M 上下文下降低显存占用。',
      'arXiv cs.CL（RSS）',
      'https://arxiv.org/abs/2610.00001',
      840,
      '方法可迁移性高，适合与现有推理优化方案对比阅读。',
    ],
    [
      'tip',
      '教程：把 Codex 接进本地工作流的五个步骤',
      '从配置模型目录到固定提示词前缀，给出可复制的配置片段。',
      '开发者博客（RSS）',
      'https://example.com/codex-local-workflow',
      360,
      '步骤可以直接照做，适合把日常重复操作收敛成固定流程。',
    ],
    [
      'tip',
      '实操：用 MCP 把本地数据库接进智能体',
      '演示如何用 MCP server 暴露只读查询，并限制表与字段范围。',
      '公众号：AI 工程实践',
      'https://mp.weixin.qq.com/s/mcp-database',
      1200,
      '给了权限收敛的具体做法，是把智能体接进真实数据的必要一步。',
    ],
    [
      'opinion',
      '观点：模型能力的瓶颈已经从训练转向评估',
      '作者认为继续堆算力的边际收益下降，评估方法与数据质量才是当前瓶颈。',
      'Simon Willison 博客',
      'https://simonwillison.net/2026/oct/13/evaluation-bottleneck/',
      540,
      '结论有争议但论证清晰，适合用来检验自己的判断依据。',
    ],
    [
      'opinion',
      '观点：端侧模型会先吃掉哪类应用',
      '作者按延迟、隐私和成本三个维度给出端侧落地的优先顺序。',
      'X：indigo (@indigox)',
      'https://x.com/indigox/status/2110000000000000000',
      1560,
      '用一个可复用的判断框架讨论端侧机会，比单看榜单更有参考价值。',
    ],
  ]
  const items = rows.map(
    ([category, title, summary, source, original, minutesAgo, reason], index) => ({
      id: `preview-aihot-${index + 1}`,
      title,
      summary,
      reason,
      source: { name: source },
      links: {
        aihot: `https://aihot.news/items/preview-${index + 1}`,
        original,
      },
      publishedAt: new Date(now - Number(minutesAgo) * 60 * 1000).toISOString(),
      category,
    }),
  )
  return { data: items, fetchedAt: Date.now(), source: 'preview', stale: false }
}

function createPreviewAihotDaily() {
  const items = createPreviewAihotItems().data
  return {
    data: {
      date: '2026-10-14',
      generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
      links: { aihot: 'https://aihot.news/daily/2026-10-14', original: '' },
      attribution: { name: 'AIHOT' },
      lead: {
        title: 'Google 发布 Gemini 4 Argon：面向复杂工程与科研任务的前沿模型',
        leadParagraph:
          'Google 发布 Gemini 4 Argon，面向开发者、企业、科学家和消费者全球开放，可经 Gemini API、AI Studio 与 Google Antigravity 使用。',
      },
      sections: [
        { label: '模型发布/更新', items: items.slice(0, 2) },
        { label: '产品发布/更新', items: items.slice(1, 3) },
        { label: '行业动态', items: items.slice(2, 3) },
      ],
    },
    fetchedAt: Date.now(),
    source: 'preview',
    stale: false,
  }
}

function createPreviewAihotHot() {
  const hotspots = [
    {
      rank: 1,
      id: 'preview-hot-1',
      title: 'Google 发布 Gemini 4 Argon，仅付费用户可用',
      publicId: 'b9d1e480-fac1-479a-9209-5241ad001528',
      source: { name: 'Google Blog：AI（RSS）' },
      links: {
        aihot: 'https://aihot.news/story/b9d1e480-fac1-479a-9209-5241ad001528',
        original: '',
      },
      sourceCount: 28,
      participantCount: 91,
      latestAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    },
    {
      rank: 2,
      id: 'preview-hot-2',
      title: 'Meta 发布首批前沿模型 Muse Wonder 系列',
      publicId: 'f7f99eb7-84e6-4450-a43f-668dca988b22',
      source: { name: 'Artificial Analysis（网页）' },
      links: {
        aihot: 'https://aihot.news/story/f7f99eb7-84e6-4450-a43f-668dca988b22',
        original: '',
      },
      sourceCount: 17,
      participantCount: 83,
      latestAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
    {
      rank: 3,
      id: 'preview-hot-3',
      title: 'Gemini 4 Argon 上线 OpenRouter',
      publicId: 'c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b',
      source: { name: 'X：OpenRouter (@OpenRouter)' },
      links: {
        aihot: 'https://aihot.news/story/c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b',
        original: '',
      },
      sourceCount: 12,
      participantCount: 44,
      latestAt: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
    },
    {
      rank: 4,
      id: 'preview-hot-4',
      title: '面壁智能开源 MiniCPM-V 4.7，端侧多模态再进一步',
      publicId: 'd2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d',
      source: { name: '公众号：面壁智能（MiniCPM）' },
      links: {
        aihot: 'https://aihot.news/story/d2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d',
        original: '',
      },
      sourceCount: 11,
      participantCount: 39,
      latestAt: new Date(Date.now() - 1000 * 60 * 260).toISOString(),
    },
    {
      rank: 5,
      id: 'preview-hot-5',
      title: 'Cursor 2.3 支持后台 Agent 与并行任务',
      publicId: 'e3c4d5e6-f7a8-4b9c-8d1e-2f3a4b5c6d7e',
      source: { name: 'Cursor 更新日志（网页）' },
      links: {
        aihot: 'https://aihot.news/story/e3c4d5e6-f7a8-4b9c-8d1e-2f3a4b5c6d7e',
        original: '',
      },
      sourceCount: 9,
      participantCount: 31,
      latestAt: new Date(Date.now() - 1000 * 60 * 420).toISOString(),
    },
    {
      rank: 6,
      id: 'preview-hot-6',
      title: 'Visual Studio Copilot 远程代码执行漏洞披露',
      publicId: 'f4d5e6f7-a8b9-4c0d-9e2f-3a4b5c6d7e8f',
      source: { name: 'Embrace The Red（RSS）' },
      links: {
        aihot: 'https://aihot.news/story/f4d5e6f7-a8b9-4c0d-9e2f-3a4b5c6d7e8f',
        original: '',
      },
      sourceCount: 7,
      participantCount: 24,
      latestAt: new Date(Date.now() - 1000 * 60 * 500).toISOString(),
    },
    {
      rank: 7,
      id: 'preview-hot-7',
      title: 'Meta 超级智能实验室首批招募名单流出',
      publicId: 'a5e6f7a8-b9c0-4d1e-8f2a-4b5c6d7e8f9a',
      source: { name: 'Artificial Analysis（网页）' },
      links: {
        aihot: 'https://aihot.news/story/a5e6f7a8-b9c0-4d1e-8f2a-4b5c6d7e8f9a',
        original: '',
      },
      sourceCount: 6,
      participantCount: 22,
      latestAt: new Date(Date.now() - 1000 * 60 * 640).toISOString(),
    },
    {
      rank: 8,
      id: 'preview-hot-8',
      title: 'Liquid AI 开源 LFM2.5-24B-A2B 端侧推理模型',
      publicId: 'b6f7a8b9-c0d1-4e2f-9a3b-5c6d7e8f9a0b',
      source: { name: 'Liquid AI（网页）' },
      links: {
        aihot: 'https://aihot.news/story/b6f7a8b9-c0d1-4e2f-9a3b-5c6d7e8f9a0b',
        original: '',
      },
      sourceCount: 5,
      participantCount: 18,
      latestAt: new Date(Date.now() - 1000 * 60 * 720).toISOString(),
    },
    {
      rank: 9,
      id: 'preview-hot-9',
      title: '论文讨论：长上下文检索的注意力重构方案',
      publicId: 'c7a8b9c0-d1e2-4f3a-8b4c-6d7e8f9a0b1c',
      source: { name: 'arXiv cs.CL（RSS）' },
      links: {
        aihot: 'https://aihot.news/story/c7a8b9c0-d1e2-4f3a-8b4c-6d7e8f9a0b1c',
        original: '',
      },
      sourceCount: 4,
      participantCount: 15,
      latestAt: new Date(Date.now() - 1000 * 60 * 800).toISOString(),
    },
    {
      rank: 10,
      id: 'preview-hot-10',
      title: '行业讨论：端侧模型会先吃掉哪类应用',
      publicId: 'd8b9c0d1-e2f3-4a4b-9c5d-7e8f9a0b1c2d',
      source: { name: 'X：indigo (@indigox)' },
      links: {
        aihot: 'https://aihot.news/story/d8b9c0d1-e2f3-4a4b-9c5d-7e8f9a0b1c2d',
        original: '',
      },
      sourceCount: 3,
      participantCount: 12,
      latestAt: new Date(Date.now() - 1000 * 60 * 900).toISOString(),
    },
  ]
  return { data: hotspots, fetchedAt: Date.now(), source: 'preview', stale: false }
}

function createPreviewAihotStory(publicId) {
  const topic = createPreviewAihotHot().data.find((entry) => entry.publicId === publicId)
  if (!topic) {
    return {
      data: null,
      fetchedAt: Date.now(),
      source: 'preview',
      stale: false,
      error: '预览数据里没有这个事件',
    }
  }
  const beats = [
    [
      '官方口径与首批实测',
      'Google Blog：AI（RSS）',
      '官方页面给出可用范围与定价，首批实测者补充了真实延迟数据。',
    ],
    [
      '多来源交叉核对',
      'MarkTechPost（RSS）',
      '三家科技媒体独立核对发布信息，确认了开放地区与订阅门槛。',
    ],
    [
      '评测者给出第一手基准',
      'X：Rohan Paul (@rohanpaul_ai)',
      '评测者贴出编码与推理基准分数，并说明测试条件。',
    ],
    [
      '定价与可用范围确认',
      'The Decoder：AI News（RSS）',
      '免费额度、缓存折扣和涨价时间点被逐条列出。',
    ],
    [
      '开发者社区开始接入',
      'X：OpenRouter (@OpenRouter)',
      '模型上线聚合平台，开发者可以直接切换调用。',
    ],
    ['社区反馈与质疑', '公众号：机器之心', '评论集中在稳定性与长任务表现，官方尚未逐条回应。'],
  ]
  const reports = beats.map(([beat, source, summary], index) => ({
    id: `${topic.publicId}-report-${index + 1}`,
    title: `${topic.title}：${beat}`,
    summary,
    source: { name: source, firstParty: false },
    publishedAt: new Date(Date.now() - (18 + index * 95) * 60 * 1000).toISOString(),
    links: {
      aihot: `https://aihot.news/items/${topic.publicId}-${index + 1}`,
      original: `https://example.com/${topic.publicId.slice(0, 8)}/${index + 1}`,
    },
  }))
  return {
    data: {
      publicId,
      title: topic.title,
      status: 'active',
      sourceCount: topic.sourceCount,
      reportCount: reports.length,
      firstReportAt: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
      latestAt: topic.latestAt,
      latest: reports[0]?.title || topic.title,
      digest: [
        `围绕「${topic.title}」，48 小时内共 ${topic.sourceCount} 个独立来源跟进报道，是当前讨论度最高的事件之一。`,
        '下面按时间顺序列出可追溯的报道，每条都保留了来源与原文入口；事件仍在演化，综述会随新报道更新。',
      ].join('\n\n'),
      digestUpdatedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      links: {
        aihot: topic.links.aihot,
        original: '',
      },
      reports,
    },
    fetchedAt: Date.now(),
    source: 'preview',
    stale: false,
  }
}

function createPreviewState() {
  const now = Date.now()
  const dshHome = 'C:\\Users\\小zp\\.dsh'
  const previewParams = new URLSearchParams(window.location.search)
  const requestedTheme = previewParams.get('theme')
  const previewWelcomeSeen = previewParams.get('welcome') === 'seen' || readPreviewWelcomeSeen()
  const theme = ['system', 'dark', 'light'].includes(requestedTheme) ? requestedTheme : 'dark'
  return {
    settings: {
      dshHome,
      experimentDir: 'C:\\Users\\小zp\\ZP Workbench\\实验资料',
      logDir: 'C:\\Users\\小zp\\AppData\\Roaming\\deepseek-harness-launcher\\logs',
      autoCheckLauncher: true,
      minimizeToTray: true,
      launchAtLogin: false,
      theme,
      termStartDate: '2026-09-01',
      notificationsEnabled: true,
      classReminderMinutes: 15,
      assignmentReminderDays: 1,
      dailyDigestTime: '08:00',
      backupEnabled: true,
      backupIntervalHours: 24,
      backupRetention: 20,
      backupIncludeMaterials: false,
      syncProvider: 'none',
      syncLocalDir: '',
      syncWebdavUrl: '',
      syncWebdavRemoteDir: 'ZP-Workbench',
      syncWebdavUsername: '',
      syncAutoUpload: false,
      syncIntervalHours: 24,
      syncLastAt: null,
      reminderLog: {},
      onboarding: {
        welcomeSeen: previewWelcomeSeen,
        guideVersion: 1,
        completedSteps: [],
        dismissedAt: null,
        completedAt: null,
      },
      updateHistory: [],
    },
    ai: {
      profiles: [
        {
          id: 'preview-deepseek',
          label: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-chat',
          hasKey: true,
          requiresKey: true,
          protocol: 'chat-completions',
          timeoutMs: 90000,
          contextWindow: 128000,
          maxOutputTokens: 8192,
          temperature: 0.2,
          reasoningEffort: '',
          supportsTools: true,
          supportsVision: false,
          headers: {},
        },
      ],
      activeProfileId: 'preview-deepseek',
    },
    backups: [
      {
        fileName: 'workspace-preview-auto.json',
        size: 18432,
        createdAt: new Date(now - 1000 * 60 * 90).toISOString(),
        summary: { assignments: 3, experiments: 3, courses: 4 },
      },
    ],
    backupArchives: [
      {
        fileName: 'workstation-preview-manual.zpbackup',
        size: 28672,
        createdAt: new Date(now - 1000 * 60 * 90).toISOString(),
        label: 'manual',
        encrypted: true,
        includeMaterials: false,
        summary: { assignments: 3, experiments: 3, courses: 4 },
      },
    ],
    backupStatus: {
      config: {
        backupEnabled: true,
        backupIntervalHours: 24,
        backupRetention: 20,
        backupIncludeMaterials: false,
        syncProvider: 'none',
        syncLocalDir: '',
        syncWebdavUrl: '',
        syncWebdavRemoteDir: 'ZP-Workbench',
        syncWebdavUsername: '',
        syncAutoUpload: false,
        syncIntervalHours: 24,
        syncLastAt: null,
      },
      webdavPasswordStored: false,
      syncPasswordStored: true,
      running: false,
      lastError: '',
      lastSyncAt: null,
    },
    status: {
      launcherVersion: '0.5.0',
      logsDir: 'C:\\Users\\小zp\\AppData\\Roaming\\deepseek-harness-launcher\\logs',
    },
    launcherUpdate: {
      supported: true,
      currentVersion: '0.3.0',
      latestVersion: '0.3.1',
      updateAvailable: true,
      checking: false,
      downloading: false,
      downloaded: false,
      message: '发现新版本 0.3.1，可以下载更新。',
      notes: '优化页面动画、修复课表编辑和资料归档问题。',
      publishedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
      htmlUrl: 'https://github.com/yuxhipeng-hub/zp-workstation/releases',
      checkedAt: new Date(now - 1000 * 60 * 8).toISOString(),
      error: null,
      sourceId: 'github-api-gh-proxy',
      sourceLabel: '国内 GitHub API 加速',
      sources: [
        { id: 'manifest-direct', label: 'GitHub 更新清单', status: 'failed' },
        { id: 'manifest-gh-proxy', label: '国内加速更新清单', status: 'failed' },
        { id: 'github-direct', label: 'GitHub 直连', status: 'failed' },
        { id: 'github-api-gh-proxy', label: '国内 GitHub API 加速', status: 'selected' },
      ],
      asset: {
        name: 'ZP-Workbench-Setup-0.3.1-x64.exe',
        size: 112 * 1024 * 1024,
        sha256: '65a713d91e8ddba9b5a18decbd8f9529b9421c1d203b29b1db1669c835e97ec4',
        downloadUrls: [
          {
            id: 'github-direct',
            label: 'GitHub 直连',
            url: 'https://github.com/yuxhipeng-hub/zp-workstation/releases',
          },
          {
            id: 'github-download-gh-proxy',
            label: '国内 GitHub 下载加速',
            url: 'https://gh-proxy.com/https://github.com/yuxhipeng-hub/zp-workstation/releases',
          },
        ],
      },
    },
    logs: [
      {
        at: new Date(now - 1000 * 45).toISOString(),
        scope: 'preview',
        level: 'info',
        message: '浏览器预览已连接，所有操作均为模拟。',
      },
      {
        at: new Date(now - 1000 * 180).toISOString(),
        scope: 'update',
        level: 'success',
        message: 'DeepSeek Harness 已是最新版本。',
      },
    ],
    workspace: {
      version: 2,
      courses: [],
      assignments: [
        {
          id: 'preview-assignment-1',
          title: '线性代数第 3 章习题',
          course: '线性代数',
          dueAt: '2026-09-22',
          priority: 'high',
          status: 'doing',
          notes: '完成矩阵秩、向量组线性相关性的证明题。',
          createdAt: new Date(now - 1000 * 60 * 60 * 30).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 55).toISOString(),
        },
        {
          id: 'preview-assignment-2',
          title: '大学物理实验报告',
          course: '大学物理',
          dueAt: '2026-09-25',
          priority: 'medium',
          status: 'inbox',
          notes: '整理示波器实验数据，补齐误差分析和思考题。',
          createdAt: new Date(now - 1000 * 60 * 60 * 20).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 48).toISOString(),
        },
        {
          id: 'preview-assignment-3',
          title: '英语课程展示提纲',
          course: '大学英语',
          dueAt: '2026-09-30',
          priority: 'low',
          status: 'done',
          notes: '三分钟展示，主题为本地 AI 工具的使用边界。',
          createdAt: new Date(now - 1000 * 60 * 60 * 80).toISOString(),
          updatedAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
        },
      ],
      experiments: [
        {
          id: 'preview-experiment-1',
          title: '算法设计与分析实验报告',
          originalName: '算法设计与分析实验报告.pdf',
          filePath:
            'C:\\Users\\小zp\\ZP Workbench\\实验资料\\算法设计与分析实验\\算法设计与分析实验报告.pdf',
          group: '算法设计与分析实验',
          size: 1843200,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 52).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 50).toISOString(),
        },
        {
          id: 'preview-experiment-2',
          title: '面向对象程序设计实验三',
          originalName: '面向对象程序设计实验三.pdf',
          filePath:
            'C:\\Users\\小zp\\ZP Workbench\\实验资料\\面向对象程序设计实验\\面向对象程序设计实验三.pdf',
          group: '面向对象程序设计实验',
          size: 2560000,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 28).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
        },
        {
          id: 'preview-experiment-3',
          title: '计算机系统基础实验一',
          originalName: '计算机系统基础实验一.pdf',
          filePath:
            'C:\\Users\\小zp\\ZP Workbench\\实验资料\\计算机系统基础\\计算机系统基础实验一.pdf',
          group: '计算机系统基础',
          size: 983040,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 12).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 10).toISOString(),
        },
        {
          id: 'preview-experiment-4',
          title: '课程复习提纲',
          originalName: '课程复习提纲.docx',
          filePath: 'C:\\Users\\小zp\\ZP Workbench\\实验资料\\课程资料\\课程复习提纲.docx',
          group: '课程资料',
          size: 358400,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 7).toISOString(),
        },
        {
          id: 'preview-experiment-5',
          title: '实验数据记录',
          originalName: '实验数据记录.xlsx',
          filePath: 'C:\\Users\\小zp\\ZP Workbench\\实验资料\\大学物理\\实验数据记录.xlsx',
          group: '大学物理',
          size: 71680,
          modifiedAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
          importedAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
        },
      ],
      experimentGroups: [
        { id: 'preview-library-1', name: '算法设计与分析实验' },
        { id: 'preview-library-2', name: '计算机系统基础' },
        { id: 'preview-library-3', name: '大学物理' },
        { id: 'preview-library-4', name: '课程资料' },
      ],
      schedule: {
        source: {
          name: '2026秋季学期课表.xlsx',
          path: 'C:\\Users\\小zp\\Downloads\\2026秋季学期课表.xlsx',
          extension: '.xlsx',
          size: 284672,
          importedAt: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
        },
        importedAt: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
        maxPeriod: 12,
        maxWeek: 18,
        periodTimes: normalizePreviewPeriodTimes(
          [
            { startTime: '08:00', endTime: '08:45' },
            { startTime: '08:55', endTime: '09:40' },
            { startTime: '10:00', endTime: '10:45' },
            { startTime: '10:55', endTime: '11:40' },
            { startTime: '14:00', endTime: '14:45' },
            { startTime: '14:55', endTime: '15:40' },
            { startTime: '16:00', endTime: '16:45' },
            { startTime: '16:55', endTime: '17:40' },
            { startTime: '19:00', endTime: '19:45' },
            { startTime: '19:55', endTime: '20:40' },
            { startTime: '20:50', endTime: '21:35' },
            { startTime: '', endTime: '' },
          ],
          12,
        ),
        courses: [
          {
            id: 'preview-schedule-1',
            name: '高等数学',
            teacher: '周老师',
            location: '博学楼 A201',
            weekday: 1,
            startPeriod: 1,
            endPeriod: 2,
            startTime: '08:00',
            endTime: '09:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '高等数学\n周老师\n博学楼 A201\n第1-2节\n1-16周',
          },
          {
            id: 'preview-schedule-2',
            name: '大学英语',
            teacher: '林老师',
            location: '文科楼 305',
            weekday: 1,
            startPeriod: 5,
            endPeriod: 6,
            startTime: '14:00',
            endTime: '15:40',
            weeks: [1, 3, 5, 7, 9, 11, 13, 15],
            weekText: '1-15周(单)',
            raw: '大学英语\n林老师\n文科楼 305\n第5-6节\n1-15周(单)',
          },
          {
            id: 'preview-schedule-3',
            name: '程序设计基础',
            teacher: '陈老师',
            location: '实验楼 5-208',
            weekday: 2,
            startPeriod: 3,
            endPeriod: 4,
            startTime: '10:00',
            endTime: '11:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '程序设计基础\n陈老师\n实验楼 5-208\n第3-4节',
          },
          {
            id: 'preview-schedule-4',
            name: '大学物理',
            teacher: '许老师',
            location: '理科楼 B103',
            weekday: 3,
            startPeriod: 1,
            endPeriod: 2,
            startTime: '08:00',
            endTime: '09:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '大学物理\n许老师\n理科楼 B103\n第1-2节',
          },
          {
            id: 'preview-schedule-5',
            name: '线性代数',
            teacher: '赵老师',
            location: '博学楼 A108',
            weekday: 3,
            startPeriod: 7,
            endPeriod: 8,
            startTime: '16:00',
            endTime: '17:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '线性代数\n赵老师\n博学楼 A108\n第7-8节',
          },
          {
            id: 'preview-schedule-6',
            name: '数据结构实验',
            teacher: '陈老师',
            location: '实验楼 5-310',
            weekday: 4,
            startPeriod: 3,
            endPeriod: 5,
            startTime: '10:00',
            endTime: '12:30',
            weeks: [2, 4, 6, 8, 10, 12, 14, 16],
            weekText: '2-16周(双)',
            raw: '数据结构实验\n陈老师\n实验楼 5-310\n第3-5节\n2-16周(双)',
          },
          {
            id: 'preview-schedule-7',
            name: '计算机系统基础',
            teacher: '沈老师',
            location: '博学楼 A401',
            weekday: 5,
            startPeriod: 1,
            endPeriod: 2,
            startTime: '08:00',
            endTime: '09:40',
            weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
            weekText: '1-16周',
            raw: '计算机系统基础\n沈老师\n博学楼 A401\n第1-2节',
          },
        ],
      },
    },
  }
}

export function createPreviewLauncherApi() {
  const state = createPreviewState()
  linkPreviewCourses(state)
  const createId = () =>
    globalThis.crypto?.randomUUID?.() ||
    `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return {
    on: subscribe,
    async bootstrap() {
      return clone(state)
    },
    async getAihotDaily() {
      return clone(createPreviewAihotDaily())
    },
    async getAihotItems(options = {}) {
      const all = createPreviewAihotItems().data
      const windowMs = options.window === '24h' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
      const cutoff = Date.now() - windowMs
      const query = String(options.q || '')
        .trim()
        .toLocaleLowerCase('zh-CN')
      const filtered = all.filter((item) => {
        if (options.category && item.category !== options.category) return false
        if (Date.parse(item.publishedAt) < cutoff) return false
        if (
          query &&
          !`${item.title}${item.summary}${item.reason}`.toLocaleLowerCase('zh-CN').includes(query)
        ) {
          return false
        }
        return true
      })
      const limit = Number(options.limit) || 20
      const items = filtered.slice(0, limit)
      return clone({
        data: { items, hasMore: filtered.length > items.length, nextCursor: '' },
        fetchedAt: Date.now(),
        source: 'preview',
        stale: false,
      })
    },
    async getAihotHot() {
      return clone(createPreviewAihotHot())
    },
    async getAihotStory(publicId) {
      return clone(createPreviewAihotStory(publicId))
    },
    async getSettings() {
      return clone(state.settings)
    },
    async patchSettings(patch) {
      state.settings = { ...state.settings, ...patch }
      if (patch?.onboarding && Object.hasOwn(patch.onboarding, 'welcomeSeen')) {
        writePreviewWelcomeSeen(patch.onboarding.welcomeSeen)
      }
      emit('settings:changed', state.settings)
      return clone(state.settings)
    },
    async getAiConfig() {
      return clone(state.ai)
    },
    async saveAiProfile(profile, apiKey, clearKey = false) {
      const existingIndex = state.ai.profiles.findIndex((item) => item.id === profile?.id)
      const existing = existingIndex >= 0 ? state.ai.profiles[existingIndex] : null
      const next = {
        id: existing?.id || createId(),
        label: String(profile?.label || '').trim(),
        baseUrl: String(profile?.baseUrl || '')
          .trim()
          .replace(/\/+$/, ''),
        model: String(profile?.model || '').trim(),
        hasKey: Boolean(apiKey) || (existing?.hasKey && !clearKey),
        requiresKey: false,
        protocol: profile?.protocol === 'responses' ? 'responses' : 'chat-completions',
        timeoutMs: Number(profile?.timeoutMs) || 90000,
        contextWindow: Number(profile?.contextWindow) || 0,
        maxOutputTokens: Number(profile?.maxOutputTokens) || 1800,
        temperature: Number.isFinite(Number(profile?.temperature))
          ? Number(profile.temperature)
          : 0.2,
        reasoningEffort: String(profile?.reasoningEffort || ''),
        supportsTools: Boolean(profile?.supportsTools),
        supportsVision: Boolean(profile?.supportsVision),
        headers: profile?.headers && typeof profile.headers === 'object' ? profile.headers : {},
      }
      try {
        const url = new URL(next.baseUrl)
        next.requiresKey = !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
      } catch {
        next.requiresKey = true
      }
      if (existingIndex >= 0) state.ai.profiles[existingIndex] = next
      else state.ai.profiles.push(next)
      if (!state.ai.activeProfileId) state.ai.activeProfileId = next.id
      return clone(state.ai)
    },
    async deleteAiProfile(id) {
      state.ai.profiles = state.ai.profiles.filter((item) => item.id !== id)
      if (state.ai.activeProfileId === id) {
        state.ai.activeProfileId = state.ai.profiles[0]?.id || ''
      }
      return clone(state.ai)
    },
    async activateAiProfile(id) {
      if (!state.ai.profiles.some((item) => item.id === id))
        throw new Error('没有找到这个模型配置。')
      state.ai.activeProfileId = id
      return clone(state.ai)
    },
    async testAiProfile(id) {
      if (!state.ai.profiles.some((item) => item.id === id))
        throw new Error('没有找到这个模型配置。')
      return { ok: true, message: 'OK', profileId: id }
    },
    async generateAssignmentPlan(id) {
      const assignment = state.workspace.assignments.find((item) => item.id === id)
      if (!assignment) throw new Error('没有找到这条作业。')
      const profile = state.ai.profiles.find((item) => item.id === state.ai.activeProfileId)
      if (!profile?.hasKey) throw new Error('当前模型还没有保存 API Key。')
      assignment.aiPlan = {
        generatedAt: new Date().toISOString(),
        provider: profile.label,
        model: profile.model,
        summary: `完成“${assignment.title}”`,
        prerequisites: ['确认题目范围与提交要求'],
        steps: ['梳理任务要求', '完成核心工作', '检查并提交'],
        risks: ['忽略题目中的格式或截止要求'],
        checklist: ['检查文件命名', '确认提交入口'],
      }
      return clone({
        workspace: state.workspace,
        plan: assignment.aiPlan,
        profile: { id: profile.id, label: profile.label, model: profile.model },
      })
    },
    async getWorkspace() {
      return clone(state.workspace)
    },
    async listCourses() {
      const countsFor = (courseId) => ({
        schedule: (state.workspace.schedule?.courses || []).filter(
          (item) => item.courseId === courseId,
        ).length,
        assignments: state.workspace.assignments.filter((item) => item.courseId === courseId)
          .length,
        knowledge: state.workspace.knowledge.filter((item) => item.courseId === courseId).length,
        experiments: state.workspace.experiments.filter((item) => item.courseId === courseId)
          .length,
      })
      return (state.workspace.courses || []).map((course) => ({
        ...clone(course),
        counts: countsFor(course.id),
      }))
    },
    async createCourse(input) {
      const name = String(input?.name || '').trim()
      if (!name) throw new Error('课程名称不能为空。')
      if (
        (state.workspace.courses || []).some(
          (course) => previewCourseKey(course.name) === previewCourseKey(name),
        )
      ) {
        throw new Error('已存在同名课程。')
      }
      const course = {
        id: createId(),
        name,
        aliases: [],
        color: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      state.workspace.courses.push(course)
      return { workspace: clone(state.workspace), course: clone(course) }
    },
    async renameCourse(id, name) {
      const course = state.workspace.courses.find((item) => item.id === id)
      if (!course) throw new Error('没有找到这门课程。')
      const nextName = String(name || '').trim()
      if (!nextName) throw new Error('课程名称不能为空。')
      if (
        state.workspace.courses.some(
          (item) => item.id !== id && previewCourseKey(item.name) === previewCourseKey(nextName),
        )
      ) {
        throw new Error('已有同名课程，请使用同一个名称或先合并数据。')
      }
      const previousName = course.name
      course.aliases = [...new Set([...(course.aliases || []), previousName])]
      course.name = nextName
      course.updatedAt = new Date().toISOString()
      for (const item of state.workspace.assignments) {
        if (item.courseId === id) item.course = nextName
      }
      for (const item of state.workspace.knowledge) {
        if (item.courseId === id) item.course = nextName
      }
      for (const item of state.workspace.schedule?.courses || []) {
        if (item.courseId === id) item.name = nextName
      }
      const groupRenames = []
      for (const item of state.workspace.experiments) {
        if (item.courseId !== id) continue
        const from = item.group
        if (from && from !== nextName && !groupRenames.some((entry) => entry.from === from)) {
          groupRenames.push({ from, to: nextName })
          item.group = nextName
        }
      }
      return {
        workspace: clone(state.workspace),
        course: clone(course),
        previousName,
        groupRenames,
        failures: [],
      }
    },
    async listBackups() {
      return clone(state.backups)
    },
    async createBackup(label = 'manual') {
      const backup = {
        fileName: `workspace-${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`,
        size: JSON.stringify(state.workspace).length,
        createdAt: new Date().toISOString(),
        summary: {
          assignments: state.workspace.assignments.length,
          experiments: state.workspace.experiments.length,
          courses: state.workspace.courses.length,
        },
      }
      state.backups.unshift(backup)
      return clone(backup)
    },
    async restoreBackup(fileName) {
      if (!state.backups.some((item) => item.fileName === fileName)) {
        throw new Error('没有找到这个备份文件。')
      }
      return clone(state.workspace)
    },
    async listBackupArchives() {
      return clone(state.backupArchives)
    },
    async createBackupArchive(options = {}) {
      const archive = {
        fileName: `workstation-${new Date().toISOString().replace(/[:.]/g, '-')}-manual.zpbackup`,
        size: 32768,
        createdAt: new Date().toISOString(),
        label: options.label || 'manual',
        encrypted: Boolean(options.password),
        includeMaterials: Boolean(options.includeMaterials),
        summary: {
          assignments: state.workspace.assignments.length,
          experiments: state.workspace.experiments.length,
          courses: state.workspace.courses.length,
        },
      }
      state.backupArchives.unshift(archive)
      return clone(archive)
    },
    async restoreBackupArchive(fileName) {
      if (!state.backupArchives.some((item) => item.fileName === fileName)) {
        throw new Error('没有找到这份完整备份。')
      }
      return clone({ fileName, workspace: state.workspace, settings: state.settings })
    },
    async getBackupStatus() {
      return clone(state.backupStatus)
    },
    async patchBackupSync(payload = {}) {
      state.settings = { ...state.settings, ...(payload.config || {}) }
      state.backupStatus.config = {
        ...state.backupStatus.config,
        ...(payload.config || {}),
      }
      if (payload.webdavPassword || payload.password) {
        state.backupStatus.webdavPasswordStored = true
      }
      if (payload.syncPassword) state.backupStatus.syncPasswordStored = true
      emit('settings:changed', state.settings)
      return clone(state.backupStatus)
    },
    async testBackupSync() {
      if (state.settings.syncProvider === 'none') throw new Error('请先选择同步方式。')
      return {
        ok: true,
        provider: state.settings.syncProvider,
        message:
          state.settings.syncProvider === 'local'
            ? state.settings.syncLocalDir
            : state.settings.syncWebdavUrl,
      }
    },
    async uploadBackupSync() {
      const fileName = `ZP-Workbench-${new Date().toISOString().replace(/[:.]/g, '-')}.zpbackup`
      state.settings.syncLastAt = new Date().toISOString()
      state.backupStatus.config.syncLastAt = state.settings.syncLastAt
      return clone({ fileName, size: 32768, settings: state.settings })
    },
    async downloadBackupSync() {
      return clone({ fileName: 'ZP-Workbench-preview.zpbackup', workspace: state.workspace })
    },
    async checkWorkspaceHealth() {
      return {
        checkedAt: new Date().toISOString(),
        total: state.workspace.experiments.length,
        missing: [],
        healthy: true,
      }
    },
    async getReminders() {
      return {
        enabled: state.settings.notificationsEnabled !== false,
        summary: previewReminderSummary(state),
      }
    },
    async testReminder() {
      emit('reminder:due', {
        key: 'test',
        title: 'ZP Workbench 提醒已开启',
        body: '之后会在课前和作业截止前提醒你。',
        at: new Date().toISOString(),
      })
      return true
    },
    async exportSnapshot() {
      return { filePath: 'C:\\Users\\小zp\\ZP Workbench\\snapshot.json', size: 4096 }
    },
    async importSnapshot() {
      return clone(state.workspace)
    },
    async exportBackupArchive(options = {}) {
      await this.createBackupArchive(options)
      return {
        filePath: 'C:\\Users\\小zp\\ZP Workbench\\ZP-Workbench-backup.zpbackup',
        size: 32768,
      }
    },
    async importBackupArchive() {
      return clone({ fileName: 'ZP-Workbench-backup.zpbackup', workspace: state.workspace })
    },
    async savePresentation(input) {
      const deck = cleanPresentation(input)
      state.workspace.presentations = [
        deck,
        ...(state.workspace.presentations || []).filter((item) => item.id !== deck.id),
      ]
      return clone(state.workspace)
    },
    async setPresentationDirty() {
      return true
    },
    async deletePresentation(id) {
      state.workspace.presentations = (state.workspace.presentations || []).filter(
        (item) => item.id !== id,
      )
      return clone(state.workspace)
    },
    async generatePresentation(input) {
      const deck = createPresentation(input)
      deck.slides = Array.from({ length: input.pageCount }, (_, index) => ({
        ...clone(deck.slides[Math.min(index, 2)]),
        id: createId(),
        layout: index === 0 ? 'cover' : index === input.pageCount - 1 ? 'closing' : 'split',
        title: index === 0 ? input.title : `示例大纲 · 第 ${index + 1} 页`,
        body: '这是界面预览的示例内容，未调用真实模型。',
      }))
      return { deck, profile: { label: '预览示例', model: '未调用模型' } }
    },
    async chatPresentation(input) {
      const message = '这是界面预览示例，未调用真实模型。请在桌面应用中连接模型制作作品。'
      if (input.deck) return { action: 'clarify', message, profile: { label: '预览示例' } }
      return {
        action: 'create',
        message,
        deck: createPresentation({ title: '对话创作示例' }),
        profile: { label: '预览示例' },
      }
    },
    async exportPresentation() {
      throw new Error('浏览器预览不提供本机文件导出，请在桌面应用中导出。')
    },
    async createAssignment(input) {
      const now = new Date().toISOString()
      state.workspace.assignments.unshift({
        id: createId(),
        title: input.title,
        course: input.course || '',
        dueAt: input.dueAt || '',
        priority: input.priority || 'medium',
        status: input.status || 'inbox',
        notes: input.notes || '',
        createdAt: now,
        updatedAt: now,
      })
      return clone(state.workspace)
    },
    async updateAssignment(id, patch) {
      state.workspace.assignments = state.workspace.assignments.map((item) =>
        item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
      )
      return clone(state.workspace)
    },
    async deleteAssignment(id) {
      state.workspace.assignments = state.workspace.assignments.filter((item) => item.id !== id)
      return clone(state.workspace)
    },
    async importExperiments(entries) {
      const imported = []
      const rejected = []
      const createdGroups = []
      const existingGroups = new Set(
        state.workspace.experiments.map((item) => String(item.group || '').trim()).filter(Boolean),
      )
      for (const entry of entries || []) {
        const originalName = String(entry?.name || entry?.path?.split(/[\\/]/).pop() || '')
        if (!originalName) {
          rejected.push({ name: '未知文件', reason: '没有取得文件名。' })
          continue
        }
        const group =
          String(entry?.group || '').trim() ||
          resolvePreviewExperimentGroup(originalName, existingGroups) ||
          inferPreviewExperimentGroup(originalName)
        if (!existingGroups.has(group)) {
          existingGroups.add(group)
          createdGroups.push(group)
        }
        const id = createId()
        imported.push({
          id,
          title: originalName.replace(/\.[^.]+$/, ''),
          originalName,
          filePath: `${state.settings.experimentDir}\\${group}\\${originalName}`,
          group,
          size: 1024 * 1024,
          modifiedAt: new Date().toISOString(),
          importedAt: new Date().toISOString(),
        })
      }
      state.workspace.experiments.unshift(...imported)
      state.workspace.experimentGroups ||= []
      for (const group of createdGroups) {
        if (!state.workspace.experimentGroups.some((item) => item.name === group)) {
          state.workspace.experimentGroups.push({ id: createId(), name: group })
        }
      }
      return {
        workspace: clone(state.workspace),
        imported: imported.length,
        rejected,
        createdGroups,
      }
    },
    async suggestExperimentGroups(entries) {
      await new Promise((resolve) => setTimeout(resolve, 650))
      const existingGroups = [
        ...new Set([
          ...state.workspace.experiments.map((item) => item.group).filter(Boolean),
          ...(state.workspace.schedule?.courses || []).map((item) => item.name).filter(Boolean),
        ]),
      ]
      const suggestions = entries.map((entry) => {
        const fileName = String(entry?.name || entry?.path?.split(/[\\/]/).pop() || '').trim()
        const matched = existingGroups.find((group) => {
          const key = String(group).replace(/实验|课程/g, '')
          return key && fileName.includes(key)
        })
        const localGroup = inferPreviewExperimentGroup(fileName)
        return {
          ...entry,
          name: fileName,
          suggestion: {
            group: matched || localGroup,
            confidence: matched ? 0.86 : 0.38,
            source: 'local',
            reason: matched
              ? `匹配到了已有的“${matched}”文件夹。`
              : '没有匹配到已有文件夹，建议新建这个分类。',
            lowConfidence: !matched,
          },
        }
      })
      return { suggestions, mode: 'local' }
    },
    async updateExperiment(id, patch) {
      state.workspace.experiments = state.workspace.experiments.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              filePath: patch.group
                ? `${state.settings.experimentDir}\\${patch.group}\\${item.originalName}`
                : item.filePath,
              updatedAt: new Date().toISOString(),
            }
          : item,
      )
      return {
        workspace: clone(state.workspace),
        experiment: clone(state.workspace.experiments.find((item) => item.id === id)),
      }
    },
    async renameExperimentGroup(currentGroup, nextGroup) {
      const next = String(nextGroup || '').trim()
      let renamed = 0
      state.workspace.experiments = state.workspace.experiments.map((item) => {
        if (item.group !== currentGroup) return item
        renamed += 1
        return {
          ...item,
          group: next,
          filePath: `${state.settings.experimentDir}\\${next}\\${item.originalName}`,
          updatedAt: new Date().toISOString(),
        }
      })
      state.workspace.experimentGroups = (state.workspace.experimentGroups || []).map((group) =>
        group.name === currentGroup ? { ...group, name: next } : group,
      )
      return {
        workspace: clone(state.workspace),
        renamed,
        group: next,
      }
    },
    async createExperimentGroup(name) {
      const cleaned = String(name || '')
        .trim()
        .slice(0, 64)
      if (!cleaned) throw new Error('资料库名称不能为空。')
      if ((state.workspace.experimentGroups || []).some((group) => group.name === cleaned)) {
        throw new Error('已存在同名资料库。')
      }
      const group = { id: createId(), name: cleaned }
      state.workspace.experimentGroups ||= []
      state.workspace.experimentGroups.push(group)
      return { workspace: clone(state.workspace), group: cleaned }
    },
    async removeExperimentGroup(name) {
      if (state.workspace.experiments.some((item) => item.group === name)) {
        throw new Error('资料库中还有文件记录，请先移动或移除这些资料。')
      }
      state.workspace.experimentGroups = (state.workspace.experimentGroups || []).filter(
        (group) => group.name !== name,
      )
      return { workspace: clone(state.workspace), group: name }
    },
    async changeExperimentRoot(nextRoot) {
      const oldRoot = state.settings.experimentDir
      state.settings.experimentDir = nextRoot
      state.workspace.experiments = state.workspace.experiments.map((item) => ({
        ...item,
        filePath: item.filePath.replace(oldRoot, nextRoot),
      }))
      emit('settings:changed', state.settings)
      return {
        workspace: clone(state.workspace),
        oldRoot,
        newRoot: nextRoot,
        copiedFiles: state.workspace.experiments.length,
        trackedFiles: state.workspace.experiments.length,
        renamedConflicts: 0,
        skipped: [],
      }
    },
    async deleteExperiment(id) {
      state.workspace.experiments = state.workspace.experiments.filter((item) => item.id !== id)
      return clone(state.workspace)
    },
    async copyText(value) {
      await navigator.clipboard.writeText(String(value ?? ''))
      return true
    },
    async chooseExperimentDir() {
      return `${state.settings.experimentDir}-preview`
    },
    async chooseLogDir() {
      return `${state.settings.logDir}-preview`
    },
    async chooseSyncDir() {
      return 'C:\\Users\\小zp\\OneDrive\\ZP Workbench'
    },
    async chooseExperimentFiles() {
      return [
        {
          name: '算法设计与分析实验五.pdf',
          path: 'C:\\preview\\算法设计与分析实验五.pdf',
        },
        {
          name: '实验数据汇总.xlsx',
          path: 'C:\\preview\\实验数据汇总.xlsx',
        },
        {
          name: '课堂展示.pptx',
          path: 'C:\\preview\\课堂展示.pptx',
        },
      ]
    },
    async chooseExperimentPdfs() {
      return this.chooseExperimentFiles()
    },
    async openExperimentFile() {
      return true
    },
    async revealExperimentFile() {
      return true
    },
    async openExperimentDirectory() {
      return true
    },
    async chooseScheduleFile() {
      return 'C:\\Users\\小zp\\Downloads\\2026秋季学期课表.xlsx'
    },
    async importSchedule(filePath) {
      const name =
        String(filePath || '')
          .split(/[\\/]/)
          .pop() || '课表.xlsx'
      state.workspace.schedule.source = {
        ...state.workspace.schedule.source,
        name,
        path: filePath,
        importedAt: new Date().toISOString(),
      }
      state.workspace.schedule.importedAt = new Date().toISOString()
      return {
        workspace: clone(state.workspace),
        schedule: clone(state.workspace.schedule),
        summary: {
          sourceName: name,
          courses: state.workspace.schedule.courses.length,
          maxWeek: state.workspace.schedule.maxWeek,
        },
      }
    },
    async stageDroppedFile() {
      throw new Error('预览环境不支持自动暂存拖入文件。')
    },
    async resolveDropReferences() {
      return []
    },
    async createScheduleCourse(input) {
      const now = new Date().toISOString()
      if (!state.workspace.schedule) {
        state.workspace.schedule = {
          source: {
            name: '手动维护',
            path: '',
            extension: '',
            size: 0,
            importedAt: now,
          },
          importedAt: now,
          maxPeriod: 10,
          maxWeek: 16,
          periodTimes: normalizePreviewPeriodTimes([], 10),
          courses: [],
        }
      }
      const course = normalizePreviewCourse(input)
      state.workspace.schedule.courses.push(course)
      syncPreviewCourseTime(state.workspace.schedule, course)
      state.workspace.schedule.maxPeriod = Math.min(
        20,
        Math.max(
          1,
          ...state.workspace.schedule.courses.map((item) => item.endPeriod),
          state.workspace.schedule.periodTimes.length,
        ),
      )
      state.workspace.schedule.maxWeek = Math.min(
        30,
        Math.max(16, ...state.workspace.schedule.courses.flatMap((item) => item.weeks)),
      )
      return { workspace: clone(state.workspace), course: clone(course) }
    },
    async updateScheduleCourse(id, patch) {
      const schedule = state.workspace.schedule
      const index = schedule?.courses.findIndex((course) => course.id === id) ?? -1
      if (index === -1) throw new Error('没有找到这门课程。')
      const course = normalizePreviewCourse(patch, schedule.courses[index])
      schedule.courses[index] = course
      syncPreviewCourseTime(schedule, course)
      schedule.maxPeriod = Math.min(
        20,
        Math.max(1, ...schedule.courses.map((item) => item.endPeriod), schedule.periodTimes.length),
      )
      schedule.maxWeek = Math.min(
        30,
        Math.max(16, ...schedule.courses.flatMap((item) => item.weeks)),
      )
      return { workspace: clone(state.workspace), course: clone(course) }
    },
    async deleteScheduleCourse(id) {
      const schedule = state.workspace.schedule
      if (!schedule?.courses.some((course) => course.id === id)) {
        throw new Error('没有找到这门课程。')
      }
      schedule.courses = schedule.courses.filter((course) => course.id !== id)
      if (!schedule.courses.length) {
        state.workspace.schedule = null
      } else {
        schedule.maxPeriod = Math.min(
          20,
          Math.max(
            1,
            ...schedule.courses.map((item) => item.endPeriod),
            schedule.periodTimes?.length || 0,
          ),
        )
        schedule.maxWeek = Math.min(
          30,
          Math.max(16, ...schedule.courses.flatMap((item) => item.weeks)),
        )
      }
      return clone(state.workspace)
    },
    async updateSchedulePeriodTimes(periodTimes) {
      const schedule = state.workspace.schedule
      if (!schedule?.courses?.length) throw new Error('请先创建或导入课程。')
      schedule.periodTimes = normalizePreviewPeriodTimes(
        periodTimes,
        Array.isArray(periodTimes) ? periodTimes.length : 0,
        schedule.courses,
      )
      schedule.maxPeriod = Math.min(
        20,
        Math.max(1, ...schedule.courses.map((item) => item.endPeriod), schedule.periodTimes.length),
      )
      return clone({ workspace: state.workspace, periodTimes: schedule.periodTimes })
    },
    async clearSchedule() {
      state.workspace.schedule = null
      return clone(state.workspace)
    },
    async revealScheduleSource() {
      return true
    },
    async openPath() {
      return true
    },
    async openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    },
    async clearLogs() {
      state.logs = []
      return true
    },
    async changeLogDirectory(nextDir) {
      const oldDir = state.settings.logDir
      state.settings.logDir = nextDir
      state.status.logsDir = nextDir
      emit('settings:changed', state.settings)
      return { oldDir, newDir: nextDir, movedFiles: 1, settings: clone(state.settings) }
    },
    async exportDiagnostics() {
      return { canceled: true }
    },
    async reportStartup() {
      return { ok: true, totalMs: 0, slow: false, rendererMs: 0 }
    },
    async checkLauncherUpdate() {
      return clone(state.launcherUpdate)
    },
    async downloadLauncherUpdate() {
      const total = state.launcherUpdate.asset?.size || 0
      for (const percent of [0, 18, 47, 76, 100]) {
        emit('launcher:download-progress', {
          phase: percent === 100 ? 'completed' : 'downloading',
          version: state.launcherUpdate.latestVersion,
          fileName: state.launcherUpdate.asset?.name,
          received: Math.round((total * percent) / 100),
          total,
          percent,
          at: new Date().toISOString(),
        })
        await new Promise((resolve) => setTimeout(resolve, 260))
      }
      emit('launcher:download-progress', {
        phase: 'opening',
        version: state.launcherUpdate.latestVersion,
        fileName: state.launcherUpdate.asset?.name,
        received: total,
        total,
        percent: 100,
        at: new Date().toISOString(),
      })
      return { filePath: 'C:\\Users\\小zp\\AppData\\Local\\Temp\\ZP-Workbench-Setup-0.3.1-x64.exe' }
    },
  }
}

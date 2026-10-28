import {
  presentationContent,
  presentationStrategy,
  structuredContentIssue,
} from './presentation-content.mjs'
import { buildStructuredSlide, chartPreview, chartScale } from './presentation-layouts.mjs'

/** PPT 工作室的作品契约和确定性布局。此模块没有文件系统、网络或 DOM 依赖。 */
export const PRESENTATION_LIMITS = { projects: 100, slides: 40, points: 6 }
export const PRESENTATION_SCENES = {
  proposal: '商业提案',
  report: '工作汇报',
  teaching: '教学培训',
  technical: '技术分享',
  brand: '品牌展示',
  competition: '比赛答辩',
}
export const PRESENTATION_LAYOUTS = {
  cover: '封面',
  statement: '观点',
  split: '内容分栏',
  steps: '步骤 / 要点',
  closing: '结束页',
  comparison: '方案 / 能力对比',
  timeline: '时间线 / 成长计划',
  process: '流程 / 实施路径',
  metrics: '关键指标',
  chart: '数据图表',
}
export const PRESENTATION_THEMES = {
  editorial: {
    name: '编辑室',
    description: '暖白底色 · 醒目标题 · 朱红标记',
    bg: 'F7F6F2',
    ink: '20201E',
    muted: '6D6C65',
    accent: 'B54932',
    panel: 'EAE8E0',
    font: 'Microsoft YaHei',
  },
  midnight: {
    name: '夜航',
    description: '深色画布 · 冷静层次 · 薄荷点睛',
    bg: '172B2E',
    ink: 'F4F5ED',
    muted: 'ADBFBA',
    accent: 'BCE3BC',
    panel: '243D3F',
    font: 'Microsoft YaHei',
  },
  paper: {
    name: '纸上',
    description: '纸张暖色 · 宋体标题 · 人文叙事',
    bg: 'F1E8D9',
    ink: '3F342D',
    muted: '807060',
    accent: '916047',
    panel: 'E5D8C5',
    font: 'Microsoft YaHei',
    titleFont: 'SimSun',
  },
}

export const presentationId = () => globalThis.crypto.randomUUID()
const text = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '')
const choice = (value, choices, fallback) =>
  Object.hasOwn(choices, value || '') ? value : fallback

export function cleanPresentation(input, existing = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (!Array.isArray(input.slides) || !input.slides.length) return null
  const now = new Date().toISOString()
  const ids = new Set()
  const slides = input.slides.slice(0, PRESENTATION_LIMITS.slides).map((slide) => {
    slide = slide && typeof slide === 'object' ? slide : {}
    let id = text(slide.id, 80)
    if (!id || ids.has(id)) id = presentationId()
    ids.add(id)
    return {
      id,
      layout: choice(slide.layout, PRESENTATION_LAYOUTS, 'split'),
      eyebrow: text(slide.eyebrow, 60),
      title: text(slide.title, 100),
      body: text(slide.body, 1200),
      points: Array.isArray(slide.points)
        ? slide.points
            .slice(0, 6)
            .map((p) => text(p, 160))
            .filter(Boolean)
        : [],
      notes: text(slide.notes, 4000),
      ...presentationContent(slide),
    }
  })
  return {
    id: existing?.id || text(input.id, 80) || presentationId(),
    title: text(input.title, 100) || '未命名演示',
    theme: choice(input.theme, PRESENTATION_THEMES, 'editorial'),
    scene: choice(input.scene, PRESENTATION_SCENES, 'proposal'),
    audience: text(input.audience, 160),
    goal: text(input.goal, 500),
    slides,
    createdAt: existing?.createdAt || text(input.createdAt, 40) || now,
    updatedAt: text(input.updatedAt, 40) || now,
    ...(presentationStrategy(input.strategy)
      ? { strategy: presentationStrategy(input.strategy) }
      : {}),
  }
}

export function validatePresentationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('作品参数无效。')
  if (!Array.isArray(input.slides) || input.slides.length < 1 || input.slides.length > 40) {
    throw new Error('作品需要包含 1–40 页。')
  }
  const check = (value, max, name) => {
    if (value !== undefined && (typeof value !== 'string' || value.length > max)) {
      throw new Error(`${name}格式不正确或超过 ${max} 字。`)
    }
  }
  check(input.id, 80, '作品编号')
  check(input.title, 100, '作品名称')
  if (!input.title?.trim()) throw new Error('作品名称不能为空。')
  check(input.audience, 160, '听众')
  check(input.goal, 500, '演示目标')
  presentationStrategy(input.strategy, true)
  if (!Object.hasOwn(PRESENTATION_THEMES, input.theme)) throw new Error('请选择有效的视觉主题。')
  if (!Object.hasOwn(PRESENTATION_SCENES, input.scene)) throw new Error('请选择有效的演示场景。')
  for (const slide of input.slides) {
    if (!slide || typeof slide !== 'object' || Array.isArray(slide))
      throw new Error('页面参数无效。')
    if (!Object.hasOwn(PRESENTATION_LAYOUTS, slide.layout)) throw new Error('页面版式无效。')
    check(slide.id, 80, '页面编号')
    check(slide.eyebrow, 60, '页眉')
    check(slide.title, 100, '页面标题')
    check(slide.body, 1200, '页面正文')
    check(slide.notes, 4000, '演讲备注')
    if (!Array.isArray(slide.points) || slide.points.length > 6)
      throw new Error('每页最多 6 个要点。')
    slide.points.forEach((point) => check(point, 160, '要点'))
    presentationContent(slide, true)
  }
  const imageBytes = input.slides
    .flatMap((slide) => slide.canvas || [])
    .filter((node) => node.type === 'image')
    .reduce((sum, node) => sum + (node.data?.length || 0), 0)
  if (imageBytes > 8000000) throw new Error('作品图片总量过大，请压缩图片或拆分作品。')
  return cleanPresentation(input)
}

/** @param {any} input */
export function createPresentation(input = {}) {
  return cleanPresentation({
    title: input.title || '未命名演示',
    theme: input.theme || 'editorial',
    scene: input.scene || 'proposal',
    audience: input.audience || '',
    goal: input.goal || '',
    slides: [
      {
        layout: 'cover',
        eyebrow: PRESENTATION_SCENES[input.scene] || '演示文稿',
        title: input.title || '从一个好想法开始',
        body: '写下你希望听众记住的一句话。',
      },
      {
        layout: 'split',
        eyebrow: '01 / 核心内容',
        title: '这一页，只讲清一件事',
        body: '在这里写下背景、证据或你的核心判断。',
        points: ['用事实支持观点', '让结构帮助理解', '把细节留给演讲备注'],
      },
      {
        layout: 'closing',
        eyebrow: '接下来',
        title: '让想法成为下一步行动',
        body: '写下你希望听众采取的行动。',
      },
    ],
  })
}

function lineCount(value, width, size) {
  return String(value)
    .split('\n')
    .reduce((total, line) => {
      const units = [...line].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 1 : 0.56), 0)
      return total + Math.max(1, Math.ceil((units * size) / width))
    }, 0)
}

/** 在 1280×720 画布上排版；字号自动适应到可读下限，剩余溢出明确报告。 */
export function buildSlideScene(slide, themeId = 'editorial', index = 0, total = 1) {
  const theme = PRESENTATION_THEMES[themeId] || PRESENTATION_THEMES.editorial
  if (Array.isArray(slide.canvas)) {
    const nodes = slide.canvas.map((source) => {
      const node = { ...source }
      if (node.role === 'pageNumber')
        node.text = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
      if (node.type === 'text')
        node.overflow = lineCount(node.text, node.w, node.size) * node.size * 1.35 > node.h
      if (node.type === 'chart') {
        node.colors ||= [theme.accent, theme.ink, theme.muted]
        node.scale = chartScale(node.chart)
        node.preview = chartPreview(node.chart, node, theme)
      }
      return node
    })
    return { width: 1280, height: 720, background: slide.background || theme.bg, nodes }
  }
  const nodes = []
  function rect(x, y, w, h, color) {
    nodes.push({ type: 'rect', x, y, w, h, color })
  }
  function label(
    value,
    x,
    y,
    w,
    h,
    size = 28,
    color = theme.ink,
    bold = false,
    min = size,
    title = false,
  ) {
    if (!value) return
    while (size > min && lineCount(value, w, size) * size * 1.35 > h) size -= 1
    nodes.push({
      type: 'text',
      text: value,
      x,
      y,
      w,
      h,
      size,
      color,
      bold,
      font: title ? theme.titleFont || theme.font : theme.font,
      overflow: lineCount(value, w, size) * size * 1.35 > h,
    })
  }
  rect(64, 57, 32, 4, theme.accent)
  label(slide.eyebrow, 112, 44, 1030, 36, 18, theme.muted)
  label(
    `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    1090,
    658,
    135,
    30,
    16,
    theme.muted,
  )
  const points = Array.isArray(slide.points) ? slide.points : []
  if (buildStructuredSlide(slide, theme, { rect, label, nodes })) {
    // 结构化版式与旧版式共用字体适配、边界检查和导出场景。
  } else if (slide.layout === 'cover' || slide.layout === 'closing') {
    rect(1024, 148, 1, 430, theme.muted)
    label(String(index + 1).padStart(2, '0'), 1070, 158, 165, 140, 96, theme.accent)
    label(slide.title, 64, 164, 890, 240, 76, theme.ink, true, 40, true)
    label(
      [slide.body, ...points].filter(Boolean).join('\n'),
      68,
      452,
      850,
      158,
      26,
      theme.muted,
      false,
      20,
    )
  } else if (slide.layout === 'statement') {
    label(slide.title, 64, 122, 1150, 178, 64, theme.ink, true, 36, true)
    rect(64, 334, 120, 5, theme.accent)
    label(
      [slide.body, ...points].filter(Boolean).join('\n'),
      64,
      375,
      1120,
      245,
      32,
      theme.muted,
      false,
      22,
    )
  } else if (slide.layout === 'steps') {
    label(slide.title, 64, 115, 1150, 115, 52, theme.ink, true, 32, true)
    label(slide.body, 64, 246, 1120, 78, 24, theme.muted, false, 18)
    const columns = points.length > 3 ? 3 : Math.max(1, points.length)
    const rows = Math.ceil(points.length / columns)
    const w = (1152 - (columns - 1) * 24) / columns
    const h = rows > 1 ? 136 : 258
    points.forEach((point, i) => {
      const x = 64 + (i % columns) * (w + 24)
      const y = 346 + Math.floor(i / columns) * (h + 18)
      rect(x, y, w, h, theme.panel)
      label(String(i + 1).padStart(2, '0'), x + 22, y + 14, 62, 40, 24, theme.accent)
      label(point, x + 22, y + 58, w - 44, h - 72, 26, theme.ink, false, 18)
    })
  } else {
    label(slide.title, 64, 115, 1150, 120, 52, theme.ink, true, 32, true)
    label(slide.body, 64, 280, 510, 320, 30, theme.muted, false, 20)
    rect(625, 280, 1, 320, theme.muted)
    const rowHeight = Math.min(106, 320 / Math.max(1, points.length))
    points.forEach((point, i) => {
      label(
        String(i + 1).padStart(2, '0'),
        680,
        280 + i * rowHeight,
        54,
        rowHeight - 8,
        20,
        theme.accent,
      )
      label(point, 750, 280 + i * rowHeight, 450, rowHeight - 10, 28, theme.ink, false, 18)
    })
  }
  return { width: 1280, height: 720, background: theme.bg, nodes }
}

export function getPresentationIssues(deck) {
  const durationIssues =
    deck.strategy?.durationSeconds &&
    deck.slides.reduce((sum, slide) => sum + (slide.seconds || 0), 0) !==
      deck.strategy.durationSeconds
      ? [
          {
            page: 1,
            message: '页面建议用时合计与演示总时长不一致，请在对话中调整。',
            blocking: true,
          },
        ]
      : []
  return [
    ...durationIssues,
    ...deck.slides.flatMap((slide, i) => {
      const issues = []
      const missing = structuredContentIssue(slide)
      if (missing) issues.push({ page: i + 1, message: missing, blocking: true })
      if (slide.points.length > 6 || slide.points.some((point) => point.length > 160)) {
        issues.push({ page: i + 1, message: '要点最多 6 项，每项最多 160 字。', blocking: true })
      }
      if (!slide.title.trim())
        issues.push({ page: i + 1, message: '页面标题尚未填写。', blocking: false })
      const scene = buildSlideScene(slide, deck.theme, i, deck.slides.length)
      if (
        scene.nodes
          .filter((node) => !node.hidden)
          .flatMap((node) => node.preview || [node])
          .some((node) => node.overflow)
      )
        issues.push({
          page: i + 1,
          message: '内容超出版式容量，请缩短文字、拆页或切换版式。',
          blocking: true,
        })
      else if ([slide.body, ...slide.points].join('').length > 350)
        issues.push({ page: i + 1, message: '内容偏多，建议把细节移到演讲备注。', blocking: false })
      return issues
    }),
  ]
}

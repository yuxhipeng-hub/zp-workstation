import { buildSlideScene, PRESENTATION_THEMES, validatePresentationInput } from './presentation.mjs'
import { canvasFromScene } from './presentation-canvas.mjs'

export const DESIGN_DIRECTIONS = {
  precision: {
    name: '清晰商务',
    description: '冷白与深蓝，明确层级，适合提案和数据汇报',
    bg: 'F4F7FB',
    ink: '142B40',
    muted: '596A7C',
    accent: '2057D2',
    panel: 'E4EBF4',
  },
  story: {
    name: '叙事编辑',
    description: '暖纸色与朱红，大标题与章节感，适合答辩和故事表达',
    bg: 'F6F1E8',
    ink: '24221F',
    muted: '776D60',
    accent: 'B64A33',
    panel: 'E5DBCA',
  },
}
export function materializeDesign(input, direction = 'precision', { replace = false } = {}) {
  if (!Object.hasOwn(DESIGN_DIRECTIONS, direction)) throw new Error('设计方向无效。')
  const deck = validatePresentationInput(input)
  const palette = DESIGN_DIRECTIONS[direction],
    original = PRESENTATION_THEMES[deck.theme]
  const mapColor = (color) => {
    const key = ['bg', 'ink', 'muted', 'accent', 'panel'].find((key) => original[key] === color)
    return key ? palette[key] : color
  }
  deck.slides = deck.slides.map((slide, index) => {
    if (slide.canvas && !replace) return slide
    const source = { ...slide }
    delete source.canvas
    delete source.background
    let scene = buildSlideScene(source, deck.theme, index, deck.slides.length)
    scene.background = palette.bg
    scene.nodes = scene.nodes.map((node) => ({
      ...node,
      ...(node.color ? { color: mapColor(node.color) } : {}),
      ...(node.colors ? { colors: node.colors.map(mapColor) } : {}),
      ...(node.type === 'text'
        ? { font: direction === 'story' && node.bold ? 'SimSun' : 'Microsoft YaHei' }
        : {}),
    }))
    if (['cover', 'closing'].includes(slide.layout)) {
      const label = (text, x, y, w, h, size, color, bold = false) => ({
        type: 'text',
        text,
        x,
        y,
        w,
        h,
        size,
        color,
        bold,
        font: direction === 'story' && bold ? 'SimSun' : 'Microsoft YaHei',
      })
      const title = label(slide.title, 80, 164, 730, 280, 72, palette.ink, true)
      while (
        title.size > 36 &&
        Math.ceil(([...title.text].length * title.size) / title.w) * title.size * 1.35 > title.h
      )
        title.size--
      scene.nodes = [
        { type: 'rect', x: 876, y: 0, w: 404, h: 720, color: palette.accent },
        { type: 'rect', x: 80, y: 112, w: 80, h: 5, color: palette.accent },
        label(slide.eyebrow, 80, 56, 720, 36, 19, palette.muted),
        title,
        label(
          [slide.body, ...slide.points].filter(Boolean).join('\n'),
          80,
          482,
          720,
          140,
          24,
          palette.muted,
        ),
        label(String(index + 1).padStart(2, '0'), 924, 210, 280, 170, 112, 'FFFFFF'),
        label(
          `${String(index + 1).padStart(2, '0')} / ${String(deck.slides.length).padStart(2, '0')}`,
          1090,
          658,
          135,
          30,
          16,
          'FFFFFF',
        ),
      ]
      for (const node of scene.nodes.filter((n) => n.type === 'text')) {
        const lines = () =>
          node.text
            .split('\n')
            .reduce(
              (sum, line) =>
                sum +
                Math.max(
                  1,
                  Math.ceil(
                    ([...line].reduce((width, c) => width + (c.charCodeAt(0) > 255 ? 1 : 0.56), 0) *
                      node.size) /
                      node.w,
                  ),
                ),
              0,
            )
        while (node.size > 18 && lines() * node.size * 1.35 > node.h) node.size--
      }
    }
    return { ...slide, background: palette.bg, canvas: canvasFromScene(scene, slide) }
  })
  return validatePresentationInput({ ...deck, designDirection: direction })
}
export function samplePageIndices(plan) {
  const content = plan.pages.findIndex(
    (p, i) =>
      i > 0 &&
      !['cover', 'closing', 'chart', 'metrics', 'comparison', 'timeline', 'process'].includes(
        p.layout,
      ),
  )
  const chart = plan.pages.findIndex((p) => p.layout === 'chart')
  const structured =
    chart > 0
      ? chart
      : plan.pages.findIndex(
          (p, i) =>
            i > 0 &&
            i !== content &&
            ['chart', 'metrics', 'comparison', 'timeline', 'process'].includes(p.layout),
        )
  const indices = [...new Set([0, content > 0 ? content : 1, structured > 0 ? structured : 2])]
  for (let i = 1; indices.length < 3 && i < plan.pages.length; i++)
    if (!indices.includes(i)) indices.push(i)
  return indices
}

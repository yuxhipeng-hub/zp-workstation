/** 结构化内容契约。只接受文字和数值，不接受 URL、文件路径或可执行内容。 */
import { presentationCanvas } from './presentation-canvas.mjs'
export const CONTENT_FIELDS = [
  'items',
  'comparison',
  'chart',
  'source',
  'purpose',
  'seconds',
  'canvas',
  'background',
  'locked',
]
const object = (value) => value && typeof value === 'object' && !Array.isArray(value)
function string(value, max, name, required = false) {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Error(`${name}无效或超长。`)
  return value.trim()
}
function array(value, min, max, name) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw new Error(`${name}数量无效。`)
  return value
}
function contentField(key, value) {
  if (key === 'canvas') return presentationCanvas(value, (chart) => contentField('chart', chart))
  if (key === 'locked') {
    if (typeof value !== 'boolean') throw new Error('页面锁定状态无效。')
    return value
  }
  if (key === 'background') {
    if (typeof value !== 'string' || !/^[0-9a-f]{6}$/i.test(value))
      throw new Error('页面背景无效。')
    return value.toUpperCase()
  }
  if (key === 'seconds') {
    if (!Number.isInteger(value) || value < 1 || value > 3600) throw new Error('页面建议时长无效。')
    return value
  }
  if (key === 'source' || key === 'purpose')
    return string(value, 200, key === 'source' ? '来源' : '页面目的')
  if (key === 'items')
    return array(value, 1, 5, '阶段/指标').map((item) => {
      if (!object(item)) throw new Error('阶段/指标格式无效。')
      return {
        label: string(item.label, 20, '阶段标签'),
        value: string(item.value, 24, '指标值'),
        title: string(item.title, 40, '阶段/指标标题', true),
        body: string(item.body, 160, '阶段/指标说明'),
      }
    })
  if (key === 'comparison') {
    if (!object(value)) throw new Error('对比内容无效。')
    const headers = array(value.headers, 2, 3, '对比列').map((header) =>
      string(header, 24, '对比列标题', true),
    )
    const rows = array(value.rows, 1, 5, '对比行').map((row) => {
      if (!object(row)) throw new Error('对比行无效。')
      if (!Array.isArray(row.values) || row.values.length !== headers.length)
        throw new Error(
          `对比行 values 必须有 ${headers.length} 项，与 headers 一一对应；label 不占 headers 一列。`,
        )
      return {
        label: string(row.label, 24, '对比维度', true),
        values: array(row.values, headers.length, headers.length, '对比值').map((v) =>
          string(v, 80, '对比值', true),
        ),
      }
    })
    return { headers, rows }
  }
  if (!object(value) || !['bar', 'line'].includes(value.type)) throw new Error('图表类型无效。')
  const categories = array(value.categories, 1, 8, '图表分类').map((c) =>
    string(c, 24, '分类标签', true),
  )
  const series = array(value.series, 1, 3, '数据系列').map((s) => {
    if (!object(s)) throw new Error('数据系列无效。')
    const values = array(s.values, categories.length, categories.length, '数据').map((v) => {
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e12)
        throw new Error('图表数值无效。')
      return v
    })
    return { name: string(s.name, 24, '系列名称', true), values }
  })
  return {
    type: value.type,
    categories,
    series,
    source: string(value.source, 200, '图表来源', true),
    unit: string(value.unit, 24, '图表单位'),
  }
}

export function presentationContent(slide, strict = false) {
  const result = {}
  for (const key of CONTENT_FIELDS)
    if (Object.hasOwn(slide, key)) {
      try {
        result[key] = contentField(key, slide[key])
      } catch (error) {
        if (strict) throw error
      }
    }
  if (strict && slide.layout === 'process' && result.items?.length > 4)
    throw new Error('流程最多 4 步。')
  if (strict && slide.layout === 'metrics' && result.items?.length > 4)
    throw new Error('指标最多 4 项。')
  return result
}

export function presentationStrategy(value, strict = false) {
  if (value === undefined) return undefined
  try {
    if (!object(value)) throw new Error('策划依据无效。')
    if (
      value.durationSeconds !== undefined &&
      (!Number.isInteger(value.durationSeconds) ||
        value.durationSeconds < 30 ||
        value.durationSeconds > 3600)
    )
      throw new Error('演示总时长无效。')
    return {
      ...(value.durationSeconds !== undefined ? { durationSeconds: value.durationSeconds } : {}),
      thesis: string(value.thesis, 500, '演示主线', true),
      requirements: array(value.requirements ?? [], 0, 12, '要求').map((v) =>
        string(v, 200, '要求', true),
      ),
      missing: array(value.missing ?? [], 0, 12, '信息缺口').map((v) =>
        string(v, 200, '信息缺口', true),
      ),
    }
  } catch (error) {
    if (strict) throw error
    return undefined
  }
}

export function structuredContentIssue(slide) {
  if (Array.isArray(slide.canvas)) return ''
  if (
    ['comparison', 'timeline', 'process', 'metrics', 'chart'].includes(slide.layout) &&
    slide.points?.length
  )
    return '此版式使用结构化内容，请在对话中将已有要点转换为对应内容，避免遗漏。'
  if (slide.layout === 'chart' && !slide.chart)
    return '缺少图表数据，请在对话中提供分类、数值和来源。'
  if (slide.layout === 'comparison' && !slide.comparison)
    return '缺少对比内容，请在对话中提供方案与对比维度。'
  if (['timeline', 'process', 'metrics'].includes(slide.layout) && !slide.items?.length)
    return '缺少阶段或指标内容，请在对话中补充。'
  if (slide.layout === 'metrics' && slide.items?.some((item) => !item.value && !item.label))
    return '关键指标缺少数值或状态，请在对话中补充，不能虚构。'
  return ''
}

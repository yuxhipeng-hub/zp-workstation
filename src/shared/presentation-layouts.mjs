import { structuredContentIssue } from './presentation-content.mjs'

export function chartScale(chart) {
  const values = chart.series.flatMap((s) => s.values)
  let min = Math.min(0, ...values)
  let max = Math.max(0, ...values)
  if (min === max) max = 1
  const raw = Math.max(Number.MIN_VALUE, (max - min) / 4)
  const power = Math.max(Number.MIN_VALUE, 10 ** Math.floor(Math.log10(raw)))
  const relative = raw / power
  const step = (relative <= 1 ? 1 : relative <= 2 ? 2 : relative <= 5 ? 5 : 10) * power
  min = Math.floor(min / step) * step
  max = Math.ceil(max / step) * step
  return { min, max, step }
}

export function chartNumber(value) {
  if (!value) return '0'
  if (Math.abs(value) >= 1e7 || Math.abs(value) < 0.001) return value.toExponential(2)
  return String(Number(value.toPrecision(6)))
}

export function chartPreview(chart, box, theme) {
  const nodes = []
  const rect = (x, y, w, h, color) => nodes.push({ type: 'rect', x, y, w, h, color })
  const label = (text, x, y, w, h, size = 18, color = theme.muted) => {
    text = String(text)
    const units = [...text].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 1 : 0.56), 0)
    const height = () => Math.max(1, Math.ceil((units * size) / w)) * size * 1.35
    while (size > 14 && height() > h) size--
    nodes.push({
      type: 'text',
      text,
      x,
      y,
      w,
      h,
      size,
      color,
      font: theme.font,
      overflow: height() > h,
    })
  }
  const colors = [theme.accent, theme.ink, theme.muted]
  const scale = chartScale(chart)
  const left = box.x + 76,
    top = box.y + 44,
    width = box.w - 96,
    height = box.h - 112
  const y = (v) => top + ((scale.max - v) / (scale.max - scale.min)) * height
  for (let tick = scale.min; tick <= scale.max + scale.step / 100; tick += scale.step) {
    const value = Number(tick.toPrecision(8))
    rect(left, y(value), width, 1, theme.panel)
    label(chartNumber(value), box.x, y(value) - 12, 68, 26, 17)
  }
  const group = width / chart.categories.length
  chart.series.forEach((series, si) => {
    rect(left + si * 250, box.y + 4, 18, 10, colors[si])
    label(series.name, left + si * 250 + 26, box.y - 2, 220, 30)
    series.values.forEach((v, i) => {
      const cx = left + group * (i + 0.5)
      if (chart.type === 'bar') {
        const barWidth = Math.min(84, (group * 0.65) / chart.series.length)
        const x = cx + (si - chart.series.length / 2) * barWidth
        rect(x, Math.min(y(0), y(v)), barWidth - 4, Math.max(1, Math.abs(y(0) - y(v))), colors[si])
        label(chartNumber(v), x, Math.max(top - 28, y(v) - 28), barWidth + 12, 25, 17, colors[si])
      } else {
        if (i) {
          const x0 = left + group * (i - 0.5),
            y0 = y(series.values[i - 1])
          const x1 = cx,
            y1 = y(v)
          const nx = Math.min(x0, x1),
            ny = Math.min(y0, y1)
          nodes.push({
            type: 'line',
            x: nx,
            y: ny,
            w: Math.max(1, Math.abs(x1 - x0)),
            h: Math.max(1, Math.abs(y1 - y0)),
            x1: x0 - nx,
            y1: y0 - ny,
            x2: x1 - nx,
            y2: y1 - ny,
            color: colors[si],
            stroke: 3,
          })
        }
        nodes.push({ type: 'ellipse', x: cx - 5, y: y(v) - 5, w: 10, h: 10, color: colors[si] })
        label(chartNumber(v), cx + 8, Math.max(top - 20, y(v) - 26), 90, 26, 17, colors[si])
      }
    })
  })
  chart.categories.forEach((category, i) =>
    label(category, left + i * group + 4, top + height + 16, group - 8, 60, 17),
  )
  return nodes
}

/** 由语义内容选择固定几何；绘制回调沿用现有字号适配和溢出检测。 */
export function buildStructuredSlide(slide, theme, { rect, label, nodes }) {
  if (!['comparison', 'timeline', 'process', 'metrics', 'chart'].includes(slide.layout))
    return false
  label(slide.title, 64, 112, 1152, 112, 52, theme.ink, true, 32, true)
  label(slide.body, 64, 232, 1152, 64, 24, theme.muted, false, 18)
  const issue = structuredContentIssue(slide)
  if (issue) {
    label(issue, 64, 350, 1100, 120, 32, theme.muted)
    return true
  }
  if (slide.layout === 'comparison') {
    const { headers, rows } = slide.comparison
    const leftWidth = 180,
      column = (1152 - leftWidth) / headers.length
    headers.forEach((header, i) => {
      const x = 64 + leftWidth + i * column
      rect(x, 314, column - 4, 60, i ? theme.panel : theme.accent)
      label(header, x + 18, 327, column - 40, 40, 26, i ? theme.ink : theme.bg, true, 20)
    })
    const rowHeight = Math.min(80, 244 / rows.length)
    rows.forEach((row, ri) => {
      const y = 390 + ri * rowHeight
      label(row.label, 64, y, leftWidth - 20, rowHeight - 12, 24, theme.muted, false, 18)
      row.values.forEach((value, ci) => {
        const x = 64 + leftWidth + ci * column
        label(value, x + 18, y, column - 40, rowHeight - 12, 26, theme.ink, false, 18)
      })
      rect(64, y + rowHeight - 8, 1152, 1, theme.panel)
    })
  } else if (slide.layout === 'metrics') {
    const width = (1152 - (slide.items.length - 1) * 24) / slide.items.length
    slide.items.forEach((item, i) => {
      const x = 64 + i * (width + 24)
      rect(x, 328, 56, 4, theme.accent)
      label(item.value || item.label, x, 368, width, 105, 64, theme.accent, true, 32)
      label(item.title, x, 480, width, 55, 28, theme.ink, true, 20)
      label(item.body, x, 548, width, 80, 22, theme.muted, false, 18)
    })
  } else if (slide.layout === 'timeline') {
    const width = 1152 / slide.items.length
    rect(64, 367, 1152 - width / 2, 2, theme.panel)
    slide.items.forEach((item, i) => {
      const x = 64 + width * i
      label(
        item.label || String(i + 1).padStart(2, '0'),
        x,
        314,
        width - 24,
        38,
        24,
        theme.accent,
        true,
        18,
      )
      nodes.push({ type: 'ellipse', x, y: 360, w: 16, h: 16, color: theme.accent })
      label(item.title, x, 406, width - 24, 84, 30, theme.ink, true, 20)
      label(item.body, x, 508, width - 24, 118, 24, theme.muted, false, 18)
    })
  } else if (slide.layout === 'process') {
    const width = (1152 - 48 * (slide.items.length - 1)) / slide.items.length
    slide.items.forEach((item, i) => {
      const x = 64 + (width + 48) * i
      rect(x, 330, width, 280, theme.panel)
      label(
        item.label || String(i + 1).padStart(2, '0'),
        x + 22,
        348,
        width - 44,
        40,
        24,
        theme.accent,
        true,
        18,
      )
      label(item.title, x + 22, 408, width - 44, 82, 30, theme.ink, true, 20)
      label(item.body, x + 22, 508, width - 44, 86, 22, theme.muted, false, 18)
      if (i < slide.items.length - 1) label('→', x + width + 10, 434, 32, 50, 30, theme.muted)
    })
  } else {
    const box = { x: 64, y: 304, w: 1152, h: 320 }
    nodes.push({
      type: 'chart',
      ...box,
      chart: slide.chart,
      colors: [theme.accent, theme.ink, theme.muted],
      scale: chartScale(slide.chart),
      preview: chartPreview(slide.chart, box, theme),
    })
  }
  const source =
    slide.layout === 'chart'
      ? [slide.chart.source, slide.chart.unit].filter(Boolean).join(' · ')
      : slide.source
  if (source) label(`来源：${source}`, 64, 644, 990, 28, 16, theme.muted, false, 14)
  return true
}

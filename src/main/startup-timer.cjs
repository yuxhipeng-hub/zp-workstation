const DEFAULT_SLOW_START_MS = 5000

const MARK_LABELS = [
  ['app-ready', '主进程就绪'],
  ['window-created', '窗口创建'],
  ['window-loaded', '页面加载'],
  ['first-render', '首屏渲染'],
]

/**
 * 记录启动各阶段耗时，只用于日志和基线，不参与启动流程。
 * @param {{ now?: () => number, slowThresholdMs?: number }} [options]
 */
function createStartupTimer({
  now = () => Date.now(),
  slowThresholdMs = DEFAULT_SLOW_START_MS,
} = {}) {
  const startedAt = now()
  const marks = {}

  const mark = (name) => {
    if (!name) return null
    if (marks[name] === undefined) marks[name] = now() - startedAt
    return marks[name]
  }

  const summary = () => {
    const totalMs = marks['first-render'] ?? marks['window-loaded'] ?? now() - startedAt
    return {
      startedAt,
      marks: { ...marks },
      totalMs,
      thresholdMs: slowThresholdMs,
      slow: totalMs > slowThresholdMs,
    }
  }

  const describe = () => {
    const info = summary()
    const parts = MARK_LABELS.filter(([name]) => info.marks[name] !== undefined).map(
      ([name, label]) => `${label} ${(info.marks[name] / 1000).toFixed(2)}s`,
    )
    const suffix = info.slow ? `（超过 ${info.thresholdMs / 1000}s 阈值）` : ''
    return `启动耗时：${parts.join('，')}；合计 ${(info.totalMs / 1000).toFixed(2)}s${suffix}`
  }

  return { mark, summary, describe, slowThresholdMs }
}

module.exports = { DEFAULT_SLOW_START_MS, createStartupTimer }

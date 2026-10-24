const assert = require('node:assert/strict')
const test = require('node:test')
const { DEFAULT_SLOW_START_MS, createStartupTimer } = require('../src/main/startup-timer.cjs')

test('records marks relative to the first call and keeps them stable', () => {
  let clock = 1000
  const timer = createStartupTimer({ now: () => clock })

  clock = 1600
  assert.equal(timer.mark('app-ready'), 600)
  clock = 2400
  assert.equal(timer.mark('window-created'), 1400)
  clock = 3000
  assert.equal(timer.mark('app-ready'), 600)

  const summary = timer.summary()
  assert.equal(summary.marks['app-ready'], 600)
  assert.equal(summary.marks['window-created'], 1400)
  assert.equal(summary.totalMs, 2000)
  assert.equal(summary.slow, false)
})

test('uses first render as total and flags slow starts', () => {
  let clock = 0
  const timer = createStartupTimer({ now: () => clock, slowThresholdMs: 1000 })
  timer.mark('app-ready')
  clock = 1200
  timer.mark('first-render')

  const summary = timer.summary()
  assert.equal(summary.totalMs, 1200)
  assert.equal(summary.slow, true)
  assert.equal(summary.thresholdMs, 1000)
  assert.match(timer.describe(), /首屏渲染 1\.20s/)
  assert.match(timer.describe(), /超过 1s 阈值/)
})

test('falls back to window-loaded and formats labels in order', () => {
  let clock = 0
  const timer = createStartupTimer({ now: () => clock })
  clock = 500
  timer.mark('app-ready')
  clock = 900
  timer.mark('window-created')
  clock = 1500
  timer.mark('window-loaded')

  assert.equal(timer.summary().totalMs, 1500)
  assert.equal(
    timer.describe(),
    '启动耗时：主进程就绪 0.50s，窗口创建 0.90s，页面加载 1.50s；合计 1.50s',
  )
  assert.equal(DEFAULT_SLOW_START_MS, 5000)
  assert.equal(timer.mark(''), null)
})

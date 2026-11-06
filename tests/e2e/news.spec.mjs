/* global window, document, requestAnimationFrame */
import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const output = path.join(os.tmpdir(), 'zp-ai-news-qa')
async function launch({ offline = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-ai-news-e2e-'))
  const env = { ...process.env, ZP_WORKBENCH_USER_DATA: dir }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: ['.'], env })
  const w = await app.firstWindow()
  await app.evaluate(
    ({ ipcMain }, { offline }) => {
      globalThis.__newsQa = { delay: 0, offline, calls: [], completed: [] }
      const item = (i) => ({
        id: `news-${i}`,
        title: `模型研究进展 ${i}：面向复杂任务的可靠评估与应用`,
        summary: '这是一段完整的新闻摘要，用于核对内置阅读、长文本换行与复制功能。',
        originalTitle: 'A practical evaluation update',
        reason: '提供可复现的评估方法。',
        source: { name: '研究团队' },
        publishedAt: '2026-11-06T12:00:00Z',
        category: i % 2 ? 'ai-models' : 'ai-products',
        links: { original: 'https://example.org/news', aihot: 'https://aihot.news/items/example' },
      })
      const bind = (name, handler) => {
        ipcMain.removeHandler(name)
        ipcMain.handle(name, async (_event, options) => {
          const qa = globalThis.__newsQa
          qa.calls.push({ name, options })
          if (qa.delay) await new Promise((resolve) => setTimeout(resolve, qa.delay))
          if (qa.offline) return { data: null, error: '连接失败，请稍后重试。' }
          const data = handler(options)
          qa.completed.push({ name, options })
          return { data, source: 'network', stale: false }
        })
      }
      bind('aihot:items', (options) => ({
        items:
          options?.q === '无结果'
            ? []
            : Array.from({ length: options?.category ? 3 : options?.cursor ? 2 : 30 }, (_, i) =>
                item(
                  i +
                    (options?.category === 'ai-products'
                      ? 201
                      : options?.category
                        ? 101
                        : options?.cursor
                          ? 31
                          : 1),
                ),
              ),
        hasMore: !options?.cursor && !options?.category && !options?.q,
        nextCursor: !options?.cursor && !options?.category && !options?.q ? 'page2' : '',
      }))
      bind('aihot:hot', () => [
        {
          rank: 1,
          publicId: 'abcdef12',
          title: '开源模型评估方法受到多来源讨论',
          sourceCount: 5,
          latestAt: '2026-11-06T12:00:00Z',
        },
      ])
      bind('aihot:story', () => ({
        publicId: 'abcdef12',
        digest: '事件综述第一段。\n\n事件综述第二段。',
        links: {},
        reports: Array.from({ length: 5 }, (_, i) => ({ ...item(i + 1), title: `报道 ${i + 1}` })),
      }))
      bind('aihot:daily', () => ({
        date: '2026-11-06',
        lead: { title: '今日 AI 动态', leadParagraph: '模型、产品与行业的主要进展。' },
        sections: [{ label: '模型', items: [item(1), item(2)] }],
      }))
    },
    { offline },
  )
  await w.getByRole('button', { name: '进入工作站' }).click()
  await w.locator('.nav-item[data-page="news"]').click()
  return { app, w, dir }
}
async function close({ app, dir }) {
  await app.close()
  if (
    path.dirname(dir) !== path.resolve(os.tmpdir()) ||
    !path.basename(dir).startsWith('zp-ai-news-e2e-')
  )
    throw new Error('Unexpected test directory')
  fs.rmSync(dir, { recursive: true, force: true })
}

test('AI news compact layout preserves reading, filters, search, pagination and daily views', async () => {
  const ctx = await launch()
  const { w, app } = ctx
  try {
    await expect(w.locator('.news-item')).toHaveCount(30)
    await expect(w.locator('#view h2')).toHaveCount(0)
    await expect(w.locator('#view')).not.toContainText('内容来自 AIHOT 的公开接口')
    const spacing = await w.locator('.ai-news').evaluate((el) => {
      const outer = el.closest('.route-canvas').getBoundingClientRect(),
        header = el.querySelector('.news-header').getBoundingClientRect()
      return { left: header.left - outer.left, top: header.top - outer.top }
    })
    expect(spacing.left).toBeGreaterThanOrEqual(24)
    expect(spacing.top).toBeGreaterThanOrEqual(20)
    const first = w.locator('.news-item-head').first()
    await first.focus()
    await w.keyboard.press('Enter')
    await expect(first).toBeFocused()
    await expect(first).toHaveAttribute('aria-expanded', 'true')
    await w.getByRole('button', { name: '复制摘要', exact: true }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain('完整的新闻摘要')
    await w.locator('[data-news-category="ai-models"]').click()
    await expect(w.locator('.news-item')).toHaveCount(3)
    await expect(w.locator('[data-news-category="ai-models"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await w.locator('[data-news-window="24h"]').click()
    await expect(w.locator('[data-news-window="24h"]')).toHaveAttribute('aria-pressed', 'true')
    await w.locator('#newsSearch').fill('无结果')
    await w.locator('#newsSearch').press('Enter')
    await expect(w.locator('.news-item')).toHaveCount(0)
    await expect(w.locator('.news-empty')).toBeVisible()
    await expect(w.locator('#newsSearch')).toBeFocused()
    await w.locator('#newsSearch').fill('')
    await w.locator('#newsSearch').press('Enter')
    await w.locator('[data-news-category=""]').click()
    await expect(w.locator('.news-item')).toHaveCount(30)
    await w.locator('[data-action="load-more-news"]').click()
    await expect(w.locator('.news-item')).toHaveCount(32)
    await w.locator('[data-news-tab="hot"]').click()
    await expect(w.locator('.news-item-head')).toHaveCount(1)
    await w.locator('.news-item-head').click()
    await expect(w.locator('.news-report')).toHaveCount(3)
    await w.locator('[data-action="toggle-news-timeline"]').click()
    await expect(w.locator('.news-report')).toHaveCount(5)
    await w.locator('[data-news-tab="daily"]').click()
    await expect(w.locator('.news-daily-lead')).toContainText('今日 AI 动态')
    await expect(w.locator('.news-item')).toHaveCount(2)
  } finally {
    await close(ctx)
  }
})

test('AI news keeps the canvas, scroll, input draft and focus during delayed filtering and refresh', async () => {
  const ctx = await launch()
  const { w, app } = ctx
  try {
    await expect(w.locator('.news-item')).toHaveCount(30)
    await app.evaluate(() => {
      globalThis.__newsQa.delay = 500
    })
    await w.locator('#newsSearch').fill('尚未提交的搜索')
    await w.locator('[data-action="refresh-news"]').click()
    await w.locator('#newsSearch').focus()
    await expect(w.locator('[data-action="refresh-news"]')).toBeEnabled()
    await expect(w.locator('.news-item')).toHaveCount(30)
    await expect(w.locator('#newsSearch')).toHaveValue('尚未提交的搜索')
    await expect(w.locator('#newsSearch')).toBeFocused()
    await w.locator('#newsSearch').fill('')
    await w.locator('#view').evaluate((el) => {
      el.scrollTop = 500
    })
    const sample = w.evaluate(async () => {
      const view = document.querySelector('#view'),
        canvas = view.querySelector('.route-canvas')
      const start = view.scrollTop,
        samples = []
      document.querySelector('[data-news-category="ai-models"]').click()
      const until = performance.now() + 850
      while (performance.now() < until) {
        await new Promise(requestAnimationFrame)
        samples.push({ top: view.scrollTop, same: view.querySelector('.route-canvas') === canvas })
      }
      return { start, samples }
    })
    const result = await sample
    expect(result.start).toBeGreaterThan(100)
    expect(result.samples.every((s) => s.same && Math.abs(s.top - result.start) <= 1)).toBe(true)
    await expect(w.locator('.news-item')).toHaveCount(3)
    await app.evaluate(() => {
      globalThis.__newsQa.delay = 600
      globalThis.__newsQa.completed = []
    })
    await w.evaluate(() => document.querySelector('[data-news-category="ai-models"]').click())
    await expect
      .poll(() => app.evaluate(() => globalThis.__newsQa.calls.at(-1).options.category))
      .toBe('ai-models')
    await app.evaluate(() => {
      globalThis.__newsQa.delay = 20
    })
    await w.evaluate(() => document.querySelector('[data-news-category="ai-products"]').click())
    await expect.poll(() => app.evaluate(() => globalThis.__newsQa.completed.length)).toBe(2)
    await expect(w.locator('.news-item-head').first()).toContainText('进展 201')
    await expect(w.locator('[data-news-category="ai-products"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await app.evaluate(() => {
      globalThis.__newsQa.offline = true
    })
    await w.evaluate(() => document.querySelector('[data-action="refresh-news"]').click())
    await expect(w.locator('[data-action="refresh-news"]')).toBeEnabled()
    await expect(w.locator('.news-item')).toHaveCount(3)
    await expect(w.locator('.news-status')).toContainText('更新失败')
    await app.evaluate(() => {
      globalThis.__newsQa.offline = false
      globalThis.__newsQa.delay = 300
    })
    const tabs = await w.evaluate(async () => {
      const view = document.querySelector('#view'),
        start = view.scrollTop,
        samples = []
      document.querySelector('[data-news-tab="hot"]').click()
      const until = performance.now() + 700
      while (performance.now() < until) {
        await new Promise(requestAnimationFrame)
        samples.push(view.scrollTop)
      }
      return { start, samples }
    })
    expect(tabs.start).toBeGreaterThan(100)
    expect(tabs.samples.every((top) => Math.abs(top - tabs.start) <= 1)).toBe(true)
  } finally {
    await close(ctx)
  }
})

test('AI news fits light, dark and narrow layouts and keeps offline recovery concise', async () => {
  const ctx = await launch({ offline: true })
  const { w, app } = ctx
  try {
    await expect(w.locator('.news-empty')).toContainText('连接失败')
    await app.evaluate(() => {
      globalThis.__newsQa.offline = false
    })
    await w.getByRole('button', { name: '刷新资讯', exact: true }).click()
    await expect(w.locator('.news-item')).toHaveCount(30)
    fs.mkdirSync(output, { recursive: true })
    for (const theme of ['dark', 'light']) {
      await w.evaluate((theme) => window.launcher.patchSettings({ theme }), theme)
      await expect(w.locator('body')).toHaveAttribute('data-theme', theme)
      await w.screenshot({ path: path.join(output, `${theme}.png`), animations: 'disabled' })
    }
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setMinimumSize(600, 600)
      win.setSize(760, 760)
    })
    await expect
      .poll(() => w.locator('.ai-news').evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true)
    await w.locator('.news-item-head').first().click()
    await expect(w.locator('.news-body')).toBeVisible()
    await w.screenshot({ path: path.join(output, 'narrow.png') })
  } finally {
    await close(ctx)
  }
})

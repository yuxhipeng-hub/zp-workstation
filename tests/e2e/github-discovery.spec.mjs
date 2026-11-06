/* global window, document, requestAnimationFrame */
import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { gitstock, archive } = require('../fixtures/github-discovery.cjs')
const screenshots = path.join(os.tmpdir(), 'zp-github-discovery-qa')
const action = (w, name) => w.locator(`[data-action="gh-${name}"]`)

async function launch(dir, mode = 'primary') {
  const env = {
    ...process.env,
    ZP_WORKBENCH_USER_DATA: path.join(dir, 'user'),
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: ['.'], env })
  const at = new Date(Date.now() - 60 * 60_000).toISOString()
  await app.evaluate(
    ({ net }, payload) => {
      const original = net.fetch
      globalThis.__githubQa = { mode: payload.mode, calls: [], delay: 0 }
      net.fetch = async (input, options) => {
        const url = String(input)
        const isPrimary = url.startsWith('https://gitstock.org/')
        const isArchive = url.includes('SnailDev/github-hot-hub')
        if (!isPrimary && !isArchive) return original(input, options)
        const qa = globalThis.__githubQa
        qa.calls.push(url)
        if (qa.delay) await new Promise((resolve) => setTimeout(resolve, qa.delay))
        if (qa.mode === 'offline') throw new Error('simulated offline')
        if (isPrimary) {
          if (qa.mode === 'archive') return new Response('unavailable', { status: 503 })
          return new Response(
            JSON.stringify({ ...payload.primary, period: new URL(url).searchParams.get('period') }),
          )
        }
        return new Response(payload.archive)
      }
    },
    {
      mode,
      primary: gitstock('weekly', at),
      archive: archive(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' +0000'),
    },
  )
  const w = await app.firstWindow()
  const welcome = w.getByRole('button', { name: '进入工作站' })
  if (
    await welcome
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
  )
    await welcome.click()
  await w.locator('[data-page="github"]').click()
  return { app, w }
}

test('GitHub page uses real IPC for periods, language browsing, safe descriptions and persistent favorites', async () => {
  test.setTimeout(90_000)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-github-e2e-'))
  let app
  try {
    let launched = await launch(dir)
    app = launched.app
    let w = launched.w
    await expect(w.locator('.gh-item')).toHaveCount(2)
    await expect(w.locator('.nav-item[data-page="github"] svg')).toHaveCount(1)
    await expect(w.locator('.gh-snapshot-summary')).toBeVisible()
    await expect(w.locator('.github-discovery input[type="search"]')).toHaveCount(0)
    await expect(w.locator('.github-discovery footer, .github-discovery details')).toHaveCount(0)
    const spacing = await w.locator('.github-discovery').evaluate((el) => {
      const outer = el.closest('.route-canvas').getBoundingClientRect()
      const heading = el.querySelector('.gh-header h2').getBoundingClientRect()
      return { left: heading.left - outer.left, top: heading.top - outer.top }
    })
    expect(spacing.left).toBeGreaterThanOrEqual(24)
    expect(spacing.top).toBeGreaterThanOrEqual(20)
    await expect(action(w, 'period').filter({ hasText: '周榜' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(w.locator('.gh-source')).toContainText('GitStock')
    const captured = await w.locator('.gh-source time').textContent()
    await w.getByLabel('榜内语言', { exact: true }).selectOption('Python')
    await expect(w.locator('.gh-item')).toHaveCount(1)
    await w.getByLabel('榜内语言', { exact: true }).selectOption('')
    await expect(w.locator('.gh-description').last()).toContainText('<img src=x')
    await expect(w.locator('.github-discovery img')).toHaveCount(0)
    const first = w.locator('[data-gh-row="example/research-tool"]')
    await first.focus()
    await w.keyboard.press('Enter')
    await expect(first).toHaveAttribute('aria-expanded', 'true')
    await expect(first).toBeFocused()
    await action(w, 'copy').click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      'https://github.com/example/research-tool',
    )
    await w.getByRole('button', { name: '收藏 example/research-tool', exact: true }).click()
    await expect(
      w.getByRole('button', { name: '取消收藏 example/research-tool', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    for (const label of ['日榜', '月榜']) {
      await action(w, 'period').filter({ hasText: label }).click()
      await expect(action(w, 'period').filter({ hasText: label })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(w.locator('.gh-item')).toHaveCount(2)
      await expect(action(w, 'refresh')).toBeEnabled()
    }
    await action(w, 'period').filter({ hasText: '周榜' }).click()
    // Background updates preserve the current language and keyboard focus.
    await app.evaluate(() => {
      globalThis.__githubQa.delay = 700
    })
    await action(w, 'refresh').click()
    await w.getByLabel('榜内语言', { exact: true }).selectOption('Python')
    await expect(action(w, 'refresh')).toBeEnabled()
    await expect(w.getByLabel('榜内语言', { exact: true })).toHaveValue('Python')
    await expect(w.getByLabel('榜内语言', { exact: true })).toBeFocused()
    await w.getByLabel('榜内语言', { exact: true }).selectOption('')
    await expect(w.locator('.gh-source time')).toHaveText(captured)
    fs.mkdirSync(screenshots, { recursive: true })
    for (const theme of ['dark', 'light']) {
      await w.evaluate((theme) => window.launcher.patchSettings({ theme }), theme)
      await expect(w.locator('body')).toHaveAttribute('data-theme', theme)
      await w.screenshot({ path: path.join(screenshots, `${theme}.png`), animations: 'disabled' })
    }
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setMinimumSize(600, 600)
      win.setSize(760, 760)
    })
    await expect
      .poll(() => w.locator('.github-discovery').evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true)
    await w.screenshot({ path: path.join(screenshots, 'narrow.png'), animations: 'disabled' })
    await app.close()
    app = null
    launched = await launch(dir, 'offline')
    app = launched.app
    w = launched.w
    await expect(w.locator('.gh-item')).toHaveCount(2)
    await action(w, 'refresh').click()
    await expect(w.locator('.gh-state')).toHaveText('待更新')
    await expect(w.locator('.gh-source time')).toHaveText(captured)
    await action(w, 'mode').filter({ hasText: '我的收藏' }).click()
    await expect(w.locator('.gh-item')).toHaveCount(1)
    await expect(w.locator('.gh-item')).toContainText('example/research-tool')
    await w.getByRole('button', { name: '取消收藏 example/research-tool', exact: true }).click()
    await expect(w.getByText('把值得研究的项目留在这里', { exact: true })).toBeVisible()
  } finally {
    if (app) await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('GitHub page identifies the archive fallback and keeps first-load offline errors recoverable', async () => {
  test.setTimeout(60_000)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-github-fallback-'))
  let app
  try {
    const launched = await launch(dir, 'offline')
    app = launched.app
    const w = launched.w
    await expect(w.getByText('暂时连接不上榜单', { exact: true })).toBeVisible()
    await action(w, 'mode').filter({ hasText: '我的收藏' }).click()
    await expect(w.getByText('把值得研究的项目留在这里', { exact: true })).toBeVisible()
    await app.evaluate(() => {
      globalThis.__githubQa.mode = 'archive'
    })
    await action(w, 'mode').filter({ hasText: '趋势榜', exact: true }).click()
    await expect(w.locator('.gh-item')).toHaveCount(2)
    await expect(w.locator('.gh-source')).toContainText('github-hot-hub 开源归档')
    await expect(w.locator('.gh-item').first()).toContainText('example/backup')
    await expect(w.locator('.gh-item').first()).toContainText('+510')
    await expect(w.locator('.gh-source time')).toBeVisible()
  } finally {
    if (app) await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('period controls stay in place throughout delayed and failed updates', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-github-stable-'))
  let app
  try {
    const launched = await launch(dir, 'offline')
    app = launched.app
    const w = launched.w
    await expect(w.getByText('暂时连接不上榜单', { exact: true })).toBeVisible()
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setMinimumSize(600, 600)
      win.setSize(1000, 720)
      globalThis.__githubQa.delay = 180
    })
    // Complete an update after resizing so responsive-window motion is outside this check.
    await action(w, 'refresh').click()
    await expect(action(w, 'refresh')).toBeEnabled()
    await w.evaluate(() => {
      const view = document.querySelector('#view')
      view.scrollTop = 32
      window.__githubFrames = []
      window.__githubSampling = true
      const sample = () => {
        const bar = document.querySelector('.gh-periods')
        window.__githubFrames.push({ top: bar.getBoundingClientRect().top, scroll: view.scrollTop })
        if (window.__githubSampling) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    for (const [label, mode] of [
      ['日榜', 'primary'],
      ['月榜', 'offline'],
      ['周榜', 'primary'],
    ]) {
      await app.evaluate((_electron, mode) => {
        globalThis.__githubQa.mode = mode
      }, mode)
      await action(w, 'period').filter({ hasText: label }).click()
      await expect(action(w, 'refresh')).toBeEnabled()
    }
    const frames = await w.evaluate(() => {
      window.__githubSampling = false
      return window.__githubFrames
    })
    expect(frames.length).toBeGreaterThan(5)
    const tops = frames.map((frame) => frame.top)
    const scrolls = frames.map((frame) => frame.scroll)
    await test.info().attach('period-motion.json', {
      body: Buffer.from(JSON.stringify(frames)),
      contentType: 'application/json',
    })
    expect(
      Math.max(...tops) - Math.min(...tops),
      'the period selector moves while loading',
    ).toBeLessThanOrEqual(1)
    expect(
      Math.max(...scrolls) - Math.min(...scrolls),
      'the page scroll changes while loading',
    ).toBeLessThanOrEqual(1)
  } finally {
    if (app) await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

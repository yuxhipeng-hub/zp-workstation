/* global document, window, Element, HTMLElement, MutationObserver, getComputedStyle, requestAnimationFrame */
import { test, expect } from '@playwright/test'
import { createServer } from 'vite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
let server, url
const screenshots = path.join(os.tmpdir(), 'zp-creation-redesign-qa')
test.beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  url = `http://127.0.0.1:${server.httpServer.address().port}/?page=creation`
  fs.mkdirSync(screenshots, { recursive: true })
})
test.afterAll(async () => server?.close())
async function expectCompact(panel, maxWidth, maxHeight) {
  const box = await panel.boundingBox()
  expect(box.width).toBeLessThanOrEqual(maxWidth)
  expect(box.height).toBeLessThanOrEqual(maxHeight)
  await expect(panel).toHaveCSS('border-top-width', '0px')
}
async function expectExpanded(panel) {
  const box = await panel.boundingBox()
  const parentWidth = await panel.evaluate(
    (node) => node.parentElement.getBoundingClientRect().width,
  )
  expect(box.width).toBeGreaterThanOrEqual(parentWidth - 31)
  expect(box.width).toBeLessThanOrEqual(parentWidth + 1)
  await expect(panel).toHaveCSS('max-height', 'none')
  await expect(panel).toHaveCSS('border-top-width', '0px')
}
test('the seven steps open reading trees, show real results and keep editors secondary', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1703, height: 950 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('.cc-project-trigger').click()
  const video = page.locator('.cc-video').first()
  await video.locator('.cc-video-trigger').click()
  const stage = (id) => video.locator(`.cc-stage[data-id="${id}"]`)
  const edit = (id) =>
    video.locator(`.cc-stage-title > [data-action="cs-edit-step"][data-id="${id}"]`)
  await stage('story').click()
  await expect(page.locator('input, textarea, select').filter({ visible: true })).toHaveCount(0)
  await expect(page.locator('.cc-function-content')).toHaveCount(0)
  await page.getByRole('button', { name: '编辑故事正文', exact: true }).click()
  await page.locator('[data-action="cs-v-enable"]').click()
  await page
    .getByLabel('故事草稿', { exact: true })
    .fill('清晨，阳光掠过桌面。手拿起水杯，停留片刻。\n镜头转向窗外，用安静的日常动作收尾。')
  await page.locator('[data-action="cs-v-save-story"]').click()
  await page.getByRole('button', { name: '返回内容', exact: true }).click()
  await page.getByRole('button', { name: '故事正文', exact: true }).click()
  await expect(page.locator('.cc-function-content')).toContainText('阳光掠过桌面')
  await expect(page.locator('.cc-step-tree')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await edit('shots').click()
  for (const name of ['镜头一', '镜头二']) {
    await page.locator('[data-action="cs-v-add-shot"]').click()
    await page.getByLabel('叙事目的', { exact: true }).fill(name)
    await page.getByLabel('故事内容', { exact: true }).fill(name + '的正文')
    await page.locator('[data-action="cs-v-save-shot"]').click()
    await page.getByLabel('5. 分段动作与时间', { exact: true }).fill(name + '的提示词')
    await page.locator('[data-action="cs-v-save-prompt"]').click()
  }
  await page.getByRole('button', { name: '返回内容', exact: true }).click()
  const shot = page.locator('[data-function^="shot:"]').first()
  await expect(page.locator('[data-function^="shot:"]')).toHaveCount(2)
  await expect(shot.locator('.cc-function-children')).toHaveCount(0)
  await shot.locator(':scope > .cc-function-row .cc-function-trigger').click()
  await shot.getByRole('button', { name: '镜头内容', exact: true }).click()
  await expect(shot.locator('.cc-function-content')).toContainText('镜头一的正文')
  await expect(shot.locator('.cc-function-content')).not.toContainText('镜头二的正文')
  await shot.getByRole('button', { name: '提示词', exact: true }).click()
  await expect(shot.locator('.cc-function-content').last()).toContainText('镜头一的提示词')
  await shot.getByRole('button', { name: '编辑提示词', exact: true }).click()
  await expect(page.getByLabel('5. 分段动作与时间', { exact: true })).toHaveValue('镜头一的提示词')
  await expect(page.getByLabel('叙事目的', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '返回内容', exact: true }).click()
  await edit('design').click()
  const imageId = await page
    .getByLabel('首帧具体版本', { exact: true })
    .locator('option')
    .nth(1)
    .getAttribute('value')
  await page.getByLabel('首帧具体版本', { exact: true }).selectOption(imageId)
  await page.locator('[data-action="cs-v-save-frames"]').click()
  await page.getByRole('button', { name: '返回内容', exact: true }).click()
  await page.getByRole('button', { name: '首尾帧', exact: true }).click()
  const frame = page.locator('[data-function^="frames:"]').first()
  await frame.locator('.cc-function-trigger').click()
  await expect(frame.locator('.cs-preview img')).toBeVisible()
  for (const [id, labels] of [
    ['audit', ['审核结论', '待处理问题']],
    ['generate', ['镜头任务', '生成结果']],
    ['edit', ['剪辑', '声音与字幕', '成片']],
    ['works', ['成片预览', '修改意见', '验收结果']],
  ]) {
    await stage(id).click()
    await expect(page.locator('.cc-step-tree')).toHaveAttribute('data-cs-step', id)
    for (const name of labels)
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await expect(
      page.locator('.cc-step-tree input, .cc-step-tree textarea, .cc-step-tree select'),
    ).toHaveCount(0)
  }
  await stage('story').click()
  const story = page.getByRole('button', { name: '故事正文', exact: true })
  await story.focus()
  await story.press('Escape')
  await expect(story).toHaveAttribute('aria-expanded', 'false')
  await story.press('ArrowRight')
  await expect(story).toHaveAttribute('aria-expanded', 'true')
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    await stage('design').click()
    for (const width of [760, 360]) {
      await page.setViewportSize({ width, height: 800 })
      await expect(frame.locator('.cs-preview img')).toBeVisible()
      expect(
        await page.locator('#view').evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true)
    }
    await stage('story').click()
    await page.setViewportSize({ width: 1703, height: 950 })
    await page.screenshot({
      path: path.join(screenshots, `creation-reading-tree-${theme}.png`),
      fullPage: true,
    })
    for (const width of [760, 360]) {
      await page.setViewportSize({ width, height: 800 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      expect(
        await page.locator('#view').evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true)
    }
  }
  expect(errors).toEqual([])
})

test('focused branches keep tools isolated and storyboard prompts save with their own shot', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('.cc-project-trigger').click()
  const video = page.locator('.cc-video').first()
  await video.locator('.cc-video-trigger').click()
  const stage = (id) =>
    video.locator(`.cc-stage-title > [data-action="cs-edit-step"][data-id="${id}"]`)
  await stage('shots').click()
  await page.locator('[data-action="cs-v-enable"]').click()
  await page.locator('[data-action="cs-v-add-shot"]').click()
  await page.getByLabel('叙事目的', { exact: true }).fill('第一镜头')
  await page.locator('[data-action="cs-v-save-shot"]').click()
  await page.getByLabel('5. 分段动作与时间', { exact: true }).fill('纸球向右滚动')
  await page.locator('[data-action="cs-v-save-prompt"]').click()
  await page.locator('[data-action="cs-v-add-shot"]').click()
  await page.getByLabel('5. 分段动作与时间', { exact: true }).fill('第二镜头未保存草稿')
  await stage('audit').click()
  const panel = page.locator('.cc-workpage')
  await expect(panel.locator('[data-v-form="prompt"]')).toHaveCount(0)
  await expect(panel.locator('[data-action="cs-v-add-shot"]')).toHaveCount(0)
  await panel.locator('[data-action="cs-v-shot"]').first().click()
  await expect(panel.locator('.cv-content')).toContainText('纸球向右滚动')
  await expect(panel.locator('.cv-content')).not.toContainText('第二镜头未保存草稿')
  await stage('shots').click()
  await page.getByLabel('5. 分段动作与时间', { exact: true }).fill('第一镜头未保存草稿')
  await panel.locator('[data-action="cs-v-shot"]').last().click()
  await expect(page.getByLabel('5. 分段动作与时间', { exact: true })).toHaveValue(
    '第二镜头未保存草稿',
  )
  await panel.locator('[data-action="cs-v-shot"]').first().click()
  await expect(page.getByLabel('5. 分段动作与时间', { exact: true })).toHaveValue(
    '第一镜头未保存草稿',
  )
  for (const [theme, width] of [
    ['dark', 1280],
    ['light', 760],
  ]) {
    await page.setViewportSize({ width, height: 950 })
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    for (const id of ['story', 'audit', 'generate', 'design', 'edit', 'works']) {
      await stage(id).click()
      await expect(panel).toHaveAttribute('data-cs-step', id)
      await expect(
        panel.locator(
          '.cs-tabs, .cv-stages, [data-action="cs-open-work"], [data-action="cs-edit"], [data-action="cs-v-add-shot"], [data-action="cs-v-save-prompt"]',
        ),
      ).toHaveCount(0)
      if (!['design', 'edit', 'works'].includes(id))
        await expect(panel.locator('[data-action="cs-import"]')).toHaveCount(0)
      if (id === 'story') {
        await expect(panel.locator('.cv-content-shots, .cv-content-media')).toHaveCount(0)
        await expect(panel.locator('[data-v-status]')).not.toContainText('镜头有当前版本视频')
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
    }
  }
})

test('creation fields and labels have no focus frames and keyboard controls use neutral focus', async ({
  page,
}) => {
  const tokenColor = (control, token) =>
    control.evaluate((node, token) => {
      const hex = getComputedStyle(node).getPropertyValue(token).trim()
      const value = Number.parseInt(hex.slice(1), 16)
      return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`
    }, token)
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('.cc-project-trigger').click()
  await page
    .locator('.cc-video')
    .first()
    .getByRole('button', { name: '制作工具', exact: true })
    .click()
  await page.locator('[data-action="cs-v-enable"]').click()
  await page.locator('[data-action="cs-v-step"][data-id="shots"]').click()
  await page.locator('[data-action="cs-v-add-shot"]').click()
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    for (const step of ['brief', 'story', 'shots', 'design', 'generate', 'edit']) {
      await page.locator(`[data-action="cs-v-step"][data-id="${step}"]`).click()
      if (step === 'generate') await page.getByText('供应商配置与预算', { exact: true }).click()
      const fields = page.locator('.cv-form :is(input, textarea, select):visible')
      for (const field of await fields.all()) {
        await field.focus()
        await expect(field).toBeFocused()
        await expect(field).toHaveCSS('outline-style', 'none')
        await expect(field).toHaveCSS('box-shadow', 'none')
        await expect(field.locator('..')).toHaveCSS('outline-style', 'none')
        await expect(field).toHaveCSS(
          'border-bottom-color',
          await tokenColor(field, '--line-strong'),
        )
      }
      if (step === 'design') {
        const style = page.getByLabel('画风说明与少量样图确认', { exact: true })
        await style.focus()
        await style.scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(screenshots, `creation-neutral-focus-${theme}.png`),
          fullPage: true,
        })
      }
    }
    const button = page.locator('[data-action="cs-v-tools"]')
    await page.keyboard.press('Tab')
    await button.focus()
    expect(await button.evaluate((node) => node.matches(':focus-visible'))).toBe(true)
    await expect(button).toHaveCSS('outline-width', '1px')
    await expect(button).toHaveCSS('outline-color', await tokenColor(button, '--text-secondary'))
  }
})

test('save actions keep their geometry and labels stable, and shots can be deleted down to zero', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('.cc-project-trigger').click()
  const video = page.locator('.cc-video').first()
  await video.locator('.cc-video-trigger').click()
  const stage = (id) =>
    video.locator(`.cc-stage-title > [data-action="cs-edit-step"][data-id="${id}"]`)
  await stage('story').click()
  await page.locator('[data-action="cs-v-enable"]').click()
  const story = page.getByLabel('故事草稿', { exact: true })
  await story.fill('保存时文本和按钮都保持原位。\n'.repeat(8))
  const save = page.locator('[data-action="cs-v-save-story"]')
  const before = await save.boundingBox()
  const expectedHeight = await story.evaluate((node) => node.style.height)
  await page.evaluate(() => {
    window.__saveMotion = []
    window.__saveHeights = []
    const story = document.querySelector('[data-v="story"]')
    new MutationObserver(() => window.__saveHeights.push(story.style.height)).observe(story, {
      attributes: true,
      attributeFilter: ['style'],
    })
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      if (this.closest('.cc-studio')) window.__saveMotion.push(this.className)
      return animate.apply(this, args)
    }
  })
  for (let i = 0; i < 3; i++) {
    await save.click()
    await expect(save).toHaveCSS('transform', 'none')
    await expect.poll(async () => (await save.boundingBox()).y).toBe(before.y)
    expect(await page.evaluate(() => window.__saveMotion)).toEqual([])
    for (const height of await page.evaluate(() => window.__saveHeights))
      expect(height).toBe(expectedHeight)
  }
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    await save.hover()
    await page.mouse.down()
    await expect(save).toHaveCSS('transform', 'none')
    await page.mouse.up()
  }
  await stage('shots').click()
  for (const name of ['镜头一', '镜头二', '镜头三']) {
    await page.locator('[data-action="cs-v-add-shot"]').click()
    await page.getByLabel('叙事目的', { exact: true }).fill(name)
    await page.locator('[data-action="cs-v-save-shot"]').click()
  }
  await page.locator('[data-action="cs-v-shot"]').nth(1).click()
  await page.locator('[data-action="cs-v-delete-shot"]').click()
  await expect(page.locator('.cv-shot-nav [data-action="cs-v-shot"]')).toHaveCount(2)
  await expect(page.getByLabel('叙事目的', { exact: true })).toHaveValue('镜头三')
  await expect(page.locator('.cv-content-shots')).not.toContainText('镜头二')
  await expect(page.locator('.cv-content-shot-heading > span')).toHaveText(['0–5 秒', '5–10 秒'])
  await page.locator('[data-action="cs-shots-toggle"]').click()
  await video.locator('.cc-shot-trigger').last().click()
  await page.locator('[data-action="cs-v-delete-shot"]').click()
  await expect(video.locator('.cc-shot-trigger')).toHaveCount(1)
  await expect(page.getByLabel('叙事目的', { exact: true })).toHaveValue('镜头一')
  await page.locator('[data-action="cs-v-delete-shot"]').click()
  await expect(page.locator('.cv-shot-nav [data-action="cs-v-shot"]')).toHaveCount(0)
  await expect(page.locator('[data-v-form="shot"], [data-v-form="prompt"]')).toHaveCount(0)
  await expect(page.locator('[data-action="cs-v-add-shot"]')).toBeVisible()
  expect(errors).toEqual([])
  await expect(page.locator('.toast.error')).toHaveCount(0)
})

test('shared buttons keep text visible while busy and stay still when pressed across pages', async ({
  page,
}) => {
  for (const route of ['creation', 'settings', 'ppt', 'github', 'news']) {
    await page.goto(url.replace('page=creation', 'page=' + route))
    const welcome = page.getByRole('button', { name: '进入工作站' })
    if (await welcome.isVisible()) await welcome.click()
    const dismiss = page.getByRole('button', { name: '稍后', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()
    await expect(page.locator('#view')).toHaveAttribute('data-page', route)
    const controls = page.locator('#view :is(.button, .icon-button):visible:not(:disabled)')
    const candidate = (await controls.count())
      ? controls.first()
      : page.locator('.topbar .icon-button:visible').first()
    await candidate.evaluate((node) => {
      node.dataset.testFeedback = 'target'
    })
    const button = page.locator('[data-test-feedback="target"]')
    await expect(button).toBeVisible()
    const label = await button.textContent()
    await button.hover()
    await page.mouse.down()
    await expect(button).toHaveCSS('transform', 'none')
    for (const svg of await button.locator('svg').all())
      await expect(svg).toHaveCSS('transform', 'none')
    await page.mouse.move(0, 0)
    await page.mouse.up()
    await button.evaluate((node) => {
      node.classList.add('is-busy')
      node.disabled = true
    })
    await expect(button).toHaveText(label)
    await expect(button).toHaveCSS('opacity', '1')
    expect(await button.evaluate((node) => getComputedStyle(node).color)).not.toBe(
      'rgba(0, 0, 0, 0)',
    )
    for (const child of await button.locator(':scope > *').all())
      await expect(child).toHaveCSS('opacity', '1')
    await button.evaluate((node) => {
      node.classList.remove('is-busy')
      node.disabled = false
    })
  }
})

test('empty project guidance stays centered in the visible canvas', async ({ page }) => {
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('[data-action="cs-group-menu"]').click()
  await page.locator('[data-action="cs-archive"]').click()
  const empty = page.locator('.cc-welcome')
  await expect(empty.getByRole('heading')).toHaveText('让创意从这里展开')
  for (const size of [
    { width: 1703, height: 871 },
    { width: 760, height: 650 },
  ]) {
    await page.setViewportSize(size)
    for (const theme of ['dark', 'light']) {
      await page.evaluate((value) => {
        document.body.dataset.theme = value
      }, theme)
      const canvas = await page.locator('.cc-viewport').boundingBox()
      const box = await empty.boundingBox()
      expect(Math.abs(box.x + box.width / 2 - canvas.x - canvas.width / 2)).toBeLessThan(2)
      expect(Math.abs(box.y + box.height / 2 - canvas.y - canvas.height / 2)).toBeLessThan(2)
      expect(box.x).toBeGreaterThanOrEqual(canvas.x)
      expect(box.y).toBeGreaterThanOrEqual(canvas.y)
      expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width)
      expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height)
    }
  }
  await empty.getByRole('button', { name: '创建项目', exact: true }).click()
  await expect(empty).toHaveCount(0)
  await expect(page.locator('.cc-composer')).toBeVisible()
  await page.getByLabel('项目名称', { exact: true }).fill('居中检查后创建的项目')
  await page.locator('[data-action="cs-save-project"]').click()
  await expect(page.locator('.cc-project-trigger')).toContainText('居中检查后创建的项目')
})
test('video details use the available canvas width and scroll with the page', async ({ page }) => {
  await page.setViewportSize({ width: 1703, height: 871 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('.cc-project-trigger').click()
  const video = page.locator('.cc-video').first()
  await video.getByRole('button', { name: '制作工具', exact: true }).click()
  await page.locator('[data-action="cs-v-enable"]').click()
  await page.locator('[data-action="cs-v-step"][data-id="edit"]').click()
  const panel = page.locator('.cc-workpage')
  await expect(panel.locator('[data-v-form="export"]')).toHaveCSS('row-gap', '10px')
  await expect(panel.getByLabel('输出宽度', { exact: true }).locator('..')).toHaveCSS(
    'margin-bottom',
    '0px',
  )
  for (const size of [
    { width: 1703, height: 871 },
    { width: 974, height: 871 },
    { width: 600, height: 650 },
  ]) {
    await page.setViewportSize(size)
    const parent = await video.boundingBox()
    const box = await panel.boundingBox()
    expect(box.width).toBeGreaterThan(parent.width * 0.9)
    expect(box.x + box.width).toBeLessThanOrEqual(parent.x + parent.width + 1)
    await expect(panel).toHaveCSS('max-height', 'none')
    expect(await panel.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    const width = await panel.getByLabel('输出宽度', { exact: true }).boundingBox()
    const height = await panel.getByLabel('输出高度', { exact: true }).boundingBox()
    const editorWidth = (await page.locator('.cv-detail-editor').boundingBox()).width
    if (editorWidth >= 421) expect(Math.abs(width.y - height.y)).toBeLessThan(2)
    else expect(height.y).toBeGreaterThan(width.y)
  }
  await page.setViewportSize({ width: 1703, height: 871 })
  await panel.locator('[data-action="cs-tab"][data-id="overview"]').click()
  await expect(panel.locator('.cs-work')).toHaveCSS('grid-template-columns', /\d+.* \d+/)
  await page.screenshot({
    path: path.join(screenshots, 'creation-wide-detail.png'),
    fullPage: true,
  })
})
test('story editing is compact and shows only its saved story alongside it', async ({ page }) => {
  await page.setViewportSize({ width: 1703, height: 871 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('.cc-project-trigger').click()
  const video = page.locator('.cc-video').first()
  await video.locator('.cc-video-trigger').click()
  await video.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="shots"]').click()
  await page.locator('[data-action="cs-v-enable"]').click()
  await page.locator('[data-action="cs-v-add-shot"]').click()
  await page.getByLabel('叙事目的', { exact: true }).fill('清晨的第一杯水')
  await page.getByLabel('故事内容', { exact: true }).fill('光线落在杯沿，手拿起杯子。')
  await page.locator('[data-action="cs-v-save-shot"]').click()
  await video.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="story"]').click()
  const story = page.getByLabel('故事草稿', { exact: true })
  await expect(story).toBeVisible()
  await expect(page.getByText('与 Codex 导演讨论', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('创作意图或修改要求', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '发送给导演', exact: true })).toHaveCount(0)
  await expect(page.locator('[data-action="cs-v-connect"]')).toHaveCount(0)
  expect((await story.boundingBox()).height).toBeLessThanOrEqual(36)
  expect((await story.boundingBox()).width).toBeLessThanOrEqual(520)
  expect(await story.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true)
  const context = page.getByRole('complementary', { name: '制作内容' })
  await expect(context.getByText('光线落在杯沿，手拿起杯子。', { exact: true })).toHaveCount(0)
  await expect(context.locator('.cs-preview, .cv-content-shots')).toHaveCount(0)
  await story.fill('清晨端起水杯。')
  await page.locator('[data-action="cs-v-save-story"]').click()
  await expect(context.getByText('清晨端起水杯。', { exact: true })).toBeVisible()
  const editor = await page.locator('.cv-detail-editor').boundingBox()
  expect((await context.boundingBox()).x).toBeGreaterThanOrEqual(editor.x + editor.width)
  await story.fill('一段较长的故事。\n'.repeat(30))
  expect((await story.boundingBox()).height).toBeGreaterThan(36)
  expect((await story.boundingBox()).height).toBeLessThanOrEqual(180)
  await story.fill('杯沿映着晨光。')
  expect((await story.boundingBox()).height).toBeLessThanOrEqual(36)
  await video.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="audit"]').click()
  await page.getByText('审核模型与记录', { exact: true }).click()
  await expect(page.getByRole('button', { name: '连接审核模型', exact: true })).toBeVisible()
  await video.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="story"]').click()
  await expect(story).toHaveValue('杯沿映着晨光。')
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => {
      document.body.dataset.theme = value
    }, theme)
    await page.screenshot({
      path: path.join(screenshots, `creation-story-content-${theme}.png`),
      fullPage: true,
    })
  }
  await page.setViewportSize({ width: 600, height: 700 })
  const narrowEditor = await page.locator('.cv-detail-editor').boundingBox()
  expect((await context.boundingBox()).y).toBeGreaterThanOrEqual(
    narrowEditor.y + narrowEditor.height,
  )
  await expect(context.locator('[data-action="cs-v-inspect-shot"]')).toHaveCount(0)
  await video.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="shots"]').click()
  await expect(page.getByLabel('叙事目的', { exact: true })).toHaveValue('清晨的第一杯水')
})
test('quiet save actions, themed stage choices and transparent scrollbar tracks remain functional', async ({
  page,
}) => {
  await page.setViewportSize({ width: 974, height: 871 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  const notice = page.getByRole('button', { name: '收起任务', exact: true })
  if (await notice.isVisible()) await notice.click()
  await page.getByRole('button', { name: '新建视频', exact: true }).click()
  const editor = page.locator('.cc-composer')
  const save = editor.locator('[data-action="cs-save-project"]')
  await expect(save).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await editor.locator('.cc-extra > summary').click()
  const trigger = page.getByRole('button', { name: '制作阶段', exact: true })
  const picker = page.getByRole('listbox', { name: '制作阶段选项', exact: true })
  await trigger.click()
  await expect(picker.getByRole('option')).toHaveText([
    '选题',
    '简报',
    '视觉打样',
    '开发',
    '成片',
    '验收',
    '发布',
    '复盘',
  ])
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(trigger).toContainText('复盘')
  await expect(editor.locator('[data-cs-field="stage"]')).toHaveValue('复盘')
  await trigger.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(editor).toBeVisible()
  await expect(trigger).toContainText('复盘')
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    await expect(save).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await trigger.click()
    await expect(picker).toBeVisible()
    await expect(picker).toHaveCSS('border-top-width', '0px')
    const menu = await picker.boundingBox()
    expect(menu.x).toBeGreaterThanOrEqual(16)
    expect(menu.x + menu.width).toBeLessThanOrEqual(958)
    expect(menu.y + menu.height).toBeLessThanOrEqual(855)
    await page.screenshot({
      path: path.join(screenshots, `creation-stage-picker-${theme}.png`),
      fullPage: true,
    })
    await picker.getByRole('option', { name: '成片', exact: true }).click()
  }
  await page.setViewportSize({ width: 360, height: 650 })
  await trigger.click()
  await expect(picker).toBeVisible()
  const narrowMenu = await picker.boundingBox()
  expect(narrowMenu.x).toBeGreaterThanOrEqual(16)
  expect(narrowMenu.x + narrowMenu.width).toBeLessThanOrEqual(344)
  expect(narrowMenu.y + narrowMenu.height).toBeLessThanOrEqual(634)
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 974, height: 871 })
  await editor.locator('[data-action="cs-cancel-edit"]').click()
  await page.getByRole('button', { name: '新建视频', exact: true }).click()
  await editor.locator('.cc-extra > summary').click()
  await expect(trigger).toContainText('成片')
  await page.getByLabel('视频名称', { exact: true }).fill('阶段选择验证')
  await save.click()
  await expect(editor).toHaveCount(0)
  const created = page
    .locator('.cc-video')
    .filter({ has: page.getByRole('button', { name: '阶段选择验证', exact: true }) })
  await expect(created.locator('.cc-video-object > small')).toHaveText(
    '手动阶段：成片 · 0 个作品版本',
  )
  const example = page
    .locator('.cc-video')
    .filter({ has: page.getByRole('button', { name: '晨光里的日常', exact: true }) })
  await expect(example.locator('.cc-video-object > small')).toHaveText(
    '手动阶段：视觉打样 · 1 个作品版本',
  )
  await example.locator('.cc-video-trigger').click()
  await example.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="story"]').click()
  await page.locator('[data-action="cs-v-enable"]').click()
  await page.setViewportSize({ width: 974, height: 650 })
  const panel = page.locator('.cc-workpage')
  expect(await panel.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
  for (const node of [panel, page.locator('.cc-viewport')]) {
    expect(await node.evaluate((el) => getComputedStyle(el).scrollbarColor)).toContain(
      'rgba(0, 0, 0, 0)',
    )
  }
  await page.evaluate(() => {
    document.body.dataset.theme = 'dark'
  })
  await page.screenshot({
    path: path.join(screenshots, 'creation-transparent-scrollbar.png'),
    fullPage: true,
  })
})

test('creation uses the application dot surface continuously through its header and tree', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1703, height: 871 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  const notice = page.getByRole('button', { name: '收起任务', exact: true })
  if (await notice.isVisible()) await notice.click()
  await page.locator('.cc-project-trigger').click()
  await page.locator('.cc-video-trigger').first().click()
  const { default: sharp } = await import('sharp')
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    const layers = await page.evaluate(() =>
      [
        '.shell',
        '.topbar',
        '#view',
        '.cc-studio',
        '.cc-toolbar',
        '.cc-viewport',
        '.cc-plane',
        '.cc-projects',
        '.cc-project',
      ].map((selector) => {
        const style = getComputedStyle(document.querySelector(selector))
        return { selector, color: style.backgroundColor, image: style.backgroundImage }
      }),
    )
    for (const layer of layers) {
      expect(layer.color, layer.selector).toBe('rgba(0, 0, 0, 0)')
      expect(layer.image, layer.selector).toBe('none')
    }
    expect(
      await page.locator('#app').evaluate((node) => getComputedStyle(node).backgroundImage),
    ).toContain('radial-gradient')
    const buffer = await page.screenshot({
      path: path.join(screenshots, `creation-main-background-${theme}.png`),
      fullPage: true,
    })
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const scale = info.width / 1703
    const pixel = (x, y) => {
      const index = (Math.round(y * scale) * info.width + Math.round(x * scale)) * 4
      return [...data.subarray(index, index + 3)]
    }
    // These blank points lie on the same global dot phase in the app header, toolbar, tree and lower canvas.
    const dot = pixel(749, 23)
    for (const y of [89, 221, 749]) expect(pixel(749, y)).toEqual(dot)
    expect(dot).not.toEqual(pixel(755, 29))
  }
  await page.getByRole('button', { name: 'GitHub 发现', exact: true }).click()
  expect(
    await page.locator('.topbar').evaluate((node) => getComputedStyle(node).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)')
})

test('empty requirements start at one line and grow, restore drafts, and shrink with their content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 974, height: 871 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  const notice = page.getByRole('button', { name: '收起任务', exact: true })
  if (await notice.isVisible()) await notice.click()
  await page.getByRole('button', { name: '新建视频', exact: true }).click()
  const field = page.getByLabel('创作要求', { exact: true })
  const initial = (await field.boundingBox()).height
  expect(initial).toBeLessThanOrEqual(36)
  await expect(field).toHaveAttribute('rows', '1')
  await field.fill('一行内容')
  expect(Math.abs((await field.boundingBox()).height - initial)).toBeLessThan(1)
  const draft = '第一行：自然光\n第二行：日常场景\n第三行：安静的节奏'
  await field.fill(draft)
  expect((await field.boundingBox()).height).toBeGreaterThan(initial + 30)
  expect(await field.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
  await page.locator('[data-action="cs-cancel-edit"]').click()
  await page.getByRole('button', { name: '新建视频', exact: true }).click()
  await expect(field).toHaveValue(draft)
  expect((await field.boundingBox()).height).toBeGreaterThan(initial + 30)
  await page.screenshot({
    path: path.join(screenshots, 'content-sized-requirements.png'),
    fullPage: true,
  })
  await field.fill('自然光里的日常片段。'.repeat(40))
  expect((await field.boundingBox()).height).toBeGreaterThan(initial)
  expect((await field.boundingBox()).height).toBeLessThanOrEqual(112)
  expect(await field.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true)
  await expect(field).toHaveCSS('resize', 'none')
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    await page.setViewportSize({ width: 360, height: 650 })
    await field.fill('')
    expect(Math.abs((await field.boundingBox()).height - initial)).toBeLessThan(1)
    await field.fill(draft)
    expect((await field.boundingBox()).height).toBeGreaterThan(initial)
    expect((await field.boundingBox()).height).toBeLessThanOrEqual(112)
  }
})

test('video requirements use a small editor and textareas have no resize grips', async ({
  page,
}) => {
  await page.setViewportSize({ width: 974, height: 871 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  const notice = page.getByRole('button', { name: '收起任务', exact: true })
  if (await notice.isVisible()) await notice.click()
  await page.getByRole('button', { name: '新建视频', exact: true }).click()
  const editor = page.locator('.cc-composer')
  await expectCompact(editor, 320, 260)
  expect(await editor.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
  await page.getByLabel('视频名称', { exact: true }).fill('紧凑需求验证')
  await page
    .getByLabel('创作要求', { exact: true })
    .fill('自然光的生活片段\n竖版短视频，保持安静的节奏')
  await editor.locator('.cc-extra > summary').click()
  await page.getByLabel('一句话目标', { exact: true }).fill('展现日常质感')
  await page.getByRole('button', { name: '制作阶段', exact: true }).click()
  await page.getByRole('option', { name: '简报', exact: true }).click()
  await expectCompact(editor, 320, 312)
  await expect(editor.locator('[data-action="cs-save-project"]')).toBeInViewport()
  expect(
    await page
      .locator('textarea')
      .evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).resize === 'none')),
  ).toBe(true)
  await page.screenshot({
    path: path.join(screenshots, 'compact-video-requirements.png'),
    fullPage: true,
  })
  await editor.locator('[data-action="cs-save-project"]').click()
  await expect(editor).toHaveCount(0)
  const video = page
    .locator('.cc-video')
    .filter({ has: page.getByRole('button', { name: '紧凑需求验证', exact: true }) })
  await video.locator('.cc-video-object [data-action="cs-edit"]').click()
  await expect(page.getByLabel('视频名称', { exact: true })).toHaveValue('紧凑需求验证')
  await expect(page.getByLabel('创作要求', { exact: true })).toHaveValue(
    '自然光的生活片段\n竖版短视频，保持安静的节奏',
  )
  await expect(page.getByLabel('一句话目标', { exact: true })).toHaveValue('展现日常质感')
  await expect(page.locator('.cc-composer [data-cs-field="stage"]')).toHaveValue('简报')
  await editor.locator('[data-action="cs-cancel-edit"]').click()
  await video.locator('.cc-video-trigger').click()
  await video.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="design"]').click()
  await page.locator('[data-action="cs-v-enable"]').click()
  expect(
    await page
      .locator('textarea')
      .evaluateAll(
        (nodes) =>
          nodes.length >= 5 && nodes.every((node) => getComputedStyle(node).resize === 'none'),
      ),
  ).toBe(true)
  await page.getByRole('button', { name: 'PPT 工作室', exact: true }).click()
  await expect(page.locator('#ppt-message')).toBeVisible()
  await expect(page.locator('#ppt-message')).toHaveCSS('resize', 'none')
})

test('project popup is positioned before it becomes visible and expanded surfaces have no border', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__menuFirstPaint = []
    const show = HTMLElement.prototype.showPopover
    HTMLElement.prototype.showPopover = function (...args) {
      const result = show.apply(this, args)
      if (this.classList.contains('cc-group-menu')) {
        window.__menuFirstPaint.push(getComputedStyle(this).visibility)
      }
      return result
    }
  })
  await page.setViewportSize({ width: 1703, height: 871 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  const notice = page.getByRole('button', { name: '收起任务', exact: true })
  if (await notice.isVisible()) await notice.click()
  await page.locator('.cc-project-trigger').click()
  await page.locator('.cc-video-trigger').first().click()
  const trigger = page.getByRole('button', { name: '项目管理', exact: true })
  const popup = page.getByRole('menu', { name: '项目操作', exact: true })
  for (let i = 0; i < 3; i++) {
    await trigger.click()
    await expect(popup).toBeVisible()
    expect(await page.evaluate(() => window.__menuFirstPaint)).toEqual(Array(i + 1).fill('hidden'))
    await expect(popup).toHaveCSS('border-top-width', '0px')
    expect(
      await page.evaluate(async () => {
        const menu = document.querySelector('.cc-group-menu')
        const button = document.querySelector('[data-action="cs-group-menu"]')
        const frames = []
        for (let frame = 0; frame < 8; frame++) {
          await new Promise(requestAnimationFrame)
          const actual = menu.getBoundingClientRect(),
            anchor = button.getBoundingClientRect()
          frames.push(
            Math.abs(actual.x - anchor.x) < 2 && Math.abs(actual.y - anchor.bottom - 8) < 2,
          )
        }
        return frames.every(Boolean)
      }),
    ).toBe(true)
    if (i === 2)
      await page.screenshot({
        path: path.join(screenshots, 'borderless-project-menu.png'),
        fullPage: true,
      })
    await page.keyboard.press('Escape')
    await expect(popup).toHaveCount(0)
  }
  const video = page.locator('.cc-video').first()
  await video.locator('.cc-video-object [data-action="cs-edit"]').click()
  await expectCompact(page.locator('.cc-composer'), 420, 380)
  await video.locator('.cc-video-object [data-action="cs-edit"]').click()
  await video.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="audit"]').click()
  await expectExpanded(page.locator('.cc-workpage'))
})

test('outline omits duplicate captions and project actions use an anchored accessible popup', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1703, height: 871 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  const taskNotice = page.getByRole('button', { name: '收起任务', exact: true })
  if (await taskNotice.isVisible()) await taskNotice.click()
  await page.locator('.cc-project-trigger').click()
  await page.locator('.cc-video-trigger').first().click()
  await expect(page.locator('.cc-tree-columns')).toHaveCount(0)
  await expect(page.getByText('项目 · 视频 · 制作步骤', { exact: true })).toHaveCount(0)
  await expect(page.locator('.cc-stage-owner')).toHaveCount(7)
  await expect(page.locator('.cc-stage-status')).toHaveCount(7)
  const trigger = page.getByRole('button', { name: '项目管理', exact: true })
  const before = await page.locator('.cc-video').first().boundingBox()
  await trigger.click()
  const popup = page.getByRole('menu', { name: '项目操作', exact: true })
  await expect(popup).toBeVisible()
  await expect(popup.getByRole('menuitem')).toHaveCount(3)
  await expect(popup.getByText('收起', { exact: true })).toHaveCount(0)
  const bounds = await popup.boundingBox(),
    anchor = await trigger.boundingBox()
  expect(Math.abs(bounds.x - anchor.x)).toBeLessThan(2)
  expect(Math.abs(bounds.y - anchor.y - anchor.height - 8)).toBeLessThan(2)
  expect((await page.locator('.cc-video').first().boundingBox()).y).toBe(before.y)
  await expect(popup.getByRole('menuitem', { name: '项目需求', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(popup.getByRole('menuitem', { name: '移除项目记录', exact: true })).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await expect(popup.getByRole('menuitem', { name: '归档项目', exact: true })).toBeFocused()
  await page.screenshot({ path: path.join(screenshots, 'project-menu-dark.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.press('Enter')
  await expect(popup).toBeVisible()
  await page.getByRole('heading', { name: '项目大纲', exact: true }).click()
  await expect(popup).toHaveCount(0)
  await trigger.click()
  await popup.getByRole('menuitem', { name: '项目需求', exact: true }).click()
  await expect(popup).toHaveCount(0)
  await expect(page.locator('.cc-composer')).toBeVisible()
  await expect(page.getByText('保存后可随时展开调整', { exact: true })).toHaveCount(0)
  await page.locator('[data-action="cs-cancel-edit"]').click()
  await page.locator('[data-action="cs-zoom-out"]').click()
  await trigger.click()
  await expect(popup).toBeVisible()
  const zoomedMenu = await popup.boundingBox(),
    zoomedAnchor = await trigger.boundingBox()
  expect(Math.abs(zoomedMenu.x - zoomedAnchor.x)).toBeLessThan(2)
  expect(Math.abs(zoomedMenu.y - zoomedAnchor.y - zoomedAnchor.height - 8)).toBeLessThan(2)
  await page.keyboard.press('Escape')
  await page.locator('[data-action="cs-reset-view"]').click()
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    await page.setViewportSize({ width: 360, height: 650 })
    await trigger.click()
    await expect(popup).toBeVisible()
    const narrow = await popup.boundingBox()
    expect(narrow.x).toBeGreaterThanOrEqual(16)
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(344)
    expect(narrow.y + narrow.height).toBeLessThanOrEqual(634)
    await page.keyboard.press('Escape')
  }
})

test('actions stay beside their object, panels toggle directly below, and view controls float in the corner', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1703, height: 871 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  const taskNotice = page.getByRole('button', { name: '收起任务', exact: true })
  if (await taskNotice.isVisible()) await taskNotice.click()
  await expect(page.getByText('拖动空白处平移 · 滚动浏览', { exact: true })).toHaveCount(0)
  await expect(page.locator('footer.cc-canvas-tools')).toHaveCount(0)
  const tools = page.locator('.cc-canvas-tools')
  const controls = await tools.boundingBox()
  expect(1703 - controls.x - controls.width).toBeLessThanOrEqual(24)
  expect(871 - controls.y - controls.height).toBeLessThanOrEqual(24)
  expect(controls.width).toBeLessThan(260)
  const root = page.locator('.cc-project').first()
  const trigger = root.locator('.cc-project-trigger')
  const menu = root.locator('.cc-root [data-action="cs-group-menu"]')
  const label = await trigger.boundingBox()
  const action = await menu.boundingBox()
  expect(action.x - label.x - label.width).toBeLessThan(80)
  await menu.click()
  await expect(root.locator('.cc-group-menu')).toBeVisible()
  await menu.click()
  await expect(root.locator('.cc-group-menu')).toHaveCount(0)
  const plus = root.locator('.cc-root [data-action="cs-new-video"]')
  await plus.click()
  const composer = root.locator(':scope > .cc-composer')
  await expect(composer).toBeVisible()
  const header = await root.locator('.cc-root').boundingBox()
  expect((await composer.boundingBox()).y - header.y - header.height).toBeLessThanOrEqual(14)
  await composer.getByLabel('创作要求', { exact: true }).fill('收起后保留的视频草稿')
  await plus.click()
  await expect(composer).toHaveCount(0)
  await plus.click()
  await expect(composer.getByLabel('创作要求', { exact: true })).toHaveValue('收起后保留的视频草稿')
  await plus.click()
  await menu.click()
  await root.locator('.cc-group-menu [data-action="cs-edit"]').click()
  await expect(composer).toBeVisible()
  await menu.click()
  await expect(composer).toHaveCount(0)
  const video = root.locator('.cc-video').first()
  await video.locator('.cc-video-trigger').click()
  const requirement = video.locator('.cc-video-object [data-action="cs-edit"]')
  await requirement.click()
  await expect(video.locator(':scope > .cc-composer')).toBeVisible()
  await requirement.click()
  await expect(page.locator('.cc-composer')).toHaveCount(0)
  const fullTools = video.locator('.cc-video-object [data-action="cs-open-work"]')
  await fullTools.click()
  const work = video.locator(':scope > .cc-workpage')
  await expect(work).toBeVisible()
  const row = await video.locator('.cc-video-object').boundingBox()
  expect((await work.boundingBox()).y - row.y - row.height).toBeLessThanOrEqual(14)
  await fullTools.click()
  await expect(work).toHaveCount(0)
  await page.screenshot({
    path: path.join(screenshots, 'local-actions-floating-view.png'),
    fullPage: true,
  })
})

test('work details scroll with the canvas while compact requirement editors retain scroll chaining', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 700 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('[data-action="cs-toggle"]').click()
  await page.locator('.cc-video-trigger').first().click()
  await page.locator('.cc-video-trigger').last().click()
  const video = page.locator('.cc-video').first()
  const viewport = page.locator('.cc-viewport')
  await video.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="audit"]').click()
  const workpage = page.locator('.cc-workpage')
  expect(await workpage.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
  await workpage.hover({ position: { x: 20, y: 80 } })
  const shortBefore = await viewport.evaluate((node) => node.scrollTop)
  await page.mouse.wheel(0, 140)
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(shortBefore)
  expect(await workpage.evaluate((node) => node.scrollTop)).toBe(0)

  await viewport.evaluate((node) => {
    node.scrollTop = 0
  })
  await page.locator('[data-action="cs-v-enable"]').click()
  await video.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="design"]').click()
  expect(await workpage.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
  await workpage.hover({ position: { x: 20, y: 80 } })
  const detailsBefore = await viewport.evaluate((node) => node.scrollTop)
  await page.mouse.wheel(0, 140)
  await expect
    .poll(() => viewport.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(detailsBefore)
  expect(await workpage.evaluate((node) => node.scrollTop)).toBe(0)

  await viewport.evaluate((node) => {
    node.scrollTop = 0
  })
  await video.locator('[data-action="cs-edit"]').first().click()
  const composer = page.locator('.cc-composer')
  await composer.locator('.cc-extra > summary').click()
  // The redesigned editor fits its fields at regular heights; exercise overflow in a short window.
  await page.setViewportSize({ width: 1400, height: 420 })
  expect(await composer.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true)
  await composer.hover({ position: { x: 5, y: 80 } })
  const composerBefore = await viewport.evaluate((node) => node.scrollTop)
  await page.mouse.wheel(0, 140)
  await expect.poll(() => composer.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  expect(await viewport.evaluate((node) => node.scrollTop)).toBe(composerBefore)
  await composer.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await page.mouse.wheel(0, 140)
  await expect
    .poll(() => viewport.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(composerBefore)
})

test('wide canvas centers the outline and shares available width with its branches', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2200, height: 1000 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('[data-action="cs-toggle"]').click()
  await page.locator('.cc-video-trigger').first().click()
  const viewport = await page.locator('.cc-viewport').boundingBox()
  const outline = await page.locator('.cc-projects').boundingBox()
  const roles = await page.locator('.cc-roles').boundingBox()
  expect(outline.width).toBeGreaterThanOrEqual(1400)
  expect(Math.abs(outline.x + outline.width / 2 - viewport.x - viewport.width / 2)).toBeLessThan(2)
  expect(roles.width).toBeGreaterThan(outline.width * 0.9)
  await page.screenshot({
    path: path.join(screenshots, 'wide-centered-outline.png'),
    fullPage: true,
  })
})

test('opening a lower branch preserves the canvas viewport without automatic positioning', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__creationAutoScroll = 0
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (...args) {
      if (this.closest('.cc-studio')) window.__creationAutoScroll++
      return original.apply(this, args)
    }
  })
  await page.setViewportSize({ width: 1400, height: 560 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('[data-action="cs-toggle"]').click()
  await page.locator('.cc-video-trigger').first().click()
  await page.locator('.cc-video-trigger').last().click()
  await page
    .locator('.cc-studio')
    .evaluate((node) =>
      Promise.all(
        node
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      ),
    )
  const viewport = page.locator('.cc-viewport')
  await viewport.evaluate((node) => {
    node.scrollTop = 180
  })
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const before = await viewport.evaluate((node) => ({ top: node.scrollTop, left: node.scrollLeft }))
  expect(before.top).toBeGreaterThan(0)
  await page
    .locator('.cc-video')
    .first()
    .locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="works"]')
    .click()
  await expect(page.locator('.cc-workpage')).toHaveAttribute('data-cs-step', 'works')
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  expect(await page.evaluate(() => window.__creationAutoScroll)).toBe(0)
  expect(
    await viewport.evaluate((node) => ({ top: node.scrollTop, left: node.scrollLeft })),
  ).toEqual(before)
  await page.locator('.cc-stage[data-id="works"]').first().press('Enter')
  await expect(page.locator('.cc-workpage')).toHaveCount(0)
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  expect(
    await viewport.evaluate((node) => ({ top: node.scrollTop, left: node.scrollLeft })),
  ).toEqual(before)
})

test('canvas expands projects and videos, isolates drafts, collapses saved requirements and keeps workflows accessible', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1500, height: 1000 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  const strip = page.getByRole('button', { name: '收起任务', exact: true })
  if (await strip.isVisible()) await strip.click()
  await expect(page.locator('[data-route-canvas]')).toHaveCount(0)
  await expect(page.locator('.cc-video')).toHaveCount(0)
  await page.locator('[data-action="cs-toggle"]').click()
  await expect(page.locator('.cc-cover img')).toBeVisible()
  await expect(page.locator('.cc-video')).toHaveCount(2)
  await expect(page.locator('.cc-stage')).toHaveCount(0)
  await page.locator('[data-action="cs-project"]').first().click()
  await expect(page.getByRole('region', { name: '视频工作区' })).toHaveCount(0)
  await expect(page.locator('.cc-stage')).toHaveCount(7)
  await expect(page.locator('.cc-roles')).toContainText('Codex 审核')
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    await page.screenshot({ path: path.join(screenshots, `${theme}-canvas.png`), fullPage: true })
  }
  await page.locator('[data-action="cs-toggle"]').click()
  await expect(page.locator('.cc-video')).toHaveCount(0)
  await page.locator('[data-action="cs-toggle"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.cc-video')).toHaveCount(2)
  await page.locator('.cc-video-object [data-action="cs-edit"]').first().click()
  await expectCompact(page.locator('.cc-composer'), 420, 380)
  await page.getByLabel('创作要求', { exact: true }).fill('未保存的晨光要求')
  await page.locator('[data-action="cs-cancel-edit"]').click()
  await page.locator('.cc-video-object [data-action="cs-edit"]').last().click()
  await expect(page.getByLabel('创作要求', { exact: true })).toHaveValue('')
  await page.locator('[data-action="cs-cancel-edit"]').click()
  await page.locator('.cc-video-object [data-action="cs-edit"]').first().click()
  await expect(page.getByLabel('创作要求', { exact: true })).toHaveValue('未保存的晨光要求')
  await page.locator('[data-action="cs-save-project"]').click()
  await expect(page.locator('.cc-composer')).toHaveCount(0)
  await page.locator('[data-action="cs-open-work"]').first().click()
  await page.locator('[data-action="cs-v-enable"]').click()
  await expectExpanded(page.locator('.cc-workpage'))
  await expect(page.locator('.cc-workpage .cs-project-heading h2')).toBeInViewport()
  await expect(page.getByRole('group', { name: '内容与受众' })).toBeVisible()
  await expect(page.getByLabel('一句话创意', { exact: true })).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  )
  await expect(page.getByLabel('一句话创意', { exact: true })).toHaveCSS('border-radius', '0px')
  await expect(page.getByLabel('配乐要求', { exact: true })).toBeHidden()
  await page.getByLabel('一句话创意', { exact: true }).fill('跟随杯口升起的蒸汽')
  await page.locator('[data-action="cs-v-save-brief"]').click()
  await expect(page.locator('.cc-workpage')).toHaveCount(0)
  await expect(page.locator('.cc-video-trigger').first()).toBeInViewport()
  await page.locator('[data-action="cs-open-work"]').first().click()
  for (const step of ['story', 'shots', 'design', 'audit', 'generate', 'edit', 'brief']) {
    const button = page.locator(`[data-action="cs-v-step"][data-id="${step}"]`)
    await button.click()
    await expect(button).toHaveAttribute('aria-current', 'step')
    await expect(button).toBeFocused()
  }
  await expect(page.getByLabel('一句话创意', { exact: true })).toHaveValue('跟随杯口升起的蒸汽')
  await page.screenshot({ path: path.join(screenshots, 'light-expanded.png'), fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of [1024, 760, 600, 360]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(await page.locator('#view').evaluate((x) => x.scrollWidth <= x.clientWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1500, height: 1000 })
  await page.locator('[data-action="cs-close-work"]').click()
  await page.locator('[data-action="cs-new"]').click()
  await expectCompact(page.locator('.cc-composer'), 420, 380)
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    await expect(page.getByLabel('项目名称', { exact: true })).toBeFocused()
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveCSS('outline-style', 'none')
    await expect(page.locator('.cc-title-field')).toHaveCSS('outline-style', 'none')
  }
  await page.screenshot({ path: path.join(screenshots, 'project-name-focus.png'), fullPage: true })
  await page.getByLabel('创作要求', { exact: true }).fill('保存失败时保留输入')
  await page.locator('[data-action="cs-save-project"]').click()
  await expect(page.locator('.cc-composer')).toBeVisible()
  await expect(page.getByLabel('创作要求', { exact: true })).toHaveValue('保存失败时保留输入')
  const name = '这是核对换行与交互的长项目名称'.repeat(4)
  await page.getByLabel('项目名称', { exact: true }).fill(name)
  await page.locator('[data-action="cs-save-project"]').click()
  const group = page
    .locator('.cc-project')
    .filter({ has: page.locator('.cc-project-trigger strong').filter({ hasText: name }) })
  await expect(group.locator('.cc-project-trigger strong')).toHaveText(name)
  await group.locator('[data-action="cs-new-video"]').first().click()
  await page.getByLabel('视频名称', { exact: true }).fill('新视频 A')
  await page.getByLabel('创作要求', { exact: true }).fill('在清晨拍摄')
  await page.locator('[data-action="cs-save-project"]').click()
  await expect(group.locator('.cc-video-trigger strong')).toHaveText('新视频 A')
  await expect(page.locator('.cc-composer')).toHaveCount(0)
  await group.locator('[data-action="cs-group-menu"]').click()
  await group.locator('[data-action="cs-archive"]').click()
  await expect(group).toHaveCount(0)
  await page.locator('[data-action="cs-archived-list"]').click()
  await expect(group.locator('.cc-video-trigger strong')).toHaveText('新视频 A')
  await group.locator('[data-action="cs-group-menu"]').click()
  await group.locator('[data-action="cs-archive"]').click()
  await page.locator('[data-action="cs-active-list"]').click()
  await expect(group.locator('.cc-video-trigger strong')).toHaveText('新视频 A')
  await page.locator('[data-action="cs-zoom-out"]').click()
  await expect(page.locator('[data-cc-zoom]')).toHaveText('90%')
  await page.locator('[data-action="cs-reset-view"]').click()
  await expect(page.locator('[data-cc-zoom]')).toHaveText('100%')
  expect(errors).toEqual([])
})

test('manual step editors stay scoped and preserve canvas media during rapid switches and polling', async ({
  page,
}) => {
  test.setTimeout(45000)
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto(url)
  await page.evaluate(() => {
    window.__creationMotion = []
    const animate = Element.prototype.animate
    Element.prototype.animate = function (frames, options) {
      if (this.closest('.cc-studio'))
        window.__creationMotion.push({
          target: this.getAttribute('class'),
          duration: typeof options === 'number' ? options : options?.duration,
        })
      return animate.call(this, frames, options)
    }
  })
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.locator('[data-action="cs-toggle"]').click()
  await page.locator('[data-action="cs-project"]').first().click()
  const image = await page.locator('.cc-cover img').elementHandle()
  const role = await page.locator('.cc-stage[data-id="story"]').elementHandle()
  const stage = (id) =>
    page.locator(`.cc-stage-title > [data-action="cs-edit-step"][data-id="${id}"]`)
  await stage('story').click()
  await expect(page.locator('.cc-workpage')).toHaveAttribute('data-cs-step', 'story')
  await expectExpanded(page.locator('.cc-workpage'))
  await expect(page.getByRole('heading', { name: '故事定稿', exact: true })).toBeVisible()
  expect(
    await page.evaluate(() =>
      window.__creationMotion.some(
        (x) => x.target.includes('cc-workpage') && x.duration > 0 && x.duration <= 140,
      ),
    ),
  ).toBe(false)
  await expect(page.getByRole('heading', { name: '从创意到成片', exact: true })).toHaveCount(0)
  await page.locator('[data-action="cs-close-work"]').click()
  await expect(page.locator('.cc-workpage')).toHaveCount(0)
  await stage('audit').click()
  await expect(page.locator('.cc-workpage')).toHaveAttribute('data-cs-step', 'audit')
  await page.locator('[data-action="cs-v-enable"]').click()
  await expect(page.getByRole('heading', { name: '独立审核', exact: true })).toBeVisible()
  await expect(page.getByText('供应商配置与预算', { exact: true })).toHaveCount(0)
  expect(
    await image.evaluate((node) => node.isConnected && node.complete && node.naturalWidth > 0),
  ).toBe(true)
  await expect(page.locator('[data-v-status]')).toHaveText('待审核')
  expect(await role.evaluate((node) => node.isConnected)).toBe(true)
  for (const id of ['story', 'generate', 'shots', 'edit', 'audit']) {
    await stage(id).click()
    await expect(page.locator('.cc-workpage')).toHaveAttribute('data-cs-step', id)
    expect(await image.evaluate((node) => node.isConnected && node.complete)).toBe(true)
    expect(await role.evaluate((node) => node.isConnected)).toBe(true)
  }
  await expect(page.locator('[data-v-form="provider"]')).toHaveCount(0)
  await stage('generate').click()
  await expect(page.getByText('供应商配置与预算', { exact: true })).toBeVisible()
  await expect(page.locator('[data-v-form="prompt"]')).toHaveCount(0)
  await page.screenshot({ path: path.join(screenshots, 'focused-generation.png'), fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stage('story').click()
  expect(
    await page
      .locator('.cc-studio')
      .evaluate((node) => node.getAnimations({ subtree: true }).length),
  ).toBe(0)
  await expect(page.getByLabel('故事草稿')).toBeVisible()
  const storyBox = await page.getByLabel('故事草稿').boundingBox()
  expect(storyBox.height).toBeLessThanOrEqual(120)
  await page.screenshot({ path: path.join(screenshots, 'compact-story.png'), fullPage: true })
  await page.locator('.cc-video-object [data-action="cs-edit"]').first().click()
  await expect(page.locator('.cc-workpage')).toHaveCount(0)
  await expect(page.locator('.cc-composer')).toHaveCount(1)
  await page.locator('[data-action="cs-cancel-edit"]').click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const beforeKeyboard = await page.evaluate(() => window.__creationMotion.length)
  await stage('story').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.cc-workpage')).toHaveAttribute('data-cs-step', 'story')
  expect(await page.evaluate(() => window.__creationMotion.length)).toBe(beforeKeyboard)
})

test('outline keeps video branches independent and opens real shot leaves with isolated drafts', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1280, height: 950 })
  await page.goto(url)
  const welcome = page.getByRole('button', { name: '进入工作站' })
  if (await welcome.isVisible()) await welcome.click()
  const dismiss = page.getByRole('button', { name: '稍后', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  const strip = page.getByRole('button', { name: '收起任务', exact: true })
  if (await strip.isVisible()) await strip.click()
  await page.locator('[data-action="cs-toggle"]').click()
  const first = page.locator('.cc-video').first(),
    second = page.locator('.cc-video').last()
  await first.locator('.cc-video-trigger').click()
  await second.locator('.cc-video-trigger').click()
  await expect(page.locator('.cc-roles')).toHaveCount(2)
  await expect(first.locator('.cc-stage')).toHaveCount(7)
  await second.locator('.cc-video-trigger').press('ArrowLeft')
  await expect(page.locator('.cc-roles')).toHaveCount(1)
  await expect(first.locator('.cc-roles')).toHaveCSS('display', 'block')
  await first.getByRole('button', { name: '编辑分镜与提示词', exact: true }).click()
  await page.locator('[data-action="cs-close-work"]').click()
  await first.locator('[data-action="cs-shots-toggle"]').click()
  await expect(first.locator('.cc-shot-empty')).toBeVisible()
  await expect(page.locator('.cc-workpage')).toHaveCount(0)
  await first.locator('.cc-stage-title > [data-action="cs-edit-step"][data-id="shots"]').click()
  await page.locator('[data-action="cs-v-enable"]').click()
  for (const name of ['第一个镜头', '第二个镜头']) {
    await page.locator('[data-action="cs-v-add-shot"]').click()
    await page.getByLabel('叙事目的', { exact: true }).fill(name)
    await page.getByLabel('故事内容', { exact: true }).fill('树形分支的实际镜头内容')
    await page.locator('[data-action="cs-v-save-shot"]').click()
  }
  await expect(first.locator('.cc-shot-trigger')).toHaveCount(2)
  await page.locator('[data-action="cs-close-work"]').click()
  const leaves = first.locator('.cc-shot-trigger')
  await leaves.first().click()
  await expect(page.locator('.cc-shot-node').first().locator('.cc-workpage')).toBeVisible()
  await expect(page.locator('.cc-shot-node').first().locator('.cv-content-shots > li')).toHaveCount(
    1,
  )
  await expect(page.getByLabel('叙事目的', { exact: true })).toHaveValue('第一个镜头')
  await expect(page.locator('.cv-shot-nav')).toHaveCount(0)
  await expect(page.getByText('全片分镜总览', { exact: true })).toHaveCount(0)
  await page.getByLabel('叙事目的', { exact: true }).fill('镜头一尚未保存的调整')
  await leaves.last().click()
  await expect(page.getByLabel('叙事目的', { exact: true })).toHaveValue('第二个镜头')
  await leaves.first().click()
  await expect(page.getByLabel('叙事目的', { exact: true })).toHaveValue('镜头一尚未保存的调整')
  await page.getByLabel('叙事目的', { exact: true }).press('Escape')
  await expect(page.locator('.cc-workpage')).toHaveCount(0)
  await expect(leaves.first()).toBeFocused()
  await leaves.first().press('Enter')
  await expect(page.getByLabel('叙事目的', { exact: true })).toHaveValue('镜头一尚未保存的调整')
  await page.locator('[data-action="cs-v-save-shot"]').click()
  await expect(leaves.first()).toContainText('镜头一尚未保存的调整')
  await first.locator('[data-action="cs-shots-toggle"]').click()
  await expect(page.locator('.cc-workpage')).toHaveCount(0)
  await first.locator('[data-action="cs-shots-toggle"]').click()
  await expect(leaves).toHaveCount(2)
  await first.evaluate((node) =>
    Promise.all(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
    ),
  )
  await page.screenshot({ path: path.join(screenshots, 'tree-outline.png'), fullPage: true })
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => {
      document.body.dataset.theme = theme
    }, theme)
    for (const width of [1024, 760, 600, 360]) {
      await page.setViewportSize({ width, height: 950 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      expect(
        await page.locator('#view').evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true)
    }
  }
  expect(errors).toEqual([])
})

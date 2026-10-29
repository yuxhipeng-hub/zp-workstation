import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const sharp = require('sharp')
const { createPresentation } = require('../../src/shared/presentation.mjs')
const { planningReply, referenceDeck } = require('../fixtures/presentation-reference.cjs')
const screenshotDir = path.join(os.tmpdir(), 'zp-ppt-studio-qa')

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zp-ppt-e2e-'))
}

test('PPT groups insert tools and selected-object properties without losing edits when switching panels', async () => {
  const directory = temporaryDirectory()
  let app
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    const { materializeDesign } = require('../../src/shared/presentation-design.mjs')
    const deck = materializeDesign(referenceDeck('proposal'))
    await window.evaluate((value) => window.launcher.savePresentation(value), deck)
    await window.reload()
    await window.locator('.nav-item[data-page="ppt"]').click()
    await window.locator('.ppt-project-open').click()
    const toolbar = window.getByRole('toolbar', { name: '画布工具' })
    const preview = window.locator('[data-ppt-preview]')
    await expect(toolbar.getByRole('button', { name: '色块', exact: true })).toHaveAttribute(
      'title',
      /底色、强调条/,
    )
    await window.getByRole('button', { name: '直接编辑', exact: true }).click()
    const originalCount = await preview.locator('[data-node-id]').count()
    await toolbar.getByRole('button', { name: '色块', exact: true }).click()
    const shapeId = await preview.locator('.is-selected').getAttribute('data-node-id')
    const shape = preview.locator(`[data-node-id="${shapeId}"]`)
    await expect(preview.locator('[data-node-id]')).toHaveCount(originalCount + 1)
    await expect(window.getByRole('button', { name: '对象属性', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const properties = window.getByRole('region', { name: '对象编辑' })
    await expect(properties).toContainText('色块可用作底色')
    await expect(properties.getByRole('button', { name: '图片', exact: true })).toHaveCount(0)
    await expect(
      properties.getByRole('button', { name: '上移图层', exact: true }),
    ).not.toBeVisible()
    await properties.getByRole('button', { name: '复制对象', exact: true }).click()
    await expect(preview.locator('[data-node-id]')).toHaveCount(originalCount + 2)
    await properties.getByText('排列与显示', { exact: true }).click()
    await properties.getByRole('button', { name: '隐藏对象', exact: true }).click()
    await expect(preview.locator('[data-node-id]')).toHaveCount(originalCount + 1)
    await properties.getByRole('button', { name: '显示对象', exact: true }).click()
    await expect(preview.locator('[data-node-id]')).toHaveCount(originalCount + 2)
    await properties.getByRole('button', { name: '锁定对象', exact: true }).click()
    await expect(properties.getByLabel('填充颜色', { exact: true })).toBeDisabled()
    await expect(properties.getByRole('button', { name: '删除对象', exact: true })).toBeDisabled()
    await properties.getByRole('button', { name: '解锁对象', exact: true }).click()
    await properties.getByRole('button', { name: '删除对象', exact: true }).click()
    await shape.click()
    await properties.getByText('精确位置与大小', { exact: true }).click()
    await properties.getByLabel('宽度', { exact: true }).fill('12')
    await properties.getByLabel('高度', { exact: true }).fill('180')
    await properties.getByLabel('水平位置', { exact: true }).fill('54')
    await properties.getByLabel('垂直位置', { exact: true }).fill('290')
    await window.getByRole('button', { name: '对话助手', exact: true }).click()
    await expect(window.locator('#ppt-message')).toBeVisible()
    await shape.click()
    await expect(properties.getByLabel('宽度', { exact: true })).toHaveValue('12')
    if (
      await properties
        .locator('[data-disclosure-id="ppt-object-geometry"]')
        .evaluate((element) => element.open)
    )
      await properties.getByText('精确位置与大小', { exact: true }).click()
    await window.getByRole('button', { name: '保存作品', exact: true }).click()
    const taskDismiss = window.getByRole('button', { name: '收起任务', exact: true })
    if (await taskDismiss.isVisible()) await taskDismiss.click()
    await expect(window.locator('#toasts .toast')).toHaveCount(0)
    fs.mkdirSync(screenshotDir, { recursive: true })
    for (const [width, theme] of [
      [1440, 'dark'],
      [1440, 'light'],
      [900, 'dark'],
      [720, 'light'],
    ]) {
      await app.evaluate(({ BrowserWindow }, size) => {
        const main = BrowserWindow.getAllWindows()[0]
        main.setMinimumSize(600, 600)
        main.setSize(size, 960)
      }, width)
      await window.evaluate((value) => window.launcher.patchSettings({ theme: value }), theme)
      await expect(window.locator('body')).toHaveAttribute('data-theme', theme)
      expect(await window.evaluate(() => globalThis.innerWidth)).toBeLessThanOrEqual(width)
      const overflow = await window
        .locator('.ppt-studio')
        .evaluate((element) => element.scrollWidth - element.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
      expect((await preview.boundingBox()).width).toBeGreaterThan(250)
      await window.locator('.view').evaluate((element) => {
        element.scrollTop = 0
      })
      await window.screenshot({
        path: path.join(screenshotDir, `editor-ui-${width}-${theme}.png`),
        animations: 'disabled',
      })
    }
    const stored = (await window.evaluate(() => window.launcher.getWorkspace())).presentations[0]
    expect(stored.slides[0].canvas.find((item) => item.type === 'rect' && item.x === 54).w).toBe(12)
  } finally {
    if (app) await close(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('PPT start choices preserve existing material and the studio fits both themes and narrow windows', async () => {
  const directory = temporaryDirectory()
  let app
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    await expect(window.getByRole('region', { name: '本地作品' })).toHaveCount(0)
    await window.getByRole('button', { name: '客户提案', exact: true }).click()
    const starter = await window.locator('#ppt-message').inputValue()
    expect(starter).toContain('客户提案')
    await expect(window.locator('#ppt-message')).toBeFocused()
    await window.getByRole('button', { name: '工作汇报', exact: true }).click()
    await expect(window.locator('#ppt-message')).toHaveValue(starter)
    expect(
      (await window.evaluate(() => window.launcher.getWorkspace())).presentations,
    ).toHaveLength(0)
    await window.locator('#ppt-message').fill('')
    await window.getByRole('button', { name: '工作汇报', exact: true }).click()
    await expect(window.locator('#ppt-message')).toHaveValue(/工作汇报/)

    fs.mkdirSync(screenshotDir, { recursive: true })
    for (const [width, theme] of [
      [1440, 'dark'],
      [1440, 'light'],
      [900, 'dark'],
      [720, 'light'],
    ]) {
      await app.evaluate(({ BrowserWindow }, size) => {
        const main = BrowserWindow.getAllWindows()[0]
        main.setMinimumSize(600, 600)
        main.setSize(size, 960)
      }, width)
      expect(await window.evaluate(() => globalThis.innerWidth)).toBeLessThanOrEqual(width)
      await window.evaluate((value) => window.launcher.patchSettings({ theme: value }), theme)
      await expect(window.locator('body')).toHaveAttribute('data-theme', theme)
      await expect(window.locator('.ppt-studio textarea')).toHaveCount(1)
      await expect(
        window.getByRole('button', { name: '从空白作品开始', exact: true }),
      ).toBeVisible()
      const size = await window
        .locator('#view')
        .evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }))
      expect(size.content).toBeLessThanOrEqual(size.width + 1)
      await window.screenshot({
        path: path.join(screenshotDir, `studio-home-${width}-${theme}.png`),
        animations: 'disabled',
      })
    }
  } finally {
    if (app) await close(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('long title preview and exported editable PPTX share balanced lines across themes and window sizes', async () => {
  const directory = temporaryDirectory()
  let app
  try {
    const { materializeDesign } = require('../../src/shared/presentation-design.mjs')
    const source = referenceDeck('proposal')
    const title = '试点只验证三件事：口径、准确性、耗时变化'
    source.slides[1].layout = 'statement'
    source.slides[1].title = title
    const deck = materializeDesign(source)
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    await window.evaluate((value) => window.launcher.savePresentation(value), deck)
    await window.reload()
    await window.locator('.nav-item[data-page="ppt"]').click()
    await window.locator('.ppt-project-open').first().click()
    await window.getByRole('button', { name: '选择第 2 页', exact: true }).click()
    const expected = '试点只验证三件事：\n口径、准确性、耗时变化'
    for (const [width, theme] of [
      [1280, 'dark'],
      [900, 'light'],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size, 900),
        width,
      )
      await window.evaluate((value) => window.launcher.patchSettings({ theme: value }), theme)
      const titleNode = window
        .locator('[data-ppt-preview] .ppt-text')
        .filter({ hasText: '试点只验证三件事' })
      await expect(titleNode).toHaveText(expected)
      const metrics = await titleNode.evaluate((element) => ({
        width: element.clientWidth,
        contentWidth: element.scrollWidth,
        height: element.clientHeight,
        contentHeight: element.scrollHeight,
      }))
      expect(metrics.contentWidth).toBeLessThanOrEqual(metrics.width + 1)
      expect(metrics.contentHeight).toBeLessThanOrEqual(metrics.height + 1)
      fs.mkdirSync(screenshotDir, { recursive: true })
      await window.locator('[data-ppt-preview]').screenshot({
        path: path.join(screenshotDir, `balanced-title-${width}-${theme}.png`),
        animations: 'disabled',
      })
    }
    const target = path.join(directory, 'balanced.pptx')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, target)
    await window.getByRole('button', { name: '导出 PPTX', exact: true }).click()
    await expect.poll(() => fs.existsSync(target)).toBe(true)
    const zip = await JSZip.loadAsync(fs.readFileSync(target))
    const xml = await zip.file('ppt/slides/slide2.xml').async('string')
    expect(xml).toContain('<a:t>试点只验证三件事：</a:t>')
    expect(xml).toContain('<a:t>口径、准确性、耗时变化</a:t>')
    const stored = (await window.evaluate(() => window.launcher.getWorkspace())).presentations[0]
    expect(stored.slides[1].title).toBe(title)
    expect(stored.slides[1].canvas.find((n) => n.field === 'title').text).toBe(title)
  } finally {
    if (app) await close(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
async function launch(directory) {
  const env = {
    ...process.env,
    ZP_WORKBENCH_USER_DATA: directory,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: ['.'], env })
  const window = await app.firstWindow()
  const welcome = window.getByRole('button', { name: '进入工作站' })
  if (
    await welcome
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
  )
    await welcome.click()
  await window.locator('.nav-item[data-page="ppt"]').click()
  return { app, window }
}

async function close(app) {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1
  })
  await app.close()
}

test('PPT conversation turns pasted notices into previews, edits selected pages and recovers failed replies', async () => {
  const directory = temporaryDirectory()
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const payload = JSON.parse(body)
      const submitted = payload.messages.findLast(
        (item) => item.role === 'user' && item.content.includes('（JSON 数据）：'),
      )
      const context = JSON.parse(submitted.content.split('\n').slice(1).join('\n'))
      let reply
      if (context.phase === 'review') {
        reply = { action: 'accept', message: '材料一致性复核完成' }
      } else if (context.message.includes('比赛通知：')) {
        reply = {
          action: 'clarify',
          message:
            '已提取五分钟展示和评分要求，请补充专业与项目经历。<img src=x onerror="window.pptInjected=true">',
        }
      } else if (!context.deck) {
        const deck = createPresentation({ title: '智能制造职业规划', scene: 'competition' })
        deck.slides[1].notes = '已有经历留待补充，不编造获奖事实。'
        reply =
          context.phase === 'plan'
            ? planningReply(deck)
            : {
                action: 'create',
                message: '已按通知组织成三页初稿，个人项目经历标记待补充。',
                deck,
              }
      } else {
        reply = {
          action: 'edit',
          message: '仅调整当前页标题，其余页面和备注保持。',
          changes: {
            slides: [
              {
                id: context.message.includes('无效回复')
                  ? 'unknown-slide'
                  : context.selectedSlideId,
                title: '从机械基础走向智能制造',
                ...(context.message === '删除选中对象'
                  ? {
                      canvas: context.deck.slides
                        .find((s) => s.id === context.selectedSlideId)
                        .canvas.filter((n) => n.id !== context.selectedObjectId),
                    }
                  : {}),
              },
            ],
          },
        }
      }
      if (!['plan', 'accept'].includes(reply.action) && context.phase !== 'samples')
        requests.push({ payload, context })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let app
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    await expect(window.locator('.ppt-studio textarea')).toHaveCount(1)
    await expect(window.locator('.ppt-studio select')).toHaveCount(0)
    await expect(window.getByRole('button', { name: '发送', exact: true })).toBeDisabled()
    await window.evaluate(async (baseUrl) => {
      await window.launcher.saveAiProfile(
        { label: '本地测试模型', baseUrl, model: 'test', requiresKey: false },
        '',
      )
    }, `http://127.0.0.1:${server.address().port}/v1`)
    await window.reload()
    await window.locator('.nav-item[data-page="ppt"]').click()
    await window
      .locator('#ppt-message')
      .fill('比赛通知：职业规划大赛，展示五分钟，评分关注职业目标、行动与成果。')
    await window.locator('#ppt-message').press('Enter')
    expect(requests).toHaveLength(0)
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('.ppt-message-assistant')).toContainText('请补充专业与项目经历')
    await expect(window.locator('.ppt-message-assistant img')).toHaveCount(0)
    expect(await window.evaluate(() => window.pptInjected)).toBeUndefined()
    await expect(window.locator('.ppt-editor')).toHaveCount(0)
    await expect(window.locator('#ppt-message')).toBeFocused()
    await window
      .locator('#ppt-message')
      .fill('我是机械专业大二学生，想走智能制造方向，先做，项目经历待补充。')
    await window.locator('#ppt-message').press('Control+Enter')
    await expect(window.locator('.ppt-sample-grid article')).toHaveCount(3)
    await window.getByRole('button', { name: '按此方向生成整套', exact: true }).click()
    await expect(window.locator('[data-ppt-project-title]')).toHaveText('智能制造职业规划')
    await expect(window.locator('.ppt-thumbnail')).toHaveCount(3)
    await expect(window.locator('.ppt-inspector')).toHaveCount(0)
    await expect(window.locator('.ppt-message')).toHaveCount(4)
    expect(requests[1].payload.messages[1].content).toContain('比赛通知：')
    expect(
      (await window.evaluate(() => window.launcher.getWorkspace())).presentations,
    ).toHaveLength(0)
    await window.getByRole('button', { name: '保存作品', exact: true }).click()
    await expect(window.locator('[data-ppt-save-state]')).toContainText('已保存到本机')
    const before = (await window.evaluate(() => window.launcher.getWorkspace())).presentations[0]
    await window.getByRole('button', { name: '选择第 2 页', exact: true }).click()
    await window.locator('#ppt-message').fill('这一页标题改得更具体，其他内容保留。')
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('[data-ppt-preview]')).toContainText('从机械基础走向智能制造')
    expect(requests[2].context.selectedSlideId).toBe(before.slides[1].id)
    expect((await window.evaluate(() => window.launcher.getWorkspace())).presentations[0]).toEqual(
      before,
    )
    await window.getByRole('button', { name: '手动编辑', exact: true }).click()
    await expect(window.locator('#ppt-slide-notes')).toHaveValue(before.slides[1].notes)
    await window.getByRole('button', { name: '撤销修改', exact: true }).click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue(before.slides[1].title)
    await window.getByRole('button', { name: '重做修改', exact: true }).click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('从机械基础走向智能制造')
    await window.getByRole('button', { name: '对话助手', exact: true }).click()
    await window.locator('#ppt-message').fill('触发无效回复')
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('.ppt-error')).toContainText('输入和原作品已保留')
    await expect(window.locator('#ppt-message')).toHaveValue('触发无效回复')
    await window.getByRole('button', { name: '手动编辑', exact: true }).click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('从机械基础走向智能制造')
    await window.getByRole('button', { name: '对话助手', exact: true }).click()
    await expect(window.locator('.ppt-message')).toHaveCount(6)
    await window.locator('#ppt-message').fill('重新修改当前页标题')
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('.ppt-error')).toHaveCount(0)
    await expect(window.locator('.ppt-message')).toHaveCount(8)
    await window.getByRole('button', { name: '保存作品', exact: true }).click()
    await expect(window.locator('[data-ppt-save-state]')).toContainText('已保存到本机')
    const after = (await window.evaluate(() => window.launcher.getWorkspace())).presentations[0]
    expect(after.slides[0]).toEqual(before.slides[0])
    expect(after.slides[2]).toEqual(before.slides[2])
    expect(after.slides[1].notes).toBe(before.slides[1].notes)
    fs.mkdirSync(screenshotDir, { recursive: true })
    await window.getByRole('button', { name: '对话助手', exact: true }).click()
    await window.evaluate(() => window.launcher.patchSettings({ theme: 'dark' }))
    await expect(window.locator('body')).toHaveAttribute('data-theme', 'dark')
    await window.locator('.view').evaluate((element) => {
      element.scrollTop = 0
    })
    const composerBox = await window.locator('[data-action="ppt-send"]').boundingBox()
    expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(
      await window.evaluate(() => globalThis.innerHeight),
    )
    await expect(window.locator('#toasts .toast')).toHaveCount(0)
    await window.screenshot({
      path: path.join(screenshotDir, 'conversation-preview-dark.png'),
      animations: 'disabled',
    })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 820))
    await window.evaluate(() => window.launcher.patchSettings({ theme: 'light' }))
    await expect(window.locator('body')).toHaveAttribute('data-theme', 'light')
    expect(
      await window
        .locator('.ppt-studio')
        .evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1)
    await window.screenshot({
      path: path.join(screenshotDir, 'conversation-preview-light.png'),
      animations: 'disabled',
    })
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    await window.locator('.ppt-project-open').click()
    await expect(window.locator('.ppt-message')).toHaveCount(0)
    await window.locator('#ppt-message').fill('修改当前封面标题')
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('.ppt-message')).toHaveCount(2)
    expect(requests.at(-1).payload.messages).toHaveLength(2)
    expect(requests.at(-1).context.selectedSlideId).toBe(after.slides[0].id)
    await window.getByRole('button', { name: '直接编辑', exact: true }).click()
    await window
      .locator('[data-ppt-preview]')
      .getByRole('button', { name: '选择对象：从机械基础走向智能制造', exact: true })
      .click()
    await window.getByRole('button', { name: '对话修改所选对象', exact: true }).click()
    await window.locator('#ppt-message').fill('修改这个对象，其他内容保留')
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('.ppt-message')).toHaveCount(4)
    expect(requests.at(-1).context.selectedObjectId).toBeTruthy()
    const selectedObject = requests
      .at(-1)
      .context.deck.slides[0].canvas.find((n) => n.id === requests.at(-1).context.selectedObjectId)
    expect(selectedObject.field).toBe('title')
    await window.locator('#ppt-message').fill('删除选中对象')
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('.ppt-message')).toHaveCount(6)
    await window.locator('#ppt-message').fill('修改当前页')
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('.ppt-message')).toHaveCount(8)
    expect(requests.at(-1).context.selectedObjectId).toBeNull()
  } finally {
    if (app) await close(app)
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('PPT plans structured pages, previews chart edits and exports an editable native chart', async () => {
  const directory = temporaryDirectory()
  let app
  const deck = referenceDeck('proposal')
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const payload = JSON.parse(body)
      const context = JSON.parse(payload.messages.at(-1).content.split('\n').slice(1).join('\n'))
      const result =
        context.phase === 'review'
          ? { action: 'accept', message: '材料一致性复核完成' }
          : context.phase === 'plan'
            ? planningReply(deck)
            : !context.deck
              ? {
                  action: 'create',
                  message: '已完成策划和页面制作。',
                  deck:
                    context.phase === 'samples'
                      ? { ...deck, slides: context.sampleIndices.map((i) => deck.slides[i]) }
                      : deck,
                }
              : {
                  action: 'edit',
                  message: '当前页切换为折线图，数值与来源保持。',
                  changes: {
                    slides: [
                      {
                        id: context.selectedSlideId,
                        chart: {
                          ...context.deck.slides.find((s) => s.id === context.selectedSlideId)
                            .chart,
                          type: 'line',
                        },
                      },
                    ],
                  },
                }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    await window.evaluate(async (baseUrl) => {
      await window.launcher.saveAiProfile(
        { label: '结构化测试模型', baseUrl, model: 'test', requiresKey: false },
        '',
      )
    }, `http://127.0.0.1:${server.address().port}/v1`)
    await window.reload()
    await window.locator('.nav-item[data-page="ppt"]').click()
    await window
      .locator('#ppt-message')
      .fill('使用这份合成商业材料制作提案，保留 3、4、1 小时与数据来源。')
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('.ppt-sample-grid article')).toHaveCount(3)
    await window.getByRole('button', { name: '叙事编辑', exact: false }).click()
    await expect(window.locator('.ppt-design-samples')).toContainText('当前为 叙事编辑')
    fs.mkdirSync(screenshotDir, { recursive: true })
    for (const theme of ['dark', 'light']) {
      await window.evaluate((value) => window.launcher.patchSettings({ theme: value }), theme)
      await expect(window.locator('body')).toHaveAttribute('data-theme', theme)
      await window.locator('.ppt-design-samples').screenshot({
        path: path.join(screenshotDir, `design-samples-${theme}.png`),
        animations: 'disabled',
      })
    }
    await window.getByRole('button', { name: '按此方向生成整套', exact: true }).click()
    await expect(window.locator('.ppt-thumbnail')).toHaveCount(8)
    await expect(window.locator('.ppt-inspector')).toHaveCount(0)
    await window.locator('.ppt-strategy summary').click()
    await expect(window.locator('.ppt-strategy')).toContainText('区分事实与计划')
    await window.getByRole('button', { name: '选择第 4 页', exact: true }).click()
    await expect(window.locator('[data-ppt-preview]')).toContainText('需梳理数据字段')
    await window.getByRole('button', { name: '选择第 3 页', exact: true }).click()
    await expect(window.locator('[data-ppt-preview]')).toContainText('合成访谈记录')
    await window.locator('#ppt-message').fill('这个图表改成折线图，保留数值和来源。')
    await window.getByRole('button', { name: '发送', exact: true }).click()
    await expect(window.locator('[data-ppt-preview] .ppt-vector')).toHaveCount(2)
    await window.getByRole('button', { name: '保存作品', exact: true }).click()
    await expect(window.locator('[data-ppt-save-state]')).toContainText('已保存到本机')
    const stored = (await window.evaluate(() => window.launcher.getWorkspace())).presentations[0]
    expect(stored.slides[2].chart.type).toBe('line')
    expect(stored.slides[2].chart.series[0].values).toEqual([3, 4, 1])
    expect(stored.slides[3].comparison.rows).toEqual(deck.slides[3].comparison.rows)
    const target = path.join(directory, 'structured.pptx')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, target)
    await window.getByRole('button', { name: '导出 PPTX', exact: true }).click()
    await expect.poll(() => fs.existsSync(target)).toBe(true)
    const zip = await JSZip.loadAsync(fs.readFileSync(target))
    expect(await zip.file('ppt/charts/chart1.xml').async('string')).toContain('c:lineChart')
    expect(zip.file(/^ppt\/embeddings\/.*\.xlsx$/)).toHaveLength(1)
    await window.getByRole('button', { name: '直接编辑', exact: true }).click()
    await window.locator('[data-ppt-preview] .ppt-chart-node').click()
    await window.getByText('编辑图表数据', { exact: true }).click()
    await window.getByLabel('现状 第 1 项数值', { exact: true }).fill('5')
    await window.getByRole('button', { name: '保存作品', exact: true }).click()
    await expect(window.locator('[data-ppt-save-state]')).toContainText('已保存到本机')
    const edited = (await window.evaluate(() => window.launcher.getWorkspace())).presentations[0]
    expect(edited.slides[2].canvas.find((n) => n.type === 'chart').chart.series[0].values).toEqual([
      5, 4, 1,
    ])
    expect(edited.slides[2].chart.series[0].values).toEqual([5, 4, 1])
    await window.getByRole('button', { name: '导出 PPTX', exact: true }).click()
    await expect(window.locator('.ppt-editor-bar button[data-action="ppt-export"]')).toBeEnabled()
    await expect
      .poll(async () => {
        const editedZip = await JSZip.loadAsync(fs.readFileSync(target))
        return editedZip.file(/^ppt\/charts\/chart\d+\.xml$/)[0].async('string')
      })
      .toContain('<c:v>5</c:v>')
  } finally {
    if (app) await close(app)
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('PPT canvas supports direct text editing, positioning, locks, image import and native export', async () => {
  const directory = temporaryDirectory()
  let app
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    await window.getByRole('button', { name: '从空白作品开始', exact: true }).click()
    await window.getByRole('button', { name: '直接编辑', exact: true }).click()
    const preview = window.locator('[data-ppt-preview]')
    await preview.getByRole('button', { name: '选择对象：从一个好想法开始', exact: true }).click()
    await preview
      .getByRole('button', { name: '选择对象：从一个好想法开始', exact: true })
      .dblclick()
    await expect(window.getByLabel('对象文字', { exact: true })).toBeFocused()
    await window.getByLabel('对象文字', { exact: true }).fill('用户可以直接操作每个对象')
    await expect(
      preview.getByRole('button', { name: '选择对象：用户可以直接操作每个对象', exact: true }),
    ).toHaveText('用户可以直接\n操作每个对象')
    await expect(window.getByLabel('对象文字', { exact: true })).toHaveValue(
      '用户可以直接操作每个对象',
    )
    const title = preview.locator('[data-node-id].is-selected')
    const original = await title.boundingBox()
    await window.mouse.move(original.x + 20, original.y + 20)
    await window.mouse.down()
    await window.mouse.move(original.x + 50, original.y + 40, { steps: 5 })
    await window.mouse.up()
    const moved = await preview.locator('[data-node-id].is-selected').boundingBox()
    expect(moved.x).toBeGreaterThan(original.x + 20)
    await preview.focus()
    await window.keyboard.press('ArrowRight')
    await window.keyboard.press('Shift+ArrowDown')
    const beforeDuplicate = await preview.locator('[data-node-id]').count()
    await window.keyboard.press('Control+d')
    await expect(preview.locator('[data-node-id]')).toHaveCount(beforeDuplicate + 1)
    await preview.focus()
    await window.keyboard.press('Delete')
    await expect(preview.locator('[data-node-id]')).toHaveCount(beforeDuplicate)
    await preview
      .getByRole('button', { name: '选择对象：用户可以直接操作每个对象', exact: true })
      .click()
    await window.getByLabel('字号', { exact: true }).fill('40')
    await window.getByRole('button', { name: '锁定对象', exact: true }).click()
    await expect(window.getByLabel('对象文字', { exact: true })).toBeDisabled()
    await expect(window.getByRole('button', { name: '删除对象', exact: true })).toBeDisabled()
    await window.getByRole('button', { name: '解锁对象', exact: true }).click()
    await expect(window.getByLabel('对象文字', { exact: true })).toBeEnabled()
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    await window.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    await expect(window.getByRole('button', { name: '完成直接编辑', exact: true })).toBeVisible()
    await window.getByRole('button', { name: '锁定页面', exact: true }).click()
    await expect(window.getByRole('button', { name: '图片', exact: true })).toBeDisabled()
    await window.getByRole('button', { name: '解锁页面', exact: true }).click()
    const imagePath = path.join(directory, 'sample.png')
    await sharp({
      create: {
        width: 320,
        height: 180,
        channels: 4,
        background: { r: 30, g: 140, b: 200, alpha: 0.5 },
      },
    })
      .png()
      .toFile(imagePath)
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, imagePath)
    await window.getByRole('button', { name: '图片', exact: true }).click()
    await expect(preview.locator('img')).toHaveCount(1)
    await window.getByRole('button', { name: '填满裁切', exact: true }).click()
    await window.getByRole('button', { name: '保存作品', exact: true }).click()
    await expect(window.locator('[data-ppt-save-state]')).toContainText('已保存到本机')
    const saved = (await window.evaluate(() => window.launcher.getWorkspace())).presentations[0]
    const savedTitle = saved.slides[0].canvas.find((n) => n.field === 'title')
    expect(savedTitle.text).toBe('用户可以直接操作每个对象')
    expect(savedTitle.size).toBe(40)
    expect(savedTitle.x).toBeGreaterThan(64)
    const image = saved.slides[0].canvas.find((n) => n.type === 'image')
    expect(image.data).toMatch(/^data:image\/png;base64,/)
    expect(image.fit).toBe('cover')
    const target = path.join(directory, 'direct-edit.pptx')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, target)
    await window.getByRole('button', { name: '导出 PPTX', exact: true }).click()
    await expect.poll(() => fs.existsSync(target)).toBe(true)
    const zip = await JSZip.loadAsync(fs.readFileSync(target))
    const xml = await zip.file('ppt/slides/slide1.xml').async('string')
    expect(xml).toContain('用户可以直接操作每个对象')
    expect(xml).toContain('<p:pic>')
    expect(xml).toContain('<p:sp>')
    expect(zip.file(/^ppt\/media\//)).toHaveLength(1)
    fs.mkdirSync(screenshotDir, { recursive: true })
    fs.copyFileSync(target, path.join(screenshotDir, 'direct-edit.pptx'))
    for (const width of [1280, 1080]) {
      await app.evaluate(
        ({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].setSize(value, 820),
        width,
      )
      for (const theme of ['dark', 'light']) {
        await window.evaluate((value) => window.launcher.patchSettings({ theme: value }), theme)
        await expect(window.locator('body')).toHaveAttribute('data-theme', theme)
        expect(
          await window.locator('.ppt-studio').evaluate((el) => el.scrollWidth - el.clientWidth),
        ).toBeLessThanOrEqual(1)
        await window.screenshot({
          path: path.join(screenshotDir, `direct-editor-${width}-${theme}.png`),
          animations: 'disabled',
        })
      }
    }
    await window.getByRole('button', { name: '完成直接编辑', exact: true }).click()
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    await window.locator('.ppt-project-open').click()
    await expect(preview).toContainText('用户可以直接操作每个对象')
    await expect(preview.locator('img')).toHaveCount(1)
  } finally {
    if (app) await close(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('PPT studio edits, reorders, saves, exports native objects and survives restart', async () => {
  const directory = temporaryDirectory()
  let app
  try {
    let launched = await launch(directory)
    app = launched.app
    let window = launched.window
    await expect(window.locator('.nav-section-tools')).toContainText('工具')
    await window.getByRole('button', { name: '从空白作品开始', exact: true }).click()
    await window.locator('#ppt-deck-title').fill('客户提案 <测试>')
    await window.locator('#ppt-slide-title').fill('让客户看清真正的价值')
    await window.locator('#ppt-slide-notes').fill('这是一段只进入备注的讲稿。')
    await window.locator('[data-ppt-field="theme"]').selectOption('midnight')
    await window.getByRole('button', { name: '选择第 2 页', exact: true }).click()
    await window.locator('#ppt-slide-body').fill('以真实证据支持这个判断。')
    await window.getByRole('button', { name: '添加页面', exact: true }).click()
    await window.locator('#ppt-slide-title').fill('新增案例')
    await window.getByRole('button', { name: '向前移动页面', exact: true }).click()
    await expect(window.locator('[data-ppt-page-label]')).toContainText('第 2 页')
    await window.getByRole('button', { name: '复制页面', exact: true }).click()
    await expect(window.locator('.ppt-thumbnail')).toHaveCount(5)
    await window.getByRole('button', { name: '撤销修改', exact: true }).click()
    await expect(window.locator('.ppt-thumbnail')).toHaveCount(4)
    await window.getByRole('button', { name: '重做修改', exact: true }).click()
    await expect(window.locator('.ppt-thumbnail')).toHaveCount(5)
    await window.getByRole('button', { name: '撤销修改', exact: true }).click()
    await window.getByRole('button', { name: '保存作品', exact: true }).click()
    await expect(window.locator('[data-ppt-save-state]')).toContainText('已保存到本机')
    const target = path.join(directory, 'proposal.pptx')
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath })
    }, target)
    await window.getByRole('button', { name: '导出 PPTX', exact: true }).click()
    await expect.poll(() => fs.existsSync(target)).toBe(true)
    const zip = await JSZip.loadAsync(fs.readFileSync(target))
    expect(await zip.file('ppt/slides/slide1.xml').async('string')).toContain(
      '让客户看清真正的价值',
    )
    expect(await zip.file('ppt/slides/slide2.xml').async('string')).toContain('新增案例')
    expect(await zip.file('ppt/notesSlides/notesSlide1.xml').async('string')).toContain(
      '只进入备注',
    )
    await close(app)
    app = null
    launched = await launch(directory)
    app = launched.app
    window = launched.window
    await window.locator('.ppt-project-open').filter({ hasText: '客户提案 <测试>' }).click()
    await window.getByRole('button', { name: '手动编辑', exact: true }).click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('让客户看清真正的价值')
    await expect(window.locator('#ppt-slide-notes')).toHaveValue('这是一段只进入备注的讲稿。')
    await expect(window.locator('.ppt-thumbnail')).toHaveCount(4)
    await window.getByRole('button', { name: '演示', exact: true }).click()
    await window.keyboard.press('ArrowRight')
    await expect(window.locator('.ppt-presentation-controls')).toContainText('2 / 4')
    await window.keyboard.press('Escape')
    await expect(window.locator('.ppt-editor')).toBeVisible()
  } finally {
    if (app) await close(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('PPT studio keeps drafts when leaving is canceled and confirms project deletion', async () => {
  const directory = temporaryDirectory()
  let app
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    await window.getByRole('button', { name: '从空白作品开始', exact: true }).click()
    await window.locator('#ppt-deck-title').fill('保留作品')
    await window.getByRole('button', { name: '保存作品', exact: true }).click()
    await window.locator('#ppt-slide-title').fill('还没有保存的标题')
    await window.evaluate(() => window.launcher.patchSettings({ minimizeToTray: false }))
    await app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showMessageBoxSync = () => 0
      BrowserWindow.getAllWindows()[0].close()
    })
    await expect(window.locator('#ppt-slide-title')).toHaveValue('还没有保存的标题')
    await window.locator('.nav-item[data-page="today"]').click()
    await window.locator('.nav-item[data-page="ppt"]').click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('还没有保存的标题')
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    await expect(window.getByRole('dialog').getByRole('combobox')).toHaveCount(0)
    await expect(window.getByRole('dialog').getByRole('button')).toHaveCount(3)
    await expect(
      window.getByRole('dialog').getByRole('button', { name: '保存', exact: true }),
    ).toBeVisible()
    await expect(
      window.getByRole('dialog').getByRole('button', { name: '不保存', exact: true }),
    ).toBeVisible()
    await window.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('还没有保存的标题')
    await expect(window.getByRole('button', { name: '返回作品', exact: true })).toBeFocused()
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    await window.keyboard.press('Escape')
    await expect(window.locator('#ppt-slide-title')).toHaveValue('还没有保存的标题')
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    await window.getByRole('dialog').getByRole('button', { name: '不保存', exact: true }).click()
    await window.locator('.ppt-project-open').click()
    await window.getByRole('button', { name: '手动编辑', exact: true }).click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('从一个好想法开始')
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    await window.getByRole('button', { name: '删除作品：保留作品', exact: true }).click()
    await window.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
    await expect(window.locator('.ppt-project')).toHaveCount(1)
    await window.getByRole('button', { name: '删除作品：保留作品', exact: true }).click()
    await window.locator('#dialogChoice').selectOption('delete')
    await window.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
    await expect(window.locator('.ppt-project')).toHaveCount(0)
  } finally {
    if (app) await close(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('PPT studio saves directly from its three-button dialog and keeps the draft on write failure', async () => {
  const directory = temporaryDirectory()
  let app
  const temporaryPath = path.join(directory, 'workspace.json.tmp')
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    await window.getByRole('button', { name: '从空白作品开始', exact: true }).click()
    await window.locator('#ppt-deck-title').fill('直接保存的作品')
    await window.locator('#ppt-slide-title').fill('需要保存的新标题')
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    const dialog = window.getByRole('dialog')
    const saveButton = dialog.getByRole('button', { name: '保存', exact: true })
    await expect(saveButton).toBeFocused()
    await window.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused()
    await window.keyboard.press('Tab')
    await expect(saveButton).toBeFocused()
    fs.mkdirSync(screenshotDir, { recursive: true })
    for (const theme of ['dark', 'light']) {
      await window.evaluate((value) => window.launcher.patchSettings({ theme: value }), theme)
      await expect(window.locator('body')).toHaveAttribute('data-theme', theme)
      await dialog.screenshot({
        path: path.join(screenshotDir, `save-dialog-${theme}.png`),
        animations: 'disabled',
      })
    }
    // 用测试临时目录中的同名文件夹模拟写入失败，不触碰真实工作区。
    fs.mkdirSync(temporaryPath)
    await saveButton.click()
    await expect(window.locator('.ppt-error')).toContainText('保存失败')
    await expect(window.locator('#ppt-slide-title')).toHaveValue('需要保存的新标题')
    await expect(window.locator('.ppt-gallery')).toHaveCount(0)
    expect(
      (await window.evaluate(() => window.launcher.getWorkspace())).presentations,
    ).toHaveLength(0)
    fs.rmdirSync(temporaryPath)
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(window.locator('.ppt-project-open')).toContainText('直接保存的作品')
    await window.locator('.ppt-project-open').click()
    await window.getByRole('button', { name: '手动编辑', exact: true }).click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('需要保存的新标题')
    await expect(window.locator('[data-ppt-save-state]')).toContainText('已保存到本机')
  } finally {
    if (fs.existsSync(temporaryPath) && fs.statSync(temporaryPath).isDirectory())
      fs.rmdirSync(temporaryPath)
    if (app) await close(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('PPT studio leaves consistent space between content and the outer frame', async () => {
  const directory = temporaryDirectory()
  let app
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    await window.getByRole('button', { name: '从空白作品开始', exact: true }).click()
    await window.locator('#ppt-deck-title').fill('间距核对作品')
    await window.getByRole('button', { name: '保存作品', exact: true }).click()
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    for (const width of [1280, 1080]) {
      await app.evaluate(
        ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size, 820),
        width,
      )
      for (const theme of ['dark', 'light']) {
        await window.evaluate((value) => window.launcher.patchSettings({ theme: value }), theme)
        await expect(window.locator('body')).toHaveAttribute('data-theme', theme)
        const gaps = await window.locator('.ppt-studio').evaluate((root) => {
          const outer = root.getBoundingClientRect()
          const box = (selector) => root.querySelector(selector).getBoundingClientRect()
          return {
            titleLeft: box('.ppt-gallery h2').left - outer.left,
            countRight: outer.right - box('.ppt-gallery .ppt-section-heading > span').right,
            cardLeft: box('.ppt-project').left - outer.left,
            inputLeft: box('.ppt-composer').left - outer.left,
            inputRight: outer.right - box('.ppt-composer').right,
            cardBottom: outer.bottom - box('.ppt-project').bottom,
          }
        })
        for (const [edge, gap] of Object.entries(gaps))
          expect(gap, `${width}/${theme}/${edge}`).toBeGreaterThanOrEqual(16)
        expect(Math.abs(gaps.inputLeft - gaps.inputRight)).toBeLessThanOrEqual(1)
        expect(Math.abs(gaps.titleLeft - gaps.countRight)).toBeLessThanOrEqual(1)
        fs.mkdirSync(screenshotDir, { recursive: true })
        await window.locator('.ppt-gallery').screenshot({
          path: path.join(screenshotDir, `spacing-gallery-${width}-${theme}.png`),
          animations: 'disabled',
        })
        await window.locator('.ppt-project-open').click()
        await window.getByRole('button', { name: '手动编辑', exact: true }).click()
        const editorGaps = await window.locator('.ppt-studio').evaluate((root) => {
          const outer = root.getBoundingClientRect()
          const box = (selector) => root.querySelector(selector).getBoundingClientRect()
          return {
            toolbarLeft: box('.ppt-editor-identity').left - outer.left,
            toolbarRight: outer.right - box('.ppt-editor-bar > .ppt-inline-actions').right,
            pagesLeft: box('.ppt-filmstrip-head').left - outer.left,
            formRight: outer.right - box('#ppt-deck-title').right,
          }
        })
        for (const [edge, gap] of Object.entries(editorGaps))
          expect(gap, `${width}/${theme}/${edge}`).toBeGreaterThanOrEqual(16)
        const overflow = await window
          .locator('.ppt-studio')
          .evaluate((element) => element.scrollWidth - element.clientWidth)
        expect(overflow).toBeLessThanOrEqual(1)
        await window.getByRole('button', { name: '返回作品', exact: true }).click()
      }
    }
  } finally {
    if (app) await close(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('PPT studio keeps narrow light and dark layouts usable and escapes editable content', async () => {
  const directory = temporaryDirectory()
  let app
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    fs.mkdirSync(screenshotDir, { recursive: true })
    await window.evaluate(() => window.launcher.patchSettings({ theme: 'dark' }))
    await expect(window.locator('body')).toHaveAttribute('data-theme', 'dark')
    await window.screenshot({
      path: path.join(screenshotDir, 'landing-dark.png'),
      animations: 'disabled',
    })
    await window.getByRole('button', { name: '从空白作品开始', exact: true }).click()
    await window.locator('#ppt-slide-title').fill('<img src=x onerror="window.pptInjected=true">')
    await expect(window.locator('.ppt-stage img')).toHaveCount(0)
    expect(await window.evaluate(() => window.pptInjected)).toBeUndefined()
    await window.locator('#ppt-slide-title').fill('把一个好想法，讲清楚')
    await window.locator('.view').evaluate((element) => {
      element.scrollTop = 0
    })
    await window.screenshot({
      path: path.join(screenshotDir, 'editor-dark.png'),
      animations: 'disabled',
    })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1080, 800))
    await window.evaluate(() => window.launcher.patchSettings({ theme: 'light' }))
    await expect(window.locator('body')).toHaveAttribute('data-theme', 'light')
    const overflow = await window
      .locator('.ppt-studio')
      .evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    await window.locator('#ppt-slide-title').focus()
    await expect(window.locator('#ppt-slide-title')).toBeFocused()
    await window.locator('.view').evaluate((element) => {
      element.scrollTop = 0
    })
    await window.screenshot({
      path: path.join(screenshotDir, 'editor-light-narrow.png'),
      animations: 'disabled',
    })
    await window.locator('#ppt-slide-body').fill('长文本'.repeat(300))
    await expect(window.locator('[data-ppt-checks]')).toContainText('超出版式容量')
    await window.getByRole('button', { name: '导出 PPTX', exact: true }).click()
    await expect(window.locator('.ppt-error')).toContainText('超出版式容量')
  } finally {
    if (app) await close(app)
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

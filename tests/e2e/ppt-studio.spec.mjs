import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')
const { createPresentation } = require('../../src/shared/presentation.mjs')
const screenshotDir = path.join(os.tmpdir(), 'zp-ppt-studio-qa')

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zp-ppt-e2e-'))
}
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

test('PPT studio edits, reorders, saves, exports native objects and survives restart', async () => {
  const directory = temporaryDirectory()
  let app
  try {
    let launched = await launch(directory)
    app = launched.app
    let window = launched.window
    await expect(window.locator('.nav-section-tools')).toContainText('工具')
    await window.getByRole('button', { name: '试试手动编辑', exact: true }).click()
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
    await window.getByRole('button', { name: '试试手动编辑', exact: true }).click()
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
    await window.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('还没有保存的标题')
    await window.getByRole('button', { name: '返回作品', exact: true }).click()
    await window.locator('#dialogChoice').selectOption('discard')
    await window.getByRole('dialog').getByRole('button', { name: '继续', exact: true }).click()
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

test('PPT studio stages model output before adoption and preserves the draft on a failed generation', async () => {
  const directory = temporaryDirectory()
  let malformed = false
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      requests.push(JSON.parse(body))
      const slides = createPresentation({ title: '模型建议标题' }).slides
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [
            { message: { content: malformed ? '{"slides":[]}' : JSON.stringify({ slides }) } },
          ],
        }),
      )
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let app
  try {
    const launched = await launch(directory)
    app = launched.app
    const window = launched.window
    await window.evaluate(async (baseUrl) => {
      await window.launcher.saveAiProfile(
        { label: '本地测试模型', baseUrl, model: 'test', requiresKey: false },
        '',
      )
    }, `http://127.0.0.1:${server.address().port}/v1`)
    await window.reload()
    await window.locator('.nav-item[data-page="ppt"]').click()
    await window.getByRole('button', { name: '试试手动编辑', exact: true }).click()
    await window.locator('#ppt-slide-title').fill('我的原始标题')
    await window.getByRole('button', { name: 'AI 大纲', exact: true }).click()
    await window.locator('#ppt-brief-title').fill('服务提案')
    await window.locator('[data-ppt-field="pageCount"]').selectOption('3')
    await window.locator('#ppt-brief-material').fill('本次主动提供的真实事实')
    await window.getByRole('button', { name: '生成 AI 大纲', exact: true }).click()
    await expect(window.locator('.ppt-candidate')).toBeVisible()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('我的原始标题')
    expect(
      (await window.evaluate(() => window.launcher.getWorkspace())).presentations,
    ).toHaveLength(0)
    expect(requests[0].messages[1].content).toContain('本次主动提供的真实事实')
    await window.getByRole('button', { name: '采用这版大纲', exact: true }).click()
    await expect(window.locator('#ppt-deck-title')).toHaveValue('服务提案')
    await window.getByRole('button', { name: '撤销修改', exact: true }).click()
    await expect(window.locator('#ppt-slide-title')).toHaveValue('我的原始标题')
    malformed = true
    await window.getByRole('button', { name: 'AI 大纲', exact: true }).click()
    await window.getByRole('button', { name: '生成 AI 大纲', exact: true }).click()
    await expect(window.locator('.ppt-error')).toContainText('页数不完整')
    await expect(window.locator('#ppt-slide-title')).toHaveValue('我的原始标题')
    await expect(window.locator('.ppt-candidate')).toHaveCount(0)
  } finally {
    if (app) await close(app)
    await new Promise((resolve) => server.close(resolve))
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
    await window.getByRole('button', { name: '试试手动编辑', exact: true }).click()
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

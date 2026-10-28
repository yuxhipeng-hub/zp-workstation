import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import sharp from 'sharp'

test('model settings verifies pictures, assigns a separate visual role and checks actual PPTX rendering', async () => {
  test.setTimeout(120000)
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-visual-e2e-'))
  let app
  const requests = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      const payload = JSON.parse(body)
      requests.push(payload)
      const text = payload.input[0].content[0].text
      const content = text.includes('按图片出现顺序')
        ? JSON.stringify({
            images: [
              [
                { color: 'red', shape: 'circle' },
                { color: 'green', shape: 'square' },
                { color: 'blue', shape: 'triangle' },
              ],
              [
                { color: 'blue', shape: 'circle' },
                { color: 'red', shape: 'square' },
                { color: 'green', shape: 'triangle' },
              ],
            ],
          })
        : text.includes('用中文描述图片')
          ? '图片中是蓝色矩形，未见文字与数值。'
          : JSON.stringify({ issues: [], patches: [] })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          model: 'reported-vision',
          output: [
            { type: 'reasoning', content: [{ type: 'reasoning_text', text: '不要拼入最终回答' }] },
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: content }],
            },
          ],
        }),
      )
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const env = {
      ...process.env,
      ZP_WORKBENCH_USER_DATA: directory,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    }
    delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({ args: ['.'], env })
    const window = await app.firstWindow()
    const welcome = window.getByRole('button', { name: '进入工作站' })
    if (
      await welcome
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false)
    )
      await welcome.click()
    const config = await window.evaluate(async (baseUrl) => {
      await window.launcher.saveAiProfile(
        {
          label: '视觉测试',
          model: 'vision-alias',
          protocol: 'responses',
          baseUrl,
          supportsVision: false,
        },
        '',
      )
      return window.launcher.saveAiProfile({ label: '文字策划', model: 'text-model', baseUrl }, '')
    }, `http://127.0.0.1:${server.address().port}/v1`)
    const visionId = config.profiles.find((p) => p.model === 'vision-alias').id
    const textId = config.profiles.find((p) => p.model === 'text-model').id
    await window.evaluate((id) => window.launcher.activateAiProfile(id), textId)
    await window.reload()
    await window.locator('.nav-item[data-page="ai"]').click()
    await window
      .locator('.ai-profile-row')
      .filter({ hasText: '视觉测试' })
      .getByRole('button', { name: '测试图片识别', exact: true })
      .click()
    await expect(window.locator('#aiSettingsGroup [role="status"]')).toContainText('识图测试通过')
    await expect(window.locator('#aiSettingsGroup [role="status"]')).toContainText(
      'reported-vision',
    )
    await window.getByRole('button', { name: '用于 PPT 视觉检查', exact: true }).click()
    expect((await window.evaluate(() => window.launcher.getAiConfig())).activeProfileId).toBe(
      textId,
    )
    await expect(window.locator('#pptVisionProfile')).toHaveValue(visionId)
    await window.reload()
    await window.locator('.nav-item[data-page="ai"]').click()
    await expect(window.locator('#pptVisionProfile')).toHaveValue(visionId)
    await window.locator('.nav-item[data-page="ppt"]').click()
    await window.getByRole('button', { name: '从空白作品开始', exact: true }).click()
    await window.getByRole('button', { name: '直接编辑', exact: true }).click()
    const imagePath = path.join(directory, 'photo.png')
    await sharp({ create: { width: 320, height: 180, channels: 3, background: '#2472b2' } })
      .png()
      .toFile(imagePath)
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
    }, imagePath)
    await window.getByRole('button', { name: '图片', exact: true }).click()
    await window.getByText('图片理解与视觉检查', { exact: true }).click()
    await window.getByRole('button', { name: '理解选中图片', exact: true }).click()
    await expect(window.locator('.ppt-message-assistant')).toContainText('蓝色矩形')
    await window.getByRole('button', { name: '检查当前页', exact: true }).click()
    await expect(window.locator('.ppt-visual-report')).toContainText('已检查第 1 页', {
      timeout: 60000,
    })
    await expect(window.locator('.ppt-visual-report')).toContainText('未发现明显视觉问题')
    await window.getByRole('button', { name: '返回画布编辑', exact: true }).click()
    await window.locator('.ppt-layer-list summary').click()
    await window
      .locator('.ppt-layer-list')
      .getByRole('button', { name: '从一个好想法开始', exact: true })
      .click()
    await window.getByLabel('字号', { exact: true }).fill('42')
    await expect(window.locator('.ppt-visual-report')).toContainText('作品已修改')
    expect(
      requests.filter((p) => p.input[0].content.some((part) => part.type === 'input_image')).length,
    ).toBe(3)
    const screenshotDir = path.join(os.tmpdir(), 'zp-ppt-visual-qa')
    fs.mkdirSync(screenshotDir, { recursive: true })
    for (const theme of ['dark', 'light']) {
      await window.evaluate((value) => window.launcher.patchSettings({ theme: value }), theme)
      await expect(window.locator('body')).toHaveAttribute('data-theme', theme)
      await window.screenshot({
        path: path.join(screenshotDir, `visual-editor-${theme}.png`),
        animations: 'disabled',
      })
    }
  } finally {
    if (app) {
      await app.evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1
      })
      await app.close()
    }
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

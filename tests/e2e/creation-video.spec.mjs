/* global window, document */
import { test, expect } from '@playwright/test'
import { launchHiddenElectron } from './hidden-electron.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
test('video workflow edits real records and exports playable FFmpeg film without model calls', async () => {
  test.setTimeout(120000)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-video-e2e-'))
  const env = {
    ...process.env,
    ZP_WORKBENCH_USER_DATA: path.join(dir, 'user'),
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  }
  delete env.ELECTRON_RUN_AS_NODE
  let app
  try {
    app = await launchHiddenElectron(dir, env)
    const w = await app.firstWindow()
    const welcome = w.getByRole('button', { name: '进入工作站' })
    if (
      await welcome
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false)
    )
      await welcome.click()
    await w.locator('[data-page="creation"]').click()
    await w.locator('[data-action="cs-new"]').first().click()
    await w.getByLabel('项目名称', { exact: true }).fill('视频流程隔离验收')
    await w.getByText('目标与阶段', { exact: true }).click()
    await w.getByLabel('一句话目标').fill('展示一个可重复制作流程')
    await w.locator('[data-action="cs-save-project"]').click()
    await w.locator('[data-action="cs-new-video"]').first().click()
    await w.getByLabel('视频名称', { exact: true }).fill('视频流程隔离验收')
    await w.locator('[data-action="cs-save-project"]').click()
    await w.locator('[data-action="cs-open-work"]').click()
    await w.locator('[data-action="cs-v-enable"]').click()
    await expect(w.getByRole('heading', { name: '视频制作', exact: true })).toBeVisible()
    await w.getByLabel('一句话创意', { exact: true }).fill('纸球滚向画面右侧，角色跟随')
    await w.locator('[data-action="cs-v-save-brief"]').click()
    await expect(w.locator('.cc-workpage')).toHaveCount(0)
    await w.locator('[data-action="cs-open-work"]').click()
    await w.locator('[data-action="cs-v-step"][data-id="story"]').click()
    await w.getByLabel('故事草稿').fill('球从桌面左侧滚到右侧，角色看到后依次转头。')
    await w.locator('[data-action="cs-v-confirm-story"]').click()
    await w.locator('[data-action="cs-v-step"][data-id="shots"]').click()
    await w.locator('[data-action="cs-v-add-shot"]').click()
    await w.getByLabel('叙事目的', { exact: true }).fill('建立球的运动方向')
    await w.getByLabel('故事内容', { exact: true }).fill('球向右滚动')
    await w.getByLabel('目标成片时长（秒）').fill('1')
    await w.locator('[data-action="cs-v-save-shot"]').click()
    const data = await w.evaluate(() => window.launcher.getWorkspace()),
      id = data.creationProjects[0].id
    const file = path.join(dir, 'clip.mp4')
    fs.writeFileSync(file, require('../fixtures/creation-video.cjs'))
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, file)
    await w.locator('[data-action="cs-import"]').first().click()
    const frame1 = path.join(dir, 'frame1.png'),
      frame2 = path.join(dir, 'frame2.png')
    await require('sharp')({ create: { width: 320, height: 180, channels: 3, background: '#777' } })
      .png()
      .toFile(frame1)
    await require('sharp')({ create: { width: 320, height: 180, channels: 3, background: '#888' } })
      .png()
      .toFile(frame2)
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files })
      },
      [frame1, frame2],
    )
    await w.locator('[data-action="cs-import"]').first().click()
    await expect
      .poll(
        async () =>
          (
            await w.evaluate(() => window.launcher.getWorkspace())
          ).creationProjects[0].artifacts.filter((a) => a.type === 'image').length,
      )
      .toBe(2)
    const images = (
      await w.evaluate(() => window.launcher.getWorkspace())
    ).creationProjects[0].artifacts.filter((a) => a.type === 'image')
    await w.locator('[data-action="cs-v-step"][data-id="design"]').click()
    await w.getByLabel('画风说明与少量样图确认').fill('灰阶纸片，保持左右方向')
    await w.getByLabel('参考图片具体版本', { exact: true }).selectOption([images[0].id])
    await w.locator('[data-action="cs-v-confirm-design"]').click()
    await w.getByLabel('首帧具体版本').selectOption(images[0].id)
    await w.getByLabel('尾帧具体版本').selectOption(images[1].id)
    await w.locator('[data-action="cs-v-save-frames"]').click()
    await expect(w.locator('.cv-frames img')).toHaveCount(2)
    await w.locator('[data-action="cs-v-frames-overlay"]').click()
    await expect(w.locator('.cv-frames')).toHaveClass(/is-overlay/)
    await w.locator('.cv-frames img').last().click()
    await expect(w.locator('.cv-lightbox')).toHaveAttribute('open', '')
    await w.getByRole('button', { name: '关闭图片' }).click()
    await w.locator('[data-action="cs-v-add-design-record"]').click()
    await w
      .locator('.cv-workspace details')
      .filter({ has: w.getByLabel('设定名称') })
      .locator('summary')
      .first()
      .click()
    await w.getByLabel('设定名称').fill('主角纸人')
    await w.getByLabel('左右特征', { exact: true }).fill('左侧固定蓝色配件')
    await w.locator('[data-action="cs-v-save-design-record"]').click()
    await w.locator('[data-action="cs-v-step"][data-id="generate"]').click()
    await w.getByText('供应商配置与预算', { exact: true }).click()
    await w.getByLabel('火山方舟 API Key（仅安全存储）').fill('never-persist-draft-secret')
    await w.locator('[data-action="cs-v-step"][data-id="edit"]').click()
    await w.getByLabel('输出宽度').fill('320')
    await w.getByLabel('输出高度').fill('256')
    const a = (await w.evaluate(() => window.launcher.getWorkspace())).creationProjects[0]
      .artifacts[0]
    await w.getByLabel('视频具体版本').selectOption(a.id)
    await w.getByLabel('片段入点（秒）').fill('0')
    await w.getByLabel('片段出点（秒）').fill('1')
    await w.getByLabel('片段字幕').fill('受控后期实测')
    await w.locator('[data-action="cs-v-save-edit"]').click()
    await w.locator('[data-action="cs-v-render"]').click()
    await expect(
      w.locator('.cv-workspace details > summary').filter({ hasText: /待人工验收 ·/ }),
    ).toBeVisible({ timeout: 30000 })
    await w.locator('[data-action="cs-v-step"][data-id="generate"]').click()
    await w.getByText('供应商配置与预算', { exact: true }).click()
    await expect(w.getByLabel('火山方舟 API Key（仅安全存储）')).toHaveValue('')
    const saved = (await w.evaluate(() => window.launcher.getWorkspace())).creationProjects[0]
    expect(saved.video.confirmedStory).toBeTruthy()
    expect(saved.video.jobs).toHaveLength(0)
    expect(JSON.stringify(saved)).not.toContain('never-persist-draft-secret')
    expect(saved.video.exports[0].status).toBe('review')
    await w.locator('[data-action="cs-tab"][data-id="works"]').click()
    await expect(w.locator('.cs-preview video')).toBeVisible()
    await expect
      .poll(() => w.locator('.cs-preview video').evaluate((v) => v.readyState))
      .toBeGreaterThanOrEqual(1)
    await w.locator('.cs-preview video').evaluate((v) => v.play())
    await expect
      .poll(() => w.locator('.cs-preview video').evaluate((v) => v.currentTime))
      .toBeGreaterThan(0.2)
    for (const theme of ['light', 'dark']) {
      await w.evaluate((theme) => {
        document.body.dataset.theme = theme
      }, theme)
      await w.locator('[data-action="cs-tab"][data-id="video"]').click()
      await w.locator('[data-action="cs-v-step"][data-id="design"]').click()
      await w.setViewportSize({ width: 900, height: 820 })
      expect(
        await w.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
      fs.mkdirSync(path.join(os.tmpdir(), 'zp-creation-video-qa'), { recursive: true })
      await w.screenshot({
        path: path.join(os.tmpdir(), 'zp-creation-video-qa', theme + '.png'),
        fullPage: true,
      })
    }
    await w.locator('[data-action="cs-v-step"][data-id="shots"]').click()
    await w.locator('[data-action="cs-v-add-shot"]').click()
    await w.getByLabel('叙事目的', { exact: true }).fill('待删除镜头')
    await w.locator('[data-action="cs-v-save-shot"]').click()
    await w.locator('[data-action="cs-v-delete-shot"]').click()
    const afterDelete = (await w.evaluate(() => window.launcher.getWorkspace())).creationProjects[0]
    expect(afterDelete.video.content.shots).toHaveLength(1)
    expect(afterDelete.video.content.shots[0].id).toBe(saved.video.content.shots[0].id)
    expect(afterDelete.artifacts).toEqual(saved.artifacts)
    await w.locator('[data-action="cs-v-delete-shot"]').click()
    await expect(w.locator('[data-action="cs-v-shot"]')).toHaveCount(0)
    const empty = (await w.evaluate(() => window.launcher.getWorkspace())).creationProjects[0]
    expect(empty.video.content.shots).toHaveLength(0)
    expect(empty.video.edit.clips).toHaveLength(0)
    expect(empty.video.exports).toEqual(saved.video.exports)
    expect(empty.artifacts).toEqual(saved.artifacts)
    expect(saved.id).toBe(id)
  } finally {
    if (app) await app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

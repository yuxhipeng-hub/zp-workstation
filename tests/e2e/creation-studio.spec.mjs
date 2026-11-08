/* global window, document */
import { test, expect } from '@playwright/test'
import { launchHiddenElectron } from './hidden-electron.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const sharp = require('sharp')
const videoFixture = require('../fixtures/creation-video.cjs')
const screenshotDir = path.join(os.tmpdir(), 'zp-creation-qa')
async function launch(dir) {
  const env = {
    ...process.env,
    ZP_WORKBENCH_USER_DATA: path.join(dir, 'user'),
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await launchHiddenElectron(dir, env)
  const window = await app.firstWindow()
  const welcome = window.getByRole('button', { name: '进入工作站' })
  if (
    await welcome
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
  )
    await welcome.click()
  await window.locator('[data-page="creation"]').click()
  return { app, window }
}
async function close(app) {
  await app.close()
}
const action = (w, name) => w.locator(`[data-action="cs-${name}"]`)
test('creation studio persists real IPC imports, versions, timed feedback, approval and publication snapshots', async () => {
  test.setTimeout(120000)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-creation-e2e-'))
  let app
  try {
    let launched = await launch(dir)
    app = launched.app
    let w = launched.window
    await expect(w.getByText('让创意从这里展开')).toBeVisible()
    await action(w, 'new').first().click()
    await w.getByLabel('项目名称', { exact: true }).fill('审片隔离项目')
    await w.getByText('目标与阶段', { exact: true }).click()
    await w.getByLabel('一句话目标').fill('核对每一次改动')
    await w.getByLabel('创作要求').fill('8秒短片，保持字幕')
    await action(w, 'save-project').click()
    await expect(w.locator('.cc-project-trigger strong')).toHaveText('审片隔离项目')
    const groupId = (await w.evaluate(() => window.launcher.getWorkspace())).creationProjects[0].id
    await action(w, 'new-video').first().click()
    await w.getByLabel('视频名称', { exact: true }).fill('审片隔离项目')
    await action(w, 'save-project').click()
    await action(w, 'open-work').click()
    await action(w, 'tab').filter({ hasText: '总览' }).click()
    await expect(w.locator('.cs-project-heading h2')).toHaveText('审片隔离项目')
    await expect(w.getByRole('heading', { name: '尚未导入产物', exact: true })).toBeVisible()
    await sharp({ create: { width: 640, height: 360, channels: 3, background: '#555' } })
      .png()
      .toFile(path.join(dir, 'one.png'))
    await sharp({ create: { width: 640, height: 360, channels: 3, background: '#aaa' } })
      .png()
      .toFile(path.join(dir, 'two.png'))
    const record = {
      schemaVersion: 1,
      projectId: 'qa',
      sourceVersion: 'source1',
      updatedAt: new Date().toISOString(),
      tasks: [{ id: 'task', goal: '制作真实记录', status: 'review' }],
      runs: [
        {
          id: 'run',
          taskId: 'task',
          status: 'running',
          description: '外部执行器提供',
          updatedAt: new Date().toISOString(),
          frames: 12,
          totalFrames: 24,
        },
      ],
      artifacts: [
        { id: 'a', family: '关键帧', type: 'image', label: 'v1', path: 'one.png' },
        { id: 'b', family: '关键帧', type: 'image', label: 'v2', path: 'two.png' },
      ],
    }
    fs.writeFileSync(path.join(dir, 'workbench-record.json'), JSON.stringify(record))
    fs.writeFileSync(path.join(dir, 'BRIEF.md'), '只读简报，不构成执行状态')
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] })
    }, dir)
    await action(w, 'connect').click()
    await w.getByText('关联资料（仅供阅读）', { exact: true }).click()
    await action(w, 'document').filter({ hasText: 'BRIEF.md' }).click()
    await expect(w.locator('[data-cs-document]')).toHaveText('只读简报，不构成执行状态')
    await action(w, 'refresh').click()
    await expect(w.locator('.cs-preview img')).toBeVisible()
    await expect.poll(() => w.locator('.cs-preview img').evaluate((x) => x.naturalWidth)).toBe(640)
    await action(w, 'refresh').click()
    expect(
      (await w.evaluate(() => window.launcher.getWorkspace())).creationProjects[0].artifacts,
    ).toHaveLength(2)
    await action(w, 'tab').filter({ hasText: '作品与版本' }).click()
    const project = (await w.evaluate(() => window.launcher.getWorkspace())).creationProjects[0]
    await w.getByLabel('对比版本', { exact: true }).selectOption(project.artifacts[0].id)
    await expect(w.locator('.cs-preview img')).toHaveCount(2)
    await expect
      .poll(() =>
        w
          .locator('.cs-preview img')
          .first()
          .evaluate((x) => x.naturalWidth),
      )
      .toBe(640)
    await action(w, 'select').click()
    await action(w, 'tab').filter({ hasText: '修改意见' }).click()
    await w.getByLabel('时间点（秒，可留空）').fill('6.2')
    await w.getByLabel('观察到的问题').fill('纸箱落地太轻')
    await w.getByLabel('希望达到的效果').fill('增加挤压回弹，字幕不变')
    await action(w, 'add-review').click()
    await expect(w.locator('.cs-review')).toContainText('6.2 秒')
    await action(w, 'copy-feedback').click()
    const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText())
    expect(clipboard).toContain('6.2 秒')
    expect(clipboard).toContain('v2')
    await w.getByLabel('修复版本', { exact: true }).selectOption(project.artifacts[0].id)
    await w.getByLabel('处理状态', { exact: true }).selectOption('resolved')
    await action(w, 'update-review').click()
    await action(w, 'tab').filter({ hasText: '作品与版本' }).click()
    await action(w, 'approve').click()
    await expect(w.locator('[data-cs-preview="main"] [data-cs-acceptance]')).toHaveText(
      '用户已验收',
    )
    await action(w, 'tab').filter({ hasText: '发布复盘' }).click()
    await w.getByLabel('发布平台').fill('手动平台')
    await w.getByLabel('实际发布时间').fill('2026-11-05T12:00')
    await w.getByLabel('对应成片版本').selectOption(project.artifacts[1].id)
    await action(w, 'publication').click()
    await w.getByText('添加一次观察快照', { exact: true }).click()
    await w.getByLabel('数据观察时间').fill('2026-11-06T12:00')
    await w.getByLabel('播放', { exact: true }).fill('100')
    await action(w, 'observation').click()
    await expect(w.locator('.cs-review')).toContainText('播放 100 · 赞 未知')
    fs.mkdirSync(screenshotDir, { recursive: true })
    await action(w, 'tab').filter({ hasText: '总览', exact: true }).click()
    for (const theme of ['dark', 'light']) {
      await w.evaluate(async (theme) => window.launcher.patchSettings({ theme }), theme)
      await expect(w.locator('body')).toHaveAttribute('data-theme', theme)
      await w.screenshot({
        animations: 'disabled',
        path: path.join(screenshotDir, `${theme}-overview.png`),
      })
    }
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.setMinimumSize(600, 600)
      window.setSize(760, 850)
    })
    await expect
      .poll(() => w.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await w.screenshot({ path: path.join(screenshotDir, 'narrow.png') })
    await action(w, 'tab').filter({ hasText: '修改意见' }).focus()
    await w.keyboard.press('Enter')
    await expect(w.getByLabel('观察到的问题')).toBeVisible()
    await action(w, 'new').first().click()
    await w.getByLabel('项目名称', { exact: true }).fill('第二个项目')
    await action(w, 'save-project').click()
    await expect(w.locator('.cc-project-trigger strong').first()).toHaveText('第二个项目')
    await w.locator('.cc-video-object [data-action="cs-edit"]').click()
    await expect(w.getByLabel('视频名称', { exact: true })).toHaveValue('审片隔离项目')
    await action(w, 'cancel-edit').click()
    await close(app)
    app = null
    launched = await launch(dir)
    app = launched.app
    w = launched.window
    await w.locator(`[data-action="cs-toggle"][data-id="${groupId}"]`).click()
    await action(w, 'open-work').click()
    await action(w, 'tab').filter({ hasText: '总览' }).click()
    await expect(w.locator('.cs-project-heading h2')).toHaveText('审片隔离项目')
    await expect(w.locator('[data-cs-latest]')).toHaveCount(0)
    await w.getByText('任务与执行详情', { exact: false }).click()
    await expect(w.locator('[data-cs-run-state]')).toHaveText('状态待确认')
    await action(w, 'tab').filter({ hasText: '修改意见' }).click()
    await expect(w.locator('.cs-review')).toContainText('纸箱落地太轻')
    fs.unlinkSync(path.join(dir, 'two.png'))
    await action(w, 'tab').filter({ hasText: '作品与版本' }).click()
    await expect(w.locator('[data-cs-preview="main"]')).toContainText('文件已丢失')
    await expect(w.locator('[data-cs-preview="main"] [data-cs-acceptance]')).toHaveText(
      '验收未生效',
    )
  } finally {
    if (app) await close(app)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('real local MP4 streams, seeks both versions and binds feedback to the original timestamp', async () => {
  test.setTimeout(60000)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-creation-video-'))
  let app
  try {
    fs.writeFileSync(path.join(dir, 'v1.mp4'), videoFixture)
    fs.writeFileSync(path.join(dir, 'v2.mp4'), videoFixture)
    const launched = await launch(dir)
    app = launched.app
    const w = launched.window
    await action(w, 'new').first().click()
    await w.getByLabel('项目名称', { exact: true }).fill('MP4审片')
    await action(w, 'save-project').click()
    await action(w, 'new-video').first().click()
    await w.getByLabel('视频名称', { exact: true }).fill('MP4审片')
    await action(w, 'save-project').click()
    await action(w, 'open-work').click()
    await action(w, 'tab').filter({ hasText: '总览' }).click()
    await expect(w.locator('.cs-project-heading h2')).toHaveText('MP4审片')
    const projectId = (await w.evaluate(() => window.launcher.getWorkspace())).creationProjects[0]
      .id
    for (const label of ['v1', 'v2']) {
      await app.evaluate(
        ({ dialog }, file) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
        },
        path.join(dir, `${label}.mp4`),
      )
      await action(w, 'import').first().click()
      await expect(w.locator('.creation-studio')).toHaveAttribute('aria-busy', 'false')
    }
    await expect.poll(() => w.locator('video').evaluate((v) => v.duration)).toBe(8)
    await w.locator('video').evaluate((v) => v.play())
    await expect.poll(() => w.locator('video').evaluate((v) => v.currentTime)).toBeGreaterThan(0.2)
    await w.locator('video').evaluate((v) => {
      v.pause()
      v.currentTime = 6.2
    })
    await action(w, 'tab').filter({ hasText: '修改意见' }).click()
    await expect.poll(() => w.locator('video').evaluate((v) => v.currentTime)).toBeCloseTo(6.2, 1)
    await action(w, 'capture-time').click()
    await expect(w.getByLabel('时间点（秒，可留空）')).toHaveValue('6.20')
    await w.getByLabel('观察到的问题').fill('第6.2秒动作太轻')
    await w.getByLabel('希望达到的效果').fill('增加回弹')
    await action(w, 'add-review').click()
    const p = (await w.evaluate(() => window.launcher.getWorkspace())).creationProjects.find(
      (p) => p.id === projectId,
    )
    expect(p.reviews[0].artifactId).toBe(p.artifacts[1].id)
    expect(p.reviews[0].time).toBe(6.2)
    await action(w, 'tab').filter({ hasText: '作品与版本' }).click()
    await w.getByLabel('对比版本', { exact: true }).selectOption(p.artifacts[0].id)
    await expect(w.locator('video')).toHaveCount(2)
    await expect
      .poll(() =>
        w
          .locator('video')
          .last()
          .evaluate((v) => v.duration),
      )
      .toBe(8)
    await w.getByLabel('同步时间点（秒）').fill('3.5')
    await action(w, 'sync-time').click()
    for (let i = 0; i < 2; i++)
      await expect
        .poll(() =>
          w
            .locator('video')
            .nth(i)
            .evaluate((v) => v.currentTime),
        )
        .toBeCloseTo(3.5, 1)
    await action(w, 'tab').filter({ hasText: '修改意见' }).click()
    await action(w, 'locate').click()
    await expect.poll(() => w.locator('video').evaluate((v) => v.currentTime)).toBeCloseTo(6.2, 1)
  } finally {
    if (app) await close(app)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

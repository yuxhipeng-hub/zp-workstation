import { test, expect, _electron as electron } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

function createUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'zp-workbench-e2e-'))
}

function launchWorkstation(userDataDir) {
  return electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      ZP_WORKBENCH_USER_DATA: userDataDir,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  })
}

async function dismissWelcome(window) {
  const welcomeButton = window.getByRole('button', { name: '进入工作站' })
  const welcomeVisible = await welcomeButton
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)

  if (welcomeVisible) {
    await welcomeButton.click()
  }
}

async function closeWorkstation(app, userDataDir) {
  await app.close()
  fs.rmSync(userDataDir, { recursive: true, force: true })
}

/**
 * 反复测量直到所有元素都有盒子且坐标连续两次一致。
 * 打开弹层或自动刷新会触发重渲染，直接量一次 `boundingBox()` 在 CI 上会偶发拿到 null。
 */
async function stableBoxes(window, selectors, attempts = 40) {
  let previous = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const boxes = await Promise.all(
      selectors.map((selector) => window.locator(selector).boundingBox()),
    )
    if (boxes.every(Boolean)) {
      const signature = JSON.stringify(
        boxes.map((box) => [box.x, box.y, box.width, box.height].map((value) => Math.round(value))),
      )
      if (signature === previous) return boxes
      previous = signature
    } else {
      previous = null
    }
    await window.waitForTimeout(50)
  }
  throw new Error('布局元素没有在预期时间内稳定')
}

test('launches the workstation on today and keeps the topbar actions available', async () => {
  const userDataDir = createUserDataDir()
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await expect(window).toHaveTitle('ZP Workbench')
    await dismissWelcome(window)
    await window.waitForTimeout(350)

    await window.locator('[data-action="toggle-theme"]').focus()
    await expect(window.locator('#quickTooltip')).toContainText('主题')
    await expect(window.locator('#quickTooltip')).toBeVisible()

    await expect(window.getByRole('button', { name: '总览', exact: true })).toHaveCount(0)
    await expect(window.getByRole('heading', { name: '今日' })).toBeVisible()
    await expect(window.locator('#topLaunchButton')).toHaveCount(0)
    await expect(window.getByRole('heading', { name: 'AI 资讯', exact: true })).toBeVisible()

    // 首屏渲染完成后，主进程应把启动耗时写进日志，便于做性能基线。
    const logFile = path.join(userDataDir, 'logs', 'workbench.log')
    await expect
      .poll(() => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''))
      .toContain('启动耗时')

    const [brandBox, topbarBox] = await Promise.all([
      window.locator('.brand').boundingBox(),
      window.locator('.topbar').boundingBox(),
    ])
    expect(Math.abs(brandBox.height - topbarBox.height)).toBeLessThan(1)
    const [brandEdge, topbarEdge] = await Promise.all([
      window.locator('.brand').evaluate((element) => {
        const style = globalThis.getComputedStyle(element)
        return [style.borderBottomWidth, style.borderBottomColor]
      }),
      window.locator('.topbar').evaluate((element) => {
        const style = globalThis.getComputedStyle(element)
        return [style.borderBottomWidth, style.borderBottomColor]
      }),
    ])
    expect(brandEdge).toEqual(topbarEdge)

    const scrollbarButtonDisplay = await window
      .locator('.view')
      .evaluate(
        (element) => globalThis.getComputedStyle(element, '::-webkit-scrollbar-button').display,
      )
    expect(scrollbarButtonDisplay).toBe('none')

    await expect(window.locator('#runtimeRibbon')).toHaveCount(0)
    await expect(window.locator('#launcherUpdateBanner')).toBeAttached()
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('groups every non-today route inside one workbench canvas', async () => {
  const userDataDir = createUserDataDir()
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await dismissWelcome(window)

    const pages = [
      'ai',
      'schedule',
      'assignments',
      'experiments',
      'news',
      'guide',
      'logs',
      'settings',
      'backup',
      'about',
    ]

    await expect(window.locator('#view > [data-route-canvas]')).toHaveCount(0)
    for (const page of pages) {
      await window.locator(`.nav-item[data-page="${page}"]`).click()
      await expect(window.locator('#view > .route-canvas')).toHaveCount(1)
      const roundedPageModules = await window
        .locator('#view > .route-canvas > *')
        .evaluateAll((elements) =>
          elements
            .map((element) => {
              const style = globalThis.getComputedStyle(element)
              return {
                className: element.className,
                selectableControl: element.matches('.segmented'),
                radius: Math.max(
                  Number.parseFloat(style.borderTopLeftRadius) || 0,
                  Number.parseFloat(style.borderTopRightRadius) || 0,
                  Number.parseFloat(style.borderBottomRightRadius) || 0,
                  Number.parseFloat(style.borderBottomLeftRadius) || 0,
                ),
              }
            })
            .filter((module) => module.radius > 0.5 && !module.selectableControl),
        )
      expect(roundedPageModules, `${page} should use square page-module connections`).toEqual([])
      if (page === 'guide') {
        await expect(window.locator('.ai-concept-board')).toHaveCSS('border-radius', '0px')
      }
    }

    await window.locator('.nav-item[data-page="today"]').click()
    await expect(window.locator('#view > [data-route-canvas]')).toHaveCount(0)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('keeps one assignment entry on today and opens the composer', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0]
      mainWindow.setMinimumSize(1200, 700)
      mainWindow.setSize(1440, 920)
    })
    await window.locator('.nav').getByRole('button', { name: '今日', exact: true }).click()

    await expect(window.locator('#view .today-courses')).toHaveCount(0)
    await expect(window.locator('#view').getByRole('button', { name: '新建课程' })).toBeVisible()
    const entry = window.locator('#view').getByRole('button', { name: '添加作业', exact: true })
    await expect(entry).toHaveCount(1)
    await entry.click()
    await expect(window.locator('#assignmentTitle')).toBeVisible()

    await expect(
      window.locator('.today-grid-primary').getByRole('heading', { name: '最近资料' }),
    ).toBeVisible()
    // 打开作业编辑器会触发重渲染；反复测量到所有元素都有盒子且坐标稳定，避免 CI 上拿到 null。
    const [heroCopy, heroSide, primaryColumn, rightColumn] = await stableBoxes(window, [
      '.today-hero-copy',
      '.today-hero-side',
      '.today-grid-primary',
      '.today-grid > .today-grid-column:last-child',
    ])
    expect(Math.abs(heroCopy.x - primaryColumn.x)).toBeLessThan(1)
    expect(
      Math.abs(heroCopy.x + heroCopy.width - primaryColumn.x - primaryColumn.width),
    ).toBeLessThan(1)
    expect(Math.abs(heroSide.x - rightColumn.x)).toBeLessThan(1)
    expect(Math.abs(heroSide.x + heroSide.width - rightColumn.x - rightColumn.width)).toBeLessThan(
      1,
    )
    expect(
      Math.abs(primaryColumn.y + primaryColumn.height - (rightColumn.y + rightColumn.height)),
    ).toBeLessThan(1)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('configures a model and runs AI assignment planning end to end', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  const requests = []
  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'test-model' }, { id: 'vision-test' }] }))
      return
    }
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const payload = JSON.parse(body)
      requests.push(payload)
      const userText = String(payload.messages?.at(-1)?.content || '')
      const content = userText.includes('通知原文')
        ? JSON.stringify({
            assignments: [
              {
                title: '概率论第 5 章习题',
                course: '概率论',
                dueAt: '',
                priority: 'high',
                notes: '拍照上传',
              },
            ],
          })
        : JSON.stringify({
            summary: '完成操作系统实验',
            prerequisites: ['阅读实验要求'],
            steps: ['梳理调度目标', '实现算法', '运行边界测试'],
            risks: ['忽略进程状态边界'],
            checklist: ['提交实验报告'],
          })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content,
              },
            },
          ],
        }),
      )
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}/v1`
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav-item[data-page="ai"]').click()
    await expect(window.locator('.page-intro h2').filter({ hasText: '模型配置' })).toBeVisible()
    await window.getByRole('button', { name: '添加模型' }).click()
    await expect(window.getByText('高级模型设置', { exact: true })).toBeVisible()
    await window.locator('.ai-advanced-settings > summary').click()
    await expect(window.locator('#aiProfileProtocol')).toBeVisible()
    await expect(window.getByText('能力声明', { exact: true })).toBeVisible()
    await window.locator('#aiProfilePreset').selectOption('deepseek-flash')
    await expect(window.locator('#aiProfileBaseUrl')).toHaveValue('https://api.deepseek.com')
    await expect(window.locator('#aiProfileModel')).toHaveValue('deepseek-flash')
    await expect(window.locator('#aiProfileSupportsVision')).toBeChecked()
    await window.locator('#aiProfileLabel').fill('本地测试模型')
    await window.locator('#aiProfileBaseUrl').fill(baseUrl)
    await window.getByRole('button', { name: '搜索模型' }).click()
    const modelOption = window.locator('.ai-model-option').filter({ hasText: 'vision-test' })
    await expect(modelOption).toBeVisible()
    await modelOption.click()
    await expect(window.locator('#aiProfileModel')).toHaveValue('vision-test')
    await window.locator('#aiProfileModel').fill('test-model')
    await window.getByRole('button', { name: '保存模型' }).click()
    await expect(window.locator('.ai-profile-row')).toContainText('本地测试模型')
    await expect(window.locator('.ai-profile-row')).toContainText('本机免 Key')
    const activeRowStyle = await window.locator('.ai-profile-row.is-active').evaluate((element) => {
      const style = globalThis.getComputedStyle(element)
      const marker = globalThis.getComputedStyle(element, '::before')
      return {
        background: style.backgroundColor,
        markerWidth: marker.width,
      }
    })
    expect(activeRowStyle.background).toBe('rgba(0, 0, 0, 0)')
    expect(activeRowStyle.markerWidth).toBe('2px')
    const profileListRadius = await window
      .locator('.ai-profile-list')
      .evaluate((element) =>
        Number.parseFloat(globalThis.getComputedStyle(element).borderTopLeftRadius),
      )
    expect(profileListRadius).toBeGreaterThanOrEqual(10)

    await window.locator('.nav-item[data-page="settings"]').click()
    await expect(window.locator('#aiSettingsGroup')).toHaveCount(0)
    const settingsListRadius = await window.locator('.settings-link-list').evaluate((element) => {
      return Number.parseFloat(globalThis.getComputedStyle(element).borderTopLeftRadius)
    })
    expect(settingsListRadius).toBeGreaterThanOrEqual(10)
    await window.locator('[data-page-jump="ai"]').click()
    await expect(window.locator('#aiSettingsGroup')).toBeVisible()

    await window.locator('.nav-item[data-page="assignments"]').click()
    await window.getByRole('button', { name: '添加作业' }).click()
    await window.locator('#assignmentTitle').fill('进程调度实验')
    await window.locator('#assignmentCourse').fill('操作系统')
    await window.getByRole('button', { name: '添加到收件箱' }).click()

    window.once('dialog', (dialog) => dialog.accept())
    await window.locator('[data-action="run-assignment-ai"]').click()
    await expect(window.locator('.assignment-ai-plan')).toBeVisible()
    await expect(window.locator('.assignment-ai-plan')).toContainText('3 步')
    await expect(window.locator('.assignment-ai-plan')).toContainText('梳理调度目标')
    expect(requests.at(-1).model).toBe('test-model')
    expect(requests.at(-1).messages.at(-1).content).toContain('进程调度实验')

    await window.getByRole('button', { name: '粘贴通知录入' }).click()
    await expect(window.locator('#smartEntryTitle')).toBeVisible()
    await window
      .locator('#smartEntryText')
      .fill('各位同学：下周五前提交概率论第 5 章习题，拍照上传到学习通。')
    await window.getByRole('button', { name: '解析为作业' }).click()
    await expect(window.locator('.smart-entry-draft')).toHaveCount(1)
    await expect(window.locator('.smart-entry-draft')).toContainText('概率论第 5 章习题')
    await expect(window.locator('.smart-entry-draft')).toContainText('高优先级')
    await expect(window.locator('.smart-entry-draft')).toContainText('未设截止')
    expect(requests.at(-1).messages.at(-1).content).toContain('通知原文')
    expect(requests.at(-1).messages.at(-1).content).toContain('概率论第 5 章习题')

    await window.getByRole('button', { name: '添加选中的作业' }).click()
    await expect(
      window.locator('.assignment-card').filter({ hasText: '概率论第 5 章习题' }),
    ).toBeVisible()
    await expect(window.locator('#smartEntryTitle')).toHaveCount(0)
  } finally {
    await closeWorkstation(app, userDataDir)
    await new Promise((resolve) => server.close(resolve))
  }
})

test('extracts assignment drafts from a platform screenshot', async () => {
  const userDataDir = createUserDataDir()
  const imagePath = path.join(userDataDir, '平台通知.png')
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAHgAAAA8CAYAAACtrX6oAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAMASURBVHhe7ZgJkoMgEEU9ngfiON7Fq3gTpkSI0HSzJJlM5td/VVRFZO0HqFk8gWaRGQQLCgaHgsGhYHAoGBwKBoeCwaHgj3D4bV2822X+7/N3gnfnl9kZn3XWzR/x8tjW4nqU3S1+3e5aoZ3GWHa3+qz4PMfm1+XFNp5kQPC1+pZlNjlvhixMePFuO6bklGKe3xWzgsPCesxn926aa53y9uXCzAl9K/Wb8ZtgQLBNNzAqV4CKAITs3o4+62W7IARdBkUkI6jTgmOdXpm0cGW/oa4cW4yB2ndo56OCz91SHzHm4IzAmnID8aSQ7UXKvrLxdINx9Zk32xWsHalVP9d4UztpJ9bDzxamspOrvq/MzpzGGRScdkw56WpwcQWvbq8Fp3uq3IQlWeTnu30gGPJZ3RMcdpy5SBOHP47suLbK51K/WvCJkFwMriUwHqf1Pfv5Xj3DzvzQlziqR4IhdmRbcL3jJdaRW6TQQLnLv1+wGND9u/HCk55LaqqP/Yv8KI9BWmNfuyvlm+3nbZcnQFNw8UJVyryLNOor1w/+g+AcdXDvIgZjj32YfY0GIxNnC2o/InLB9YISKVtM1b2UsvmV3Q3OaYCu4DB5ObDRJAf+BOkb9GXB2dFrChZH+U0tWK1vXD9A3sFTC0Vp0+xrIhhJjCUo7DatD0VwNWaZlHZSDPJb6rwm5tTjs4IHylrlrHz7GWy8EwzswJpacKu+vI65Vxuu8aL6KErB+Y3pYPQE1bxBsHgHSEe1WvaJOVlQcKvtRDwlUh29/lZ88pXNyU+v+ysh1FVOn3/3V6U9ESUpbZp9dQQPPS+tdO6y+A3u9ta/cC3inyFy7OIroaAzpxk+K3igrFXOyn9nMDTOBZJ3O7Vgmi9uF+q83jinlwST74eCwaFgcCgYHAoGh4LBoWBwKBgcCgaHgsGhYHAoGBwKBoeCwaFgcCgYHAoGh4LBoWBwKBgcCgaHgsGhYHAoGBwKBoeCwaFgcCgYHAoGh4LBoWBwKBgcCgaHgsGhYHAoGBwKBoeCwaFgcH6UjErm7hwzHAAAAABJRU5ErkJggg=='
  fs.writeFileSync(imagePath, Buffer.from(pngBase64, 'base64'))
  const requests = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      requests.push(JSON.parse(body))
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  assignments: [
                    {
                      title: '平台截图作业',
                      course: '操作系统',
                      dueAt: '2026-11-01',
                      priority: 'high',
                      notes: '从平台截图识别',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      )
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}/v1`
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify(
      {
        onboarding: { welcomeSeen: true },
        aiProfiles: [
          {
            id: 'vision-e2e',
            label: '视觉测试模型',
            baseUrl,
            model: 'vision-test',
            protocol: 'chat-completions',
            supportsVision: true,
            timeoutMs: 90000,
            contextWindow: 0,
            maxOutputTokens: 1800,
            temperature: 0.2,
          },
        ],
        activeAiProfileId: 'vision-e2e',
      },
      null,
      2,
    ),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav-item[data-page="assignments"]').click()
    await window.getByRole('button', { name: '粘贴通知录入' }).click()
    await expect(window.locator('#smartEntryTitle')).toBeVisible()

    await window.locator('#smartEntryImages').setInputFiles(imagePath)
    await expect(window.locator('.smart-entry-image')).toHaveCount(1)
    await expect(window.locator('.smart-entry-image img')).toBeVisible()

    await window.getByRole('button', { name: '解析为作业' }).click()
    await expect(window.locator('.smart-entry-draft')).toContainText('平台截图作业')
    await expect(window.locator('.smart-entry-draft')).toContainText('高优先级')

    const payload = requests.at(-1)
    const userContent = payload.messages.at(-1).content
    assert.equal(Array.isArray(userContent), true)
    const textPart = userContent.find((part) => part.type === 'text')
    assert.match(textPart.text, /通知内容在图片中/)
    const imagePart = userContent.find((part) => part.type === 'image_url')
    assert.match(imagePart.image_url.url, /^data:image\/jpeg;base64,/)

    await window.getByRole('button', { name: '添加选中的作业' }).click()
    await expect(
      window.locator('.assignment-card').filter({ hasText: '平台截图作业' }),
    ).toBeVisible()
  } finally {
    await closeWorkstation(app, userDataDir)
    await new Promise((resolve) => server.close(resolve))
  }
})

test('reads AI news inside the app instead of jumping to the website', async () => {
  const userDataDir = createUserDataDir()
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await dismissWelcome(window)
    await window.locator('.nav').getByRole('button', { name: 'AI 资讯', exact: true }).click()

    await expect(window.locator('#view .page-intro h2')).toHaveText('AI 资讯')
    await expect(window.locator('.news-feed')).toBeVisible()

    const heads = window.locator('.news-item-head')
    if (await heads.count()) {
      await heads.first().click()
      await expect(window.locator('.news-item.is-open .news-body')).toBeVisible()
      await expect(window.getByRole('button', { name: '复制摘要' })).toBeVisible()
      await expect(window.locator('.news-item.is-open')).toHaveCount(1)
      if ((await heads.count()) > 1) {
        await heads.nth(1).click()
        await expect(window.locator('.news-item.is-open')).toHaveCount(1)
        await expect(heads.nth(0)).toHaveAttribute('aria-expanded', 'false')
        await expect(heads.nth(1)).toHaveAttribute('aria-expanded', 'true')
      }
    }

    await window.locator('[data-news-tab="hot"]').click()
    await expect(window.locator('[data-news-tab="hot"]')).toHaveClass(/active/)
    await expect(window.locator('.news-feed')).toBeVisible()

    await window.locator('[data-news-tab="daily"]').click()
    await expect(window.locator('[data-news-tab="daily"]')).toHaveClass(/active/)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('shows the guide with plain-language AI basics', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav').getByRole('button', { name: '指南', exact: true }).click()

    await expect(
      window.locator('#view').getByRole('heading', { name: '指南', exact: true }),
    ).toBeVisible()
    await expect(window.getByText('装好官方 DeepSeek Harness', { exact: true })).toHaveCount(0)
    await expect(window.locator('.guide-step')).toHaveCount(5)
    await expect(window.getByText('配置模型', { exact: true })).toBeVisible()
    await expect(window.getByText('可以直接用配置好的模型拆解步骤')).toBeVisible()

    const workbenchHeading = await window
      .getByRole('heading', { name: '它能做什么', exact: true })
      .boundingBox()
    const aiBasicsHeading = await window
      .getByRole('heading', { name: '先分清五个角色，再看懂一次请求是怎么完成的', exact: true })
      .boundingBox()
    expect(workbenchHeading.y).toBeLessThan(aiBasicsHeading.y)

    await expect(window.getByText('AI 基础概念', { exact: true })).toBeVisible()
    await expect(window.getByText('客户端', { exact: true })).toBeVisible()
    await expect(window.getByText('Agent 执行代理', { exact: true })).toBeVisible()
    await expect(window.getByText('API 连接层', { exact: true })).toBeVisible()
    await expect(window.getByText('身份与计费凭证', { exact: true })).toBeVisible()
    await expect(
      window.getByRole('heading', { name: '网络、代理与 Skills', exact: true }),
    ).toBeVisible()

    await expect(window.getByRole('heading', { name: 'Codex 入门', exact: true })).toHaveCount(0)
    await expect(
      window.getByRole('heading', { name: 'DeepSeek 接入 Codex', exact: true }),
    ).toHaveCount(0)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('keeps the help section below the system group in the sidebar', async () => {
  const userDataDir = createUserDataDir()
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await dismissWelcome(window)

    const systemBox = await window.locator('.nav-section-system').boundingBox()
    const helpBox = await window.locator('.nav-section-help').boundingBox()
    expect(helpBox.y).toBeGreaterThan(systemBox.y)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('auto-saves settings fields without a floating save bar', async () => {
  const userDataDir = createUserDataDir()
  const app = await launchWorkstation(userDataDir)
  const readSettings = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8'))
    } catch {
      return {}
    }
  }

  try {
    const window = await app.firstWindow()
    await dismissWelcome(window)
    await window.locator('.nav').getByRole('button', { name: '设置', exact: true }).click()

    await expect(window.getByRole('button', { name: '导出诊断信息' })).toBeVisible()

    const minimizeToTray = window.locator('input[data-setting="minimizeToTray"]')
    await expect(minimizeToTray).toBeChecked()
    await minimizeToTray.focus()
    await expect(minimizeToTray.locator('xpath=..')).toHaveCSS('outline-style', 'none')
    await minimizeToTray.uncheck()
    await expect(window.locator('.settings-save')).toHaveCount(0)
    await expect.poll(() => readSettings().minimizeToTray).toBe(false)

    await expect(window.locator('input[type="time"]')).toHaveCount(0)
    const reminderTimeInput = window.locator('input[data-setting="dailyDigestTime"]')
    const reminderTimeControl = reminderTimeInput.locator('xpath=..')
    await reminderTimeControl.getByRole('button', { name: '选择时间' }).click()
    await expect(window.locator('#timePickerPopover')).toBeVisible()
    await window.locator('#timePickerPopover [data-time-part="hour"][data-time-value="20"]').click()
    await window
      .locator('#timePickerPopover [data-time-part="minute"][data-time-value="30"]')
      .click()
    await window.getByRole('button', { name: '完成', exact: true }).click()
    await expect(reminderTimeInput).toHaveValue('20:30')
    await expect.poll(() => readSettings().dailyDigestTime).toBe('20:30')

    const toggleTransition = await window
      .locator('.toggle')
      .first()
      .evaluate((element) => globalThis.getComputedStyle(element, '::after').transitionDuration)
    expect(toggleTransition).not.toBe('0s')
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('renames an experiment group from the workspace dialog', async () => {
  const userDataDir = createUserDataDir()
  const experimentDir = path.join(userDataDir, '实验资料')
  const currentGroup = '算法设计与分析实验'
  const nextGroup = '算法实验'
  const originalFile = path.join(experimentDir, currentGroup, '实验一报告.txt')
  const renamedFile = path.join(experimentDir, nextGroup, '实验一报告.txt')

  fs.mkdirSync(path.dirname(originalFile), { recursive: true })
  fs.writeFileSync(originalFile, '实验报告内容', 'utf8')
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify(
      {
        experimentDir,
        onboarding: { welcomeSeen: true },
      },
      null,
      2,
    ),
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'workspace.json'),
    JSON.stringify(
      {
        version: 2,
        courses: [],
        assignments: [],
        knowledge: [],
        experiments: [
          {
            id: 'experiment-1',
            title: '实验一报告',
            originalName: '实验一报告.txt',
            filePath: originalFile,
            group: currentGroup,
            size: Buffer.byteLength('实验报告内容'),
            importedAt: new Date().toISOString(),
          },
        ],
        schedule: null,
      },
      null,
      2,
    ),
    'utf8',
  )

  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await expect(window).toHaveTitle('ZP Workbench')
    await window.locator('.nav').getByRole('button', { name: '资料库', exact: true }).click()

    const group = window.locator(`.experiment-group[data-experiment-group="${currentGroup}"]`)
    await expect(group).toBeVisible()
    await expect(window.locator('.experiment-explorer-head-actions')).toHaveCount(0)
    await group.getByRole('button', { name: '重命名课程文件夹' }).click()

    const dialog = window.getByRole('dialog', { name: '重命名课程文件夹' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: '课程文件夹名称' }).fill(nextGroup)
    await dialog.getByRole('button', { name: '保存名称' }).click()

    await expect(
      window.locator(`.experiment-group[data-experiment-group="${nextGroup}"]`),
    ).toBeVisible()
    await expect(window.getByText('prompt() is not supported.')).toHaveCount(0)
    assert.equal(fs.existsSync(originalFile), false)
    assert.equal(fs.existsSync(renamedFile), true)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('keeps experiment group list scroll position when selecting another library', async () => {
  const userDataDir = createUserDataDir()
  const experimentDir = path.join(userDataDir, '实验资料')
  const groupNames = Array.from({ length: 12 }, (_, index) => `课程资料 ${index + 1}`)
  const experiments = groupNames.map((group, index) => {
    const fileName = `资料 ${index + 1}.txt`
    const filePath = path.join(experimentDir, group, fileName)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `资料 ${index + 1}`, 'utf8')
    return {
      id: `scroll-experiment-${index + 1}`,
      title: `资料 ${index + 1}`,
      originalName: fileName,
      filePath,
      group,
      size: Buffer.byteLength(`资料 ${index + 1}`),
      importedAt: new Date().toISOString(),
    }
  })

  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ experimentDir, onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'workspace.json'),
    JSON.stringify(
      {
        version: 2,
        courses: [],
        assignments: [],
        knowledge: [],
        experiments,
        schedule: null,
      },
      null,
      2,
    ),
    'utf8',
  )

  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => {
      const mainWindow = BrowserWindow.getAllWindows()[0]
      mainWindow.setMinimumSize(1000, 700)
      mainWindow.setSize(1200, 760)
    })
    await window.locator('.nav').getByRole('button', { name: '资料库', exact: true }).click()

    const groupList = window.locator('.experiment-group-list')
    await expect(groupList).toBeVisible()
    const view = window.locator('#view')
    await view.evaluate((element) => {
      element.scrollTop = Math.min(220, element.scrollHeight - element.clientHeight)
    })
    await groupList.evaluate((element) => {
      element.scrollTop = Math.min(260, element.scrollHeight - element.clientHeight)
    })
    const before = await groupList.evaluate((element) => element.scrollTop)
    const viewBefore = await view.evaluate((element) => element.scrollTop)
    expect(before).toBeGreaterThan(0)

    const target = groupNames[8]
    await window
      .locator(`.experiment-group[data-experiment-group="${target}"] .experiment-group-select`)
      .evaluate((element) => element.click())
    await expect(window.locator('.experiment-explorer-head h3')).toHaveText(target)
    await expect.poll(() => groupList.evaluate((element) => element.scrollTop)).toBe(before)
    await expect.poll(() => view.evaluate((element) => element.scrollTop)).toBe(viewBefore)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('moves an experiment to an existing course folder from a select dialog', async () => {
  const userDataDir = createUserDataDir()
  const experimentDir = path.join(userDataDir, '实验资料')
  const sourceGroup = '算法设计与分析实验'
  const targetGroup = '计算机系统基础'
  const originalFile = path.join(experimentDir, sourceGroup, '实验一报告.txt')
  const movedFile = path.join(experimentDir, targetGroup, '实验一报告.txt')

  fs.mkdirSync(path.dirname(originalFile), { recursive: true })
  fs.mkdirSync(path.join(experimentDir, targetGroup), { recursive: true })
  fs.writeFileSync(originalFile, '实验报告内容', 'utf8')
  fs.writeFileSync(path.join(experimentDir, targetGroup, '课程笔记.txt'), '课程笔记', 'utf8')
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ experimentDir, onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'workspace.json'),
    JSON.stringify(
      {
        version: 2,
        courses: [],
        assignments: [],
        knowledge: [],
        experiments: [
          {
            id: 'experiment-source',
            title: '实验一报告',
            originalName: '实验一报告.txt',
            filePath: originalFile,
            group: sourceGroup,
            size: Buffer.byteLength('实验报告内容'),
            importedAt: new Date().toISOString(),
          },
          {
            id: 'experiment-target',
            title: '课程笔记',
            originalName: '课程笔记.txt',
            filePath: path.join(experimentDir, targetGroup, '课程笔记.txt'),
            group: targetGroup,
            size: Buffer.byteLength('课程笔记'),
            importedAt: new Date().toISOString(),
          },
        ],
        schedule: null,
      },
      null,
      2,
    ),
    'utf8',
  )

  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav').getByRole('button', { name: '资料库', exact: true }).click()
    await window
      .locator(`.experiment-group[data-experiment-group="${sourceGroup}"] .experiment-group-select`)
      .click()
    const fileRow = window.locator('.experiment-file', { hasText: '实验一报告' })
    await expect(fileRow).toBeVisible()
    const openFileButton = fileRow.getByRole('button', { name: '打开文件' })
    const moveFileButton = fileRow.getByRole('button', { name: '移动到其他课程文件夹' })
    await openFileButton.scrollIntoViewIfNeeded()
    await window.waitForTimeout(100)
    await openFileButton.focus()
    await expect(window.locator('#quickTooltip')).toHaveText('打开文件')
    await expect(window.locator('#quickTooltip')).toBeVisible()
    await moveFileButton.focus()
    await expect(window.locator('#quickTooltip')).toHaveText('移动到其他课程文件夹')
    await expect(window.locator('#quickTooltip')).toBeVisible()
    await moveFileButton.click()

    const dialog = window.getByRole('dialog', { name: '移动到课程文件夹' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('目标课程文件夹').selectOption(targetGroup)
    await dialog.getByRole('button', { name: '移动资料' }).click()

    await expect.poll(() => fs.existsSync(movedFile), { timeout: 8_000 }).toBe(true)
    assert.equal(fs.existsSync(originalFile), false)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('drops an external file directly into an existing course folder', async () => {
  const userDataDir = createUserDataDir()
  const experimentDir = path.join(userDataDir, '实验资料')
  const targetGroup = '计算机系统基础'
  const existingFile = path.join(experimentDir, targetGroup, '课程笔记.txt')
  const droppedSource = path.join(userDataDir, '实验二数据.txt')

  fs.mkdirSync(path.dirname(existingFile), { recursive: true })
  fs.writeFileSync(existingFile, '课程笔记', 'utf8')
  fs.writeFileSync(droppedSource, '实验数据', 'utf8')
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ experimentDir, onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'workspace.json'),
    JSON.stringify(
      {
        version: 2,
        courses: [],
        assignments: [],
        knowledge: [],
        experiments: [
          {
            id: 'experiment-target',
            title: '课程笔记',
            originalName: '课程笔记.txt',
            filePath: existingFile,
            group: targetGroup,
            size: Buffer.byteLength('课程笔记'),
            importedAt: new Date().toISOString(),
          },
        ],
        schedule: null,
      },
      null,
      2,
    ),
    'utf8',
  )

  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav').getByRole('button', { name: '资料库', exact: true }).click()
    const targetGroupRow = window
      .locator('.experiment-group')
      .filter({ hasText: targetGroup })
      .first()
    await expect(targetGroupRow).toBeVisible()
    await targetGroupRow.evaluate((target, url) => {
      const dataTransfer = new globalThis.DataTransfer()
      dataTransfer.setData('text/uri-list', url)
      target.dispatchEvent(
        new globalThis.DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      )
    }, pathToFileURL(droppedSource).href)

    const imported = path.join(experimentDir, targetGroup, path.basename(droppedSource))
    await expect.poll(() => fs.existsSync(imported), { timeout: 8_000 }).toBe(true)
    assert.equal(fs.existsSync(droppedSource), true)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('shows a classification confirmation before importing an unassigned file', async () => {
  const userDataDir = createUserDataDir()
  const experimentDir = path.join(userDataDir, '实验资料')
  const existingGroup = '计算机系统基础'
  const existingFile = path.join(experimentDir, existingGroup, '课程笔记.txt')
  const droppedSource = path.join(userDataDir, '计算机系统基础实验三.txt')
  const importedFile = path.join(experimentDir, existingGroup, path.basename(droppedSource))

  fs.mkdirSync(path.dirname(existingFile), { recursive: true })
  fs.writeFileSync(existingFile, '课程笔记', 'utf8')
  fs.writeFileSync(droppedSource, '实验数据', 'utf8')
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ experimentDir, onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'workspace.json'),
    JSON.stringify(
      {
        version: 2,
        courses: [],
        assignments: [],
        knowledge: [],
        experiments: [
          {
            id: 'experiment-existing',
            title: '课程笔记',
            originalName: '课程笔记.txt',
            filePath: existingFile,
            group: existingGroup,
            size: Buffer.byteLength('课程笔记'),
            importedAt: new Date().toISOString(),
          },
        ],
        schedule: null,
      },
      null,
      2,
    ),
    'utf8',
  )

  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav').getByRole('button', { name: '资料库', exact: true }).click()
    const dropzone = window.locator('[data-experiment-dropzone]')
    await expect(dropzone).toBeVisible()
    await dropzone.evaluate((target, url) => {
      const dataTransfer = new globalThis.DataTransfer()
      dataTransfer.setData('text/uri-list', url)
      target.dispatchEvent(
        new globalThis.DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      )
    }, pathToFileURL(droppedSource).href)

    const dialog = window.getByRole('dialog', { name: '确认资料分类' })
    await expect(dialog).toBeVisible()
    const groupCombobox = dialog.getByRole('combobox', { name: '课程文件夹' })
    await expect(groupCombobox).toHaveValue(existingGroup)
    await dialog.getByRole('button', { name: '查看已有课程文件夹' }).click()
    await expect(dialog.getByRole('listbox', { name: '已有课程文件夹' })).toBeVisible()
    await dialog.getByRole('option', { name: existingGroup, exact: true }).click()
    await expect(groupCombobox).toHaveValue(existingGroup)
    assert.equal(fs.existsSync(importedFile), false)

    await dialog.getByRole('button', { name: '确认并归档' }).click()
    await expect.poll(() => fs.existsSync(importedFile), { timeout: 8_000 }).toBe(true)
    assert.equal(fs.existsSync(droppedSource), true)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('creates a complete workstation backup', async () => {
  const userDataDir = createUserDataDir()
  const dshHome = path.join(userDataDir, '.dsh')
  const skillDirectory = path.join(dshHome, 'skills', 'academic-writer')
  fs.mkdirSync(skillDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(skillDirectory, 'SKILL.md'),
    '---\nname: academic-writer\ndescription: Improve academic writing.\n---\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ dshHome, onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )

  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav').getByRole('button', { name: '备份与同步', exact: true }).click()
    await expect(
      window.locator('#view').getByRole('heading', { name: '备份与同步', exact: true }),
    ).toBeVisible()
    const policyFields = window.locator('.backup-center-side .two-fields .field')
    const [intervalLabel, retentionLabel, intervalInput, retentionInput] = await Promise.all([
      policyFields.nth(0).locator(':scope > span').boundingBox(),
      policyFields.nth(1).locator(':scope > span').boundingBox(),
      policyFields.nth(0).locator('input').boundingBox(),
      policyFields.nth(1).locator('input').boundingBox(),
    ])
    expect(Math.abs(intervalLabel.y - retentionLabel.y)).toBeLessThan(1)
    expect(Math.abs(intervalInput.y - retentionInput.y)).toBeLessThan(1)
    const savePolicyButton = window.getByRole('button', { name: '保存备份策略' })
    const savePolicyBox = await savePolicyButton.boundingBox()
    const fieldBottom = Math.max(
      intervalInput.y + intervalInput.height,
      retentionInput.y + retentionInput.height,
    )
    expect(savePolicyBox.y - fieldBottom).toBeGreaterThanOrEqual(12)
    await window.locator('#view').getByRole('button', { name: '立即备份' }).click()
    await expect(window.getByText(/manual ·/).first()).toBeVisible()
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('imports a schedule from a WPS-style URI-list drop without DataTransfer.files', async () => {
  const userDataDir = createUserDataDir()
  const schedulePath = path.join(userDataDir, 'wps-schedule.xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['课程名称', '星期', '节次', '周次', '教师', '地点', '上课时间'],
      ['线性代数', '星期三', '第7-8节', '1-16周', '赵老师', 'A108', '09:00-10:40'],
    ]),
    '课表',
  )
  XLSX.writeFile(workbook, schedulePath)
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )

  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav').getByRole('button', { name: '课表', exact: true }).click()
    const uri = pathToFileURL(schedulePath).href
    const resolved = await window.evaluate(
      (value) => window.launcher.resolveDropReferences([value]),
      uri,
    )
    assert.equal(resolved.length, 1)
    assert.equal(fs.existsSync(resolved[0].path), true)

    const observedDrop = await window.evaluate(
      (value) =>
        new Promise((resolve) => {
          globalThis.document.addEventListener(
            'drop',
            (event) => {
              resolve({
                types: [...event.dataTransfer.types],
                uri: event.dataTransfer.getData('text/uri-list'),
              })
            },
            { capture: true, once: true },
          )
          const dataTransfer = new globalThis.DataTransfer()
          dataTransfer.setData('text/uri-list', value)
          globalThis.document.dispatchEvent(
            new globalThis.DragEvent('drop', {
              bubbles: true,
              cancelable: true,
              dataTransfer,
            }),
          )
        }),
      uri,
    )
    assert.deepEqual(observedDrop, { types: ['text/uri-list'], uri })
    await expect(window.locator('.toast.success')).toContainText('已识别 1 个课程安排。')
    await expect(window.getByText('线性代数', { exact: true }).first()).toBeVisible()
    await expect(window.getByText(/赵老师/).first()).toBeVisible()
    await expect(window.getByText('09:00–10:40').first()).toBeVisible()
    await expect(window.locator('.schedule-time-cell').nth(6)).toContainText('起 09:00')
    await expect(window.locator('.schedule-time-cell').nth(7)).toContainText('止 10:40')
    const scheduleModuleRadii = await window
      .locator('.route-canvas > :is(.schedule-source-bar, .schedule-board)')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const style = globalThis.getComputedStyle(element)
          return Number.parseFloat(style.borderTopLeftRadius) || 0
        }),
      )
    expect(scheduleModuleRadii).toEqual([0, 0])

    await window.getByRole('button', { name: '节次时间', exact: true }).click()
    const periodDialog = window.getByRole('dialog', { name: '节次时间' })
    await expect(periodDialog).toBeVisible()
    await periodDialog.getByLabel('第 7 节开始时间').fill('09:10')
    await periodDialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(window.locator('.schedule-time-cell').nth(6)).toContainText('09:10')
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('lets a course use a custom translucent color', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav').getByRole('button', { name: '课表', exact: true }).click()
    await window.locator('[data-action="open-schedule-composer"]').first().click()
    const dialog = window.getByRole('dialog', { name: '添加课程' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('课程名称').fill('数据结构')
    await dialog.locator('[data-action="choose-schedule-color"][data-color="#826F9A"]').click()
    await dialog.getByRole('button', { name: '添加课程', exact: true }).click()

    const course = window.locator('.schedule-course', { hasText: '数据结构' })
    await expect(course).toHaveAttribute('data-schedule-course-color', '#826F9A')
    const background = await course.evaluate((element) => {
      const style = globalThis.getComputedStyle(element)
      return [style.backgroundColor, style.borderColor]
    })
    expect(background[0]).not.toBe('rgba(0, 0, 0, 0)')
    await expect
      .poll(() => {
        const workspace = JSON.parse(
          fs.readFileSync(path.join(userDataDir, 'workspace.json'), 'utf8'),
        )
        return workspace.schedule?.courses?.[0]?.color
      })
      .toBe('#826F9A')
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('creates a custom library and accepts files dropped onto it', async () => {
  const userDataDir = createUserDataDir()
  const experimentDir = path.join(userDataDir, '实验资料')
  const droppedSource = path.join(userDataDir, '我的学习资料.txt')
  fs.writeFileSync(droppedSource, '学习资料', 'utf8')
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ experimentDir, onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav').getByRole('button', { name: '资料库', exact: true }).click()
    await window.getByRole('button', { name: '新建资料库', exact: true }).click()
    const dialog = window.getByRole('dialog', { name: '新建资料库' })
    await dialog.getByLabel('资料库名称').fill('我的资料')
    await dialog.getByRole('button', { name: '创建资料库' }).click()

    const group = window.locator('.experiment-group', { hasText: '我的资料' }).first()
    await expect(group).toBeVisible()
    assert.equal(fs.existsSync(path.join(experimentDir, '我的资料')), true)

    await group.evaluate((target, url) => {
      const dataTransfer = new globalThis.DataTransfer()
      dataTransfer.setData('text/uri-list', url)
      target.dispatchEvent(
        new globalThis.DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }),
      )
    }, pathToFileURL(droppedSource).href)

    const imported = path.join(experimentDir, '我的资料', path.basename(droppedSource))
    await expect.poll(() => fs.existsSync(imported), { timeout: 8_000 }).toBe(true)
    assert.equal(fs.existsSync(droppedSource), true)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('migrates the library root and log directory through the desktop bridge', async () => {
  const userDataDir = createUserDataDir()
  const oldLibrary = path.join(userDataDir, '资料库-old')
  const nextLibrary = path.join(userDataDir, '资料库-new')
  const nextLogs = path.join(userDataDir, '日志-new')
  const trackedFile = path.join(oldLibrary, '课程资料', '课程笔记.txt')
  fs.mkdirSync(path.dirname(trackedFile), { recursive: true })
  fs.writeFileSync(trackedFile, '课程笔记', 'utf8')
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ experimentDir: oldLibrary, onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'workspace.json'),
    JSON.stringify(
      {
        version: 2,
        courses: [],
        assignments: [],
        knowledge: [],
        experiments: [
          {
            id: 'migration-file',
            title: '课程笔记',
            originalName: '课程笔记.txt',
            filePath: trackedFile,
            group: '课程资料',
            size: Buffer.byteLength('课程笔记'),
            importedAt: new Date().toISOString(),
          },
        ],
        schedule: null,
      },
      null,
      2,
    ),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    const libraryResult = await window.evaluate(
      (target) => window.launcher.changeExperimentRoot(target),
      nextLibrary,
    )
    assert.equal(libraryResult.copiedFiles, 1)
    assert.equal(fs.existsSync(oldLibrary), false)
    assert.equal(fs.existsSync(path.join(nextLibrary, '课程资料', '课程笔记.txt')), true)

    const logResult = await window.evaluate(
      (target) => window.launcher.changeLogDirectory(target),
      nextLogs,
    )
    assert.equal(logResult.newDir, nextLogs)
    assert.equal(fs.existsSync(path.join(nextLogs, 'workbench.log')), true)
    const settings = JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8'))
    assert.equal(settings.experimentDir, nextLibrary)
    assert.equal(settings.logDir, nextLogs)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('renders a 1000-assignment workload within the baseline budget', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  const stamp = new Date().toISOString()
  const assignments = Array.from({ length: 1000 }, (_, index) => ({
    id: `perf-assignment-${index}`,
    title: `压力测试作业 ${index + 1}`,
    course: '性能基线',
    dueAt: '2026-12-31',
    priority: 'medium',
    status: 'inbox',
    notes: '',
    createdAt: stamp,
    updatedAt: stamp,
  }))
  fs.writeFileSync(
    path.join(userDataDir, 'workspace.json'),
    JSON.stringify(
      {
        version: 2,
        courses: [],
        assignments,
        knowledge: [],
        experiments: [],
        experimentGroups: [],
        schedule: null,
      },
      null,
      2,
    ),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await dismissWelcome(window)
    const startedAt = Date.now()
    await window.locator('.nav button[data-page="assignments"]').click()
    await expect(window.locator('.assignment-card')).toHaveCount(1000)
    const elapsedMs = Date.now() - startedAt
    console.log(`[perf] 1000 条作业渲染耗时：${elapsedMs}ms`)
    expect(elapsedMs).toBeLessThan(5000)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('traps keyboard focus inside dialogs and closes them with Escape', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await dismissWelcome(window)
    await window.locator('.nav').getByRole('button', { name: '资料库', exact: true }).click()
    await window.getByRole('button', { name: '新建资料库', exact: true }).click()

    const dialog = window.getByRole('dialog', { name: '新建资料库' })
    await expect(dialog).toBeVisible()
    const nameInput = dialog.getByLabel('资料库名称')
    await expect(nameInput).toBeFocused()

    for (let index = 0; index < 5; index += 1) await window.keyboard.press('Tab')
    expect(
      await window.evaluate(() =>
        Boolean(globalThis.document.activeElement?.closest('[role="dialog"]')),
      ),
    ).toBe(true)

    await nameInput.focus()
    await window.keyboard.press('Shift+Tab')
    expect(
      await window.evaluate(() =>
        Boolean(globalThis.document.activeElement?.closest('[role="dialog"]')),
      ),
    ).toBe(true)

    await window.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

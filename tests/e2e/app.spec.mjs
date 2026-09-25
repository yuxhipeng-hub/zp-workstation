import { test, expect, _electron as electron } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
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

test('launches the workstation on today and keeps runtime actions available', async () => {
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
    await expect(window.locator('#topLaunchButton')).toBeVisible()

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

    await window.locator('#runtimeRibbon summary').click()
    await expect(window.locator('#runtimeLaunchAction')).toBeVisible()
    await expect(window.locator('#runtimeStopAction')).toBeVisible()
    await expect(window.locator('#runtimeOpenDshHomeAction')).toBeVisible()
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
      'tools',
      'schedule',
      'assignments',
      'experiments',
      'knowledge',
      'guide',
      'updates',
      'plugins',
      'skills',
      'models',
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
        await expect(window.locator('.ruka-guide-hero')).toHaveCSS('border-radius', '0px')
      }
    }

    await window.locator('.nav-item[data-page="today"]').click()
    await expect(window.locator('#view > [data-route-canvas]')).toHaveCount(0)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('resizes the tool browser and preview with a draggable divider', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'app-host.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        catalog: {
          scannedAt: new Date().toISOString(),
          apps: [
            {
              id: '0123456789abcdef0123',
              displayName: 'Notepad',
              publisher: 'Microsoft',
              version: '1.0',
              executableName: 'notepad.exe',
              executablePath: path.join(process.env.WINDIR, 'System32', 'notepad.exe'),
              iconPath: path.join(process.env.WINDIR, 'System32', 'notepad.exe'),
              workingDirectory: path.join(process.env.WINDIR, 'System32'),
              source: 'test',
              sourceLabel: '测试工具',
            },
          ],
        },
        preferences: {},
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
    await window.locator('.nav-item[data-page="tools"]').click()
    await expect(window.locator('[data-tool-icon] img')).toBeVisible()
    const divider = window.getByRole('separator', { name: '调整工具列表和实时画面宽度' })
    await expect(divider).toBeVisible()
    const browser = window.locator('.tool-browser')
    const before = await browser.boundingBox()

    const dragDivider = async (distance) => {
      const box = await divider.boundingBox()
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await window.mouse.move(x, y)
      await window.mouse.down()
      await window.mouse.move(x + distance, y)
      await window.mouse.up()
    }

    await dragDivider(-60)
    const afterShrink = await browser.boundingBox()
    expect(afterShrink.width).toBeLessThan(before.width - 20)

    await dragDivider(120)
    const afterDrag = await browser.boundingBox()
    expect(afterDrag.width).toBeGreaterThan(afterShrink.width + 40)

    await divider.focus()
    await divider.press('ArrowLeft')
    const afterKeyboard = await browser.boundingBox()
    expect(afterKeyboard.width).toBeLessThan(afterDrag.width)

    await divider.dblclick()
    const afterReset = await browser.boundingBox()
    const maxWidth = Number(await divider.getAttribute('aria-valuemax'))
    expect(Math.abs(afterReset.width - Math.min(380, maxWidth))).toBeLessThan(2)

    await window.getByRole('button', { name: '全屏画面' }).click()
    await expect(window.locator('.sidebar')).toBeHidden()
    await expect(window.getByRole('button', { name: '退出全屏画面' })).toBeVisible()
    await window.keyboard.press('Escape')
    await expect(window.locator('.sidebar')).toBeVisible()
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('shows engineering tools first and keeps entertainment in the last group', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'app-host.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        catalog: {
          scannedAt: new Date().toISOString(),
          apps: [
            {
              id: '11111111111111111111',
              displayName: 'Steam',
              executableName: 'steam.exe',
              executablePath: 'C:\\Games\\Steam\\steam.exe',
            },
            {
              id: '22222222222222222222',
              displayName: 'MATLAB R2024b',
              executableName: 'matlab.exe',
              executablePath: 'C:\\MATLAB\\matlab.exe',
            },
            {
              id: '33333333333333333333',
              displayName: 'Microsoft Excel',
              executableName: 'excel.exe',
              executablePath: 'C:\\Office\\excel.exe',
            },
          ],
        },
        preferences: {
          '11111111111111111111': { favorite: true, lastLaunchedAt: '' },
        },
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
    await window.locator('.nav-item[data-page="tools"]').click()

    const categories = window.locator('[data-tool-category]')
    await expect(categories).toHaveCount(3)
    await expect(categories.nth(0)).toHaveAttribute('data-tool-category', 'engineering')
    await expect(categories.nth(1)).toHaveAttribute('data-tool-category', 'productivity')
    await expect(categories.nth(2)).toHaveAttribute('data-tool-category', 'entertainment')
    await expect(categories.nth(0)).toContainText('MATLAB R2024b')

    const search = window.locator('#toolSearch')
    await search.fill('娱乐')
    await expect(window.locator('[data-tool-category="engineering"]')).toHaveClass(/hidden/)
    await expect(window.locator('[data-tool-category="entertainment"]')).not.toHaveClass(/hidden/)
    await expect(window.locator('#toolSearchCount')).toHaveText('1 个结果')
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('keeps the knowledge search centered without a duplicate result count', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav-item[data-page="knowledge"]').click()

    const toolbar = window.locator('.knowledge-toolbar')
    const search = toolbar.locator('.input-shell')
    await expect(toolbar).toHaveCSS('display', 'grid')
    await expect(toolbar.locator(':scope > span')).toHaveCount(0)
    const [routeCanvasBox, toolbarBox, searchBox] = await Promise.all([
      window.locator('.route-canvas').boundingBox(),
      toolbar.boundingBox(),
      search.boundingBox(),
    ])
    expect(toolbarBox.x - routeCanvasBox.x).toBeGreaterThanOrEqual(24)
    expect(
      routeCanvasBox.x + routeCanvasBox.width - (toolbarBox.x + toolbarBox.width),
    ).toBeGreaterThanOrEqual(24)
    expect(searchBox.width).toBeLessThanOrEqual(720)
    const leftGap = searchBox.x - toolbarBox.x
    const rightGap = toolbarBox.x + toolbarBox.width - searchBox.x - searchBox.width
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(1)
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('selects and deletes multiple knowledge points', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(userDataDir, 'workspace.json'),
    JSON.stringify(
      {
        version: 2,
        courses: [],
        assignments: [],
        knowledge: [
          {
            id: 'knowledge-1',
            title: '矩阵的秩',
            course: '线性代数',
            content: '按行阶梯形判断。',
            tags: ['矩阵'],
            mastery: 0,
            updatedAt: '2026-09-23T08:00:00.000Z',
          },
          {
            id: 'knowledge-2',
            title: '特征值',
            course: '线性代数',
            content: '求解特征方程。',
            tags: ['矩阵'],
            mastery: 0,
            updatedAt: '2026-09-23T07:00:00.000Z',
          },
          {
            id: 'knowledge-3',
            title: '极限定义',
            course: '高等数学',
            content: '理解数列极限。',
            tags: ['极限'],
            mastery: 0,
            updatedAt: '2026-09-23T06:00:00.000Z',
          },
        ],
        experiments: [],
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
    await window.locator('.nav-item[data-page="knowledge"]').click()
    const cards = window.locator('[data-knowledge-card]')
    await expect(cards).toHaveCount(3)
    await window.locator('.knowledge-group').evaluateAll((groups) => {
      for (const group of groups) group.open = true
    })

    await window.getByRole('button', { name: '多选删除', exact: true }).click()
    await expect(window.locator('[data-knowledge-card].is-selecting')).toHaveCount(3)
    await cards.nth(0).locator('.knowledge-select-check').click()
    await cards.nth(1).locator('.knowledge-select-check').click()
    await expect(window.getByText('已选择 2 个知识点', { exact: true })).toBeVisible()

    window.once('dialog', (dialog) => dialog.accept())
    await window.getByRole('button', { name: '删除所选（2）', exact: true }).click()

    await expect(cards).toHaveCount(1)
    await expect(window.getByText('已选择 0 个知识点', { exact: true })).toBeVisible()
    const workspace = JSON.parse(fs.readFileSync(path.join(userDataDir, 'workspace.json'), 'utf8'))
    assert.deepEqual(
      workspace.knowledge.map((item) => item.id),
      ['knowledge-2'],
    )
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
    const [heroCopy, heroSide, primaryColumn, rightColumn] = await Promise.all([
      window.locator('.today-hero-copy').boundingBox(),
      window.locator('.today-hero-side').boundingBox(),
      window.locator('.today-grid-primary').boundingBox(),
      window.locator('.today-grid > .today-grid-column:last-child').boundingBox(),
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
    await expect(window.getByText('AI 基础概念', { exact: true })).toBeVisible()
    await expect(window.getByText('客户端', { exact: true })).toBeVisible()
    await expect(window.getByText('Agent 执行代理', { exact: true })).toBeVisible()
    await expect(window.getByText('API 连接层', { exact: true })).toBeVisible()
    await expect(window.getByText('身份与计费凭证', { exact: true })).toBeVisible()
    await expect(window.getByRole('heading', { name: 'Codex 入门', exact: true })).toBeVisible()
    await expect(
      window.getByRole('heading', { name: 'DeepSeek 接入 Codex', exact: true }),
    ).toBeVisible()
    expect(
      await window
        .locator('#rukaDeepseekDetails')
        .evaluate((element) => Boolean(element.closest('.ruka-route-panel'))),
    ).toBe(false)
    await expect(window.locator('.ruka-route-panel')).toHaveCount(0)

    await window.getByRole('button', { name: /Codex 桌面应用/ }).click()
    await expect(window.locator('.ruka-route-panel[data-route="desktop"]')).toBeVisible()
    await window.locator('#rukaDeepseekDetails > summary').click()
    await expect(window.locator('#rukaDeepseekCodex')).toBeVisible()
    await expect(window.locator('.ruka-route-panel[data-route="desktop"]')).toBeVisible()
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('configures the DSH model connection inside ZP Workbench', async () => {
  const userDataDir = createUserDataDir()
  fs.writeFileSync(
    path.join(userDataDir, 'settings.json'),
    JSON.stringify({ onboarding: { welcomeSeen: true } }, null, 2),
    'utf8',
  )
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await window.locator('.nav').getByRole('button', { name: '模型连接', exact: true }).click()

    await expect(
      window.locator('#view').getByRole('heading', { name: '模型连接', exact: true }),
    ).toBeVisible()
    const keyInput = window.locator('#deepseekApiKey')
    await expect(keyInput).toBeVisible()
    await expect(keyInput).toHaveAttribute('type', 'text')
    await expect(keyInput).toHaveAttribute('autocomplete', 'off')
    await expect(keyInput).toHaveAttribute('readonly', '')
    await expect(keyInput).toHaveValue('')
    await keyInput.focus()
    await expect(keyInput).not.toHaveAttribute('readonly', '')
    await expect(window.locator('label.model-key-field')).toHaveCSS('outline-style', 'none')
    await expect(window.locator('[data-action="save-deepseek-key"]')).toBeVisible()
    await expect(window.getByRole('button', { name: '高级模型设置', exact: true })).toBeVisible()
    await expect(window.getByText('高级与诊断', { exact: true })).toBeVisible()
  } finally {
    await closeWorkstation(app, userDataDir)
  }
})

test('updates the Jev mode immediately and labels the current switch state', async () => {
  const userDataDir = createUserDataDir()
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await dismissWelcome(window)
    await window.locator('.nav').getByRole('button', { name: '设置', exact: true }).click()

    const modeTitle = window.locator('.jev-current-mode-title strong')
    const modeSwitch = window.locator('.jev-mode-switch')
    const modeSwitchTitle = modeSwitch.locator('strong')

    await expect(modeTitle).toHaveText('Jev 增强待配置')
    await expect(modeSwitchTitle).toHaveText('Jev 已启用，待配置 Key')

    await modeSwitch.click()
    await expect(modeTitle).toHaveText('免费本地模式（不使用 Jev）')
    await expect(modeSwitchTitle).toHaveText('启用 Jev 云端增强')
    await expect(modeSwitch.locator('input')).not.toBeChecked()

    await modeSwitch.click()
    await expect(modeTitle).toHaveText('Jev 增强待配置')
    await expect(modeSwitchTitle).toHaveText('Jev 已启用，待配置 Key')
    await expect(modeSwitch.locator('input')).toBeChecked()

    await window.locator('.view').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await modeSwitch.click()
    await expect(modeTitle).toHaveText('免费本地模式（不使用 Jev）')
    await window.locator('.view').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await modeSwitch.click()
    await expect(modeTitle).toHaveText('Jev 增强待配置')
    const pagePosition = await window.evaluate(() => ({
      documentScroll: globalThis.document.scrollingElement.scrollTop,
      bodyScroll: globalThis.document.body.scrollTop,
      appTop: Math.round(globalThis.document.querySelector('#app').getBoundingClientRect().top),
    }))
    expect(pagePosition).toEqual({ documentScroll: 0, bodyScroll: 0, appTop: 0 })

    await modeSwitch.locator('input').focus()
    await expect(modeSwitch).toHaveCSS('outline-style', 'none')
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

    const autoCheckDsh = window.locator('input[data-setting="autoCheckDsh"]')
    await expect(autoCheckDsh).toBeChecked()
    await autoCheckDsh.focus()
    await expect(autoCheckDsh.locator('xpath=..')).toHaveCSS('outline-style', 'none')
    await autoCheckDsh.uncheck()
    await expect(window.locator('.settings-save')).toHaveCount(0)
    await expect.poll(() => readSettings().autoCheckDsh).toBe(false)

    const portInput = window.locator('input[data-setting="port"]')
    await portInput.fill('3090')
    await portInput.press('Tab')
    await expect.poll(() => readSettings().port).toBe(3090)

    await expect(window.locator('input[type="time"]')).toHaveCount(0)
    const reminderTimeInput = window.locator('input[data-setting="reviewReminderTime"]')
    const reminderTimeControl = reminderTimeInput.locator('xpath=..')
    await reminderTimeControl.getByRole('button', { name: '选择时间' }).click()
    await expect(window.locator('#timePickerPopover')).toBeVisible()
    await window.locator('#timePickerPopover [data-time-part="hour"][data-time-value="20"]').click()
    await window
      .locator('#timePickerPopover [data-time-part="minute"][data-time-value="30"]')
      .click()
    await window.getByRole('button', { name: '完成', exact: true }).click()
    await expect(reminderTimeInput).toHaveValue('20:30')
    await expect.poll(() => readSettings().reviewReminderTime).toBe('20:30')

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
    await openFileButton.hover()
    await expect(window.locator('#quickTooltip')).toHaveText('打开文件')
    await expect(window.locator('#quickTooltip')).toBeVisible()
    await moveFileButton.hover()
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

test('renders the Skills center and creates a complete workstation backup', async () => {
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
    await window.locator('.nav').getByRole('button', { name: 'Skills', exact: true }).click()
    await expect(
      window.locator('#view').getByRole('heading', { name: 'Skills 中心' }),
    ).toBeVisible()
    await expect(window.getByText('academic-writer', { exact: true }).first()).toBeVisible()
    const [
      routeCanvasBox,
      workspaceMetricsBox,
      skillTabsBox,
      skillsToolbarBox,
      skillGridBox,
      firstSkillCardBox,
      lastSkillCardBox,
    ] = await Promise.all([
      window.locator('.route-canvas').boundingBox(),
      window.locator('.workspace-metrics').boundingBox(),
      window.locator('.skill-mode-tabs').boundingBox(),
      window.locator('.skills-toolbar').boundingBox(),
      window.locator('.skill-grid').boundingBox(),
      window.locator('.skill-card').first().boundingBox(),
      window.locator('.skill-card').last().boundingBox(),
    ])
    for (const box of [workspaceMetricsBox, skillTabsBox, skillsToolbarBox]) {
      expect(box.x - routeCanvasBox.x).toBeGreaterThanOrEqual(24)
      expect(routeCanvasBox.x + routeCanvasBox.width - (box.x + box.width)).toBeGreaterThanOrEqual(
        24,
      )
    }
    const skillTabsStyle = await window.locator('.skill-mode-tabs').evaluate((element) => {
      const style = globalThis.getComputedStyle(element)
      return {
        borderRadius: Number.parseFloat(style.borderTopLeftRadius) || 0,
        columns: style.gridTemplateColumns.split(' ').length,
      }
    })
    expect(skillTabsStyle.borderRadius).toBeGreaterThanOrEqual(10)
    expect(skillTabsStyle.columns).toBe(2)
    expect(skillsToolbarBox.y - (skillTabsBox.y + skillTabsBox.height)).toBeGreaterThanOrEqual(12)
    expect(
      firstSkillCardBox.y - (skillsToolbarBox.y + skillsToolbarBox.height),
    ).toBeGreaterThanOrEqual(18)
    expect(firstSkillCardBox.x - skillGridBox.x).toBeGreaterThanOrEqual(24)
    expect(
      skillGridBox.x + skillGridBox.width - (lastSkillCardBox.x + lastSkillCardBox.width),
    ).toBeGreaterThanOrEqual(24)

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

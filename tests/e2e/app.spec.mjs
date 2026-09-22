import { test, expect, _electron as electron } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

test('launches the workstation and opens the overview', async () => {
  const userDataDir = createUserDataDir()
  const app = await launchWorkstation(userDataDir)

  try {
    const window = await app.firstWindow()
    await expect(window).toHaveTitle('ZP Workbench')
    await dismissWelcome(window)

    await window.getByRole('button', { name: '总览', exact: true }).click()
    await expect(window.getByRole('heading', { name: '总览' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '运行环境' })).toBeVisible()
    await expect(window.locator('#view').getByRole('button', { name: '启动工作台' })).toBeVisible()
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
    await group.getByTitle('重命名课程文件夹').click()

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

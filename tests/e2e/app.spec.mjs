import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('launches the workstation and opens the overview', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-workbench-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      ZP_WORKBENCH_USER_DATA: userDataDir,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  })

  try {
    const window = await app.firstWindow()
    await expect(window).toHaveTitle('ZP Workbench')

    const welcomeButton = window.getByRole('button', { name: '进入工作站' })
    const welcomeVisible = await welcomeButton
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false)

    if (welcomeVisible) {
      await welcomeButton.click()
    }

    await window.getByRole('button', { name: '总览', exact: true }).click()
    await expect(window.getByRole('heading', { name: '总览' })).toBeVisible()
    await expect(window.getByRole('heading', { name: '运行环境' })).toBeVisible()
    await expect(window.locator('#view').getByRole('button', { name: '启动工作台' })).toBeVisible()
  } finally {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})

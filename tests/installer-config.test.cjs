const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const { APP_ID, APP_NAME } = require('../src/main/constants.cjs')

test('keeps a stable Windows shell identity across updates', () => {
  const { build } = packageJson
  const { nsis } = build

  assert.equal(build.appId, APP_ID)
  assert.equal(build.productName, APP_NAME)
  assert.equal(nsis.guid, 'acc0f786-1437-5371-9173-93f7ff33fc77')
  assert.equal(nsis.shortcutName, APP_NAME)
  assert.equal(nsis.createDesktopShortcut, true)
  assert.equal(nsis.createStartMenuShortcut, true)
})

test('always upgrades as a per-user installation so shell identity is not split', () => {
  const { nsis } = packageJson.build

  assert.equal(nsis.perMachine, false)
  assert.equal(nsis.allowElevation, false)
})

test('keeps shortcuts when an older version starts the installer', () => {
  const { nsis } = packageJson.build

  // electron-builder 只在安装器不允许改安装目录时才启用 keep-shortcuts 机制。
  // 旧版本的应用内更新不会给安装包传 `--updated`，若保留目录选择，升级时仍会
  // 删除并重建快捷方式、注销 AppUserModelID，任务栏固定项随之失效。
  // 已有自定义安装目录仍会从 InstallLocation 读取，升级不会搬家。
  assert.equal(nsis.allowToChangeInstallationDirectory, false)
  assert.equal(nsis.createDesktopShortcut, true)
  assert.equal(nsis.createStartMenuShortcut, true)
})

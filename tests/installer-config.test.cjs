const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const { APP_ID, APP_NAME } = require('../src/main/constants.cjs')

test('packages the shared presentation model and native PPTX export runtime', () => {
  for (const item of [
    'src/shared/**/*',
    'node_modules/pptxgenjs/**/*',
    'node_modules/image-size/**/*',
  ]) {
    assert.ok(packageJson.build.files.includes(item), item)
  }
  assert.ok(packageJson.dependencies.pptxgenjs)
})

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
  assert.equal(nsis.allowToChangeInstallationDirectory, true)
})

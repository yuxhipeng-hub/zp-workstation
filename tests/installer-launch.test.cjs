const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { UPDATE_INSTALLER_ARGS, launchUpdateInstaller } = require('../src/main/installer-launch.cjs')

function createFakeSpawn() {
  const calls = []
  const errors = []
  const child = {
    unrefCount: 0,
    unref() {
      this.unrefCount += 1
    },
    on(event, handler) {
      if (event === 'error') errors.push(handler)
    },
  }
  function spawnImpl(command, args, options) {
    calls.push({ command, args, options })
    return child
  }
  return { calls, errors, child, spawnImpl }
}

function createTempInstaller() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-installer-launch-'))
  const file = path.join(dir, 'ZP-Workbench-Setup-9.9.9-x64.exe')
  fs.writeFileSync(file, 'stub')
  return { dir, file }
}

test('in-app updates start the installer in NSIS update mode', () => {
  // 不带 `--updated` 时 electron-builder 会重建快捷方式并注销 AppUserModelID，
  // 导致桌面多一个快捷方式、任务栏固定项失效。
  assert.deepEqual(UPDATE_INSTALLER_ARGS, ['--updated', '/currentuser'])
})

test('launches the downloaded installer detached and ignores its stdio', (t) => {
  const { dir, file } = createTempInstaller()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const { calls, child, spawnImpl } = createFakeSpawn()

  launchUpdateInstaller(file, { spawnImpl })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, file)
  assert.deepEqual(calls[0].args, ['--updated', '/currentuser'])
  assert.equal(calls[0].options.detached, true)
  assert.equal(calls[0].options.stdio, 'ignore')
  assert.equal(child.unrefCount, 1)
})

test('keeps a spawn failure from crashing the main process', (t) => {
  const { dir, file } = createTempInstaller()
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const { errors, spawnImpl } = createFakeSpawn()
  const logged = []
  const logger = { error: (...args) => logged.push(args) }

  launchUpdateInstaller(file, { spawnImpl, logger })
  assert.equal(errors.length, 1)

  errors[0](new Error('spawn EACCES'))

  assert.equal(logged.length, 1)
  assert.match(logged[0][1], /安装程序启动失败：spawn EACCES/)
})

test('rejects a missing installer path instead of spawning nothing', () => {
  const { calls, spawnImpl } = createFakeSpawn()

  assert.throws(() => launchUpdateInstaller('', { spawnImpl }), /安装包路径为空/)
  assert.throws(
    () => launchUpdateInstaller(path.join(os.tmpdir(), 'zp-missing-setup.exe'), { spawnImpl }),
    /安装包不存在/,
  )
  assert.equal(calls.length, 0)
})

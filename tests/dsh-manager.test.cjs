const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DshManager } = require('../src/main/dsh-manager.cjs')

test('creates the DSH home before launching its child process', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-dsh-manager-'))
  const userData = path.join(root, 'user-data')
  const dshHome = path.join(root, '.dsh')
  const cache = path.join(root, 'cache')
  let launchedCwd = null

  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const manager = new DshManager({
    app: {
      getPath(name) {
        if (name === 'userData') return userData
        if (name === 'cache') return cache
        throw new Error(`Unexpected app path: ${name}`)
      },
    },
    settings: {
      get() {
        return {
          dshHome,
          host: '127.0.0.1',
          port: 3080,
        }
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  })

  manager.getInstalledVersion = () => '0.1.5-rc.2'
  manager.ensurePnpmShim = async () => {}
  manager.isPortAvailable = async () => true
  manager.nodeExecutablePath = () => process.execPath
  manager.buildEnvironment = () => ({})
  manager.waitForHttp = async () => 'http://127.0.0.1:3080'
  manager.runner.run = async (_node, _args, options) => {
    launchedCwd = options.cwd
    assert.equal(fs.existsSync(options.cwd), true)
    manager.runner.active.set(options.taskId, { killed: false, pid: 1234 })
    return { code: 0 }
  }

  await manager.startWeb()

  assert.equal(launchedCwd, dshHome)
  assert.equal(fs.existsSync(dshHome), true)
})

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

test('reads the live DSH model state through the official settings API', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-dsh-model-state-'))
  const userData = path.join(root, 'user-data')
  const dshHome = path.join(root, '.dsh')
  const cache = path.join(root, 'cache')
  const originalFetch = global.fetch

  t.after(() => {
    global.fetch = originalFetch
    fs.rmSync(root, { recursive: true, force: true })
  })

  fs.mkdirSync(dshHome, { recursive: true })
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
  manager.webProcess = { killed: false, pid: 1234 }
  manager.webUrl = 'http://127.0.0.1:3080/?token=test-token'

  const requests = []
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('token=test-token')) {
      return new Response('', {
        status: 303,
        headers: {
          'set-cookie': 'dsh-session=test-cookie; Path=/; HttpOnly; SameSite=Strict',
        },
      })
    }
    requests.push({ url: String(url), options })
    const method = JSON.parse(options.body).method
    if (method === 'credentials/describe') {
      return Response.json({
        type: 'server-response',
        rpcId: 'test',
        result: {
          ok: true,
          value: {
            DEEPSEEK_API_KEY: {
              configured: true,
              source: 'file',
              writable: true,
            },
          },
        },
      })
    }
    return Response.json({
      type: 'server-response',
      rpcId: 'test',
      result: {
        ok: true,
        value: {
          writable: true,
          namespaces: [
            {
              ns: 'agent-default-model',
              value: {
                provider: 'deepseek-official',
                model: 'deepseek-flash',
              },
            },
          ],
        },
      },
    })
  }

  const state = await manager.getDshModelState()

  assert.equal(state.available, true)
  assert.equal(state.credential.configured, true)
  assert.equal(state.credential.writable, true)
  assert.equal(state.defaultModel.provider, 'deepseek-official')
  assert.equal(state.defaultModel.model, 'deepseek-flash')
  assert.equal(requests.length, 2)
  assert.equal(requests[0].options.headers.cookie, 'dsh-session=test-cookie')
})

test('rejects malformed DeepSeek API keys before writing to DSH', async () => {
  const manager = new DshManager({
    app: {
      getPath() {
        return ''
      },
    },
    settings: {
      get() {
        return { dshHome: '' }
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  })

  await assert.rejects(() => manager.setDeepseekApiKey('not-a-deepseek-key'), {
    message: '请输入以 sk- 开头的有效 DeepSeek API Key。',
  })
})

test('writes a valid DeepSeek API key through the official credential endpoint', async () => {
  const manager = new DshManager({
    app: {
      getPath() {
        return ''
      },
    },
    settings: {
      get() {
        return { dshHome: '' }
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
  })
  const calls = []
  manager.requestDsh = async (method, args, options) => {
    calls.push({ method, args, options })
  }
  manager.getDshModelState = async () => ({
    available: true,
    credential: { configured: true, writable: true, source: 'file' },
    defaultModel: { provider: 'deepseek-official', model: 'deepseek-flash' },
    writable: true,
    error: null,
  })

  const key = 'sk-test-key-that-stays-write-only'
  const result = await manager.setDeepseekApiKey(key)

  assert.deepEqual(calls, [
    {
      method: 'credentials/set',
      args: {
        ref: 'DEEPSEEK_API_KEY',
        value: key,
      },
      options: { autoStart: true },
    },
  ])
  assert.equal(JSON.stringify(result).includes(key), false)
  assert.equal(result.credential.configured, true)
})

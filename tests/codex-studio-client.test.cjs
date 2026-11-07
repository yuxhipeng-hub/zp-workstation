const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { CodexStudioClient } = require('../src/main/codex-studio-client.cjs')
test('Codex client handshakes, suppresses tools, filters old connections and denies approval requests', async () => {
  const children = [],
    requests = [],
    events = []
  let options, args
  const client = new CodexStudioClient({
    binary: 'test-codex',
    spawnImpl: (_binary, a, o) => {
      args = a
      options = o
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill() {
          this.emit('close', 0)
        },
      })
      child.stdin.on('data', (b) => {
        for (const line of String(b).trim().split('\n')) {
          const m = JSON.parse(line)
          requests.push(m)
          if (m.method && m.id != null) {
            const result =
              m.method === 'config/read'
                ? {
                    config: {
                      mcp_servers: {
                        external: { url: 'https://example.invalid/?secret=never-return' },
                      },
                    },
                  }
                : m.method === 'account/read'
                  ? { account: { type: 'chatgpt', email: 'private' } }
                  : m.method === 'model/list'
                    ? { data: [{ model: 'available', displayName: '可用模型', isDefault: true }] }
                    : m.method.startsWith('thread/')
                      ? { thread: { id: 'thread' } }
                      : {}
            queueMicrotask(() => child.stdout.write(JSON.stringify({ id: m.id, result }) + '\n'))
          }
        }
      })
      children.push(child)
      return child
    },
  })
  client.onEvent = (e) => events.push(e)
  const info = await client.info('C:/isolated')
  assert.equal(info.models[0].id, 'available')
  assert.equal(info.authenticated, true)
  assert.equal(JSON.stringify(info).includes('private'), false)
  assert.ok(args.includes('view_image'))
  assert.ok(args.includes('features.code_mode_host=false'))
  assert.equal(options.shell, false)
  assert.equal(options.windowsHide, true)
  assert.equal(options.env.CODEX_APP_TOOLS_PIPE_PATH, undefined)
  await client.thread({ cwd: 'C:/isolated', model: 'available' })
  const thread = requests.find((m) => m.method === 'thread/start')
  assert.equal(thread.params.sandbox, 'read-only')
  assert.equal(thread.params.config.mcp_servers.external.enabled, false)
  children[0].stdout.write(
    JSON.stringify({ method: 'item/agentMessage/delta', params: { delta: 'hello' } }) + '\n',
  )
  assert.equal(events.at(-1).params.delta, 'hello')
  children[0].stdout.write(
    JSON.stringify({
      id: 99,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'unsafe' },
    }) + '\n',
  )
  assert.equal(requests.at(-1).error.code, -32601)
  client.close()
  await client.connect('C:/isolated')
  const count = events.length
  children[0].stdout.write(
    JSON.stringify({ method: 'item/agentMessage/delta', params: { delta: 'late' } }) + '\n',
  )
  assert.equal(events.length, count)
  const pending = client.request('unanswered', {})
  children[1].emit('close', 1)
  await assert.rejects(pending, /连接断开/)
  await client.connect('C:/isolated')
  const disconnected = client.request('unanswered', {})
  children[2].stdin.emit('error', new Error('EPIPE'))
  await assert.rejects(disconnected, /连接断开/)
})

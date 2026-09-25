const assert = require('node:assert/strict')
const test = require('node:test')
const {
  WindowProcessResolver,
  parseWindowOutput,
} = require('../src/main/window-process-resolver.cjs')

test('parses window process resolver JSON lines', () => {
  const windows = parseWindowOutput(
    [
      '{"handle":123,"processId":42,"title":"Main","visible":true}',
      'warning',
      '{"handle":456,"processId":43,"title":"Child","visible":false}',
    ].join('\n'),
  )

  assert.deepEqual(windows, [
    { handle: '123', processId: 42, title: 'Main', visible: true },
    { handle: '456', processId: 43, title: 'Child', visible: false },
  ])
})

test('resolves and caches the process window map', async () => {
  const calls = []
  const resolver = new WindowProcessResolver({
    logger: { info() {}, warn() {} },
    cacheMs: 5000,
    runner: {
      async run(_executable, _args, options) {
        calls.push(options.env.ZP_WINDOW_PROCESS_ID)
        return {
          stdout: '{"handle":123,"processId":42,"title":"Main","visible":true}\n',
        }
      },
    },
  })

  assert.equal((await resolver.resolve(42))[0].handle, '123')
  assert.equal((await resolver.resolve(42))[0].processId, 42)
  assert.deepEqual(calls, ['42'])
})

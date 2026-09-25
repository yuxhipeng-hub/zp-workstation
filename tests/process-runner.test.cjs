const assert = require('node:assert/strict')
const test = require('node:test')
const { ProcessRunner } = require('../src/main/process-runner.cjs')

test('captures stdout when requested', async () => {
  const runner = new ProcessRunner({
    info() {},
    warn() {},
  })
  const result = await runner.run(process.execPath, ['-e', "process.stdout.write('tool-output')"], {
    scope: 'test',
    captureOutput: true,
  })

  assert.equal(result.code, 0)
  assert.equal(result.stdout.trim(), 'tool-output')
})

test('terminates a child process when its timeout expires', async () => {
  const runner = new ProcessRunner({
    info() {},
    warn() {},
  })

  await assert.rejects(
    runner.run(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {
      scope: 'test',
      timeoutMs: 30,
    }),
    /timed out/,
  )
})

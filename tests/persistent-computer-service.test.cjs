const assert = require('node:assert/strict')
const test = require('node:test')
const {
  PersistentComputerService,
  buildServiceScript,
} = require('../src/main/persistent-computer-service.cjs')

test('builds a bounded JSON-RPC computer service script', () => {
  const script = buildServiceScript({
    inspectionScript: 'inspect',
    actionScript: 'action',
    windowScript: 'window',
  })

  assert.match(script, /Send-Response '__READY__'/)
  assert.match(script, /switch \(\[string\]\$request.method\)/)
})

test('reuses one PowerShell process for inspection, windows, and actions', async () => {
  const service = new PersistentComputerService({
    logger: { warn() {} },
    inspectionScript: '\'{"name":"Test"}\'',
    actionScript: '\'{"ok":true,"action":"invoke","effect":"unverified"}\'',
    windowScript: '\'{"handle":123,"processId":42,"title":"Main","visible":true}\'',
  })
  try {
    const inspection = await service.call('inspect', {
      processId: 1,
      maxDepth: 1,
      maxNodes: 2,
    })
    const windows = await service.call('windows', { processId: 42 })
    const action = await service.call('action', { payload: 'AA==' })

    assert.equal(JSON.parse(inspection.nodesJson)[0].name, 'Test')
    assert.equal(JSON.parse(windows.windowsJson)[0].handle, 123)
    assert.equal(action.ok, true)
  } finally {
    await service.stop()
  }
})

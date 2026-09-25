const assert = require('node:assert/strict')
const test = require('node:test')
const {
  ComputerDriver,
  normalizeSelector,
  parseActionOutput,
  parseNodeOutput,
  summarizeNodes,
} = require('../src/main/computer-driver.cjs')

test('parses UI Automation JSON lines and ignores other output', () => {
  const nodes = parseNodeOutput(
    [
      '{"depth":0,"name":"VS Code","controlType":"ControlType.Window"}',
      'warning',
      '{"depth":1,"name":"Explorer","controlType":"ControlType.Tree"}',
    ].join('\n'),
  )

  assert.equal(nodes.length, 2)
  assert.equal(nodes[0].name, 'VS Code')
})

test('summarizes useful UI Automation element groups', () => {
  const summary = summarizeNodes([
    { controlType: 'ControlType.Button' },
    { controlType: 'ControlType.Button' },
    { controlType: 'ControlType.Edit' },
    { controlType: 'ControlType.MenuItem' },
    { controlType: 'ControlType.Tree' },
    { controlType: 'ControlType.Document' },
  ])

  assert.deepEqual(
    {
      total: summary.total,
      buttons: summary.buttons,
      edits: summary.edits,
      menus: summary.menus,
      trees: summary.trees,
      documents: summary.documents,
    },
    {
      total: 6,
      buttons: 2,
      edits: 1,
      menus: 1,
      trees: 1,
      documents: 1,
    },
  )
})

test('inspects a bounded process through the PowerShell driver', async () => {
  let capturedScript = ''
  const runner = {
    async run(_executable, args, options) {
      capturedScript = Buffer.from(args.at(-1), 'base64').toString('utf16le')
      return {
        code: 0,
        stdout: '{"depth":0,"name":"VS Code","controlType":"ControlType.Window"}\n',
        options,
      }
    },
  }
  const driver = new ComputerDriver({
    logger: { info() {}, warn() {} },
    runner,
  })
  const result = await driver.inspectProcess(1234, { maxDepth: 4, maxNodes: 120 })

  assert.equal(result.available, true)
  assert.equal(result.summary.windows, 1)
  assert.match(capturedScript, /\$processId = 1234/)
  assert.match(capturedScript, /\$maxDepth = 4/)
  assert.match(capturedScript, /\$maxNodes = 120/)
})

test('normalizes UI Automation selectors', () => {
  assert.deepEqual(
    normalizeSelector({
      path: '0.2.1',
      automationId: 'workbench.parts.editor',
      name: '编辑器',
      controlType: 'ControlType.Group',
      ignored: 'value',
    }),
    {
      path: '0.2.1',
      automationId: 'workbench.parts.editor',
      name: '编辑器',
      controlType: 'ControlType.Group',
    },
  )
})

test('executes a UI Automation action through the driver', async () => {
  let receivedPayload = null
  const runner = {
    async run(_executable, _args, options) {
      receivedPayload = JSON.parse(
        Buffer.from(options.env.ZP_UIA_ACTION_PAYLOAD, 'base64').toString('utf8'),
      )
      return {
        code: 0,
        stdout: '{"ok":true,"action":"invoke","effect":"unverifiable","confirmed":false}\n',
      }
    },
  }
  const driver = new ComputerDriver({
    logger: { info() {}, warn() {} },
    runner,
  })
  const result = await driver.executeAction(4321, {
    action: 'invoke',
    selector: { path: '0.1.2', name: '运行' },
  })

  assert.equal(result.ok, true)
  assert.equal(receivedPayload.processId, 4321)
  assert.equal(receivedPayload.action, 'invoke')
  assert.equal(receivedPayload.selector.path, '0.1.2')
})

test('parses action output and rejects invalid actions', async () => {
  assert.equal(parseActionOutput('{"ok":true}').ok, true)
  const driver = new ComputerDriver({
    logger: { info() {}, warn() {} },
    runner: { run: async () => ({ stdout: '{}' }) },
  })
  await assert.rejects(driver.executeAction(1234, { action: 'delete' }), /不支持的界面动作/)
})

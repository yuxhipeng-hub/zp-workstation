const test = require('node:test')
const assert = require('node:assert/strict')
const semver = require('semver')
const packageJson = require('../package.json')
const { APP_ID } = require('../src/main/constants.cjs')
const { normalizeVersion } = require('../src/main/launcher-updater.cjs')
const {
  extractCredentialRefs,
  extractDefaultModel,
  extractDshWebUrl,
} = require('../src/main/dsh-manager.cjs')

test('normalizes release tags', () => {
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3')
  assert.equal(normalizeVersion('0.1.4-rc.2'), '0.1.4-rc.2')
  assert.equal(normalizeVersion('not-a-version'), null)
})

test('update comparison follows semver ordering', () => {
  assert.equal(semver.gt('0.1.5-alpha.2', '0.1.4-rc.2'), true)
  assert.equal(semver.gt('0.1.4-rc.2', '0.1.5-alpha.2'), false)
  assert.equal(semver.compare('0.1.4', '0.1.4'), 0)
})

test('keeps the runtime and installer taskbar identity aligned', () => {
  assert.equal(packageJson.build.appId, APP_ID)
  assert.equal(packageJson.build.nsis.guid, 'acc0f786-1437-5371-9173-93f7ff33fc77')
})

test('extracts the authenticated DSH web URL from startup output', () => {
  assert.equal(
    extractDshWebUrl('dsh web: http://127.0.0.1:3080/?token=abc123'),
    'http://127.0.0.1:3080/?token=abc123',
  )
  assert.equal(extractDshWebUrl('starting dsh web'), null)
})

test('reads the selected DSH model without reading credential values', () => {
  const settings = [
    'agent-default-model:',
    '  provider: deepseek-official',
    '  model: deepseek-v4-pro',
    '  reasoningEffort: high',
    'ui-theme:',
    '  preference: dark',
  ].join('\n')
  assert.deepEqual(extractDefaultModel(settings), {
    provider: 'deepseek-official',
    model: 'deepseek-v4-pro',
    reasoningEffort: 'high',
  })
})

test('extracts only credential reference names', () => {
  const credentials = [
    'version: 1',
    'refs:',
    '  DEEPSEEK_API_KEY: sk-secret-value',
    '  OPENAI_API_KEY: sk-another-secret',
    'records:',
    '  llm-pi-ai/example:',
    '    kind: api-key',
  ].join('\n')
  assert.deepEqual(extractCredentialRefs(credentials), ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY'])
})

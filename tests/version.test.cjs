const test = require('node:test')
const assert = require('node:assert/strict')
const semver = require('semver')
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

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { AppActionLog, sanitizeValue } = require('../src/main/app-action-log.cjs')

test('persists, filters, and trims the tool action log', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-action-log-'))
  try {
    const log = new AppActionLog(directory, { maxEntries: 2 })
    log.append({ sessionId: 'session-a', action: 'first', effect: 'confirmed' })
    log.append({ sessionId: 'session-b', action: 'second', effect: 'unverifiable' })
    log.append({ sessionId: 'session-a', action: 'third', effect: 'failed' })

    assert.deepEqual(
      log.list({ sessionId: 'session-a' }).map((entry) => entry.action),
      ['third'],
    )
    assert.deepEqual(
      log.list().map((entry) => entry.action),
      ['third', 'second'],
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('redacts secrets and home paths from action details', () => {
  const sanitized = sanitizeValue({
    path: path.join(os.homedir(), 'private', 'file.txt'),
    apiKey: 'secret-value',
    nested: { token: 'token-value' },
  })

  assert.equal(sanitized.path, path.join('%USERPROFILE%', 'private', 'file.txt'))
  assert.equal(sanitized.apiKey, '<redacted>')
  assert.equal(sanitized.nested.token, '<redacted>')
})

test('clears the action log file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-action-log-clear-'))
  try {
    const log = new AppActionLog(directory)
    log.append({ action: 'test' })
    assert.equal(log.list().length, 1)
    log.clear()
    assert.equal(log.list().length, 0)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { Logger } = require('../src/main/logger.cjs')

test('migrates existing logs when the log directory changes', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-logger-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const firstDirectory = path.join(directory, 'logs-a')
  const secondDirectory = path.join(directory, 'logs-b')
  const logger = new Logger(directory, firstDirectory)
  logger.info('test', 'first entry')

  const result = await logger.changeDirectory(secondDirectory)
  logger.info('test', 'second entry')

  assert.equal(result.oldDir, firstDirectory)
  assert.equal(result.newDir, secondDirectory)
  assert.equal(result.movedFiles, 1)
  assert.equal(fs.existsSync(firstDirectory), false)
  const contents = fs.readFileSync(path.join(secondDirectory, 'workbench.log'), 'utf8')
  assert.match(contents, /first entry/)
  assert.match(contents, /second entry/)
})

test('reloads persisted entries after the application restarts', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-logger-restart-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const firstRun = new Logger(directory)
  firstRun.info('startup', 'before restart')
  firstRun.warn('launcher-update', 'line one\nline two')

  const secondRun = new Logger(directory)
  const entries = secondRun.list(10)

  assert.deepEqual(
    entries.map(({ scope, level, message }) => ({ scope, level, message })),
    [
      { scope: 'startup', level: 'info', message: 'before restart' },
      { scope: 'launcher-update', level: 'warn', message: 'line one\nline two' },
    ],
  )
})

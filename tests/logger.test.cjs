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

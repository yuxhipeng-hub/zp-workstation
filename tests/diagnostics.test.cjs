const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const JSZip = require('jszip')
const {
  MAX_LOG_BYTES,
  collectDiagnostics,
  readLogTail,
  redactSettings,
  workspaceSummary,
} = require('../src/main/diagnostics.cjs')

test('redacts secret-looking setting keys at any depth', () => {
  const settings = {
    theme: 'dark',
    syncWebdavPassword: 'secret',
    sync: { token: 'abc', label: '主同步' },
    aiProfiles: [{ label: 'DeepSeek', apiKey: 'sk-1', hasKey: true }],
    syncWebdavUsername: 'zp',
  }

  const redacted = redactSettings(settings)
  assert.equal(redacted.theme, 'dark')
  assert.equal(redacted.syncWebdavUsername, 'zp')
  assert.equal(redacted.syncWebdavPassword, '（已隐藏）')
  assert.equal(redacted.sync.token, '（已隐藏）')
  assert.equal(redacted.sync.label, '主同步')
  assert.equal(redacted.aiProfiles[0].apiKey, '（已隐藏）')
  assert.equal(redacted.aiProfiles[0].label, 'DeepSeek')
  // 原对象不被修改
  assert.equal(settings.sync.token, 'abc')
})

test('summarizes workspace counts without exposing content', () => {
  const summary = workspaceSummary({
    version: 2,
    courses: [{ name: '高等数学' }],
    assignments: [{ title: '作业一' }, { title: '作业二' }],
    experiments: [{ title: '资料' }],
    knowledge: [],
    experimentGroups: [{ name: '组' }],
    schedule: { courses: [{ name: '课' }] },
  })

  assert.deepEqual(summary, {
    structureVersion: 2,
    courses: 1,
    assignments: 2,
    experiments: 1,
    knowledge: 0,
    experimentGroups: 1,
    scheduleCourses: 1,
  })
})

test('reads only the tail of a large log file', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-diagnostics-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const logFile = path.join(directory, 'workbench.log')
  const padding = 'A'.repeat(MAX_LOG_BYTES + 4096)
  fs.writeFileSync(logFile, `${padding}\n最后一行日志\n`, 'utf8')

  const tail = await readLogTail(logFile)
  assert.equal(Buffer.byteLength(tail, 'utf8'), MAX_LOG_BYTES)
  assert.match(tail, /最后一行日志/)
  assert.equal(tail.startsWith('A'), true)

  assert.equal(await readLogTail(path.join(directory, 'missing.log')), '')
  assert.equal(await readLogTail(''), '')
})

test('builds a zip with manifest, redacted settings, summary and log tail', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-diagnostics-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const logFile = path.join(directory, 'workbench.log')
  fs.writeFileSync(logFile, 'line-1\nline-2\n', 'utf8')

  const { buffer, manifest, logBytes } = await collectDiagnostics({
    appInfo: {
      appVersion: '0.6.1',
      electronVersion: '44.4.3',
      chromeVersion: '140.0.0.0',
      locale: 'zh-CN',
    },
    settings: { theme: 'dark', syncPassword: 'secret' },
    workspace: { version: 2, assignments: [{ title: '作业' }] },
    logFile,
    generatedAt: new Date('2026-10-24T05:00:00.000Z'),
  })

  assert.equal(manifest.app.version, '0.6.1')
  assert.equal(manifest.generatedAt, '2026-10-24T05:00:00.000Z')
  assert.ok(manifest.system.platform)
  assert.ok(logBytes > 0)

  const zip = await JSZip.loadAsync(buffer)
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir)
  assert.deepEqual(names.sort(), [
    'README.txt',
    'logs/workbench.log',
    'manifest.json',
    'settings.json',
    'workspace-summary.json',
  ])

  const settings = JSON.parse(await zip.file('settings.json').async('string'))
  assert.equal(settings.theme, 'dark')
  assert.equal(settings.syncPassword, '（已隐藏）')

  const summary = JSON.parse(await zip.file('workspace-summary.json').async('string'))
  assert.equal(summary.assignments, 1)
  assert.equal(Object.hasOwn(summary, 'assignmentsList'), false)

  const log = await zip.file('logs/workbench.log').async('string')
  assert.match(log, /line-2/)

  const readme = await zip.file('README.txt').async('string')
  assert.match(readme, /隐私说明/)
  assert.match(readme, /不会上传/)
})

test('handles a missing log file without failing', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-diagnostics-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const { buffer, logBytes } = await collectDiagnostics({
    appInfo: { appVersion: '0.6.1' },
    settings: {},
    workspace: {},
    logFile: path.join(directory, 'missing.log'),
  })
  assert.equal(logBytes, 0)

  const zip = await JSZip.loadAsync(buffer)
  const log = await zip.file('logs/workbench.log').async('string')
  assert.match(log, /没有可读取的日志/)
})

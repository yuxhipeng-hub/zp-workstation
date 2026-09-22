const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { JevManager, normalizeApiBaseUrl } = require('../src/main/jev-manager.cjs')
const { SettingsStore } = require('../src/main/settings-store.cjs')

function createHarness({ fetchImpl } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-jev-'))
  const settings = new SettingsStore(path.join(directory, 'data'))
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (buffer) => buffer.toString('utf8').replace(/^encrypted:/, ''),
  }
  const manager = new JevManager({
    userDataDir: directory,
    settings,
    safeStorage,
    fetchImpl:
      fetchImpl ||
      (async () =>
        new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })),
    fallbackClassifier: ({ fileName, existingGroups }) => {
      if (fileName.includes('算法') && existingGroups.includes('算法实验')) {
        return {
          group: '算法实验',
          confidence: 0.68,
          reason: '匹配到了已有的算法课程文件夹。',
        }
      }
      return {
        group: fileName.replace(/\.[^.]+$/, '') || '未分类资料',
        confidence: 0.35,
        reason: '根据文件名创建分类。',
      }
    },
    now: () => new Date('2026-09-22T10:00:00.000Z'),
  })
  return { directory, settings, manager }
}

test('normalizes TypeSafe API addresses', () => {
  assert.equal(normalizeApiBaseUrl('https://api.typesafe.ai'), 'https://api.typesafe.ai/v1')
  assert.equal(normalizeApiBaseUrl('https://api.typesafe.ai/v1/'), 'https://api.typesafe.ai/v1')
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:4010/v1'), 'http://127.0.0.1:4010/v1')
  assert.throws(() => normalizeApiBaseUrl('http://api.typesafe.ai/v1'), /HTTP/)
})

test('encrypts the API key and never writes it into settings.json', (t) => {
  const harness = createHarness()
  t.after(() => fs.rmSync(harness.directory, { recursive: true, force: true }))

  const status = harness.manager.setApiKey('ts_test_secret_value')
  assert.equal(status.hasApiKey, true)
  assert.equal(harness.manager.getApiKey(), 'ts_test_secret_value')
  assert.equal(
    fs
      .readFileSync(path.join(harness.directory, 'data', 'settings.json'), 'utf8')
      .includes('ts_test_secret_value'),
    false,
  )
  assert.equal(
    fs
      .readFileSync(path.join(harness.directory, 'jev-secrets.bin'), 'utf8')
      .includes('ts_test_secret_value'),
    true,
  )
})

test('detects the concrete Jev version behind jev-latest', async (t) => {
  const calls = []
  const harness = createHarness({
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      if (String(url).endsWith('/models')) {
        return new Response(
          JSON.stringify({
            models: [
              {
                name: 'jev-latest',
                description: 'Latest stable Jev model',
                release_date: '2026-09-01',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({
          model: 'jev-1.13.0',
          answers: {
            document_category: {
              type: 'choice',
              choice: 'algorithms',
              confidence: 0.91,
              probabilities: { algorithms: 0.91 },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    },
  })
  t.after(() => fs.rmSync(harness.directory, { recursive: true, force: true }))
  harness.manager.setApiKey('ts_test')

  const status = await harness.manager.testConnection()
  assert.equal(status.lastModel, 'jev-1.13.0')
  assert.equal(status.latestReleaseDate, '2026-09-01')
  assert.equal(status.compatibilityPassed, true)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://api.typesafe.ai/v1/models')
  assert.equal(calls[1].options.method, 'POST')
  assert.equal(JSON.parse(calls[1].options.body).model, 'jev-latest')
})

test('uses Jev for a confident existing group and falls back for low confidence', async (t) => {
  const source = path.join(os.tmpdir(), `zp-jev-source-${Date.now()}.txt`)
  fs.writeFileSync(source, 'Quick sort uses divide and conquer.', 'utf8')
  let answer = {
    type: 'choice',
    choice: 'group_0',
    confidence: 0.9,
    probabilities: { group_0: 0.9 },
  }
  let systemOneCalls = 0
  const harness = createHarness({
    fetchImpl: async () => {
      systemOneCalls += 1
      return new Response(
        JSON.stringify({ model: 'jev-1.13.0', answers: { target_group: answer } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    },
  })
  t.after(() => {
    fs.rmSync(harness.directory, { recursive: true, force: true })
    fs.rmSync(source, { force: true })
  })
  harness.manager.setApiKey('ts_test')

  const entry = { name: '算法作业.txt', path: source }
  const first = await harness.manager.suggestEntries([entry], {
    existingGroups: ['算法实验'],
  })
  assert.equal(first.suggestions[0].suggestion.source, 'jev')
  assert.equal(first.suggestions[0].suggestion.group, '算法实验')
  assert.equal(first.suggestions[0].suggestion.lowConfidence, false)

  const cached = await harness.manager.suggestEntries([entry], {
    existingGroups: ['算法实验'],
  })
  assert.equal(cached.suggestions[0].suggestion.group, '算法实验')
  assert.equal(systemOneCalls, 1)

  answer = {
    type: 'choice',
    choice: 'new_folder',
    confidence: 0.4,
    probabilities: { new_folder: 0.4, group_0: 0.6 },
  }
  harness.manager.cache.clear()
  const second = await harness.manager.suggestEntries([entry], {
    existingGroups: ['算法实验'],
  })
  assert.equal(second.suggestions[0].suggestion.source, 'local')
  assert.equal(second.suggestions[0].suggestion.group, '算法实验')
  assert.equal(second.suggestions[0].suggestion.lowConfidence, true)
})

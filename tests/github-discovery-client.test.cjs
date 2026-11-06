const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  GitHubDiscoveryClient,
  parseGitStock,
  parseArchive,
} = require('../src/main/github-discovery-client.cjs')
const { count } = require('../src/main/github-discovery-schema.cjs')
const { gitstock, archive, captured } = require('./fixtures/github-discovery.cjs')
const start = Date.parse('2026-11-06T12:00:00Z')
const response = (data) => new Response(typeof data === 'string' ? data : JSON.stringify(data))

function harness(t, fetchImpl) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-github-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  let clock = start
  const client = new GitHubDiscoveryClient({ userDataDir: dir, fetchImpl, now: () => clock })
  return {
    client,
    dir,
    advance: (ms) => {
      clock += ms
    },
  }
}

test('normalizes GitStock snapshots and never trusts external repository URLs or future timestamps', () => {
  const data = parseGitStock(gitstock(), 'weekly', start)
  assert.equal(data.items[0].url, 'https://github.com/example/research-tool')
  assert.equal(data.items[0].periodStars, 1250)
  assert.equal(data.capturedAt, captured)
  assert.throws(() => parseGitStock(gitstock('daily'), 'weekly', start), /格式/)
  assert.throws(
    () => parseGitStock(gitstock('weekly', '2099-01-01T00:00:00Z'), 'weekly', start),
    /时间/,
  )
  const bad = gitstock()
  bad.items.forEach((item) => {
    item.owner = '..'
  })
  assert.throws(() => parseGitStock(bad, 'weekly', start), /有效项目/)
  assert.equal(count(null), null)
  assert.equal(count(true), null)
  assert.equal(count('unknown'), null)
  assert.equal(count('1,234'), 1234)
})

test('parses each archive period, UTC offset, original ordering and comma-separated metrics', () => {
  for (const period of ['daily', 'weekly', 'monthly']) {
    const data = parseArchive(archive(), period, start)
    assert.equal(data.capturedAt, '2026-11-06T11:00:00.000Z')
    assert.deepEqual(
      data.items.map((item) => item.rank),
      [1, 2],
    )
    assert.equal(data.items[0].stars, 8100)
    assert.equal(data.items[0].periodStars, 510)
    assert.equal(data.items[0].description, 'Backup project description')
  }
  assert.throws(() => parseArchive('## 近一周热门仓库', 'weekly', start), /时间/)
  assert.throws(
    () => parseArchive(archive().replaceAll('this week', 'today'), 'weekly', start),
    /有效项目/,
  )
})

test('caches with distinct check and capture times, coalesces requests and supports offline disk reload', async (t) => {
  let calls = 0
  const { client, dir, advance } = harness(t, async () => {
    calls++
    return response(gitstock())
  })
  assert.equal(await client.getSnapshot({ cacheOnly: true }), null)
  const [a, b] = await Promise.all([client.getSnapshot(), client.getSnapshot()])
  assert.deepEqual(a, b)
  assert.equal(calls, 1)
  advance(60_000)
  assert.equal((await client.getSnapshot()).fromCache, true)
  assert.equal(calls, 1)
  advance(31 * 60_000)
  const checked = await client.getSnapshot()
  assert.equal(checked.snapshot.capturedAt, captured)
  assert.notEqual(checked.checkedAt, a.checkedAt)
  const offline = new GitHubDiscoveryClient({
    userDataDir: dir,
    now: () => start + 3_600_000,
    fetchImpl: async () => {
      throw new Error('offline')
    },
  })
  const cached = await offline.getSnapshot({ force: true })
  assert.equal(cached.stale, true)
  assert.equal(cached.snapshot.items[0].fullName, 'example/research-tool')
  assert.equal(cached.checkedAt, checked.checkedAt)
  assert.match(cached.warning, /上次保存/)
})

test('falls back to maintained archive when primary is unavailable and reports original source', async (t) => {
  const calls = []
  const { client } = harness(t, async (url, options) => {
    calls.push(url)
    assert.equal(options.redirect, 'error')
    if (url.startsWith('https://gitstock.org/')) return new Response('unavailable', { status: 503 })
    return response(archive())
  })
  const result = await client.getSnapshot({ period: 'monthly' })
  assert.equal(result.snapshot.sourceId, 'archive')
  assert.equal(result.stale, false)
  assert.match(result.source.name, /开源归档/)
  assert.equal(calls.length, 2)
  assert.equal(client.findRepo('EXAMPLE/backup').language, 'Rust')
})

test('chooses a newer archive over a stale primary and never overwrites a newer local snapshot', async (t) => {
  let old = false
  const { client } = harness(t, async (url) =>
    url.startsWith('https://gitstock.org/')
      ? response(gitstock('weekly', old ? '2026-11-04T00:00:00Z' : captured))
      : response(archive(old ? '2026-11-04 08:00:00 +0800' : '2026-11-06 19:00:00 +0800')),
  )
  const first = await client.getSnapshot()
  old = true
  const second = await client.getSnapshot({ force: true })
  assert.equal(second.snapshot.capturedAt, first.snapshot.capturedAt)
  assert.match(second.warning, /更早/)
  const { client: fallback } = harness(t, async (url) =>
    url.startsWith('https://gitstock.org/')
      ? response(gitstock('weekly', '2026-11-05T00:00:00Z'))
      : response(archive()),
  )
  assert.equal((await fallback.getSnapshot()).snapshot.sourceId, 'archive')
})

test('rejects invalid, oversized and empty sources without poisoning the saved cache', async (t) => {
  let broken = false
  const { client, dir } = harness(t, async () =>
    broken ? new Response('x'.repeat(1024 * 1024 + 1)) : response(gitstock()),
  )
  await client.getSnapshot()
  const before = fs.readFileSync(path.join(dir, 'github-discovery-cache.json'), 'utf8')
  broken = true
  assert.equal((await client.getSnapshot({ force: true })).stale, true)
  assert.equal(fs.readFileSync(path.join(dir, 'github-discovery-cache.json'), 'utf8'), before)
  const { client: empty } = harness(t, async () => response({ items: [] }))
  await assert.rejects(empty.getSnapshot(), /暂时无法/)
  await assert.rejects(empty.getSnapshot({ period: '__proto__' }), /周期/)
})

test('ignores malformed disk entries and persists concurrent periods without losing either', async (t) => {
  const { client, dir } = harness(t, async (url) =>
    response(gitstock(new URL(url).searchParams.get('period'))),
  )
  fs.writeFileSync(path.join(dir, 'github-discovery-cache.json'), '{broken')
  await Promise.all([
    client.getSnapshot({ period: 'daily' }),
    client.getSnapshot({ period: 'monthly' }),
  ])
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'github-discovery-cache.json'), 'utf8'))
  assert.equal(stored.entries.daily.snapshot.period, 'daily')
  assert.equal(stored.entries.monthly.snapshot.period, 'monthly')
  const again = new GitHubDiscoveryClient({ userDataDir: dir, now: () => start })
  assert.equal(again.getCached('daily').snapshot.items.length, 2)
})

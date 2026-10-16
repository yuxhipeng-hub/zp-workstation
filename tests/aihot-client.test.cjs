const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { AihotClient } = require('../src/main/aihot-client.cjs')

function createHarness(fetchImpl) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-aihot-'))
  let clock = Date.parse('2026-10-14T04:00:00.000Z')
  const client = new AihotClient({
    userDataDir: root,
    fetchImpl,
    now: () => clock,
  })
  return {
    root,
    client,
    advance: (ms) => {
      clock += ms
    },
  }
}

function jsonResponse(body, { etag = '"v1"', status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => {
        const key = String(name).toLowerCase()
        if (key === 'etag') return etag
        return headers[key] ?? null
      },
    },
    text: async () => JSON.stringify(body),
  }
}

const dailyPayload = {
  schemaVersion: 1,
  report: {
    date: '2026-10-14',
    generatedAt: '2026-10-14T00:00:27.127Z',
    links: { aihot: 'https://aihot.news/daily/2026-10-14' },
    attribution: { name: 'AIHOT', url: 'https://aihot.news/daily/2026-10-14' },
    lead: { title: '头条标题', leadParagraph: '头条摘要' },
    sections: [
      {
        label: '模型发布/更新',
        items: [
          {
            id: 'item-1',
            title: '模型发布',
            summary: '摘要',
            source: { name: 'Google Blog' },
            links: {
              aihot: 'https://aihot.news/items/item-1',
              original: 'https://example.com/item-1',
            },
            publishedAt: '2026-10-14T01:00:00.000Z',
            category: 'ai-models',
          },
        ],
      },
    ],
  },
}

test('reads the latest daily report and caches it on disk', async (t) => {
  const calls = []
  const harness = createHarness(async (url, options) => {
    calls.push({ url, headers: options.headers })
    return jsonResponse(dailyPayload)
  })
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))

  const result = await harness.client.getLatestDaily()
  assert.equal(result.source, 'live')
  assert.equal(result.stale, false)
  assert.equal(result.data.date, '2026-10-14')
  assert.equal(result.data.lead.title, '头条标题')
  assert.equal(result.data.sections[0].label, '模型发布/更新')
  assert.equal(result.data.sections[0].items[0].title, '模型发布')
  assert.equal(result.data.sections[0].items[0].links.original, 'https://example.com/item-1')
  assert.match(calls[0].url, /^https:\/\/aihot\.news\/api\/v1\/dailies\/latest$/)

  const cache = JSON.parse(fs.readFileSync(path.join(harness.root, 'aihot-cache.json'), 'utf8'))
  assert.equal(cache.entries['/api/v1/dailies/latest'].etag, '"v1"')
})

test('serves the cached report inside the polling window and revalidates with ETag', async (t) => {
  const calls = []
  const harness = createHarness(async (url, options) => {
    calls.push(options.headers)
    if (options.headers['if-none-match'] === '"v1"') {
      return jsonResponse(null, { status: 304, etag: '"v1"' })
    }
    return jsonResponse(dailyPayload)
  })
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))

  await harness.client.getLatestDaily()
  harness.advance(60_000)
  const cached = await harness.client.getLatestDaily()
  assert.equal(cached.source, 'cache')
  assert.equal(calls.length, 1)

  harness.advance(31 * 60_000)
  const revalidated = await harness.client.getLatestDaily()
  assert.equal(calls.length, 2)
  assert.equal(calls[1]['if-none-match'], '"v1"')
  assert.equal(revalidated.data.lead.title, '头条标题')
})

test('falls back to the cached report and reports the failure when the network is down', async (t) => {
  let offline = false
  const harness = createHarness(async () => {
    if (offline) throw Object.assign(new Error('offline'), { name: 'TypeError' })
    return jsonResponse(dailyPayload)
  })
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))

  await harness.client.getLatestDaily()
  offline = true
  harness.advance(31 * 60_000)
  const stale = await harness.client.getLatestDaily()
  assert.equal(stale.source, 'cache')
  assert.equal(stale.stale, true)
  assert.match(stale.error, /AIHOT 网络不可用/)
  assert.equal(stale.data.lead.title, '头条标题')
})

test('surfaces rate limiting instead of hammering the API', async (t) => {
  const harness = createHarness(async () =>
    jsonResponse(null, { status: 429, headers: { 'retry-after': '90' } }),
  )
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))

  await assert.rejects(() => harness.client.getLatestDaily(), /请求过于频繁/)
})

test('keeps the request shape of the latest selected items', async (t) => {
  const calls = []
  const harness = createHarness(async (url) => {
    calls.push(url)
    return jsonResponse({
      schemaVersion: 1,
      items: [
        {
          id: 'item-9',
          title: '最新资讯',
          summary: '摘要',
          source: { name: 'X：某账号' },
          links: { aihot: 'https://aihot.news/items/item-9', original: 'https://example.com/9' },
          publishedAt: '2026-10-14T03:00:00.000Z',
          category: 'paper',
        },
      ],
    })
  })
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))

  const result = await harness.client.getLatestItems({ limit: 3 })
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].source.name, 'X：某账号')
  assert.match(calls[0], /mode=selected/)
  assert.match(calls[0], /window=24h/)
  assert.match(calls[0], /limit=3/)
})

test('builds filtered item queries with category, window, search and cursor', async (t) => {
  const calls = []
  const harness = createHarness(async (url) => {
    calls.push(url)
    return jsonResponse({
      schemaVersion: 1,
      items: [
        {
          id: 'item-7',
          title: '论文精选',
          summary: '摘要',
          source: { name: 'arXiv' },
          links: { aihot: 'https://aihot.news/items/item-7', original: 'https://example.com/7' },
          category: 'paper',
          reason: '因为值得读',
          score: 88,
        },
      ],
      page: { count: 1, hasMore: true, nextCursor: 'cursor-2' },
    })
  })
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))

  const result = await harness.client.getItems({
    mode: 'selected',
    window: '24h',
    category: 'paper',
    q: '推理',
    limit: 5,
  })
  assert.equal(result.data.items[0].reason, '因为值得读')
  assert.equal(result.data.items[0].score, 88)
  assert.equal(result.data.hasMore, true)
  assert.equal(result.data.nextCursor, 'cursor-2')
  assert.match(calls[0], /mode=selected/)
  assert.match(calls[0], /window=24h/)
  assert.match(calls[0], /category=paper/)
  assert.match(calls[0], /limit=5/)

  const second = await harness.client.getItems({ cursor: 'cursor-2', category: 'not-a-category' })
  assert.match(calls[1], /cursor=cursor-2/)
  assert.doesNotMatch(calls[1], /category=/)
  assert.equal(second.data.hasMore, true)
})

test('reads hot topics with their story identifiers', async (t) => {
  const harness = createHarness(async () =>
    jsonResponse({
      schemaVersion: 1,
      count: 1,
      items: [
        {
          rank: 1,
          id: 'hot-1',
          title: '热点事件',
          source: { name: '某来源' },
          links: {
            aihot: 'https://aihot.news/items/hot-1',
            original: 'https://example.com/hot-1',
            story: 'https://aihot.virxact.com/story/b9d1e480-fac1-479a-9209-5241ad001528',
          },
          sourceCount: 28,
          participantCount: 91,
          latestAt: '2026-10-14T07:39:37.000Z',
        },
      ],
    }),
  )
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))

  const result = await harness.client.getHotTopics()
  assert.equal(result.data[0].rank, 1)
  assert.equal(result.data[0].publicId, 'b9d1e480-fac1-479a-9209-5241ad001528')
  assert.equal(result.data[0].sourceCount, 28)
})

test('validates story identifiers and trims the digest timeline', async (t) => {
  const calls = []
  const harness = createHarness(async (url) => {
    calls.push(url)
    return jsonResponse({
      schemaVersion: 1,
      story: {
        publicId: 'b9d1e480-fac1-479a-9209-5241ad001528',
        title: '事件标题',
        status: 'active',
        sourceCount: 28,
        reportCount: 2,
        digest: '第一段\n\n第二段',
        links: { aihot: 'https://aihot.news/story/b9d1e480-fac1-479a-9209-5241ad001528' },
        reports: [
          {
            id: 'report-1',
            title: '报道一',
            summary: '摘要一',
            source: { name: '来源一', firstParty: true },
            publishedAt: '2026-10-14T08:08:40Z',
            links: {
              aihot: 'https://aihot.news/items/report-1',
              original: 'https://example.com/1',
            },
          },
        ],
      },
    })
  })
  t.after(() => fs.rmSync(harness.root, { recursive: true, force: true }))

  const story = await harness.client.getStory('b9d1e480-fac1-479a-9209-5241ad001528')
  assert.equal(story.data.title, '事件标题')
  assert.equal(story.data.reports[0].firstParty, true)
  assert.equal(story.data.reports[0].summary, '摘要一')
  assert.match(calls[0], /\/api\/v1\/stories\/b9d1e480-fac1-479a-9209-5241ad001528$/)

  await assert.rejects(() => harness.client.getStory('not a story id'), /事件标识无效/)
  assert.equal(calls.length, 1)
})

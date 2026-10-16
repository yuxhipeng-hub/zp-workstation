const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

// AIHOT 是第三方 AI 资讯聚合站，提供匿名只读的 /api/v1 接口。
// 官方要求：条件请求（ETag）、按节奏轮询（items 与热点最快 60 秒，RSS 30 分钟）、
// 保留署名与原文链接。这里用 30 分钟磁盘缓存加单飞请求把这些约束收在一个地方。

const API_BASE = 'https://aihot.news'
const CACHE_TTL_MS = 30 * 60 * 1000
const REQUEST_TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 2 * 1024 * 1024
const CACHE_VERSION = 1
const MAX_CACHE_ENTRIES = 24
const CATEGORIES = new Set(['ai-models', 'ai-products', 'industry', 'paper', 'tip', 'opinion'])

function trimSource(source) {
  return { name: String(source?.name || 'AIHOT') }
}

function trimLinks(links) {
  return {
    aihot: typeof links?.aihot === 'string' ? links.aihot : '',
    original: typeof links?.original === 'string' ? links.original : '',
  }
}

function trimItem(item) {
  return {
    id: String(item?.id || ''),
    title: String(item?.title || ''),
    originalTitle: String(item?.originalTitle || ''),
    summary: String(item?.summary || ''),
    reason: String(item?.reason || ''),
    score: Number.isFinite(item?.score) ? item.score : null,
    source: trimSource(item?.source),
    links: trimLinks(item?.links),
    publishedAt: item?.publishedAt || null,
    discoveredAt: item?.discoveredAt || null,
    category: item?.category || '',
  }
}

function trimReport(report) {
  return {
    ...trimItem(report),
    firstParty: report?.source?.firstParty === true,
  }
}

function trimHotTopic(item) {
  const storyUrl = String(item?.links?.story || '')
  return {
    rank: Number(item?.rank) || 0,
    id: String(item?.id || ''),
    title: String(item?.title || ''),
    publicId: storyUrl ? storyUrl.split('/').filter(Boolean).pop() : '',
    source: trimSource(item?.source),
    links: trimLinks(item?.links),
    sourceCount: Number(item?.sourceCount) || 0,
    participantCount: Number(item?.participantCount) || 0,
    latestAt: item?.latestAt || null,
  }
}

function trimStory(story) {
  return {
    publicId: String(story?.publicId || ''),
    title: String(story?.title || ''),
    status: String(story?.status || ''),
    sourceCount: Number(story?.sourceCount) || 0,
    reportCount: Number(story?.reportCount) || 0,
    firstReportAt: story?.firstReportAt || null,
    latestAt: story?.latestAt || null,
    latest: String(story?.latest || ''),
    digest: String(story?.digest || ''),
    digestUpdatedAt: story?.digestUpdatedAt || null,
    links: trimLinks(story?.links),
    reports: (Array.isArray(story?.reports) ? story.reports : []).map(trimReport),
  }
}

function trimDailyReport(report) {
  const lead = report?.lead || {}
  return {
    date: String(report?.date || ''),
    generatedAt: report?.generatedAt || null,
    links: trimLinks(report?.links),
    attribution: trimSource(report?.attribution),
    lead: {
      title: String(lead.title || ''),
      leadParagraph: String(lead.leadParagraph || ''),
    },
    sections: (Array.isArray(report?.sections) ? report.sections : [])
      .map((section) => ({
        label: String(section?.label || ''),
        items: (Array.isArray(section?.items) ? section.items : []).map(trimItem),
      }))
      .filter((section) => section.label && section.items.length),
  }
}

class AihotClient {
  constructor({ userDataDir, logger = null, fetchImpl = fetch, now = () => Date.now() }) {
    this.cacheFile = path.join(userDataDir, 'aihot-cache.json')
    this.logger = logger
    this.fetchImpl = fetchImpl
    this.now = now
    this.cache = null
    this.inflight = new Map()
  }

  loadCache() {
    if (this.cache) return this.cache
    try {
      const parsed = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'))
      this.cache =
        parsed && parsed.version === CACHE_VERSION && parsed.entries
          ? { version: CACHE_VERSION, entries: parsed.entries }
          : { version: CACHE_VERSION, entries: {} }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger?.warn?.('aihot', `读取 AIHOT 缓存失败：${error.message}`)
      }
      this.cache = { version: CACHE_VERSION, entries: {} }
    }
    return this.cache
  }

  async saveCache() {
    const entries = Object.fromEntries(
      Object.entries(this.loadCache().entries)
        .filter(([, entry]) => entry?.payload)
        .sort((left, right) => Number(right[1].fetchedAt || 0) - Number(left[1].fetchedAt || 0))
        .slice(0, MAX_CACHE_ENTRIES),
    )
    this.cache = { version: CACHE_VERSION, entries }
    try {
      await fsp.mkdir(path.dirname(this.cacheFile), { recursive: true })
      await fsp.writeFile(
        this.cacheFile,
        `${JSON.stringify({ version: CACHE_VERSION, entries }, null, 2)}\n`,
        'utf8',
      )
    } catch (error) {
      this.logger?.warn?.('aihot', `写入 AIHOT 缓存失败：${error.message}`)
    }
  }

  async fetchOnce(pathname) {
    const entry = this.loadCache().entries[pathname] || null
    const headers = { accept: 'application/json' }
    if (entry?.etag) headers['if-none-match'] = entry.etag

    let response
    try {
      response = await this.fetchImpl(`${API_BASE}${pathname}`, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? '请求超时' : '网络不可用'
      throw Object.assign(new Error(`AIHOT ${reason}`), { code: 'network', cause: error })
    }

    if (response.status === 304) {
      return { entry: { ...entry, fetchedAt: this.now() }, notModified: true }
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers?.get?.('retry-after')) || null
      throw Object.assign(new Error('AIHOT 请求过于频繁'), { code: 'rate-limited', retryAfter })
    }
    if (!response.ok) {
      throw Object.assign(new Error(`AIHOT 返回 ${response.status}`), {
        code: 'http',
        status: response.status,
      })
    }

    const body = await response.text()
    if (body.length > MAX_BODY_BYTES) {
      throw Object.assign(new Error('AIHOT 响应过大，已放弃写入缓存'), { code: 'too-large' })
    }
    let payload
    try {
      payload = JSON.parse(body)
    } catch (error) {
      throw Object.assign(new Error('AIHOT 返回的内容无法解析'), {
        code: 'invalid-json',
        cause: error,
      })
    }
    return {
      entry: {
        etag: response.headers?.get?.('etag') || null,
        fetchedAt: this.now(),
        payload,
      },
      notModified: false,
    }
  }

  async load(pathname, sculpt, { force = false } = {}) {
    if (this.inflight.has(pathname)) return this.inflight.get(pathname)
    const task = (async () => {
      const cached = this.loadCache().entries[pathname] || null
      const fresh = cached && this.now() - Number(cached.fetchedAt || 0) < CACHE_TTL_MS
      if (cached && fresh && !force) {
        return {
          data: sculpt(cached.payload),
          fetchedAt: cached.fetchedAt,
          source: 'cache',
          stale: false,
        }
      }
      try {
        const result = await this.fetchOnce(pathname)
        const entry = result.entry
        if (!result.notModified) {
          const data = sculpt(entry.payload)
          this.loadCache().entries[pathname] = entry
          await this.saveCache()
          return { data, fetchedAt: entry.fetchedAt, source: 'live', stale: false }
        }
        this.loadCache().entries[pathname] = entry
        await this.saveCache()
        return {
          data: sculpt(entry.payload),
          fetchedAt: entry.fetchedAt,
          source: 'cache',
          stale: false,
        }
      } catch (error) {
        if (error.code === 'rate-limited' && error.retryAfter) {
          this.logger?.warn?.('aihot', `AIHOT 限流，${error.retryAfter} 秒后重试`)
        } else {
          this.logger?.warn?.('aihot', error.message)
        }
        if (cached?.payload) {
          return {
            data: sculpt(cached.payload),
            fetchedAt: cached.fetchedAt,
            source: 'cache',
            stale: true,
            error: error.message,
          }
        }
        throw error
      }
    })().finally(() => {
      this.inflight.delete(pathname)
    })
    this.inflight.set(pathname, task)
    return task
  }

  async getLatestDaily(options = {}) {
    const result = await this.load(
      '/api/v1/dailies/latest',
      (payload) => {
        if (!payload?.report?.date) throw new Error('AIHOT 日报结构不符合预期')
        return trimDailyReport(payload.report)
      },
      options,
    )
    return result
  }

  async getLatestItems(options = {}) {
    const { limit = 6 } = options
    const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 20)
    return this.load(
      `/api/v1/items?mode=selected&window=24h&by=timeline&limit=${safeLimit}`,
      (payload) => {
        if (!Array.isArray(payload?.items)) throw new Error('AIHOT 资讯结构不符合预期')
        return payload.items.map(trimItem)
      },
      options,
    )
  }

  async getItems(options = {}) {
    const mode = options.mode === 'all' ? 'all' : 'selected'
    const window = options.window === '24h' ? '24h' : '7d'
    const category = CATEGORIES.has(options.category) ? options.category : ''
    const query = String(options.q || '')
      .trim()
      .slice(0, 200)
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 30)
    const cursor = String(options.cursor || '').slice(0, 600)
    const search = new URLSearchParams({
      mode,
      window,
      by: 'timeline',
      limit: String(limit),
    })
    if (category) search.set('category', category)
    if (query) search.set('q', query)
    if (cursor) search.set('cursor', cursor)
    return this.load(
      `/api/v1/items?${search.toString()}`,
      (payload) => {
        if (!Array.isArray(payload?.items)) throw new Error('AIHOT 资讯结构不符合预期')
        return {
          items: payload.items.map(trimItem),
          hasMore: payload?.page?.hasMore === true,
          nextCursor: String(payload?.page?.nextCursor || ''),
        }
      },
      { force: options.force === true },
    )
  }

  async getHotTopics(options = {}) {
    return this.load(
      '/api/v1/hot-topics',
      (payload) => {
        if (!Array.isArray(payload?.items)) throw new Error('AIHOT 热点结构不符合预期')
        return payload.items.map(trimHotTopic)
      },
      { force: options.force === true },
    )
  }

  async getStory(publicId, options = {}) {
    const id = String(publicId || '').trim()
    if (!/^[0-9a-fA-F][0-9a-fA-F-]{7,63}$/.test(id)) throw new Error('事件标识无效。')
    return this.load(
      `/api/v1/stories/${id}`,
      (payload) => {
        if (!payload?.story?.publicId) throw new Error('AIHOT 事件结构不符合预期')
        return trimStory(payload.story)
      },
      { force: options.force === true },
    )
  }
}

module.exports = { AihotClient, trimDailyReport, trimItem, trimStory, trimHotTopic }

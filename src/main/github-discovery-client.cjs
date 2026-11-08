const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { PERIODS, SOURCES, cleanRepo, count } = require('./github-discovery-schema.cjs')

const CACHE_TTL = 30 * 60_000
const STALE_AFTER = 6 * 60 * 60_000
const MAX_BYTES = 1024 * 1024
const ARCHIVE_URL = 'https://raw.githubusercontent.com/SnailDev/github-hot-hub/main/README.md'

function validTime(value, now) {
  const time = Date.parse(value)
  return Number.isFinite(time) && time > 0 && time <= now + 5 * 60_000
}

function snapshot(period, sourceId, capturedAt, items, now) {
  if (!PERIODS.has(period) || !Object.hasOwn(SOURCES, sourceId) || !validTime(capturedAt, now))
    throw new Error('榜单来源或采集时间无效。')
  const seen = new Set()
  const cleaned = items.map(cleanRepo).filter((item) => {
    if (!item || seen.has(item.fullName.toLowerCase())) return false
    seen.add(item.fullName.toLowerCase())
    return true
  })
  if (!cleaned.length || cleaned.length > 100) throw new Error('榜单没有有效项目。')
  return { period, sourceId, capturedAt: new Date(capturedAt).toISOString(), items: cleaned }
}

function parseGitStock(body, period, now = Date.now()) {
  if (
    body?.period !== period ||
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 100
  )
    throw new Error('GitStock 榜单格式无效。')
  const times = body.items.map((item) => Number(item.captured_at) * 1000)
  if (times.some((time) => !Number.isFinite(time) || time <= 0 || time > now + 5 * 60_000))
    throw new Error('GitStock 采集时间无效。')
  const items = body.items
    .map((item) => ({
      fullName: `${item.owner}/${item.repo}`,
      description: item.description,
      language: item.language,
      stars: item.stars,
      forks: item.forks,
      periodStars: item.stars_gained,
      rank: item.rank,
    }))
    .sort((a, b) => (count(a.rank) || 101) - (count(b.rank) || 101))
  return snapshot(period, 'gitstock', new Date(Math.min(...times)).toISOString(), items, now)
}

function parseArchive(text, period, now = Date.now()) {
  const labels = { daily: '今日热门仓库', weekly: '近一周热门仓库', monthly: '近一月热门仓库' }
  const updated = text.match(
    /更新时间[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})/,
  )
  if (!updated || !PERIODS.has(period)) throw new Error('开源归档缺少采集时间。')
  const capturedAt = `${updated[1]}T${updated[2]}${updated[3]}:${updated[4]}`
  const section = text.split(`## ${labels[period]}`)[1]?.split(/^## /m)[0]
  if (!section) throw new Error('开源归档缺少对应榜单。')
  const suffix = { daily: 'today', weekly: 'this week', monthly: 'this month' }[period]
  const items = section
    .split(/^\d+\.\s+(?=\[)/m)
    .slice(1)
    .map((block, index) => {
      const heading = block.match(/^\[[^\]]+\]\(https:\/\/github\.com\/([^\s)]+)\)/)
      const lines = block
        .split('\n')
        .slice(1)
        .map((line) => line.trim().replace(/^-\s*/, ''))
      const meta = lines.find((line) => line.startsWith('language:')) || ''
      const growth = meta.match(/`([\d,]+) stars (today|this week|this month)`/)
      if (!heading || !growth || growth[2] !== suffix) return null
      return {
        fullName: heading[1],
        description: lines.filter((line) => line && !line.startsWith('language:')).join(' '),
        language: meta.match(/language:\s*\*\*([^*]*)\*\*/)?.[1] || '',
        stars: meta.match(/\bstars:\s*\*\*([\d,]+)\*\*/)?.[1],
        forks: meta.match(/\b(?:folks|forks):\s*\*\*([\d,]+)\*\*/)?.[1],
        periodStars: growth[1],
        rank: index + 1,
      }
    })
    .filter(Boolean)
  return snapshot(period, 'archive', capturedAt, items, now)
}

async function readLimited(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('榜单响应过大。')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('榜单响应为空。')
  const parts = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BYTES) throw new Error('榜单响应过大。')
      parts.push(Buffer.from(value))
    }
    return Buffer.concat(parts).toString('utf8')
  } finally {
    await reader.cancel().catch(() => {})
  }
}

class GitHubDiscoveryClient {
  constructor({ userDataDir, fetchImpl = fetch, now = () => Date.now() }) {
    this.file = path.join(userDataDir, 'github-discovery-cache.json')
    this.fetchImpl = fetchImpl
    this.now = now
    this.cache = null
    this.pending = new Map()
    this.writes = Promise.resolve()
  }

  loadCache() {
    if (this.cache) return this.cache
    this.cache = {}
    try {
      if (fs.statSync(this.file).size > MAX_BYTES) return this.cache
      const stored = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      if (stored.version !== 1) return this.cache
      for (const period of PERIODS) {
        try {
          const entry = stored.entries?.[period]
          if (!entry || !validTime(entry.checkedAt, this.now())) continue
          const data = entry.snapshot
          this.cache[period] = {
            snapshot: snapshot(period, data.sourceId, data.capturedAt, data.items, this.now()),
            checkedAt: new Date(entry.checkedAt).toISOString(),
          }
        } catch {
          /* Invalid entries never replace usable entries. */
        }
      }
    } catch {
      /* Missing or invalid network cache is recoverable. */
    }
    return this.cache
  }

  result(entry, fromCache = true, warning = '', failed = false) {
    return {
      ...entry,
      fromCache,
      stale: failed || this.now() - Date.parse(entry.snapshot.capturedAt) > STALE_AFTER,
      warning,
      source: SOURCES[entry.snapshot.sourceId],
    }
  }

  getCached(period) {
    if (!PERIODS.has(period)) throw new Error('榜单周期无效。')
    const entry = this.loadCache()[period]
    return entry ? this.result(entry) : null
  }

  async request(url) {
    const response = await this.fetchImpl(url, {
      headers: { accept: url === ARCHIVE_URL ? 'text/plain' : 'application/json' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    })
    if (!response.ok) throw new Error(`来源返回 HTTP ${response.status}`)
    return readLimited(response)
  }

  async persist() {
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        const content = JSON.stringify({ version: 1, entries: this.cache })
        await fsp.mkdir(path.dirname(this.file), { recursive: true })
        await fsp.writeFile(`${this.file}.tmp`, content, 'utf8')
        await fsp.rename(`${this.file}.tmp`, this.file)
      })
    return this.writes
  }

  async getSnapshot({ period = 'weekly', force = false, cacheOnly = false } = {}) {
    if (!PERIODS.has(period)) throw new Error('榜单周期无效。')
    const cached = this.loadCache()[period]
    if (cacheOnly) return cached ? this.result(cached) : null
    if (!force && cached && this.now() - Date.parse(cached.checkedAt) < CACHE_TTL)
      return this.result(cached)
    if (this.pending.has(period)) return this.pending.get(period)
    const task = this.refresh(period, cached)
    this.pending.set(period, task)
    try {
      return await task
    } finally {
      this.pending.delete(period)
    }
  }

  async refresh(period, cached) {
    let candidate = null
    let warning = ''
    try {
      const body = JSON.parse(
        await this.request(
          `https://gitstock.org/api/v1/github/trending?period=${period}&description_lang=zh`,
        ),
      )
      candidate = parseGitStock(body, period, this.now())
    } catch {
      warning = 'GitStock 暂不可用，已尝试开源归档。'
    }
    if (!candidate || this.now() - Date.parse(candidate.capturedAt) > STALE_AFTER) {
      try {
        const archive = parseArchive(await this.request(ARCHIVE_URL), period, this.now())
        if (!candidate || Date.parse(archive.capturedAt) > Date.parse(candidate.capturedAt)) {
          candidate = archive
          warning = '当前使用 github-hot-hub 开源归档，介绍保留原文。'
        }
      } catch {
        /* Keep the primary snapshot or the local cache. */
      }
    }
    if (!candidate) {
      if (cached)
        return this.result(cached, true, '网络或来源暂不可用，正在显示上次保存的榜单。', true)
      throw new Error('暂时无法读取榜单，请稍后重试；首次成功加载后可离线浏览。')
    }
    if (cached && Date.parse(candidate.capturedAt) < Date.parse(cached.snapshot.capturedAt))
      return this.result(cached, true, '来源返回了更早的榜单，已保留本地较新的版本。', true)
    const entry = { snapshot: candidate, checkedAt: new Date(this.now()).toISOString() }
    this.cache[period] = entry
    try {
      await this.persist()
    } catch {
      warning += ' 本地缓存未能写入，重启后可能需要重新加载。'
    }
    return this.result(entry, false, warning.trim())
  }

  findRepo(fullName) {
    return Object.values(this.loadCache())
      .flatMap((entry) => entry.snapshot.items)
      .find((item) => item.fullName.toLowerCase() === fullName.toLowerCase())
  }
}

module.exports = { GitHubDiscoveryClient, parseGitStock, parseArchive, readLimited }

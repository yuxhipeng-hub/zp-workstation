const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { EventEmitter } = require('node:events')
const { pipeline } = require('node:stream/promises')
const { Readable, Transform } = require('node:stream')
const semver = require('semver')

const DEFAULT_CHECK_TIMEOUT = 7000
const DEFAULT_DOWNLOAD_TIMEOUT = 180000
const CHECKSUM_TIMEOUT = 5000

function normalizeVersion(value) {
  const clean = String(value || '').trim().replace(/^v/, '')
  return semver.valid(clean) ? clean : null
}

function cloneState(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value
}

function parseSha256(value) {
  const match = String(value || '').match(/(?:sha256:)?([a-f0-9]{64})/i)
  return match ? match[1].toLowerCase() : null
}

function resolveUrl(value, baseUrl = '') {
  try {
    return new URL(String(value), baseUrl || undefined).toString()
  } catch {
    return String(value || '')
  }
}

function joinSourceUrl(prefix, targetUrl) {
  const target = String(targetUrl || '')
  const template = String(prefix || '')
  if (!template) return target
  if (template.includes('{url}')) {
    return template.replaceAll('{url}', encodeURIComponent(target))
  }
  return `${template.replace(/\/+$/, '')}/${target.replace(/^\/+/, '')}`
}

function normalizeDownloadUrl(item, index = 0, fallbackLabel = '下载线路') {
  if (typeof item === 'string') {
    return {
      id: `download-${index + 1}`,
      label: fallbackLabel,
      url: item,
    }
  }
  return {
    id: String(item?.id || `download-${index + 1}`),
    label: String(item?.label || fallbackLabel),
    url: String(item?.url || item?.downloadUrl || ''),
  }
}

class NoReleaseError extends Error {
  constructor(message) {
    super(message)
    this.code = 'NO_RELEASE'
  }
}

class LauncherUpdater extends EventEmitter {
  constructor({ app, logger, releaseConfig, currentVersion, fetchImpl = globalThis.fetch }) {
    super()
    this.app = app
    this.logger = logger
    this.config = releaseConfig || {}
    this.currentVersion = currentVersion
    this.fetchImpl = fetchImpl
    this.inFlightCheck = null
    this.inFlightDownload = null
    this.state = this.createBaseState()
  }

  isConfigured() {
    return this.config.provider === 'github' && this.config.owner && this.config.repo
  }

  createBaseState(patch = {}) {
    return {
      supported: Boolean(this.isConfigured()),
      currentVersion: this.currentVersion,
      latestVersion: null,
      updateAvailable: false,
      checking: false,
      downloading: false,
      downloaded: false,
      message: this.isConfigured()
        ? '尚未检查启动器更新。'
        : '尚未配置启动器发布仓库，当前只能通过安装包手动升级。',
      notes: '',
      publishedAt: null,
      htmlUrl: null,
      asset: null,
      sourceId: null,
      sourceLabel: null,
      sources: [],
      checkedAt: null,
      error: null,
      ...patch,
    }
  }

  getState() {
    return cloneState(this.state)
  }

  setState(patch) {
    this.state = { ...this.state, ...patch }
    const next = this.getState()
    this.emit('state', next)
    return next
  }

  getCheckSources() {
    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}/releases/latest`
    const githubSources = [
      {
        id: 'github-direct',
        label: 'GitHub 直连',
        kind: 'github',
        url: apiUrl,
        prefix: '',
      },
    ]
    for (const [index, mirror] of (this.config.apiMirrors || []).entries()) {
      const item = typeof mirror === 'string' ? { prefix: mirror } : mirror || {}
      if (!item.prefix && !item.url) continue
      githubSources.push({
        id: String(item.id || `github-mirror-${index + 1}`),
        label: String(item.label || '国内 GitHub 加速'),
        kind: 'github',
        url: joinSourceUrl(item.prefix || item.url, apiUrl),
        prefix: String(item.prefix || ''),
      })
    }

    const manifestSources = (this.config.manifestUrls || []).flatMap((manifest, index) => {
      const item = typeof manifest === 'string' ? { url: manifest } : manifest || {}
      if (!item.url) return []
      return [
        {
          id: String(item.id || `manifest-${index + 1}`),
          label: String(item.label || '自有更新 CDN'),
          kind: 'manifest',
          url: String(item.url),
          prefix: '',
        },
      ]
    })

    return { manifestSources, githubSources }
  }

  async fetchWithTimeout(url, options = {}, timeout = DEFAULT_CHECK_TIMEOUT) {
    return this.fetchImpl(url, {
      ...options,
      signal: AbortSignal.timeout(timeout),
    })
  }

  async readChecksum(source, checksumUrl) {
    const urls = [
      source.prefix ? joinSourceUrl(source.prefix, checksumUrl) : checksumUrl,
      checksumUrl,
    ].filter((url, index, all) => url && all.indexOf(url) === index)
    for (const url of urls) {
      try {
        const response = await this.fetchWithTimeout(
          url,
          { headers: { 'User-Agent': 'ZP-Workbench-Launcher' } },
          CHECKSUM_TIMEOUT,
        )
        if (!response.ok) continue
        const digest = parseSha256(await response.text())
        if (digest) return digest
      } catch {
        // Try the next checksum URL.
      }
    }
    return null
  }

  async parseGithubRelease(payload, source) {
    const latestVersion = normalizeVersion(payload.tag_name)
    if (!latestVersion) throw new Error('GitHub Release 的版本号格式无法识别。')
    const expectedName = String(this.config.assetPattern || '').replace(
      '${version}',
      latestVersion,
    )
    const rawAsset = (payload.assets || []).find((candidate) => candidate.name === expectedName)
    if (!rawAsset) {
      return {
        version: latestVersion,
        tag: payload.tag_name || `v${latestVersion}`,
        name: payload.name || payload.tag_name || latestVersion,
        notes: payload.body || '',
        publishedAt: payload.published_at || null,
        htmlUrl: payload.html_url || null,
        asset: null,
      }
    }

    let sha256 = parseSha256(rawAsset.digest)
    if (!sha256) {
      const checksumAsset = (payload.assets || []).find((candidate) =>
        [`${expectedName}.sha256`, `${expectedName}.sha256.txt`].includes(candidate.name),
      )
      if (checksumAsset?.browser_download_url) {
        sha256 = await this.readChecksum(source, checksumAsset.browser_download_url)
      }
    }

    return {
      version: latestVersion,
      tag: payload.tag_name || `v${latestVersion}`,
      name: payload.name || payload.tag_name || latestVersion,
      notes: payload.body || '',
      publishedAt: payload.published_at || null,
      htmlUrl: payload.html_url || null,
      asset: {
        name: rawAsset.name,
        size: Number(rawAsset.size) || 0,
        sha256,
        urls: [
          {
            id: 'github-direct',
            label: 'GitHub 直连',
            url: rawAsset.browser_download_url,
          },
        ],
      },
    }
  }

  parseManifest(payload, source) {
    const latestVersion = normalizeVersion(
      payload.version || payload.tag_name || payload.tag || payload.name,
    )
    if (!latestVersion) throw new Error('更新清单中的版本号格式无法识别。')
    const expectedName = String(this.config.assetPattern || '').replace(
      '${version}',
      latestVersion,
    )
    const rawAsset = (payload.assets || []).find((candidate) => candidate.name === expectedName)
    if (!rawAsset) {
      return {
        version: latestVersion,
        tag: payload.tag || payload.tag_name || `v${latestVersion}`,
        name: payload.name || `ZP Workbench ${latestVersion}`,
        notes: payload.notes || payload.body || '',
        publishedAt: payload.publishedAt || payload.published_at || null,
        htmlUrl: payload.htmlUrl || payload.html_url || null,
        asset: null,
      }
    }

    const urlItems = Array.isArray(rawAsset.urls)
      ? rawAsset.urls
      : rawAsset.downloadUrl || rawAsset.browser_download_url
        ? [rawAsset.downloadUrl || rawAsset.browser_download_url]
        : []
    return {
      version: latestVersion,
      tag: payload.tag || payload.tag_name || `v${latestVersion}`,
      name: payload.name || `ZP Workbench ${latestVersion}`,
      notes: payload.notes || payload.body || '',
      publishedAt: payload.publishedAt || payload.published_at || null,
      htmlUrl: payload.htmlUrl || payload.html_url || null,
      asset: {
        name: rawAsset.name,
        size: Number(rawAsset.size) || 0,
        sha256: parseSha256(rawAsset.sha256 || rawAsset.digest),
        urls: urlItems
          .map((item, index) => {
            const normalized = normalizeDownloadUrl(item, index, source.label)
            return {
              ...normalized,
              url: resolveUrl(normalized.url, source.url),
            }
          })
          .filter((item) => item.url),
      },
    }
  }

  async checkSource(source) {
    const response = await this.fetchWithTimeout(source.url, {
      headers: {
        Accept: 'application/json, application/vnd.github+json',
        'User-Agent': 'ZP-Workbench-Launcher',
      },
    })
    if (response.status === 404) {
      throw new NoReleaseError(`${source.label} 暂无 Release`)
    }
    if (!response.ok) throw new Error(`${source.label} HTTP ${response.status}`)
    const payload = await response.json()
    const release =
      source.kind === 'manifest'
        ? this.parseManifest(payload, source)
        : await this.parseGithubRelease(payload, source)
    return { ...release, source }
  }

  async checkGroup(sources) {
    if (!sources.length) return { candidates: [], errors: [], noRelease: false }
    const settled = await Promise.allSettled(sources.map((source) => this.checkSource(source)))
    const candidates = []
    const errors = []
    let noRelease = false
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        candidates.push(result.value)
        return
      }
      if (result.reason?.code === 'NO_RELEASE') {
        noRelease = true
        return
      }
      errors.push(`${sources[index].label}：${result.reason?.message || '不可用'}`)
    })
    return { candidates, errors, noRelease }
  }

  buildDownloadUrls(asset) {
    const directUrls = (asset.urls || [])
      .map((item, index) => normalizeDownloadUrl(item, index, 'GitHub 直连'))
      .filter((item) => item.url)
    const direct = directUrls[0]?.url || asset.downloadUrl
    const mirrorUrls = []
    for (const [index, mirror] of (this.config.downloadMirrors || []).entries()) {
      if (!direct) break
      const item = typeof mirror === 'string' ? { prefix: mirror } : mirror || {}
      if (!item.prefix) continue
      mirrorUrls.push({
        id: String(item.id || `download-mirror-${index + 1}`),
        label: String(item.label || '国内 GitHub 加速'),
        url: joinSourceUrl(item.prefix, direct),
      })
    }
    const all = [...directUrls, ...mirrorUrls]
      .map((item, index) => normalizeDownloadUrl(item, index, '下载线路'))
      .filter((item) => item.url)
    return all.filter(
      (item, index) =>
        all.findIndex((candidate) => candidate.url === item.url) === index,
    )
  }

  formatCheckErrors(errors) {
    return errors.filter(Boolean).slice(0, 3).join('；')
  }

  async check() {
    if (!this.isConfigured()) return this.setState(this.createBaseState())
    if (this.inFlightCheck) return this.inFlightCheck
    this.inFlightCheck = this.performCheck()
    try {
      return await this.inFlightCheck
    } finally {
      this.inFlightCheck = null
    }
  }

  async performCheck() {
    this.setState({
      supported: true,
      checking: true,
      error: null,
      message: '正在通过 GitHub 与国内加速线路检查新版本。',
    })
    const { manifestSources, githubSources } = this.getCheckSources()
    const candidates = []
    const errors = []
    let noRelease = false

    const sourceGroups = [manifestSources, githubSources].filter((sources) => sources.length)
    const results = await Promise.all(sourceGroups.map((sources) => this.checkGroup(sources)))
    for (const result of results) {
      candidates.push(...result.candidates)
      errors.push(...result.errors)
      noRelease ||= result.noRelease
    }

    if (candidates.length) {
      candidates.sort((left, right) => {
        const versionOrder = semver.rcompare(left.version, right.version)
        if (versionOrder) return versionOrder
        return (left.source.priority || 0) - (right.source.priority || 0)
      })
      const best = candidates[0]
      const updateAvailable = semver.gt(best.version, this.currentVersion)
      const asset = best.asset
        ? {
            ...best.asset,
            downloadUrls: this.buildDownloadUrls(best.asset),
          }
        : null
      const sources = [
        ...manifestSources.map((source) => ({
          id: source.id,
          label: source.label,
          status: candidates.some((candidate) => candidate.source.id === source.id)
            ? 'selected'
            : errors.find((error) => error.startsWith(source.label))
              ? 'failed'
              : 'unavailable',
        })),
        ...githubSources.map((source) => ({
          id: source.id,
          label: source.label,
          status: candidates.some((candidate) => candidate.source.id === source.id)
            ? 'selected'
            : errors.find((error) => error.startsWith(source.label))
              ? 'failed'
              : 'unavailable',
        })),
      ]

      return this.setState({
        supported: true,
        latestVersion: best.version,
        updateAvailable,
        checking: false,
        downloaded: false,
        name: best.name,
        notes: best.notes,
        publishedAt: best.publishedAt,
        htmlUrl: best.htmlUrl,
        checkedAt: new Date().toISOString(),
        error: null,
        sourceId: best.source.id,
        sourceLabel: best.source.label,
        sources,
        asset,
        message: updateAvailable
          ? asset
            ? `发现新版本 ${best.version}，已通过${best.source.label}获取更新信息。`
            : `发现新版本 ${best.version}，但发布中没有找到匹配的安装包。`
          : `当前已是最新版本 ${this.currentVersion}，检测线路：${best.source.label}。`,
      })
    }

    if (noRelease) {
      return this.setState({
        supported: true,
        latestVersion: null,
        updateAvailable: false,
        checking: false,
        downloaded: false,
        asset: null,
        sourceId: null,
        sourceLabel: null,
        sources: [],
        error: null,
        checkedAt: new Date().toISOString(),
        message: '发布仓库还没有可用的 Release，暂时无需更新。',
      })
    }

    const message = `所有更新线路均不可用：${this.formatCheckErrors(errors)}`
    this.setState({
      supported: true,
      checking: false,
      error: message,
      message,
      sources: [],
    })
    throw new Error(message)
  }

  async download(asset) {
    if (this.inFlightDownload) return this.inFlightDownload
    const downloadUrls =
      asset?.downloadUrls?.length > 0
        ? asset.downloadUrls
        : asset?.downloadUrl
          ? [{ id: 'legacy', label: '下载线路', url: asset.downloadUrl }]
          : []
    if (!downloadUrls.length) throw new Error('发布包中没有找到匹配的安装程序。')

    this.inFlightDownload = this.performDownload({ ...asset, downloadUrls })
    try {
      return await this.inFlightDownload
    } finally {
      this.inFlightDownload = null
    }
  }

  async performDownload(asset) {
    const downloadDir = path.join(this.app.getPath('temp'), 'ZP-Workbench-Launcher-Updates')
    fs.mkdirSync(downloadDir, { recursive: true })
    const safeName = path.basename(asset.name)
    const target = path.join(downloadDir, safeName)
    const part = `${target}.part`
    const version = normalizeVersion(this.state.latestVersion) || this.currentVersion
    const attempts = asset.downloadUrls.length
    const expectedSha256 = parseSha256(asset.sha256)
    const downloadTimeout = Number(this.config.downloadTimeoutMs) || DEFAULT_DOWNLOAD_TIMEOUT
    const errors = []

    const reportProgress = (phase, source, attempt, extra = {}) => {
      const payload = {
        phase,
        version,
        fileName: safeName,
        sourceId: source?.id || null,
        sourceLabel: source?.label || null,
        attempt,
        attempts,
        at: new Date().toISOString(),
        ...extra,
      }
      this.emit('download-progress', payload)
      return payload
    }

    this.setState({
      downloading: true,
      downloaded: false,
      error: null,
      message: `正在下载 ZP Workbench ${version} 安装包。`,
    })

    for (const [index, source] of asset.downloadUrls.entries()) {
      const attempt = index + 1
      let received = 0
      let total = Number(asset.size) || 0
      let lastProgressAt = 0
      const hash = createHash('sha256')
      fs.rmSync(part, { force: true })

      const reportBytes = (phase, extra = {}) => {
        const percent = total
          ? Math.min(100, Math.max(0, Math.round((received / total) * 100)))
          : null
        return reportProgress(phase, source, attempt, {
          received,
          total,
          percent,
          ...extra,
        })
      }

      try {
        reportBytes('starting')
        this.logger.info(
          'launcher-update',
          `尝试通过 ${source.label} 下载启动器安装包 ${source.url}`,
        )
        const response = await this.fetchWithTimeout(
          source.url,
          {
            headers: {
              Accept: 'application/octet-stream',
              'User-Agent': 'ZP-Workbench-Launcher',
            },
          },
          downloadTimeout,
        )
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`)
        }
        total = Number(response.headers?.get?.('content-length')) || total

        const progressStream = new Transform({
          transform: (chunk, _encoding, callback) => {
            received += chunk.length
            hash.update(chunk)
            const now = Date.now()
            if (now - lastProgressAt >= 80 || (total && received >= total)) {
              reportBytes('downloading')
              lastProgressAt = now
            }
            callback(null, chunk)
          },
        })

        await pipeline(Readable.fromWeb(response.body), progressStream, fs.createWriteStream(part))
        const actualSha256 = hash.digest('hex')
        if (expectedSha256 && actualSha256 !== expectedSha256) {
          throw new Error(`SHA-256 校验失败，期望 ${expectedSha256}，实际 ${actualSha256}`)
        }
        if (!expectedSha256) {
          this.logger.warn('launcher-update', `本次更新包没有可用的 SHA-256：${safeName}`)
        }
        fs.renameSync(part, target)
        const completed = reportBytes('completed', {
          percent: 100,
          sha256: actualSha256,
          checksumVerified: Boolean(expectedSha256),
          filePath: target,
        })
        this.setState({
          downloading: false,
          downloaded: true,
          sourceId: source.id,
          sourceLabel: source.label,
          message: `ZP Workbench ${version} 安装包已通过${source.label}下载完成。`,
        })
        this.logger.info(
          'launcher-update',
          `安装包已保存到 ${target}，线路 ${source.label}，SHA-256 ${actualSha256}`,
        )
        return { filePath: target, ...completed }
      } catch (error) {
        fs.rmSync(part, { force: true })
        errors.push(`${source.label}：${error.message}`)
        this.logger.warn('launcher-update', `${source.label} 下载失败：${error.message}`)
        if (attempt < attempts) {
          reportBytes('retrying', {
            error: error.message,
            nextSourceLabel: asset.downloadUrls[index + 1]?.label || null,
          })
        }
      }
    }

    const message = `所有下载线路均失败：${this.formatCheckErrors(errors)}`
    reportProgress('error', asset.downloadUrls.at(-1), attempts, { error: message })
    this.setState({
      downloading: false,
      downloaded: false,
      error: message,
      message,
    })
    throw new Error(message)
  }

  markOpening(filePath = '') {
    const payload = {
      phase: 'opening',
      version: normalizeVersion(this.state.latestVersion) || this.currentVersion,
      fileName: path.basename(filePath || this.state.asset?.name || ''),
      filePath,
      received: Number(this.state.asset?.size) || 0,
      total: Number(this.state.asset?.size) || 0,
      percent: 100,
      sourceId: this.state.sourceId,
      sourceLabel: this.state.sourceLabel,
      at: new Date().toISOString(),
    }
    this.emit('download-progress', payload)
    this.setState({ message: '安装程序已启动，ZP Workbench 即将退出。' })
    return payload
  }
}

module.exports = { LauncherUpdater, normalizeVersion }

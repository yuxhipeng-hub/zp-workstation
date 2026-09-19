const fs = require('node:fs')
const path = require('node:path')
const { pipeline } = require('node:stream/promises')
const { Readable } = require('node:stream')
const semver = require('semver')

function normalizeVersion(value) {
  const clean = String(value || '').trim().replace(/^v/, '')
  return semver.valid(clean) ? clean : null
}

class LauncherUpdater {
  constructor({ app, logger, releaseConfig, currentVersion }) {
    this.app = app
    this.logger = logger
    this.config = releaseConfig || {}
    this.currentVersion = currentVersion
  }

  isConfigured() {
    return this.config.provider === 'github' && this.config.owner && this.config.repo
  }

  async check() {
    if (!this.isConfigured()) {
      return {
        supported: false,
        currentVersion: this.currentVersion,
        message: '尚未配置启动器发布仓库，当前只能通过安装包手动升级。',
      }
    }

    const url = `https://api.github.com/repos/${encodeURIComponent(this.config.owner)}/${encodeURIComponent(this.config.repo)}/releases/latest`
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'DeepSeek-Harness-Launcher',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`启动器更新检查失败：HTTP ${response.status}`)
    const release = await response.json()
    const latestVersion = normalizeVersion(release.tag_name)
    const updateAvailable = latestVersion ? semver.gt(latestVersion, this.currentVersion) : false
    const expectedName = String(this.config.assetPattern || '').replace('${version}', latestVersion || '')
    const asset = (release.assets || []).find((candidate) => candidate.name === expectedName)

    return {
      supported: true,
      currentVersion: this.currentVersion,
      latestVersion,
      updateAvailable,
      name: release.name || release.tag_name,
      notes: release.body || '',
      publishedAt: release.published_at,
      htmlUrl: release.html_url,
      asset: asset
        ? {
            name: asset.name,
            size: asset.size,
            downloadUrl: asset.browser_download_url,
          }
        : null,
    }
  }

  async download(asset) {
    if (!asset?.downloadUrl) throw new Error('发布包中没有找到匹配的安装程序。')
    const downloadDir = path.join(this.app.getPath('temp'), 'DeepSeek-Harness-Launcher-Updates')
    fs.mkdirSync(downloadDir, { recursive: true })
    const safeName = path.basename(asset.name)
    const target = path.join(downloadDir, safeName)

    this.logger.info('launcher-update', `下载启动器安装包 ${asset.downloadUrl}`)
    const response = await fetch(asset.downloadUrl, {
      headers: { 'User-Agent': 'DeepSeek-Harness-Launcher' },
      signal: AbortSignal.timeout(120000),
    })
    if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)

    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target))
    this.logger.info('launcher-update', `安装包已保存到 ${target}`)
    return target
  }
}

module.exports = { LauncherUpdater, normalizeVersion }

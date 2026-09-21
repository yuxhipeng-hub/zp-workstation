const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { LauncherUpdater } = require('../src/main/launcher-updater.cjs')

const ASSET_PATTERN = 'ZP-Workbench-Setup-${version}-x64.exe'

function createUpdater({ fetchImpl, version = '0.3.0', releaseConfig } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-launcher-updater-'))
  const updater = new LauncherUpdater({
    app: { getPath: () => tempDir },
    logger: { info() {}, warn() {}, error() {} },
    releaseConfig: releaseConfig || {
      provider: 'github',
      owner: 'yuxhipeng-hub',
      repo: 'zp-workstation',
      assetPattern: ASSET_PATTERN,
    },
    currentVersion: version,
    fetchImpl,
  })
  return { updater, tempDir }
}

function githubPayload(version, overrides = {}) {
  const assetName = ASSET_PATTERN.replace('${version}', version)
  return {
    tag_name: `v${version}`,
    name: `ZP Workbench ${version}`,
    body: `更新说明 ${version}`,
    html_url: `https://example.test/releases/v${version}`,
    published_at: '2026-09-21T00:00:00.000Z',
    assets: [
      {
        name: assetName,
        size: 123456,
        browser_download_url: `https://example.test/${assetName}`,
      },
    ],
    ...overrides,
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

test('launcher updater finds a matching GitHub release asset', async (t) => {
  const requests = []
  const { updater, tempDir } = createUpdater({
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        json: async () => githubPayload('0.3.1'),
      }
    },
  })
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const result = await updater.check()
  assert.equal(result.updateAvailable, true)
  assert.equal(result.latestVersion, '0.3.1')
  assert.equal(result.sourceId, 'github-direct')
  assert.equal(result.asset.name, 'ZP-Workbench-Setup-0.3.1-x64.exe')
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /yuxhipeng-hub\/zp-workstation\/releases\/latest$/)
})

test('launcher updater falls back to the GitHub API mirror', async (t) => {
  const requests = []
  const { updater, tempDir } = createUpdater({
    releaseConfig: {
      provider: 'github',
      owner: 'yuxhipeng-hub',
      repo: 'zp-workstation',
      assetPattern: ASSET_PATTERN,
      apiMirrors: [
        {
          id: 'github-api-gh-proxy',
          label: '国内 GitHub API 加速',
          prefix: 'https://gh-proxy.com/',
        },
      ],
    },
    fetchImpl: async (url) => {
      requests.push(url)
      if (url.startsWith('https://api.github.com')) throw new Error('direct unavailable')
      return {
        ok: true,
        status: 200,
        json: async () => githubPayload('0.3.1'),
      }
    },
  })
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const result = await updater.check()
  assert.equal(result.latestVersion, '0.3.1')
  assert.equal(result.sourceId, 'github-api-gh-proxy')
  assert.equal(requests.length, 2)
  assert.match(
    requests[1],
    /^https:\/\/gh-proxy\.com\/https:\/\/api\.github\.com\/repos\//,
  )
})

test('launcher updater compares all routes and selects the highest version', async (t) => {
  const { updater, tempDir } = createUpdater({
    releaseConfig: {
      provider: 'github',
      owner: 'yuxhipeng-hub',
      repo: 'zp-workstation',
      assetPattern: ASSET_PATTERN,
      manifestUrls: [
        {
          id: 'manifest-direct',
          label: 'GitHub 更新清单',
          url: 'https://example.test/latest.json',
        },
      ],
    },
    fetchImpl: async (url) => {
      if (url.includes('latest.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: '0.3.1',
            name: 'ZP Workbench 0.3.1',
            assets: [
              {
                name: 'ZP-Workbench-Setup-0.3.1-x64.exe',
                size: 1,
                urls: [{ id: 'direct', label: '清单直连', url: 'setup-0.3.1.exe' }],
              },
            ],
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => githubPayload('0.3.2'),
      }
    },
  })
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const result = await updater.check()
  assert.equal(result.latestVersion, '0.3.2')
  assert.equal(result.sourceId, 'github-direct')
  assert.equal(result.sources.length, 2)
})

test('launcher updater reports a missing release asset without crashing', async (t) => {
  const { updater, tempDir } = createUpdater({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => githubPayload('0.3.1', { assets: [] }),
    }),
  })
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const result = await updater.check()
  assert.equal(result.updateAvailable, true)
  assert.equal(result.asset, null)
  assert.match(result.message, /没有找到匹配的安装包/)
})

test('launcher updater treats a repository without releases as current', async (t) => {
  const { updater, tempDir } = createUpdater({
    fetchImpl: async () => ({ ok: false, status: 404 }),
  })
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))

  const result = await updater.check()
  assert.equal(result.updateAvailable, false)
  assert.equal(result.error, null)
  assert.match(result.message, /还没有可用的 Release/)
})

test('launcher updater switches download mirrors and verifies SHA-256', async (t) => {
  const payload = Buffer.from('zp-workbench-installer')
  const requests = []
  const { updater, tempDir } = createUpdater({
    fetchImpl: async (url) => {
      requests.push(url)
      if (url.includes('broken.example')) return { ok: false, status: 503 }
      return new Response(payload, {
        status: 200,
        headers: { 'content-length': String(payload.length) },
      })
    },
  })
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  updater.state = updater.createBaseState({
    supported: true,
    latestVersion: '0.3.1',
    updateAvailable: true,
  })
  const progress = []
  updater.on('download-progress', (event) => progress.push(event))

  const result = await updater.download({
    name: 'ZP-Workbench-Setup-0.3.1-x64.exe',
    size: payload.length,
    sha256: sha256(payload),
    downloadUrls: [
      {
        id: 'github-direct',
        label: 'GitHub 直连',
        url: 'https://broken.example/setup.exe',
      },
      {
        id: 'gh-proxy',
        label: '国内 GitHub 下载加速',
        url: 'https://mirror.example/setup.exe',
      },
    ],
  })

  assert.equal(fs.readFileSync(result.filePath, 'utf8'), payload.toString())
  assert.equal(updater.getState().downloaded, true)
  assert.equal(updater.getState().sourceId, 'gh-proxy')
  assert.equal(
    progress.find((event) => event.phase === 'retrying')?.nextSourceLabel,
    '国内 GitHub 下载加速',
  )
  assert.equal(progress.at(-1).phase, 'completed')
  assert.equal(progress.at(-1).checksumVerified, true)
  assert.equal(requests.length, 2)
})

test('launcher updater rejects a bad checksum and tries the next route', async (t) => {
  const expectedPayload = Buffer.from('correct-installer')
  const tamperedPayload = Buffer.from('tampered-installer')
  const { updater, tempDir } = createUpdater({
    fetchImpl: async (url) => {
      const payload = url.includes('direct.example') ? tamperedPayload : expectedPayload
      return new Response(payload, {
        status: 200,
        headers: { 'content-length': String(payload.length) },
      })
    },
  })
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  updater.state = updater.createBaseState({
    supported: true,
    latestVersion: '0.3.1',
    updateAvailable: true,
  })
  const progress = []
  updater.on('download-progress', (event) => progress.push(event))

  const result = await updater.download({
    name: 'ZP-Workbench-Setup-0.3.1-x64.exe',
    size: expectedPayload.length,
    sha256: sha256(expectedPayload),
    downloadUrls: [
      { id: 'direct', label: 'GitHub 直连', url: 'https://direct.example/setup.exe' },
      { id: 'mirror', label: '国内加速', url: 'https://mirror.example/setup.exe' },
    ],
  })

  assert.equal(fs.readFileSync(result.filePath, 'utf8'), expectedPayload.toString())
  const retry = progress.find((event) => event.phase === 'retrying')
  assert.match(retry.error, /SHA-256 校验失败/)
  assert.equal(progress.at(-1).phase, 'completed')
})

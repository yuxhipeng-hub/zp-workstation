import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
)

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) continue
    const next = argv[index + 1]
    values[key.slice(2)] = next && !next.startsWith('--') ? next : true
    if (values[key.slice(2)] !== true) index += 1
  }
  return values
}

function normalizeVersion(value) {
  const version = String(value || '').trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`版本号格式无效：${value}`)
  }
  return version
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

function readNotes(args) {
  if (args['notes-file']) {
    return fs.readFileSync(path.resolve(rootDir, String(args['notes-file'])), 'utf8').trim()
  }
  if (typeof args.notes === 'string') return args.notes.trim()
  return String(process.env.RELEASE_NOTES || '').trim()
}

const args = parseArgs(process.argv.slice(2))
const releaseConfig = packageJson.launcherRelease || {}
const { owner, repo, assetPattern } = releaseConfig
if (releaseConfig.provider !== 'github' || !owner || !repo) {
  throw new Error('package.json launcherRelease 必须配置 GitHub owner、repo 和 assetPattern。')
}

const version = normalizeVersion(args.version || packageJson.version)
const releaseDir = path.resolve(rootDir, String(args['release-dir'] || 'release'))
const assetName = String(assetPattern).replaceAll('${version}', version)
const installerPath = path.resolve(
  rootDir,
  String(args.installer || path.join(releaseDir, assetName)),
)
if (!fs.existsSync(installerPath)) {
  throw new Error(`找不到安装包：${installerPath}`)
}

const installer = fs.readFileSync(installerPath)
const sha256 = createHash('sha256').update(installer).digest('hex')
const tag = `v${version}`
const releaseUrl = `https://github.com/${owner}/${repo}/releases/download/${tag}/${encodeURIComponent(assetName)}`
const urls = []

for (const [index, mirrorValue] of (releaseConfig.downloadMirrors || []).entries()) {
  const mirror =
    typeof mirrorValue === 'string' ? { prefix: mirrorValue } : mirrorValue || {}
  if (!mirror.prefix) continue
  urls.push({
    id: String(mirror.id || `download-mirror-${index + 1}`),
    label: String(mirror.label || '下载加速'),
    url: joinSourceUrl(mirror.prefix, releaseUrl),
  })
}

urls.push({
  id: 'github-direct',
  label: 'GitHub 直连',
  url: releaseUrl,
})

const outputPath = path.resolve(
  rootDir,
  String(args.output || path.join(releaseDir, 'latest.json')),
)
const publishedAt = new Date().toISOString()
const notes = readNotes(args) || `ZP Workbench ${version}`
const manifest = {
  version,
  tag,
  name: `ZP Workbench ${version}`,
  notes,
  publishedAt,
  htmlUrl: `https://github.com/${owner}/${repo}/releases/tag/${tag}`,
  assets: [
    {
      name: assetName,
      size: installer.length,
      sha256,
      urls,
    },
  ],
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
fs.writeFileSync(`${installerPath}.sha256`, `${sha256}  ${assetName}\n`, 'utf8')

console.log(`更新清单：${outputPath}`)
console.log(`安装包：${assetName}`)
console.log(`SHA-256：${sha256}`)
console.log(`下载线路：${urls.length}`)

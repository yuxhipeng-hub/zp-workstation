const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const JSZip = require('jszip')

const GITHUB_API = 'https://api.github.com'
const GITHUB_ARCHIVE = 'https://codeload.github.com'
const GITHUB_WEB = 'https://github.com'
const GITHUB_ROUTES = [
  { id: 'github-direct', label: 'GitHub 直连', prefix: '' },
  { id: 'github-gh-proxy', label: '国内 GitHub 加速', prefix: 'https://gh-proxy.com/' },
  { id: 'github-ghfast', label: '国内 GitHub 备用加速', prefix: 'https://ghfast.top/' },
]
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
const MAX_SKILL_FILES = 4000
const MAX_SKILL_BYTES = 150 * 1024 * 1024
const SKIPPED_INSTALL_DIRECTORIES = new Set(['.git', 'node_modules'])

function expandHomePath(value, homeDir) {
  const input = String(value || '').trim()
  if (!input) return ''
  if (input === '~') return homeDir
  if (input.startsWith(`~${path.sep}`) || input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(homeDir, input.slice(2))
  }
  return path.resolve(input)
}

function stripInlineComment(value) {
  let quote = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if ((character === '"' || character === "'") && value[index - 1] !== '\\') {
      quote = quote === character ? '' : quote || character
      continue
    }
    if (character === '#' && !quote && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trim()
    }
  }
  return value.trim()
}

function parseScalar(value) {
  const trimmed = stripInlineComment(String(value ?? '').trim())
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\(["'\\])/g, '$1')
  }
  return trimmed
}

function parseList(value) {
  if (value === undefined || value === null) return []
  const source = Array.isArray(value) ? value : [value]
  return [
    ...new Set(
      source
        .flatMap((item) => String(item).split(/[,;\n]/))
        .map((item) =>
          item
            .trim()
            .replace(/^\[|\]$/g, '')
            .replace(/^['"]|['"]$/g, ''),
        )
        .filter(Boolean),
    ),
  ].slice(0, 50)
}

function parseStrictBoolean(value) {
  if (value === undefined) return { provided: false, value: undefined, valid: true }
  const normalized = String(value).trim().toLocaleLowerCase('en-US')
  if (['true', 'yes', 'on', '1'].includes(normalized)) {
    return { provided: true, value: true, valid: true }
  }
  if (['false', 'no', 'off', '0'].includes(normalized)) {
    return { provided: true, value: false, valid: true }
  }
  return { provided: true, value: undefined, valid: false }
}

function parseFrontmatter(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '')
  const match = normalized.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match) return null

  const fields = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s/.test(line)) continue
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key)) continue
    fields[key] = parseScalar(line.slice(separator + 1))
  }
  return fields
}

function parseSkillDocument(text) {
  const metadata = parseFrontmatter(text)
  if (!metadata) return null

  const name = String(metadata.name || '').trim()
  const description = String(metadata.description || '').trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || !description) return null
  if (
    Object.hasOwn(metadata, 'disableModelInvocation') ||
    Object.hasOwn(metadata, 'userInvocable')
  ) {
    return null
  }

  const disableModelInvocation = parseStrictBoolean(metadata['disable-model-invocation'])
  const userInvocable = parseStrictBoolean(metadata['user-invocable'])
  if (!disableModelInvocation.valid || !userInvocable.valid) return null

  const whenToUse = metadata.whenToUse ? String(metadata.whenToUse).trim() : ''
  return {
    name,
    description,
    whenToUse,
    author: String(metadata.author || metadata.owner || metadata.maintainer || '').trim(),
    version: String(metadata.version || '').trim(),
    repository: String(metadata.repository || metadata.source || metadata.homepage || '').trim(),
    permissions: parseList(metadata.permissions || metadata.permission),
    dependencies: parseList(metadata.dependencies || metadata.requires),
    disableModelInvocation: disableModelInvocation.value === true,
    userInvocable: userInvocable.provided ? userInvocable.value : true,
    metadata,
  }
}

function rootDefinition(kind, label, rootPath, rank, { skipSystem = false } = {}) {
  if (!rootPath) return null
  return {
    kind,
    label,
    path: rootPath,
    rank,
    skipSystem,
  }
}

async function readSkillEntry(root, entry) {
  if ((!entry.isDirectory() && !entry.isFile()) || (root.skipSystem && entry.name === '.system')) {
    return null
  }

  const entryPath = path.join(root.path, entry.name)
  const isDirectory = entry.isDirectory()
  const isFlatFile = entry.isFile() && entry.name.toLocaleLowerCase('en-US').endsWith('.md')
  if (!isDirectory && !isFlatFile) return null

  const skillFile = isDirectory ? path.join(entryPath, 'SKILL.md') : entryPath
  let text
  try {
    text = await fsp.readFile(skillFile, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
    throw error
  }

  const parsed = parseSkillDocument(text)
  if (!parsed) return null

  let stats
  try {
    stats = await fsp.stat(skillFile)
  } catch {
    stats = null
  }

  const folder = isDirectory ? entry.name : entry.name.replace(/\.md$/i, '')
  return {
    id: `${root.kind}:${parsed.name}`,
    name: parsed.name,
    folder,
    description: parsed.description,
    whenToUse: parsed.whenToUse,
    author: parsed.author,
    version: parsed.version,
    repository: parsed.repository,
    permissions: parsed.permissions,
    dependencies: parsed.dependencies,
    active: !parsed.disableModelInvocation,
    disableModelInvocation: parsed.disableModelInvocation,
    userInvocable: parsed.userInvocable,
    kind: root.kind,
    sourceLabel: root.label,
    sourcePath: root.path,
    rank: root.rank,
    invocation: `$${parsed.name}`,
    directory: isDirectory ? entryPath : root.path,
    skillFile,
    canManage: root.kind === 'dsh' && !entry.name.startsWith('.'),
    updatedAt: stats?.mtime?.toISOString() || '',
  }
}

async function listRootSkills(root) {
  let entries = []
  try {
    entries = await fsp.readdir(root.path, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []
    throw error
  }

  const skills = []
  for (const entry of entries) {
    const skill = await readSkillEntry(root, entry)
    if (skill) skills.push(skill)
  }
  return skills
}

function parseGithubSpec(value) {
  const input = String(value || '').trim()
  if (!input) throw new Error('请输入 GitHub 仓库地址。')

  const normalized = input
    .replace(/^github:/i, '')
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '')

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new Error('仓库格式应为 owner/repo，也可以附带 Skill 子目录。')
  }

  const owner = segments[0]
  const repo = segments[1]
  if (
    !/^[A-Za-z0-9_.-]+$/.test(owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(repo) ||
    owner.startsWith('.') ||
    repo.startsWith('.')
  ) {
    throw new Error('GitHub 仓库名称无效。')
  }

  let rest = segments.slice(2)
  let ref = ''
  if (rest[0] === 'tree' || rest[0] === 'blob') {
    ref = rest[1] || ''
    rest = rest.slice(2)
  }
  const subpath = rest
    .join('/')
    .replace(/\/SKILL\.md$/i, '')
    .replace(/^\/+|\/+$/g, '')
  if (subpath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Skill 子目录无效。')
  }

  return {
    owner,
    repo,
    ref,
    subpath,
    repository: `${owner}/${repo}`,
    repositoryUrl: `${GITHUB_WEB}/${owner}/${repo}`,
  }
}

function formatGithubSpec(entry) {
  return [entry.owner, entry.repo, entry.ref ? `tree/${entry.ref}` : '', entry.subpath]
    .filter(Boolean)
    .join('/')
}

function validateRelativePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Skill 压缩包包含不安全路径。')
  }
  return normalized
}

function updateSkillAvailability(text, enabled) {
  const eol = String(text).includes('\r\n') ? '\r\n' : '\n'
  const match = String(text).match(/^(\uFEFF?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/)
  if (!match) throw new Error('SKILL.md 缺少有效的 frontmatter。')

  const lines = match[2].split(/\r?\n/)
  const removeKey = (key) => {
    const index = lines.findIndex((line) => new RegExp(`^${key}\\s*:`, 'i').test(line))
    if (index >= 0) lines.splice(index, 1)
  }
  const setKey = (key, value) => {
    const index = lines.findIndex((line) => new RegExp(`^${key}\\s*:`, 'i').test(line))
    if (index >= 0) lines[index] = `${key}: ${value}`
    else lines.push(`${key}: ${value}`)
  }

  if (enabled) {
    removeKey('disable-model-invocation')
    removeKey('user-invocable')
  } else {
    setKey('disable-model-invocation', 'true')
    setKey('user-invocable', 'false')
  }

  return `${match[1]}${lines.join(eol)}${match[3]}`
}

function githubRouteUrl(prefix, targetUrl) {
  const target = String(targetUrl || '')
  if (!prefix) return target
  return `${String(prefix).replace(/\/+$/, '')}/${target.replace(/^\/+/, '')}`
}

/**
 * @param {string} targetUrl
 * @param {RequestInit & { fetchImpl?: typeof fetch, timeout?: number }} [options]
 */
async function fetchFromGithubRoutes(
  targetUrl,
  { fetchImpl = fetch, timeout = 20_000, ...options } = {},
) {
  const attempts = GITHUB_ROUTES.map(async (route) => {
    const response = await fetchImpl(githubRouteUrl(route.prefix, targetUrl), {
      ...options,
      signal: AbortSignal.timeout(timeout),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `${route.label}（${response.status}）${detail ? `：${detail.slice(0, 120)}` : ''}`,
      )
    }
    return { response, route }
  })
  try {
    return await Promise.any(attempts)
  } catch (error) {
    const messages = (error?.errors || [])
      .map((item) => item?.message)
      .filter(Boolean)
      .slice(0, 3)
    throw new Error(`GitHub 线路均不可用：${messages.join('；') || '未知错误'}`)
  }
}

/**
 * @param {string} url
 * @param {RequestInit & { fetchImpl?: typeof fetch, timeout?: number }} [options]
 */
async function fetchJson(url, { fetchImpl = fetch, timeout = 20_000, ...options } = {}) {
  const { response } = await fetchFromGithubRoutes(url, {
    ...options,
    fetchImpl,
    timeout,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ZP-Workbench',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  })
  return /** @type {any} */ (await response.json())
}

async function downloadArchive({ owner, repo, ref }, fetchImpl = fetch) {
  const candidates = ref ? [ref] : ['main', 'master']
  let lastError = null
  for (const candidate of candidates) {
    for (const kind of ['heads', 'tags']) {
      const url = `${GITHUB_ARCHIVE}/${owner}/${repo}/zip/refs/${kind}/${encodeURIComponent(candidate)}`
      try {
        const { response } = await fetchFromGithubRoutes(url, {
          fetchImpl,
          timeout: 45_000,
          headers: { 'User-Agent': 'ZP-Workbench' },
        })
        const contentLength = Number(response.headers.get('content-length')) || 0
        if (contentLength > MAX_ARCHIVE_BYTES) {
          throw new Error('仓库压缩包超过 50 MB，已拒绝安装。')
        }
        const buffer = Buffer.from(await response.arrayBuffer())
        if (buffer.length > MAX_ARCHIVE_BYTES) {
          throw new Error('仓库压缩包超过 50 MB，已拒绝安装。')
        }
        return { buffer, ref: candidate }
      } catch (error) {
        lastError = error
      }
    }
  }
  throw new Error(
    `无法下载 GitHub 仓库。${lastError?.message ? ` ${lastError.message}` : ''}`.trim(),
  )
}

async function moveDirectory(source, destination) {
  try {
    await fsp.rename(source, destination)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    await fsp.cp(source, destination, { recursive: true, force: true })
    await fsp.rm(source, { recursive: true, force: true })
  }
}

class SkillsManager {
  constructor({
    dshHome = '',
    homeDir = os.homedir(),
    agentsHome = process.env.DSH_AGENTS_HOME || '',
    bundledSkillDir = process.env.DSH_BUNDLED_SKILL_DIR || '',
    registryFile = '',
    backupRoot = '',
    fetchImpl = fetch,
  } = {}) {
    this.homeDir = homeDir
    this.dshHome = expandHomePath(dshHome || path.join(homeDir, '.dsh'), homeDir)
    this.agentsHome = expandHomePath(agentsHome || path.join(homeDir, '.agents'), homeDir)
    this.bundledSkillDir = expandHomePath(bundledSkillDir, homeDir)
    this.registryFile = registryFile
      ? path.resolve(registryFile)
      : path.join(this.dshHome, '.zp-workbench-skill-registry.json')
    this.backupRoot = backupRoot
      ? path.resolve(backupRoot)
      : path.join(path.dirname(this.registryFile), 'skill-backups')
    this.fetchImpl = fetchImpl
    this.cache = null
  }

  setDshHome(dshHome) {
    const next = expandHomePath(dshHome || path.join(this.homeDir, '.dsh'), this.homeDir)
    if (next === this.dshHome) return
    this.dshHome = next
    this.cache = null
  }

  roots() {
    return [
      rootDefinition('dsh', 'DSH 用户', path.join(this.dshHome, 'skills'), 400, {
        skipSystem: true,
      }),
      rootDefinition('agents', 'Agent 共享', path.join(this.agentsHome, 'skills'), 500),
      rootDefinition('bundled', 'DSH 内置', this.bundledSkillDir, 600),
    ].filter(Boolean)
  }

  registry() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.registryFile, 'utf8'))
      return {
        version: 1,
        skills: parsed?.skills && typeof parsed.skills === 'object' ? parsed.skills : {},
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to read skill registry:', error.message)
      }
      return { version: 1, skills: {} }
    }
  }

  saveRegistry(registry) {
    fs.mkdirSync(path.dirname(this.registryFile), { recursive: true })
    const temporary = `${this.registryFile}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
    fs.renameSync(temporary, this.registryFile)
  }

  async list({ refresh = false } = {}) {
    if (this.cache && !refresh) return this.cache

    const roots = this.roots()
    const registry = this.registry()
    const discovered = []
    for (const root of roots) {
      const skills = await listRootSkills(root)
      discovered.push(...skills)
    }

    const merged = []
    const byName = new Map()
    for (const skill of discovered.sort((left, right) => left.rank - right.rank)) {
      if (byName.has(skill.name)) continue
      const managed = registry.skills[skill.name] || null
      skill.managed = Boolean(managed)
      skill.managedSource = managed
      skill.author = skill.author || managed?.author || ''
      skill.version = skill.version || managed?.version || ''
      skill.repository = skill.repository || managed?.repositoryUrl || ''
      skill.installedAt = managed?.installedAt || ''
      byName.set(skill.name, skill)
      merged.push(skill)
    }
    merged.sort((left, right) => {
      if (left.kind !== right.kind) return left.rank - right.rank
      return left.name.localeCompare(right.name, 'zh-CN')
    })

    const countByKind = (kind) => merged.filter((skill) => skill.kind === kind).length
    const dshRoot = roots.find((root) => root.kind === 'dsh')
    const agentsRoot = roots.find((root) => root.kind === 'agents')
    const bundledRoot = roots.find((root) => root.kind === 'bundled')
    this.cache = {
      skillsRoot: dshRoot.path,
      agentsRoot: agentsRoot.path,
      bundledRoot: bundledRoot?.path || '',
      roots: roots.map((root) => ({
        kind: root.kind,
        label: root.label,
        path: root.path,
        exists: fs.existsSync(root.path),
      })),
      skills: merged,
      counts: {
        total: merged.length,
        dsh: countByKind('dsh'),
        agents: countByKind('agents'),
        bundled: countByKind('bundled'),
        active: merged.filter((skill) => skill.active).length,
        userInvocable: merged.filter((skill) => skill.userInvocable).length,
        shadowed: discovered.length - merged.length,
        managed: merged.filter((skill) => skill.managed).length,
        disabled: merged.filter((skill) => !skill.active && !skill.userInvocable).length,
      },
    }
    return this.cache
  }

  async getDirectory(id) {
    const data = await this.list()
    const skill = data.skills.find((item) => item.id === id)
    if (!skill) throw new Error('没有找到这个 Skill。')
    if (!fs.existsSync(skill.directory)) throw new Error('这个 Skill 目录已不存在。')
    return skill.directory
  }

  async searchGithub(query, { limit = 12 } = {}) {
    const cleanQuery = String(query || '').trim()
    const searchText = cleanQuery
      ? `${cleanQuery} skill in:name,description,readme`
      : 'topic:agent-skills'
    const payload = await fetchJson(
      `${GITHUB_API}/search/repositories?q=${encodeURIComponent(searchText)}&sort=stars&order=desc&per_page=${Math.min(Math.max(Number(limit) || 12, 1), 30)}`,
      { fetchImpl: this.fetchImpl },
    )
    return {
      query: cleanQuery,
      total: Number(payload.total_count) || 0,
      items: (payload.items || []).map((item) => ({
        id: String(item.id || ''),
        name: String(item.name || ''),
        owner: String(item.owner?.login || ''),
        fullName: String(item.full_name || ''),
        description: String(item.description || ''),
        url: String(item.html_url || ''),
        stars: Number(item.stargazers_count) || 0,
        updatedAt: String(item.updated_at || ''),
        defaultBranch: String(item.default_branch || ''),
        topics: Array.isArray(item.topics) ? item.topics.slice(0, 8) : [],
      })),
    }
  }

  async installFromGithub(spec, { fetchImpl = this.fetchImpl } = {}) {
    const parsed = parseGithubSpec(spec)
    const archive = await downloadArchive(parsed, fetchImpl)
    const zip = await JSZip.loadAsync(archive.buffer)
    const rootPrefix = `${Object.keys(zip.files)[0]?.split('/')[0] || ''}/`
    const skillFiles = Object.keys(zip.files).filter(
      (name) =>
        !zip.files[name].dir && path.posix.basename(name).toLocaleLowerCase('en-US') === 'skill.md',
    )
    const expected = parsed.subpath
      ? `${rootPrefix}${parsed.subpath.replaceAll('\\', '/')}/SKILL.md`.toLocaleLowerCase('en-US')
      : ''
    const candidates = expected
      ? skillFiles.filter((name) => name.toLocaleLowerCase('en-US') === expected)
      : skillFiles
    if (!candidates.length) {
      throw new Error(
        parsed.subpath
          ? `仓库中没有找到 ${parsed.subpath}/SKILL.md。`
          : '仓库中没有找到 SKILL.md。',
      )
    }
    if (candidates.length > 1) {
      throw new Error(
        `仓库包含多个 Skill，请在地址后补充子目录：${candidates
          .slice(0, 5)
          .map((name) => name.slice(rootPrefix.length, -'/SKILL.md'.length))
          .join('、')}`,
      )
    }

    const skillFile = candidates[0]
    const parsedSkill = parseSkillDocument(await zip.file(skillFile).async('string'))
    if (!parsedSkill) throw new Error('SKILL.md 的 frontmatter 无效。')

    const prefix = skillFile.slice(0, -'SKILL.md'.length)
    const entries = Object.values(zip.files).filter(
      (entry) =>
        !entry.dir &&
        entry.name.startsWith(prefix) &&
        !entry.name
          .slice(prefix.length)
          .split('/')
          .some((segment) => SKIPPED_INSTALL_DIRECTORIES.has(segment)),
    )
    if (entries.length > MAX_SKILL_FILES) {
      throw new Error(`Skill 包含超过 ${MAX_SKILL_FILES} 个文件，已拒绝安装。`)
    }

    const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'zp-skill-install-'))
    const temporarySkill = path.join(temporaryRoot, parsedSkill.name)
    let extractedBytes = 0
    try {
      for (const entry of entries) {
        const relative = validateRelativePath(entry.name.slice(prefix.length))
        const content = await entry.async('nodebuffer')
        extractedBytes += content.length
        if (extractedBytes > MAX_SKILL_BYTES) {
          throw new Error('Skill 解压后超过 150 MB，已拒绝安装。')
        }
        const target = path.join(temporarySkill, ...relative.split('/'))
        if (
          target !== temporarySkill &&
          !target.startsWith(`${path.resolve(temporarySkill)}${path.sep}`)
        ) {
          throw new Error('Skill 压缩包包含不安全路径。')
        }
        await fsp.mkdir(path.dirname(target), { recursive: true })
        await fsp.writeFile(target, content)
      }

      const skillsRoot = path.join(this.dshHome, 'skills')
      await fsp.mkdir(skillsRoot, { recursive: true })
      const destination = path.join(skillsRoot, parsedSkill.name)
      if (!destination.startsWith(`${path.resolve(skillsRoot)}${path.sep}`)) {
        throw new Error('Skill 安装目录无效。')
      }

      const registry = this.registry()
      const existing = registry.skills[parsedSkill.name]
      let wasDisabled = false
      if (fs.existsSync(destination)) {
        const sameSource =
          existing &&
          existing.owner === parsed.owner &&
          existing.repo === parsed.repo &&
          existing.subpath === parsed.subpath
        if (!sameSource) {
          throw new Error(`已存在同名 Skill：${parsedSkill.name}`)
        }
        try {
          const currentDocument = await fsp.readFile(path.join(destination, 'SKILL.md'), 'utf8')
          wasDisabled = parseSkillDocument(currentDocument)?.disableModelInvocation === true
        } catch {
          wasDisabled = false
        }
        await fsp.mkdir(this.backupRoot, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        await moveDirectory(destination, path.join(this.backupRoot, `${parsedSkill.name}-${stamp}`))
      }
      await moveDirectory(temporarySkill, destination)
      if (wasDisabled) {
        const installedDocument = await fsp.readFile(path.join(destination, 'SKILL.md'), 'utf8')
        await fsp.writeFile(
          path.join(destination, 'SKILL.md'),
          updateSkillAvailability(installedDocument, false),
          'utf8',
        )
      }

      const commitPayload = await fetchJson(
        `${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}/commits?sha=${encodeURIComponent(archive.ref)}&per_page=1`,
        { fetchImpl, headers: { 'User-Agent': 'ZP-Workbench' } },
      ).catch(() => [])
      const commit = Array.isArray(commitPayload) ? String(commitPayload[0]?.sha || '') : ''
      const now = new Date().toISOString()
      registry.skills[parsedSkill.name] = {
        name: parsedSkill.name,
        owner: parsed.owner,
        repo: parsed.repo,
        ref: archive.ref,
        subpath: parsed.subpath,
        repositoryUrl: parsed.repositoryUrl,
        version: parsedSkill.version,
        author: parsedSkill.author,
        commit,
        installedAt: existing?.installedAt || now,
        updatedAt: now,
      }
      this.saveRegistry(registry)
      this.cache = null
      const data = await this.list({ refresh: true })
      const skill = data.skills.find((item) => item.name === parsedSkill.name)
      return { skill, data, managed: registry.skills[parsedSkill.name] }
    } finally {
      await fsp.rm(temporaryRoot, { recursive: true, force: true }).catch(() => {})
    }
  }

  async setEnabled(id, enabled) {
    const data = await this.list()
    const skill = data.skills.find((item) => item.id === id)
    if (!skill) throw new Error('没有找到这个 Skill。')
    if (!skill.canManage) throw new Error('只有 DSH 用户目录中的 Skill 可以启停。')
    const text = await fsp.readFile(skill.skillFile, 'utf8')
    const next = updateSkillAvailability(text, Boolean(enabled))
    const temporary = `${skill.skillFile}.tmp`
    await fsp.writeFile(temporary, next, 'utf8')
    await fsp.rename(temporary, skill.skillFile)
    this.cache = null
    const refreshed = await this.list({ refresh: true })
    return {
      skill: refreshed.skills.find((item) => item.name === skill.name),
      data: refreshed,
    }
  }

  async checkUpdates() {
    const registry = this.registry()
    const entries = Object.values(registry.skills)
    const updates = []
    for (const entry of entries) {
      try {
        const payload = await fetchJson(
          `${GITHUB_API}/repos/${entry.owner}/${entry.repo}/commits?sha=${encodeURIComponent(entry.ref || 'HEAD')}&per_page=1`,
          { fetchImpl: this.fetchImpl, headers: { 'User-Agent': 'ZP-Workbench' } },
        )
        const commit = Array.isArray(payload) ? String(payload[0]?.sha || '') : ''
        updates.push({
          name: entry.name,
          updateAvailable: Boolean(commit && entry.commit && commit !== entry.commit),
          currentCommit: entry.commit || '',
          latestCommit: commit,
          error: '',
        })
      } catch (error) {
        updates.push({
          name: entry.name,
          updateAvailable: false,
          currentCommit: entry.commit || '',
          latestCommit: '',
          error: error.message,
        })
      }
    }
    return updates
  }

  async updateFromGithub(id) {
    const data = await this.list()
    const skill = data.skills.find((item) => item.id === id)
    if (!skill?.managedSource) throw new Error('这个 Skill 不是由工作站从 GitHub 安装的。')
    const entry = skill.managedSource
    return this.installFromGithub(formatGithubSpec(entry), {
      fetchImpl: this.fetchImpl,
    })
  }

  async uninstall(id) {
    const data = await this.list()
    const skill = data.skills.find((item) => item.id === id)
    if (!skill?.managedSource) throw new Error('这个 Skill 不是由工作站从 GitHub 安装的。')
    const registry = this.registry()
    const directory = skill.directory
    if (fs.existsSync(directory)) {
      await fsp.mkdir(this.backupRoot, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      await moveDirectory(directory, path.join(this.backupRoot, `${skill.name}-${stamp}`))
    }
    delete registry.skills[skill.name]
    this.saveRegistry(registry)
    this.cache = null
    return this.list({ refresh: true })
  }
}

module.exports = {
  SkillsManager,
  parseGithubSpec,
  parseSkillDocument,
  updateSkillAvailability,
}

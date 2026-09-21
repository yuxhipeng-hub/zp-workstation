const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

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
  if (Object.hasOwn(metadata, 'disableModelInvocation') || Object.hasOwn(metadata, 'userInvocable')) {
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

class SkillsManager {
  constructor({
    dshHome = '',
    homeDir = os.homedir(),
    agentsHome = process.env.DSH_AGENTS_HOME || '',
    bundledSkillDir = process.env.DSH_BUNDLED_SKILL_DIR || '',
  } = {}) {
    this.homeDir = homeDir
    this.dshHome = expandHomePath(dshHome || path.join(homeDir, '.dsh'), homeDir)
    this.agentsHome = expandHomePath(agentsHome || path.join(homeDir, '.agents'), homeDir)
    this.bundledSkillDir = expandHomePath(bundledSkillDir, homeDir)
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

  async list({ refresh = false } = {}) {
    if (this.cache && !refresh) return this.cache

    const roots = this.roots()
    const discovered = []
    for (const root of roots) {
      const skills = await listRootSkills(root)
      discovered.push(...skills)
    }

    const merged = []
    const byName = new Map()
    for (const skill of discovered.sort((left, right) => left.rank - right.rank)) {
      if (byName.has(skill.name)) continue
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
}

module.exports = {
  SkillsManager,
  parseSkillDocument,
}

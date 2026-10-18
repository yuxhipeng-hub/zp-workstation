const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const BUILTIN_EXPERIMENT_GROUPS = [
  {
    name: '算法设计与分析实验',
    aliases: [
      '算法设计与分析',
      '算法设计',
      '算法分析',
      'algorithmdesign',
      'algorithmanalysis',
      'algorithms',
    ],
  },
  {
    name: '面向对象程序设计实验',
    aliases: [
      '面向对象程序设计',
      '面向对象',
      'objectorientedprogramming',
      'objectoriented',
      'oop',
      'java程序设计',
    ],
  },
  {
    name: '计算机系统基础',
    aliases: [
      '计算机系统基础',
      '计算机系统',
      '计算机组成',
      '操作系统实验',
      'computersystems',
      'computerorganization',
      'csapp',
    ],
  },
]

function normalizeLookupText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_\-—–.·]+/g, '')
}

function sanitizePathSegment(value) {
  return (
    String(value ?? '')
      .normalize('NFKC')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()
      .slice(0, 64) || '未分类实验'
  )
}

function inferExperimentGroup(fileName) {
  const baseName = path.basename(String(fileName ?? ''), path.extname(String(fileName ?? '')))
  const normalized = normalizeLookupText(baseName)
  const builtin = BUILTIN_EXPERIMENT_GROUPS.find((group) =>
    group.aliases.some((alias) => normalized.includes(normalizeLookupText(alias))),
  )
  if (builtin) return builtin.name

  const marker = baseName.search(/实验报告|实验|作业|报告|lab|experiment|assignment|homework/i)
  let candidate = marker > 1 ? baseName.slice(0, marker) : baseName
  candidate = candidate
    .replace(/[（(][^()（）]+[)）]/g, ' ')
    .replace(/第?\s*[一二三四五六七八九十\d]+\s*次?$/g, ' ')
    .replace(/[\s_\-—]+$/g, '')
    .trim()

  if (!candidate || /^(实验|作业|报告|lab|experiment|assignment|homework)$/i.test(candidate)) {
    return '未分类实验'
  }
  return sanitizePathSegment(candidate)
}

function longestCommonSubstringLength(left, right) {
  if (!left || !right) return 0
  let previous = new Array(right.length + 1).fill(0)
  let longest = 0
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Array(right.length + 1).fill(0)
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      if (left[leftIndex - 1] === right[rightIndex - 1]) {
        current[rightIndex] = previous[rightIndex - 1] + 1
        longest = Math.max(longest, current[rightIndex])
      }
    }
    previous = current
  }
  return longest
}

function groupMatchScore(left, right) {
  const normalizedLeft = normalizeLookupText(left)
  const normalizedRight = normalizeLookupText(right)
  if (!normalizedLeft || !normalizedRight) return 0
  if (normalizedLeft === normalizedRight) return 1

  const shorter = normalizedLeft.length <= normalizedRight.length ? normalizedLeft : normalizedRight
  const longer = normalizedLeft.length > normalizedRight.length ? normalizedLeft : normalizedRight
  if (longer.includes(shorter)) {
    return 0.25 + shorter.length / longer.length
  }

  const longest = longestCommonSubstringLength(normalizedLeft, normalizedRight)
  return longest / Math.max(normalizedLeft.length, normalizedRight.length)
}

function resolveExperimentGroup(fileName, existingGroups = []) {
  const inferred = inferExperimentGroup(fileName)
  if (!inferred || normalizeLookupText(inferred) === normalizeLookupText('未分类实验')) {
    return ''
  }

  let bestMatch = ''
  let bestScore = 0
  for (const candidate of existingGroups) {
    const score = groupMatchScore(inferred, candidate)
    if (score > bestScore) {
      bestMatch = String(candidate || '').trim()
      bestScore = score
    }
  }

  return bestScore >= 0.55 ? bestMatch : ''
}

function isPathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function uniqueDestination(directory, originalName) {
  const extension = path.extname(originalName)
  const baseName = path.basename(originalName, extension)
  let candidate = path.join(directory, originalName)
  let suffix = 2
  while (true) {
    try {
      await fsp.access(candidate)
      candidate = path.join(directory, `${baseName} (${suffix})${extension}`)
      suffix += 1
    } catch (error) {
      if (error.code === 'ENOENT') return candidate
      throw error
    }
  }
}

function samePath(left, right) {
  return (
    path.resolve(left).toLocaleLowerCase('zh-CN') === path.resolve(right).toLocaleLowerCase('zh-CN')
  )
}

async function copyDirectoryTree(sourceRoot, targetRoot) {
  const copied = []
  const skipped = []

  async function walk(sourceDirectory, relativeDirectory = '') {
    const entries = await fsp.readdir(sourceDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const source = path.join(sourceDirectory, entry.name)
      const relative = path.join(relativeDirectory, entry.name)
      if (entry.isDirectory()) {
        await walk(source, relative)
        continue
      }
      if (!entry.isFile()) {
        skipped.push({ path: source, reason: '不支持迁移符号链接或其他特殊文件。' })
        continue
      }
      const targetDirectory = path.join(targetRoot, relativeDirectory)
      await fsp.mkdir(targetDirectory, { recursive: true })
      const destination = await uniqueDestination(targetDirectory, entry.name)
      await fsp.copyFile(source, destination)
      copied.push({
        source: path.resolve(source),
        destination: path.resolve(destination),
        renamed: path.basename(destination) !== path.basename(source),
      })
    }
  }

  if (fs.existsSync(sourceRoot)) await walk(sourceRoot)
  return { copied, skipped }
}

class ExperimentLibrary {
  constructor({ settings, workspace }) {
    this.settings = settings
    this.workspace = workspace
  }

  getRoot() {
    const configured = String(this.settings.get().experimentDir || '').trim()
    if (!configured) throw new Error('实验资料目录不能为空。')
    return path.resolve(configured)
  }

  groupDirectory(group) {
    const root = this.getRoot()
    const target = path.join(root, sanitizePathSegment(group))
    if (!isPathInside(root, target)) throw new Error('实验分组路径不安全。')
    return target
  }

  async suggestEntries(entries = []) {
    const existingGroups = new Set(
      [
        ...(this.workspace.get().experimentGroups || []).map((group) => group.name),
        ...(this.workspace.get().experiments || []).map((item) => item.group),
      ]
        .map((group) => String(group || '').trim())
        .filter(Boolean),
    )
    const root = this.getRoot()
    const directoryEntries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of directoryEntries) {
      if (entry.isDirectory()) existingGroups.add(entry.name)
    }

    const suggestions = []
    for (const entry of entries || []) {
      const fileName = String(entry?.name || path.basename(entry?.path || '')).trim()
      const requestedGroup = String(entry?.group || '').trim()
      const matchedGroup = resolveExperimentGroup(fileName, [...existingGroups])
      const group = requestedGroup || matchedGroup || inferExperimentGroup(fileName)
      suggestions.push({
        ...entry,
        name: fileName,
        suggestion: {
          group,
          confidence: requestedGroup ? 1 : matchedGroup ? 0.7 : 0.35,
          source: requestedGroup ? 'explicit' : 'local',
          reason: requestedGroup
            ? '使用了你指定的目标文件夹。'
            : matchedGroup
              ? '匹配到了已有的课程文件夹。'
              : '根据文件名生成新的课程分类。',
          lowConfidence: !requestedGroup && !matchedGroup,
        },
      })
    }
    return { suggestions, mode: 'local' }
  }

  async importEntries(entries) {
    const root = this.getRoot()
    await fsp.mkdir(root, { recursive: true })
    const imported = []
    const rejected = []
    const createdGroups = []
    const existingPaths = new Set(
      (this.workspace.get().experiments || [])
        .filter((item) => item.filePath)
        .map((item) => path.resolve(item.filePath).toLocaleLowerCase('zh-CN')),
    )
    const existingGroups = new Set(
      [
        ...(this.workspace.get().experimentGroups || []).map((group) => group.name),
        ...(this.workspace.get().experiments || []).map((item) => item.group),
      ]
        .map((group) => String(group || '').trim())
        .filter(Boolean),
    )
    const directoryEntries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of directoryEntries) {
      if (entry.isDirectory()) existingGroups.add(entry.name)
    }

    for (const entry of entries || []) {
      const sourceValue = typeof entry === 'string' ? entry : entry?.path
      const sourcePath = String(sourceValue || '').trim()
      if (!sourcePath) {
        rejected.push({ name: entry?.name || '未知文件', reason: '没有取得本地文件路径。' })
        continue
      }

      const resolvedSource = path.resolve(sourcePath)
      if (existingPaths.has(resolvedSource.toLocaleLowerCase('zh-CN'))) {
        rejected.push({ name: path.basename(resolvedSource), reason: '这个文件已经在工作站中。' })
        continue
      }

      try {
        const sourceStats = await fsp.stat(resolvedSource)
        if (!sourceStats.isFile()) {
          rejected.push({ name: path.basename(resolvedSource), reason: '拖入的项目不是文件。' })
          continue
        }

        const originalName = path.basename(resolvedSource)
        const requestedGroup =
          typeof entry === 'object' && String(entry?.group || '').trim()
            ? sanitizePathSegment(entry.group)
            : ''
        const matchedGroup = resolveExperimentGroup(originalName, [...existingGroups])
        const group = requestedGroup || matchedGroup || inferExperimentGroup(originalName)
        if (!existingGroups.has(group)) {
          existingGroups.add(group)
          createdGroups.push(group)
        }
        const targetDirectory = this.groupDirectory(group)
        await fsp.mkdir(targetDirectory, { recursive: true })

        const alreadyInTarget =
          isPathInside(root, resolvedSource) &&
          path.dirname(resolvedSource).toLocaleLowerCase('zh-CN') ===
            targetDirectory.toLocaleLowerCase('zh-CN')
        const destination = alreadyInTarget
          ? resolvedSource
          : await uniqueDestination(targetDirectory, originalName)

        if (!alreadyInTarget) await fsp.copyFile(resolvedSource, destination)

        imported.push({
          title: path.basename(originalName, path.extname(originalName)),
          originalName,
          filePath: destination,
          group,
          size: sourceStats.size,
          modifiedAt: sourceStats.mtime.toISOString(),
        })
        existingPaths.add(destination.toLocaleLowerCase('zh-CN'))
      } catch (error) {
        rejected.push({ name: path.basename(resolvedSource), reason: error.message })
      }
    }

    const workspace = imported.length
      ? this.workspace.addExperiments(imported)
      : this.workspace.get()
    return { workspace, imported: imported.length, rejected, createdGroups }
  }

  async updateExperiment(id, patch = {}) {
    const existing = this.workspace.getExperiment(id)
    const nextGroup = patch.group ? sanitizePathSegment(patch.group) : existing.group
    const nextTitle =
      String(patch.title ?? existing.title)
        .trim()
        .slice(0, 160) || existing.title
    let filePath = existing.filePath

    if (nextGroup !== existing.group && fs.existsSync(existing.filePath)) {
      const targetDirectory = this.groupDirectory(nextGroup)
      await fsp.mkdir(targetDirectory, { recursive: true })
      const destination = await uniqueDestination(targetDirectory, path.basename(existing.filePath))
      try {
        await fsp.rename(existing.filePath, destination)
      } catch (error) {
        if (error.code !== 'EXDEV') throw error
        await fsp.copyFile(existing.filePath, destination)
        await fsp.unlink(existing.filePath)
      }
      filePath = destination
    }

    const workspace = this.workspace.updateExperiment(id, {
      title: nextTitle,
      group: nextGroup,
      filePath,
      courseId: nextGroup !== existing.group ? '' : existing.courseId,
    })
    return { workspace, experiment: workspace.experiments.find((item) => item.id === id) }
  }

  removeExperiment(id) {
    return this.workspace.deleteExperiment(id)
  }

  async createGroup(name) {
    const result = this.workspace.createExperimentGroup(name)
    const group = result.group.name
    try {
      await fsp.mkdir(this.groupDirectory(group), { recursive: true })
      return { ...result, group }
    } catch (error) {
      try {
        this.workspace.removeExperimentGroup(group)
      } catch {
        // Preserve the original directory error.
      }
      throw error
    }
  }

  async removeGroup(name) {
    const group = sanitizePathSegment(name)
    const directory = this.groupDirectory(group)
    let entries = []
    try {
      entries = await fsp.readdir(directory)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (entries.length) throw new Error('资料库文件夹里还有文件，请先清空后再删除。')
    const workspace = this.workspace.removeExperimentGroup(group)
    await fsp.rmdir(directory).catch((error) => {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error
    })
    return { workspace, group }
  }

  async renameGroup(currentGroup, nextGroup) {
    const current = sanitizePathSegment(currentGroup)
    const next = sanitizePathSegment(nextGroup)
    if (!String(currentGroup || '').trim()) throw new Error('原课程文件夹名称不能为空。')
    if (!String(nextGroup || '').trim()) throw new Error('新的课程文件夹名称不能为空。')
    if (normalizeLookupText(current) === normalizeLookupText(next)) {
      return { workspace: this.workspace.get(), renamed: 0, group: current }
    }

    const oldDirectory = this.groupDirectory(current)
    const nextDirectory = this.groupDirectory(next)
    const items = this.workspace
      .get()
      .experiments.filter((item) => String(item.group || '').trim() === current)
    const existingFileIds = new Set(
      items.filter((item) => item.filePath && fs.existsSync(item.filePath)).map((item) => item.id),
    )
    const movedPaths = new Map()
    const oldDirectoryExists = fs.existsSync(oldDirectory)
    const nextDirectoryExists = fs.existsSync(nextDirectory)

    if (oldDirectoryExists && oldDirectory !== nextDirectory) {
      if (!nextDirectoryExists) {
        await fsp.mkdir(path.dirname(nextDirectory), { recursive: true })
        await fsp.rename(oldDirectory, nextDirectory)
      } else {
        const entries = await fsp.readdir(oldDirectory, { withFileTypes: true })
        await fsp.mkdir(nextDirectory, { recursive: true })
        for (const entry of entries) {
          const source = path.join(oldDirectory, entry.name)
          const destination = await uniqueDestination(nextDirectory, entry.name)
          await fsp.rename(source, destination)
          movedPaths.set(path.basename(source), destination)
        }
        await fsp.rmdir(oldDirectory).catch(() => {})
      }
    }

    const nextPaths = {}
    for (const item of items) {
      if (!existingFileIds.has(item.id)) continue
      if (!oldDirectoryExists || oldDirectory === nextDirectory) {
        nextPaths[item.id] = path.join(nextDirectory, path.basename(item.filePath))
        continue
      }

      if (!isPathInside(oldDirectory, item.filePath)) {
        nextPaths[item.id] = path.join(nextDirectory, path.basename(item.filePath))
        continue
      }

      const relativePath = path.relative(oldDirectory, item.filePath)
      const [topLevelName, ...nestedParts] = relativePath.split(path.sep)
      const movedTopLevel = movedPaths.get(topLevelName)
      nextPaths[item.id] = movedTopLevel
        ? path.join(movedTopLevel, ...nestedParts)
        : path.join(nextDirectory, relativePath)
    }

    const workspace = this.workspace.updateExperimentGroup(current, next, nextPaths)
    return { workspace, renamed: items.length, group: next }
  }

  async changeRoot(nextRoot) {
    const targetRoot = path.resolve(String(nextRoot || '').trim())
    const sourceRoot = this.getRoot()
    if (!path.isAbsolute(String(nextRoot || '').trim())) {
      throw new Error('资料库根目录必须是绝对路径。')
    }
    if (samePath(sourceRoot, targetRoot)) {
      return {
        workspace: this.workspace.get(),
        oldRoot: sourceRoot,
        newRoot: targetRoot,
        copiedFiles: 0,
        trackedFiles: 0,
        renamedConflicts: 0,
        skipped: [],
      }
    }
    if (isPathInside(sourceRoot, targetRoot) || isPathInside(targetRoot, sourceRoot)) {
      throw new Error('新资料库目录不能与当前目录互相包含，请选择另一个位置。')
    }

    await fsp.mkdir(targetRoot, { recursive: true })
    const { copied, skipped } = await copyDirectoryTree(sourceRoot, targetRoot)
    const copiedBySource = new Map(copied.map((entry) => [entry.source, entry.destination]))
    const pathMap = {}
    for (const item of this.workspace.get().experiments || []) {
      const source = path.resolve(item.filePath)
      const destination = copiedBySource.get(source)
      if (destination) pathMap[item.filePath] = destination
    }

    try {
      const migration = this.workspace.migrateExperimentPaths(pathMap)
      this.settings.patch({ experimentDir: targetRoot })
      let cleanupError = ''
      if (skipped.length) {
        cleanupError = '旧目录包含未迁移的特殊文件，已保留原目录'
      } else {
        try {
          await fsp.rm(sourceRoot, { recursive: true, force: true })
        } catch (error) {
          cleanupError = error.message
        }
      }
      return {
        workspace: migration.workspace,
        oldRoot: sourceRoot,
        newRoot: targetRoot,
        copiedFiles: copied.length,
        trackedFiles: migration.migrated,
        renamedConflicts: copied.filter((entry) => entry.renamed).length,
        skipped,
        cleanupError,
      }
    } catch (error) {
      const reverseMap = Object.fromEntries(
        Object.entries(pathMap).map(([source, destination]) => [destination, source]),
      )
      try {
        this.workspace.migrateExperimentPaths(reverseMap)
      } catch {
        // Keep the original migration error.
      }
      for (const entry of copied) {
        await fsp.unlink(entry.destination).catch(() => {})
      }
      throw error
    }
  }

  getExperiment(id) {
    return this.workspace.getExperiment(id)
  }

  resolveDirectory(group = '') {
    const root = this.getRoot()
    if (!group) return root
    const target = this.groupDirectory(group)
    if (!isPathInside(root, target)) throw new Error('实验分组路径不安全。')
    return target
  }
}

module.exports = {
  BUILTIN_EXPERIMENT_GROUPS,
  ExperimentLibrary,
  inferExperimentGroup,
  isPathInside,
  resolveExperimentGroup,
  sanitizePathSegment,
}

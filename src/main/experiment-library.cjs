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

  const marker = baseName.search(
    /实验报告|实验|作业|报告|lab|experiment|assignment|homework/i,
  )
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

  async importEntries(entries) {
    const root = this.getRoot()
    await fsp.mkdir(root, { recursive: true })
    const imported = []
    const rejected = []
    const existingPaths = new Set(
      (this.workspace.get().experiments || [])
        .filter((item) => item.filePath)
        .map((item) => path.resolve(item.filePath).toLocaleLowerCase('zh-CN')),
    )

    for (const entry of entries || []) {
      const sourceValue = typeof entry === 'string' ? entry : entry?.path
      const sourcePath = String(sourceValue || '').trim()
      if (!sourcePath) {
        rejected.push({ name: entry?.name || '未知文件', reason: '没有取得本地文件路径。' })
        continue
      }

      const resolvedSource = path.resolve(sourcePath)
      if (path.extname(resolvedSource).toLocaleLowerCase('en-US') !== '.pdf') {
        rejected.push({ name: path.basename(resolvedSource), reason: '目前只接收 PDF 文件。' })
        continue
      }
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
        const group = inferExperimentGroup(originalName)
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

    const workspace = imported.length ? this.workspace.addExperiments(imported) : this.workspace.get()
    return { workspace, imported: imported.length, rejected }
  }

  async updateExperiment(id, patch = {}) {
    const existing = this.workspace.getExperiment(id)
    const nextGroup = patch.group ? sanitizePathSegment(patch.group) : existing.group
    const nextTitle = String(patch.title ?? existing.title).trim().slice(0, 160) || existing.title
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
    })
    return { workspace, experiment: workspace.experiments.find((item) => item.id === id) }
  }

  removeExperiment(id) {
    return this.workspace.deleteExperiment(id)
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
  sanitizePathSegment,
}

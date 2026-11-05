const fs = require('node:fs/promises')
const { createReadStream } = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const S = require('./creation-schema.cjs')
const TYPES = {
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.mp4': 'video',
  '.md': 'text',
  '.txt': 'text',
}
const now = () => new Date().toISOString()
function localUrl(value) {
  try {
    const u = new URL(value)
    return (
      u.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash
    )
  } catch {
    return false
  }
}
async function inspect(file) {
  const stat = await fs.stat(file)
  if (!stat.isFile() || stat.size > 4 * 1024 ** 3)
    throw new Error('文件必须为普通文件且不超过 4 GB。')
  const ext = path.extname(file).toLowerCase()
  if (
    (TYPES[ext] === 'text' && stat.size > 1024 * 1024) ||
    (TYPES[ext] === 'image' && stat.size > 50 * 1024 * 1024)
  )
    throw new Error('文件超过大小限制：文字 1 MB，图片 50 MB。')
  const handle = await fs.open(file, 'r')
  let header
  try {
    header = Buffer.alloc(Math.min(4096, stat.size))
    await handle.read(header, 0, header.length, 0)
  } finally {
    await handle.close()
  }
  const invalid =
    ext === '.mp4'
      ? header.toString('ascii', 4, 8) !== 'ftyp'
      : ext === '.png'
        ? header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        : ['.jpg', '.jpeg'].includes(ext)
          ? header[0] !== 255 || header[1] !== 216 || header[2] !== 255
          : ext === '.webp'
            ? header.toString('ascii', 0, 4) !== 'RIFF' ||
              header.toString('ascii', 8, 12) !== 'WEBP'
            : TYPES[ext] === 'text'
              ? header.includes(0)
              : true
  if (invalid) throw new Error('文件内容与允许的类型不符。')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  const after = await fs.stat(file)
  if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
    throw new Error('文件正在写入，请稍后刷新。')
  return { digest: hash.digest('hex'), size: stat.size }
}
async function within(root, relative) {
  if (
    typeof relative !== 'string' ||
    !relative ||
    relative.length > 2048 ||
    /[:\x00]/.test(relative) ||
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/).includes('..')
  )
    throw new Error('产物路径必须位于关联目录内，不能包含 .. 或绝对路径。')
  const base = await fs.realpath(root)
  const lexical = path.resolve(base, relative)
  const check = (p) => {
    const r = path.relative(base, p)
    if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error('产物路径越界。')
  }
  check(lexical)
  // Missing files remain records; existing parents and symlinks must stay within root.
  let parent = lexical
  while (parent !== base) {
    try {
      const real = await fs.realpath(parent)
      check(real)
      break
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
      parent = path.dirname(parent)
    }
  }
  return lexical
}
class CreationManager {
  constructor(workspace) {
    this.workspace = workspace
    this.observed = new Map()
  }
  project(id) {
    if (typeof id !== 'string' || id.length > 100) throw new Error('项目编号无效。')
    const p = this.workspace.get().creationProjects.find((x) => x.id === id)
    if (!p) throw new Error('项目不存在。')
    return p
  }
  commit(p, message) {
    for (const key of ['tasks', 'runs', 'artifacts', 'reviews', 'publications'])
      if (p[key].length > 500) throw new Error('单项目记录达到 500 条上限。')
    p.updatedAt = now()
    p.activity.unshift({ at: p.updatedAt, message })
    const all = this.workspace.get().creationProjects
    if (!all.some((x) => x.id === p.id) && all.length >= 100) throw new Error('最多 100 个项目。')
    return this.workspace.saveCreationProjects([p, ...all.filter((x) => x.id !== p.id)])
  }
  async health(a, project = null) {
    if (a.type === 'interactive')
      return {
        digest: '',
        size: 0,
        status: localUrl(a.url) ? 'available' : 'invalid',
        message: '仅在外部浏览器打开本机地址',
      }
    try {
      if (a.source === 'external') {
        if (!project?.directory) throw new Error('外部目录未连接。')
        await within(project.directory, path.relative(project.directory, a.path))
      }
      if (TYPES[path.extname(a.path).toLowerCase()] !== a.type)
        throw new Error('文件类型与记录不符。')
      const info = await inspect(a.path)
      return {
        ...info,
        status: info.digest === a.digest ? 'available' : 'changed',
        message:
          info.digest === a.digest ? '' : '文件已被替换；原版本验收失效，请重新导入为新版本。',
      }
    } catch (e) {
      return {
        digest: '',
        size: 0,
        status: e.code === 'ENOENT' ? 'missing' : 'unavailable',
        message: e.code === 'ENOENT' ? '文件已丢失' : `文件不可访问：${e.message}`,
      }
    }
  }
  async details(id) {
    const p = this.project(id)
    let directoryStatus = 'disconnected'
    if (p.directory) {
      try {
        directoryStatus = (await fs.stat(p.directory)).isDirectory() ? 'connected' : 'missing'
      } catch {
        directoryStatus = 'missing'
      }
    }
    const reviewHealth = {}
    for (const r of p.reviews.filter((r) => r.status === 'resolved')) {
      const a = p.artifacts.find((a) => a.id === r.resolvedArtifactId)
      reviewHealth[r.id] =
        !!a && (await this.health(a, p)).digest === r.resolvedDigest && !!r.resolvedDigest
    }
    return {
      reviewHealth,
      directoryStatus,
      runs: p.runs.map((r) => ({
        ...r,
        displayStatus:
          r.status === 'running' &&
          (!this.observed.has(`${p.id}:${r.id}`) ||
            Date.now() - Date.parse(r.updatedAt) > 120000 ||
            Date.parse(r.updatedAt) > Date.now() + 30000)
            ? 'unknown'
            : r.status,
      })),
    }
  }
  async connect(id, directory) {
    const p = this.project(id)
    const real = await fs.realpath(directory)
    if (!(await fs.stat(real)).isDirectory()) throw new Error('请选择目录。')
    if (p.directory !== real) {
      p.externalId = ''
      this.observed.clear()
    }
    p.directory = real
    return this.commit(p, '关联外部项目目录')
  }
  async importFiles(id, files, label, family = '作品') {
    const p = this.project(id)
    if (!Array.isArray(files) || files.length > 20) throw new Error('一次最多导入 20 个文件。')
    for (const file of files) {
      const type = TYPES[path.extname(file).toLowerCase()]
      if (!type) throw new Error('仅支持 PNG/JPG/WebP/MP4/Markdown/TXT。')
      const info = await inspect(file)
      if (p.artifacts.some((a) => a.path === file && a.digest === info.digest)) continue
      p.artifacts.push(
        S.artifact({
          id: randomUUID(),
          type,
          path: file,
          label: S.text(label, 100) || `v${p.artifacts.length + 1}`,
          family,
          ...info,
          createdAt: now(),
          source: 'manual',
          sourceVersion: info.digest,
        }),
      )
    }
    return this.commit(p, '导入产物版本')
  }
  async refresh(id) {
    const p = this.project(id)
    if (!p.directory) throw new Error('外部目录未连接。')
    const manifest = await within(p.directory, 'workbench-record.json')
    const stat = await fs.stat(manifest)
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error('外部记录必须为不超过 1 MB 的 JSON 文件。')
    let data
    try {
      data = JSON.parse(await fs.readFile(manifest, 'utf8'))
    } catch {
      throw new Error('JSON 格式错误或文件尚未写完；已保留上次有效记录。')
    }
    if (
      data.schemaVersion !== 1 ||
      typeof data.projectId !== 'string' ||
      !data.projectId ||
      data.projectId.length > 100 ||
      !S.date(data.updatedAt)
    )
      throw new Error('需要 schemaVersion: 1、projectId 和有效 updatedAt。')
    if (p.externalId && data.projectId !== p.externalId)
      throw new Error('外部项目身份不匹配，请重新关联目录。')
    if (p.externalUpdatedAt && Date.parse(data.updatedAt) < Date.parse(p.externalUpdatedAt))
      throw new Error('记录时间早于上次导入，拒绝回退状态。')
    for (const key of ['tasks', 'runs', 'artifacts']) {
      if (!Array.isArray(data[key]) || data[key].length > 500)
        throw new Error(`${key} 必须为数组且最多 500 项。`)
      const ids = new Set()
      for (const x of data[key]) {
        if (!x || typeof x.id !== 'string' || !x.id || x.id.length > 100 || ids.has(x.id))
          throw new Error(`${key} 编号缺失或重复。`)
        ids.add(x.id)
        if (key !== 'artifacts' && !S.STATES.includes(x.status))
          throw new Error(`${key}/${x.id} 状态无效。`)
        if (
          key === 'runs' &&
          (!S.date(x.updatedAt) ||
            (x.totalFrames != null &&
              (!Number.isInteger(x.totalFrames) ||
                x.totalFrames <= 0 ||
                !Number.isInteger(x.frames) ||
                x.frames < 0 ||
                x.frames > x.totalFrames)))
        )
          throw new Error(`执行 ${x.id} 时间或帧数无效。`)
      }
    }
    const ref = (v) =>
      v
        ? `ext:${createHash('sha256')
            .update(data.projectId + '\0' + v)
            .digest('hex')}`
        : ''
    const merge = (old, incoming) => [
      ...old.filter((x) => !incoming.some((y) => y.id === x.id)),
      ...incoming,
    ]
    const tasks = data.tasks.map((t) =>
      S.task({ ...t, id: ref(t.id), artifactId: ref(t.artifactId) }),
    )
    const runs = data.runs.map((r) => S.run({ ...r, id: ref(r.id), taskId: ref(r.taskId) }))
    const artifacts = []
    for (const a of data.artifacts) {
      if (!['image', 'video', 'text', 'interactive'].includes(a.type) || !S.text(a.label, 100))
        throw new Error(`产物 ${a.id} 类型或版本标签无效。`)
      const file = a.type === 'interactive' ? '' : await within(p.directory, a.path)
      if (
        a.type === 'interactive'
          ? !localUrl(a.url)
          : TYPES[path.extname(file).toLowerCase()] !== a.type
      )
        throw new Error(`产物 ${a.id} 类型或地址不受支持。`)
      let info = { digest: '', size: null }
      if (file) {
        try {
          info = await inspect(file)
        } catch (e) {
          if (e.code !== 'ENOENT') throw e
        }
      }
      const next = S.artifact({
        ...a,
        ...info,
        id: ref(a.id),
        path: file,
        source: 'external',
        sourceVersion: a.sourceVersion || data.sourceVersion,
        taskId: ref(a.taskId),
        runId: ref(a.runId),
        acceptance: 'pending',
        acceptedAt: '',
        acceptedDigest: '',
      })
      const previous = p.artifacts.find((x) => x.id === next.id)
      if (
        previous &&
        (previous.digest !== next.digest ||
          previous.path !== next.path ||
          previous.sourceVersion !== next.sourceVersion ||
          previous.url !== next.url)
      )
        throw new Error(`产物 ${a.id} 内容或来源版本改变，请使用新的产物 id；旧版本已保留。`)
      artifacts.push(previous || next)
    }
    const taskIds = new Set([...p.tasks, ...tasks].map((x) => x.id))
    const runIds = new Set([...p.runs, ...runs].map((x) => x.id))
    const artifactIds = new Set([...p.artifacts, ...artifacts].map((x) => x.id))
    if (
      tasks.some((x) => x.artifactId && !artifactIds.has(x.artifactId)) ||
      runs.some((x) => x.taskId && !taskIds.has(x.taskId)) ||
      artifacts.some(
        (x) => (x.taskId && !taskIds.has(x.taskId)) || (x.runId && !runIds.has(x.runId)),
      )
    )
      throw new Error('任务、执行或产物引用不存在。')
    p.tasks = merge(p.tasks, tasks)
    p.runs = merge(p.runs, runs)
    p.artifacts = merge(p.artifacts, artifacts)
    p.externalId = data.projectId
    p.externalUpdatedAt = data.updatedAt
    p.sourceVersion = S.text(data.sourceVersion, 200)
    const result = this.commit(p, '刷新有效外部记录')
    for (const r of runs) this.observed.set(`${id}:${r.id}`, true)
    return result
  }
  async command(input) {
    if (!input || typeof input !== 'object' || JSON.stringify(input).length > 50000)
      throw new Error('请求无效或过大。')
    const { action, projectId } = input
    const p =
      action === 'create'
        ? S.cleanProject({ id: randomUUID(), createdAt: now() })
        : this.project(projectId)
    if (action === 'create' || action === 'edit') {
      if (!S.text(input.name, 120) || !S.STAGES.includes(input.stage))
        throw new Error('名称或制作阶段无效。')
      p.name = S.text(input.name, 120)
      p.goal = S.text(input.goal)
      p.brief = S.text(input.brief, 8000)
      p.stage = input.stage
    } else if (action === 'archive') p.archived = input.archived === true
    else if (action === 'delete')
      return this.workspace.saveCreationProjects(
        this.workspace.get().creationProjects.filter((x) => x.id !== p.id),
      )
    else if (action === 'select' || action === 'approve') {
      const a = p.artifacts.find((x) => x.id === input.artifactId)
      if (!a) throw new Error('产物不存在。')
      if (action === 'select') p.selectedArtifactId = a.id
      else {
        if (a.type === 'interactive')
          throw new Error('互动作品无法校验文件摘要，请以导出的图片或视频进行验收。')
        const h = await this.health(a, p)
        if (h.status !== 'available') throw new Error(h.message || '文件不可用。')
        if (p.sourceVersion && a.source === 'external' && a.sourceVersion !== p.sourceVersion)
          throw new Error('来源版本已变化，请验收新来源版本。')
        if (
          p.reviews.some(
            (r) =>
              r.priority === 'required' &&
              r.status !== 'resolved' &&
              (r.artifactId === a.id ||
                p.artifacts.find((x) => x.id === r.artifactId)?.family === a.family),
          )
        )
          throw new Error('仍有必须修改的意见，请先复查关闭。')
        for (const r of p.reviews.filter(
          (r) =>
            r.priority === 'required' &&
            r.status === 'resolved' &&
            p.artifacts.find((x) => x.id === r.artifactId)?.family === a.family,
        )) {
          const fix = p.artifacts.find((x) => x.id === r.resolvedArtifactId)
          if (!fix || (await this.health(fix, p)).digest !== r.resolvedDigest || !r.resolvedDigest)
            throw new Error('修复文件已变化，请重新复查意见。')
        }
        a.acceptance = 'approved'
        a.acceptedDigest = h.digest
        a.acceptedAt = now()
      }
    } else if (action === 'review-add') {
      if (
        !p.artifacts.some((x) => x.id === input.artifactId) ||
        !S.text(input.problem) ||
        !S.text(input.expected)
      )
        throw new Error('请选择产物并填写问题与期望效果。')
      if (input.time !== '' && input.time != null && S.number(input.time) === null)
        throw new Error('时间点须为非负秒数。')
      p.reviews.push(
        S.review({
          ...input,
          id: randomUUID(),
          createdAt: now(),
          updatedAt: now(),
          status: 'open',
          resolvedArtifactId: '',
          resolvedDigest: '',
        }),
      )
      const a = p.artifacts.find((x) => x.id === input.artifactId)
      a.acceptance = 'pending'
    } else if (action === 'review-update') {
      const r = p.reviews.find((x) => x.id === input.reviewId)
      if (!r || !['open', 'doing', 'recheck', 'resolved'].includes(input.status))
        throw new Error('意见或状态无效。')
      const a = p.artifacts.find((x) => x.id === input.resolvedArtifactId)
      const original = p.artifacts.find((x) => x.id === r.artifactId)
      if (a && a.family !== original?.family) throw new Error('修复版本必须属于同一作品分组。')
      if (['recheck', 'resolved'].includes(input.status) && !a) throw new Error('请选择修复版本。')
      if (input.status === 'resolved') {
        const h = await this.health(a, p)
        if (h.status !== 'available') throw new Error(h.message || '修复版本不可用。')
        r.resolvedDigest = h.digest
      }
      r.status = input.status
      r.resolvedArtifactId = a?.id || ''
      r.updatedAt = now()
      if (r.history.length >= 500) throw new Error('意见处理历史达到 500 条上限。')
      r.history.push({ at: r.updatedAt, status: r.status, artifactId: r.resolvedArtifactId })
    } else if (action === 'publication') {
      if (input.url) {
        let url
        try {
          url = new URL(input.url)
        } catch {
          throw new Error('发布链接须为有效 HTTP/HTTPS 地址。')
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          throw new Error('发布链接不能包含凭据，且仅支持 HTTP/HTTPS。')
      }
      if (
        !S.text(input.platform, 100) ||
        !p.artifacts.some((x) => x.id === input.artifactId) ||
        !S.date(input.publishedAt)
      )
        throw new Error('请填写平台、发布时间并选择成片版本。')
      p.publications.push(S.publication({ ...input, id: randomUUID(), observations: [] }))
    } else if (action === 'observation') {
      const pub = p.publications.find((x) => x.id === input.publicationId)
      if (!pub || !S.date(input.observedAt)) throw new Error('发布记录或观察时间无效。')
      if (pub.observations.length >= 500) throw new Error('观察快照达到 500 条上限。')
      pub.observations.push(
        S.publication({ observations: [{ ...input, id: randomUUID() }] }).observations[0],
      )
    } else throw new Error('不支持的工作室操作。')
    for (const key of ['tasks', 'runs', 'artifacts', 'reviews', 'publications'])
      if (p[key].length > 500) throw new Error('单项目记录达到 500 条上限。')
    return this.commit(
      p,
      {
        create: '创建项目',
        edit: '更新制作简报',
        archive: '更新归档状态',
        select: '设置选定版本',
        approve: '用户确认版本验收',
        'review-add': '添加修改意见',
        'review-update': '记录意见处理',
        publication: '记录发布与复盘',
        observation: '添加指标观察快照',
      }[action],
    )
  }
  feedback(id, filters = {}) {
    const p = this.project(id)
    return (
      p.reviews
        .filter(
          (r) =>
            (!filters.status || r.status === filters.status) &&
            (!filters.priority || r.priority === filters.priority),
        )
        .sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity))
        .map((r) => {
          const a = p.artifacts.find((a) => a.id === r.artifactId)
          return `[${r.priority === 'required' ? '必须修改' : '建议优化'} / ${r.status}] ${a?.family} · ${a?.label} (${a?.id})\n来源版本：${a?.sourceVersion || '未提供'}；摘要：${a?.digest || '未提供'}\n时间：${r.time === null ? '全局' : r.time + ' 秒'}\n问题：${r.problem}\n期望：${r.expected}`
        })
        .join('\n\n') || '暂无符合条件的修改意见。'
    )
  }
}
module.exports = { CreationManager, localUrl, inspect, within, TYPES }

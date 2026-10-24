const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { cleanAiPlan } = require('./ai-plan.cjs')

const ASSIGNMENT_STATUSES = new Set(['inbox', 'doing', 'done'])
const ASSIGNMENT_PRIORITIES = new Set(['low', 'medium', 'high'])
const DEFAULT_WORKSPACE = {
  version: 2,
  courses: [],
  assignments: [],
  knowledge: [],
  experiments: [],
  experimentGroups: [],
  schedule: null,
}

const BACKUP_INTERVAL_MS = 30 * 60 * 1000
const MAX_AUTO_BACKUPS = 20
const UNCLASSIFIED_COURSE_KEYS = new Set(['未分类', '未分类实验', '未分类课程', 'uncategorized'])

function cleanString(value, maxLength) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength)
}

function cleanDate(value) {
  const text = cleanString(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function cleanColor(value) {
  const match = cleanString(value, 24).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return ''
  const hex = match[1].length === 3 ? [...match[1]].map((part) => part + part).join('') : match[1]
  return `#${hex.toUpperCase()}`
}

function courseKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_\-—–.·、,，]+/g, '')
    .replace(/(实验|实训|实践|课程|课)+$/g, '')
}

function groupKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s_\-—–.·、,，]+/g, '')
}

function isUnclassifiedCourse(value) {
  const key = courseKey(value)
  return !key || UNCLASSIFIED_COURSE_KEYS.has(key)
}

function cleanCourse(input = {}, existing = {}) {
  const name = cleanString(input.name, 100)
  if (!name) return null
  const now = new Date().toISOString()
  const aliases = (Array.isArray(input.aliases) ? input.aliases : [])
    .map((alias) => cleanString(alias, 100))
    .filter((alias) => alias && courseKey(alias) !== courseKey(name))
  return {
    id: existing.id || cleanString(input.id, 80) || randomUUID(),
    name,
    aliases: [...new Set(aliases)].slice(0, 12),
    color: cleanColor(input.color || existing.color),
    createdAt: existing.createdAt || cleanString(input.createdAt, 40) || now,
    updatedAt: now,
  }
}

function cleanAssignment(input, existing = {}) {
  const title = cleanString(input.title, 120)
  if (!title) throw new Error('作业标题不能为空。')
  const status = ASSIGNMENT_STATUSES.has(input.status) ? input.status : existing.status || 'inbox'
  const priority = ASSIGNMENT_PRIORITIES.has(input.priority)
    ? input.priority
    : existing.priority || 'medium'
  const aiPlan = Object.hasOwn(input, 'aiPlan')
    ? cleanAiPlan(input.aiPlan)
    : cleanAiPlan(existing.aiPlan)
  const now = new Date().toISOString()
  return {
    id: existing.id || randomUUID(),
    title,
    course: cleanString(input.course, 80),
    courseId: cleanString(
      Object.hasOwn(input, 'courseId') ? input.courseId : existing.courseId,
      80,
    ),
    dueAt: cleanDate(input.dueAt),
    priority,
    status,
    notes: cleanString(input.notes, 2000),
    aiPlan: aiPlan || null,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  }
}

function cleanExperiment(input, existing = {}) {
  const title = cleanString(input.title, 160)
  const filePath = cleanString(input.filePath, 2048)
  if (!title || !filePath) throw new Error('实验文件信息不完整。')
  const size = Number(input.size)
  return {
    id: existing.id || randomUUID(),
    title,
    originalName: cleanString(input.originalName || title, 260),
    filePath,
    group: cleanString(input.group || '未分类实验', 64),
    courseId: cleanString(
      Object.hasOwn(input, 'courseId') ? input.courseId : existing.courseId,
      80,
    ),
    size: Number.isFinite(size) && size >= 0 ? Math.round(size) : 0,
    modifiedAt: cleanString(input.modifiedAt, 40),
    importedAt: existing.importedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function cleanExperimentGroup(input = {}, existing = {}) {
  const name = cleanString(typeof input === 'string' ? input : input.name || existing.name, 64)
  if (!name) return null
  const now = new Date().toISOString()
  return {
    id: existing.id || cleanString(input.id, 80) || randomUUID(),
    name,
    createdAt: existing.createdAt || cleanString(input.createdAt, 40) || now,
    updatedAt: now,
  }
}

function cleanScheduleCourse(input = {}) {
  const name = cleanString(input.name, 100)
  const weekday = Number(input.weekday)
  const startPeriod = Number(input.startPeriod)
  const endPeriod = Math.max(startPeriod, Number(input.endPeriod) || startPeriod)
  if (
    !name ||
    !Number.isInteger(weekday) ||
    weekday < 1 ||
    weekday > 7 ||
    !Number.isInteger(startPeriod) ||
    startPeriod < 1 ||
    startPeriod > 20
  ) {
    return null
  }
  const weeks = [
    ...new Set(
      (Array.isArray(input.weeks) ? input.weeks : [])
        .map((week) => Number(week))
        .filter((week) => Number.isInteger(week) && week >= 1 && week <= 30),
    ),
  ].sort((left, right) => left - right)
  return {
    id: cleanString(input.id, 80) || randomUUID(),
    name,
    courseId: cleanString(input.courseId, 80),
    teacher: cleanString(input.teacher, 40),
    location: cleanString(input.location, 80),
    weekday,
    startPeriod,
    endPeriod: Math.min(endPeriod, 20),
    startTime: cleanString(input.startTime, 8),
    endTime: cleanString(input.endTime, 8),
    weeks,
    weekText: cleanString(input.weekText, 80),
    color: cleanColor(input.color),
    raw: cleanString(input.raw, 1000),
  }
}

function cleanTimeValue(value) {
  const match = cleanString(value, 8).match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : ''
}

function cleanSchedule(input) {
  if (!input || typeof input !== 'object') return null
  const courses = (Array.isArray(input.courses) ? input.courses : [])
    .map((course) => cleanScheduleCourse(course))
    .filter(Boolean)
    .slice(0, 500)
  if (!courses.length) return null
  const periodTimeInputs = Array.isArray(input.periodTimes) ? input.periodTimes : []
  const maxPeriod = Math.min(
    20,
    Math.max(
      1,
      Number(input.maxPeriod) || 0,
      periodTimeInputs.length,
      ...courses.map((course) => course.endPeriod),
    ),
  )
  const periodTimes = Array.from({ length: maxPeriod }, (_item, index) => {
    const entry = periodTimeInputs[index] || {}
    return {
      period: index + 1,
      startTime: cleanTimeValue(entry.startTime),
      endTime: cleanTimeValue(entry.endTime),
    }
  })
  const maxWeek = Math.min(
    30,
    Math.max(16, Number(input.maxWeek) || 0, ...courses.flatMap((course) => course.weeks)),
  )
  return {
    source: {
      name: cleanString(input.source?.name, 260),
      path: cleanString(input.source?.path, 2048),
      extension: cleanString(input.source?.extension, 16),
      size: Math.max(0, Math.round(Number(input.source?.size) || 0)),
      importedAt: cleanString(input.source?.importedAt, 40),
    },
    importedAt: cleanString(input.importedAt, 40) || new Date().toISOString(),
    maxPeriod,
    maxWeek,
    periodTimes,
    courses,
  }
}

class WorkspaceStore {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, 'workspace.json')
    this.backupDir = path.join(userDataDir, 'backups')
    const before = this.load()
    this.data = structuredClone(before)
    this.linkCourses()
    if (JSON.stringify(before) !== JSON.stringify(this.data)) this.save()
  }

  load() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      return this.normalizeData(stored)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.quarantineCorruptFile()
        console.warn('Failed to read workspace data, using defaults:', error)
      }
      return this.normalizeData(structuredClone(DEFAULT_WORKSPACE))
    }
  }

  /** 读取失败时先留一份原始文件，避免下一次保存把用户数据直接覆盖。 */
  quarantineCorruptFile() {
    try {
      if (!fs.existsSync(this.filePath)) return ''
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const target = path.join(path.dirname(this.filePath), `workspace.corrupt-${stamp}.json`)
      fs.copyFileSync(this.filePath, target)
      return target
    } catch (error) {
      console.warn('Failed to keep a copy of the corrupt workspace file:', error.message)
      return ''
    }
  }

  normalizeData(stored = {}) {
    const experiments = Array.isArray(stored.experiments) ? stored.experiments : []
    const experimentGroups = (Array.isArray(stored.experimentGroups) ? stored.experimentGroups : [])
      .map((group) => cleanExperimentGroup(group))
      .filter(Boolean)
      .slice(0, 300)
    return {
      version: 2,
      courses: (Array.isArray(stored.courses) ? stored.courses : [])
        .map((course) => cleanCourse(course))
        .filter(Boolean)
        .slice(0, 300),
      assignments: Array.isArray(stored.assignments) ? stored.assignments : [],
      knowledge: Array.isArray(stored.knowledge) ? stored.knowledge : [],
      experiments,
      experimentGroups,
      schedule: cleanSchedule(stored.schedule),
    }
  }

  courseNameFor(item) {
    if (!item || typeof item !== 'object') return ''
    if (item.name && item.weekday) return item.name
    if (item.group !== undefined) return item.group
    return item.course || item.source?.group || ''
  }

  linkCourses() {
    const courses = this.data.courses || []
    const byKey = new Map()
    const index = (course) => {
      const key = courseKey(course.name)
      if (key && !byKey.has(key)) byKey.set(key, course)
      for (const alias of course.aliases || []) {
        const aliasKey = courseKey(alias)
        if (aliasKey && !byKey.has(aliasKey)) byKey.set(aliasKey, course)
      }
    }
    courses.forEach(index)

    const lookup = (rawName) => {
      const name = cleanString(rawName, 100)
      if (isUnclassifiedCourse(name)) return null
      const key = courseKey(name)
      let course = byKey.get(key)
      if (!course) {
        course = courses.find((candidate) => {
          const candidateKey = courseKey(candidate.name)
          if (!candidateKey) return false
          const ratio =
            Math.min(candidateKey.length, key.length) / Math.max(candidateKey.length, key.length)
          return ratio >= 0.6 && (candidateKey.includes(key) || key.includes(candidateKey))
        })
      }
      return course || null
    }

    const ensure = (rawName) => {
      const name = cleanString(rawName, 100)
      const course = lookup(name)
      if (course) {
        const key = courseKey(name)
        if (courseKey(course.name) !== key && !(course.aliases || []).includes(name)) {
          const aliases = new Set(course.aliases || [])
          aliases.add(name)
          course.aliases = [...aliases].slice(0, 12)
        }
        byKey.set(key, course)
        return course
      }
      if (isUnclassifiedCourse(name)) return null
      const created = cleanCourse({ name })
      if (created) {
        courses.push(created)
        index(created)
      }
      return created
    }

    const resolve = (rawName) => {
      const name = cleanString(rawName, 100)
      if (isUnclassifiedCourse(name)) return null
      const course = lookup(name)
      if (course && courseKey(course.name) !== courseKey(name)) {
        const aliases = new Set(course.aliases || [])
        aliases.add(name)
        course.aliases = [...aliases].slice(0, 12)
      }
      return course
    }

    for (const item of this.data.assignments) {
      const name = this.courseNameFor(item)
      item.course = cleanString(item.course || name, 80)
      item.courseId = ensure(item.course || name)?.id || ''
    }
    for (const item of this.data.knowledge) {
      const name = this.courseNameFor(item)
      if (name && !item.course) item.course = cleanString(name, 80)
      item.courseId = ensure(item.course || name)?.id || ''
    }
    for (const item of this.data.experiments) {
      const linked = courses.find((course) => course.id === item.courseId)
      item.courseId = resolve(item.group)?.id || linked?.id || ensure(item.group)?.id || ''
    }
    const knownGroups = new Set(
      (this.data.experimentGroups || []).map((group) => String(group.name || '').trim()),
    )
    for (const item of this.data.experiments) {
      const name = cleanString(item.group, 64)
      if (!name || knownGroups.has(name)) continue
      const group = cleanExperimentGroup({ name })
      if (group) {
        this.data.experimentGroups.push(group)
        knownGroups.add(name)
      }
    }
    this.data.experimentGroups = (this.data.experimentGroups || []).slice(0, 300)
    if (this.data.schedule) {
      for (const course of this.data.schedule.courses) {
        const entity = ensure(course.name)
        course.courseId = entity?.id || ''
        if (entity?.color && !course.color) course.color = entity.color
        if (course.color && entity) {
          entity.color = course.color
          entity.updatedAt = new Date().toISOString()
        }
      }
    }
    this.data.courses = courses.slice(0, 300)
  }

  get() {
    return structuredClone(this.data)
  }

  createAssignment(input) {
    this.data.assignments.unshift(cleanAssignment(input || {}))
    this.save()
    return this.get()
  }

  updateAssignment(id, patch) {
    const index = this.data.assignments.findIndex((item) => item.id === id)
    if (index === -1) throw new Error('没有找到这条作业。')
    this.data.assignments[index] = cleanAssignment(
      { ...this.data.assignments[index], ...(patch || {}) },
      this.data.assignments[index],
    )
    this.save()
    return this.get()
  }

  deleteAssignment(id) {
    this.data.assignments = this.data.assignments.filter((item) => item.id !== id)
    this.save()
    return this.get()
  }

  getExperiment(id) {
    const experiment = this.data.experiments.find((item) => item.id === id)
    if (!experiment) throw new Error('没有找到这个实验文件。')
    return structuredClone(experiment)
  }

  addExperiments(entries) {
    const records = (entries || []).map((entry) => cleanExperiment(entry))
    this.data.experiments.unshift(...records)
    this.save()
    return this.get()
  }

  createExperimentGroup(name) {
    const cleaned = cleanString(name, 64)
    if (!cleaned) throw new Error('资料库名称不能为空。')
    const key = groupKey(cleaned)
    if (
      (this.data.experimentGroups || []).some((group) => groupKey(group.name) === key) ||
      this.data.experiments.some((item) => groupKey(item.group) === key)
    ) {
      throw new Error('已存在同名资料库。')
    }
    const group = cleanExperimentGroup({ name: cleaned })
    this.data.experimentGroups.push(group)
    this.save()
    return { workspace: this.get(), group }
  }

  removeExperimentGroup(name) {
    const cleaned = cleanString(name, 64)
    if (!cleaned) throw new Error('资料库名称不能为空。')
    if (this.data.experiments.some((item) => String(item.group || '').trim() === cleaned)) {
      throw new Error('资料库中还有文件记录，请先移动或移除这些资料。')
    }
    this.data.experimentGroups = (this.data.experimentGroups || []).filter(
      (group) => String(group.name || '').trim() !== cleaned,
    )
    this.save()
    return this.get()
  }

  updateExperiment(id, patch) {
    const index = this.data.experiments.findIndex((item) => item.id === id)
    if (index === -1) throw new Error('没有找到这个实验文件。')
    this.data.experiments[index] = cleanExperiment(
      { ...this.data.experiments[index], ...(patch || {}) },
      this.data.experiments[index],
    )
    this.save()
    return this.get()
  }

  updateExperimentGroup(currentGroup, nextGroup, nextPaths = {}) {
    const now = new Date().toISOString()
    this.data.experiments = this.data.experiments.map((item) => {
      if (String(item.group || '').trim() !== currentGroup) return item
      return cleanExperiment(
        {
          ...item,
          group: nextGroup,
          filePath: nextPaths[item.id] || item.filePath,
          courseId: '',
        },
        { ...item, updatedAt: now },
      )
    })
    let groups = this.data.experimentGroups || []
    const existing = groups.find((group) => String(group.name || '').trim() === currentGroup)
    if (existing) {
      const nextExisting = groups.find(
        (group) => group !== existing && String(group.name || '').trim() === nextGroup,
      )
      if (nextExisting) {
        groups = groups.filter((group) => group !== existing)
      } else {
        existing.name = nextGroup
        existing.updatedAt = now
      }
    } else if (!groups.some((group) => String(group.name || '').trim() === nextGroup)) {
      const group = cleanExperimentGroup({ name: nextGroup })
      if (group) groups.push(group)
    }
    this.data.experimentGroups = groups
    this.save()
    return this.get()
  }

  migrateExperimentPaths(pathMap = {}) {
    let migrated = 0
    this.data.experiments = this.data.experiments.map((item) => {
      const nextPath = pathMap[item.filePath]
      if (!nextPath || nextPath === item.filePath) return item
      migrated += 1
      return cleanExperiment({ ...item, filePath: nextPath }, item)
    })
    if (migrated) this.save()
    return { workspace: this.get(), migrated }
  }

  deleteExperiment(id) {
    this.data.experiments = this.data.experiments.filter((item) => item.id !== id)
    this.save()
    return this.get()
  }

  replaceSchedule(schedule) {
    this.data.schedule = cleanSchedule(schedule)
    this.save()
    return this.get()
  }

  clearSchedule() {
    this.data.schedule = null
    this.save()
    return this.get()
  }

  listCourses() {
    return (this.data.courses || []).map((course) => ({
      ...structuredClone(course),
      counts: {
        schedule: (this.data.schedule?.courses || []).filter((item) => item.courseId === course.id)
          .length,
        assignments: this.data.assignments.filter((item) => item.courseId === course.id).length,
        knowledge: this.data.knowledge.filter((item) => item.courseId === course.id).length,
        experiments: this.data.experiments.filter((item) => item.courseId === course.id).length,
      },
    }))
  }

  createCourse(input) {
    const name = cleanString(input?.name, 100)
    if (!name) throw new Error('课程名称不能为空。')
    if (this.data.courses.some((course) => courseKey(course.name) === courseKey(name))) {
      throw new Error('已存在同名课程。')
    }
    const course = cleanCourse({ name })
    this.data.courses.push(course)
    this.save()
    return { workspace: this.get(), course }
  }

  renameCourse(id, nextName) {
    const course = this.data.courses.find((item) => item.id === id)
    if (!course) throw new Error('没有找到这门课程。')
    const name = cleanString(nextName, 100)
    if (!name) throw new Error('课程名称不能为空。')
    if (
      this.data.courses.some((item) => item.id !== id && courseKey(item.name) === courseKey(name))
    ) {
      throw new Error('已有同名课程，请使用同一个名称或先合并数据。')
    }
    const previousName = course.name
    course.aliases = [...new Set([...(course.aliases || []), previousName])].slice(0, 12)
    course.name = name
    course.updatedAt = new Date().toISOString()
    for (const item of this.data.assignments) {
      if (item.courseId === id) item.course = name
    }
    for (const item of this.data.knowledge) {
      if (item.courseId === id) item.course = name
    }
    for (const item of this.data.schedule?.courses || []) {
      if (item.courseId === id) item.name = name
    }
    const groupRenames = []
    for (const item of this.data.experiments) {
      if (item.courseId !== id || !item.group || isUnclassifiedCourse(item.group)) continue
      if (!groupRenames.some((entry) => entry.from === item.group)) {
        groupRenames.push({ from: item.group, to: name })
      }
    }
    this.save()
    return { workspace: this.get(), course, previousName, groupRenames }
  }

  autoBackup() {
    try {
      if (!fs.existsSync(this.filePath)) return
      const newest = fs.existsSync(this.backupDir)
        ? fs
            .readdirSync(this.backupDir)
            .filter((file) => file.startsWith('workspace-') && file.endsWith('.json'))
            .map((file) => {
              try {
                return fs.statSync(path.join(this.backupDir, file)).mtimeMs
              } catch {
                return 0
              }
            })
            .sort((left, right) => right - left)[0] || 0
        : 0
      if (Date.now() - newest < BACKUP_INTERVAL_MS) return
      fs.mkdirSync(this.backupDir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      fs.copyFileSync(this.filePath, path.join(this.backupDir, `workspace-${stamp}.json`))
      this.pruneBackups(MAX_AUTO_BACKUPS)
    } catch (error) {
      console.warn('Failed to create workspace backup:', error.message)
    }
  }

  pruneBackups(limit) {
    try {
      const files = fs
        .readdirSync(this.backupDir)
        .filter((file) => file.startsWith('workspace-') && file.endsWith('.json'))
        .map((file) => ({
          file,
          mtime: fs.statSync(path.join(this.backupDir, file)).mtimeMs,
        }))
        .sort((left, right) => right.mtime - left.mtime)
      for (const entry of files.slice(limit)) {
        fs.rmSync(path.join(this.backupDir, entry.file), { force: true })
      }
    } catch (error) {
      console.warn('Failed to prune workspace backups:', error.message)
    }
  }

  createBackup(label = 'manual') {
    if (!fs.existsSync(this.filePath)) return null
    fs.mkdirSync(this.backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeLabel = cleanString(label, 20).replace(/[^\w-]+/g, '') || 'manual'
    const fileName = `workspace-${stamp}-${safeLabel}.json`
    fs.copyFileSync(this.filePath, path.join(this.backupDir, fileName))
    this.pruneBackups(MAX_AUTO_BACKUPS + 10)
    return this.describeBackup(fileName)
  }

  describeBackup(fileName) {
    const filePath = path.join(this.backupDir, fileName)
    const stat = fs.statSync(filePath)
    let summary = { assignments: 0, experiments: 0, courses: 0 }
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      summary = {
        assignments: Array.isArray(parsed.assignments) ? parsed.assignments.length : 0,
        experiments: Array.isArray(parsed.experiments) ? parsed.experiments.length : 0,
        courses: Array.isArray(parsed.courses) ? parsed.courses.length : 0,
      }
    } catch {
      summary = null
    }
    return { fileName, size: stat.size, createdAt: stat.mtime.toISOString(), summary }
  }

  listBackups() {
    if (!fs.existsSync(this.backupDir)) return []
    return fs
      .readdirSync(this.backupDir)
      .filter((file) => file.startsWith('workspace-') && file.endsWith('.json'))
      .map((file) => {
        try {
          return this.describeBackup(file)
        } catch {
          return null
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 40)
  }

  restoreBackup(fileName) {
    const safeName = path.basename(cleanString(fileName, 200))
    const filePath = path.join(this.backupDir, safeName)
    if (!safeName.startsWith('workspace-') || !fs.existsSync(filePath)) {
      throw new Error('没有找到这个备份文件。')
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    this.autoBackup()
    this.data = this.normalizeData(parsed)
    this.save()
    return this.get()
  }

  exportSnapshot(targetPath) {
    const target = cleanString(targetPath, 2048)
    if (!target) throw new Error('缺少导出位置。')
    const payload = {
      format: 'zp-workbench-snapshot',
      snapshotVersion: 1,
      exportedAt: new Date().toISOString(),
      workspace: this.get(),
    }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return { filePath: target, size: fs.statSync(target).size }
  }

  importSnapshot(sourcePath) {
    const source = cleanString(sourcePath, 2048)
    if (!source || !fs.existsSync(source)) throw new Error('没有找到要导入的快照文件。')
    const parsed = JSON.parse(fs.readFileSync(source, 'utf8'))
    const workspace = parsed?.workspace || parsed
    if (!workspace || typeof workspace !== 'object' || !Array.isArray(workspace.assignments)) {
      throw new Error('这个文件不是有效的工作站快照。')
    }
    this.autoBackup()
    this.data = this.normalizeData(workspace)
    this.save()
    return this.get()
  }

  importWorkspaceData(source) {
    if (!source || typeof source !== 'object' || !Array.isArray(source.assignments)) {
      throw new Error('备份中的工作站数据无效。')
    }
    this.autoBackup()
    this.data = this.normalizeData(source)
    this.save()
    return this.get()
  }

  healthCheck() {
    const missing = []
    for (const item of this.data.experiments) {
      let exists = false
      try {
        exists = fs.statSync(item.filePath).isFile()
      } catch {
        exists = false
      }
      if (!exists) {
        missing.push({
          id: item.id,
          title: item.title,
          group: item.group,
          filePath: item.filePath,
        })
      }
    }
    return {
      checkedAt: new Date().toISOString(),
      total: this.data.experiments.length,
      missing,
      healthy: missing.length === 0,
    }
  }

  save() {
    this.linkCourses()
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    this.autoBackup()
    const temporary = `${this.filePath}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    fs.renameSync(temporary, this.filePath)
  }
}

module.exports = { WorkspaceStore }

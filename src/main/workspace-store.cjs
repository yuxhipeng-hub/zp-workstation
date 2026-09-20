const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const ASSIGNMENT_STATUSES = new Set(['inbox', 'doing', 'done'])
const ASSIGNMENT_PRIORITIES = new Set(['low', 'medium', 'high'])

const DEFAULT_WORKSPACE = {
  version: 1,
  assignments: [],
  knowledge: [],
  experiments: [],
}

function cleanString(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function cleanDate(value) {
  const text = cleanString(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function cleanTags(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(',')
  return [...new Set(source.map((tag) => cleanString(tag, 24)).filter(Boolean))].slice(0, 12)
}

function cleanAssignment(input, existing = {}) {
  const title = cleanString(input.title, 120)
  if (!title) throw new Error('作业标题不能为空。')
  const status = ASSIGNMENT_STATUSES.has(input.status) ? input.status : existing.status || 'inbox'
  const priority = ASSIGNMENT_PRIORITIES.has(input.priority)
    ? input.priority
    : existing.priority || 'medium'
  const now = new Date().toISOString()
  return {
    id: existing.id || randomUUID(),
    title,
    course: cleanString(input.course, 80),
    dueAt: cleanDate(input.dueAt),
    priority,
    status,
    notes: cleanString(input.notes, 2000),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  }
}

function cleanKnowledge(input, existing = {}) {
  const title = cleanString(input.title, 120)
  if (!title) throw new Error('知识卡标题不能为空。')
  const now = new Date().toISOString()
  return {
    id: existing.id || randomUUID(),
    title,
    content: cleanString(input.content, 12000),
    course: cleanString(input.course, 80),
    tags: cleanTags(input.tags),
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
    size: Number.isFinite(size) && size >= 0 ? Math.round(size) : 0,
    modifiedAt: cleanString(input.modifiedAt, 40),
    importedAt: existing.importedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

class WorkspaceStore {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, 'workspace.json')
    this.data = this.load()
  }

  load() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      return {
        version: 1,
        assignments: Array.isArray(stored.assignments) ? stored.assignments : [],
        knowledge: Array.isArray(stored.knowledge) ? stored.knowledge : [],
        experiments: Array.isArray(stored.experiments) ? stored.experiments : [],
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to read workspace data, using defaults:', error)
      }
      return structuredClone(DEFAULT_WORKSPACE)
    }
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

  createKnowledge(input) {
    this.data.knowledge.unshift(cleanKnowledge(input || {}))
    this.save()
    return this.get()
  }

  updateKnowledge(id, patch) {
    const index = this.data.knowledge.findIndex((item) => item.id === id)
    if (index === -1) throw new Error('没有找到这张知识卡。')
    this.data.knowledge[index] = cleanKnowledge(
      { ...this.data.knowledge[index], ...(patch || {}) },
      this.data.knowledge[index],
    )
    this.save()
    return this.get()
  }

  deleteKnowledge(id) {
    this.data.knowledge = this.data.knowledge.filter((item) => item.id !== id)
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
        },
        { ...item, updatedAt: now },
      )
    })
    this.save()
    return this.get()
  }

  deleteExperiment(id) {
    this.data.experiments = this.data.experiments.filter((item) => item.id !== id)
    this.save()
    return this.get()
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.tmp`
    fs.writeFileSync(temporary, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
    fs.renameSync(temporary, this.filePath)
  }
}

module.exports = { WorkspaceStore }

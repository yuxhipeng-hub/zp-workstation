const { randomUUID } = require('node:crypto')
const STAGES = ['选题', '简报', '视觉打样', '开发', '成片', '验收', '发布', '复盘']
const STATES = [
  'pending',
  'running',
  'review',
  'blocked',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
  'unknown',
]
const text = (v, n = 2000) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const date = (v) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : ''
const number = (v) =>
  v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null
const list = (v, clean) =>
  (Array.isArray(v) ? v : [])
    .slice(0, 500)
    .filter((x) => x && typeof x === 'object')
    .map(clean)
const id = (v) => text(v, 100) || randomUUID()
function artifact(x) {
  return {
    id: id(x.id),
    family: text(x.family, 100) || '作品',
    type: ['image', 'video', 'text', 'interactive'].includes(x.type) ? x.type : 'text',
    label: text(x.label, 100),
    path: text(x.path, 2048),
    url: text(x.url, 2048),
    source: text(x.source, 100),
    sourceVersion: text(x.sourceVersion, 200),
    createdAt: date(x.createdAt),
    taskId: text(x.taskId, 100),
    runId: text(x.runId, 100),
    digest: text(x.digest, 64),
    size: number(x.size),
    acceptance: ['approved', 'pending'].includes(x.acceptance) ? x.acceptance : 'pending',
    acceptedDigest: text(x.acceptedDigest, 64),
    acceptedAt: date(x.acceptedAt),
  }
}
function task(x) {
  return {
    id: id(x.id),
    goal: text(x.goal),
    status: STATES.includes(x.status) ? x.status : 'unknown',
    artifactId: text(x.artifactId, 100),
    blockedReason: text(x.blockedReason),
    createdAt: date(x.createdAt),
    updatedAt: date(x.updatedAt),
  }
}
function run(x) {
  return {
    id: id(x.id),
    source: text(x.source, 100),
    status: STATES.includes(x.status) ? x.status : 'unknown',
    taskId: text(x.taskId, 100),
    description: text(x.description),
    startedAt: date(x.startedAt),
    endedAt: date(x.endedAt),
    updatedAt: date(x.updatedAt),
    frames: number(x.frames),
    totalFrames: number(x.totalFrames),
    error: text(x.error, 8000),
    memoryMB: number(x.memoryMB),
    vramMB: number(x.vramMB),
    sampledAt: date(x.sampledAt),
    scope: text(x.scope, 200),
  }
}
function review(x) {
  return {
    id: id(x.id),
    artifactId: text(x.artifactId, 100),
    time: number(x.time),
    problem: text(x.problem),
    expected: text(x.expected),
    priority: x.priority === 'suggestion' ? 'suggestion' : 'required',
    status: ['open', 'doing', 'recheck', 'resolved'].includes(x.status) ? x.status : 'open',
    resolvedArtifactId: text(x.resolvedArtifactId, 100),
    resolvedDigest: text(x.resolvedDigest, 64),
    createdAt: date(x.createdAt),
    updatedAt: date(x.updatedAt),
    history: list(x.history, (h) => ({
      at: date(h.at),
      status: text(h.status, 30),
      artifactId: text(h.artifactId, 100),
    })),
  }
}
function publication(x) {
  return {
    id: id(x.id),
    platform: text(x.platform, 100),
    url: text(x.url, 2048),
    publishedAt: date(x.publishedAt),
    artifactId: text(x.artifactId, 100),
    hours: number(x.hours),
    cost: number(x.cost),
    notes: text(x.notes, 8000),
    observations: list(x.observations, (o) => ({
      id: id(o.id),
      observedAt: date(o.observedAt),
      views: number(o.views),
      likes: number(o.likes),
      comments: number(o.comments),
      shares: number(o.shares),
      favorites: number(o.favorites),
      followers: number(o.followers),
    })),
  }
}
function cleanProject(x = {}) {
  return {
    id: id(x.id),
    name: text(x.name, 120),
    goal: text(x.goal),
    brief: text(x.brief, 8000),
    stage: STAGES.includes(x.stage) ? x.stage : '选题',
    directory: text(x.directory, 2048),
    externalId: text(x.externalId, 100),
    sourceVersion: text(x.sourceVersion, 200),
    externalUpdatedAt: date(x.externalUpdatedAt),
    createdAt: date(x.createdAt),
    updatedAt: date(x.updatedAt),
    archived: x.archived === true,
    selectedArtifactId: text(x.selectedArtifactId, 100),
    tasks: list(x.tasks, task),
    runs: list(x.runs, run),
    artifacts: list(x.artifacts, artifact),
    reviews: list(x.reviews, review),
    publications: list(x.publications, publication),
    activity: list(x.activity, (a) => ({ at: date(a.at), message: text(a.message, 200) })).slice(
      0,
      80,
    ),
  }
}
function cleanProjects(v) {
  return list(v, cleanProject)
    .filter((x) => x.name)
    .slice(0, 100)
    .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
}
module.exports = {
  STAGES,
  STATES,
  text,
  date,
  number,
  cleanProject,
  cleanProjects,
  artifact,
  task,
  run,
  review,
  publication,
}

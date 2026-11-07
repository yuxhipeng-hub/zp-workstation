const { createHash, randomUUID } = require('node:crypto')
const text = (v, n = 12000) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
const fields = (x, keys) => Object.fromEntries(keys.map((k) => [k, text(x?.[k])]))
const finite = (v, fallback = 0) =>
  Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const list = (v, fn) => (Array.isArray(v) ? v : []).slice(0, 500).map(fn)
const id = (x) => text(x, 100)
const now = () => new Date().toISOString()
const briefKeys = [
  'idea',
  'audience',
  'platform',
  'duration',
  'ratio',
  'style',
  'music',
  'dialogue',
  'subtitles',
  'references',
  'mustKeep',
  'forbidden',
]
const shotKeys = [
  'story',
  'purpose',
  'framing',
  'camera',
  'movement',
  'positions',
  'action',
  'cause',
  'reaction',
  'motion',
  'palette',
  'entities',
  'continuity',
  'risks',
]
const promptKeys = [
  'style',
  'camera',
  'composition',
  'characters',
  'action',
  'sound',
  'constraints',
]
function shot(x = {}) {
  return {
    id: id(x.id) || randomUUID(),
    ...fields(x, shotKeys),
    start: finite(x.start),
    duration: finite(x.duration, 5),
    generationDuration: finite(x.generationDuration, 5),
    firstFrame: id(x.firstFrame),
    lastFrame: id(x.lastFrame),
    video: id(x.video),
    subjectX: Math.min(100, finite(x.subjectX, 50)),
    subjectY: Math.min(100, finite(x.subjectY, 55)),
    subjectScale: Math.min(70, Math.max(5, finite(x.subjectScale, 25))),
    backgroundColor: color(x.backgroundColor, '#d9d9d9'),
    subjectColor: color(x.subjectColor, '#444444'),
    accentColor: color(x.accentColor, '#999999'),
    ...Object.fromEntries(['prompt'].map((k) => [k, fields(x[k], promptKeys)])),
  }
}
function content(x = {}) {
  return {
    brief: fields(x.brief, briefKeys),
    story: text(x.story),
    style: text(x.style),
    characters: text(x.characters),
    scenes: text(x.scenes),
    props: text(x.props),
    colors: text(x.colors),
    references: list(x.references, id),
    designs: list(x.designs, (y) => ({
      id: id(y.id),
      type: ['character', 'scene', 'prop'].includes(y.type) ? y.type : 'character',
      ...fields(y, ['name', 'appearance', 'clothes', 'accessories', 'laterality', 'expressions']),
      references: list(y.references, id),
    })),
    shots: list(x.shots, shot),
  }
}
function color(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}
function cleanVideo(v) {
  if (!v || v.schemaVersion !== 1) return null
  return {
    schemaVersion: 1,
    revision: id(v.revision),
    content: content(v.content),
    confirmedStory: text(v.confirmedStory, 64),
    confirmedDesign: text(v.confirmedDesign, 64),
    history: list(v.history, (x) => ({
      id: id(x.id),
      at: text(x.at, 40),
      digest: text(x.digest, 64),
      content: content(x.content),
    })),
    audits: list(v.audits, (x) => ({
      id: id(x.id),
      shotId: id(x.shotId),
      digest: text(x.digest, 64),
      at: text(x.at, 40),
      threadId: id(x.threadId),
      revision: id(x.revision),
      status: ['pass', 'fail', 'unknown'].includes(x.status) ? x.status : 'unknown',
      checks: list(x.checks, (y) => ({
        ...fields(y, ['check', 'result', 'issue', 'location', 'severity', 'suggestion']),
      })),
      summary: text(x.summary),
    })),
    sessions: list(v.sessions, (x) => ({
      ...fields(x, [
        'id',
        'threadId',
        'turnId',
        'role',
        'status',
        'error',
        'startedAt',
        'endedAt',
        'revision',
      ]),
      messages: list(x.messages, (y) => ({ ...fields(y, ['type', 'text', 'at']) })),
      result: text(x.result, 60000),
    })),
    jobs: list(v.jobs, (x) => ({
      ...fields(x, [
        'id',
        'shotId',
        'digest',
        'status',
        'taskId',
        'error',
        'createdAt',
        'updatedAt',
        'artifactId',
        'model',
        'resolution',
        'ratio',
        'rateSource',
        'capability',
        'usageTokens',
        'revision',
        'boardVersion',
        'designVersion',
        'promptVersion',
      ]),
      estimate: finite(x.estimate),
      rate: finite(x.rate),
      reserveFactor: finite(x.reserveFactor, 1.5),
      reserve: finite(x.reserve),
      settled: x.settled == null ? null : finite(x.settled),
      duration: finite(x.duration),
      audio: x.audio === true,
      request: fields(x.request, ['prompt', 'firstFrame', 'lastFrame']),
      images: list(x.images, (y) => ({
        id: id(y.id),
        digest: text(y.digest, 64),
        width: finite(y.width),
        height: finite(y.height),
        size: finite(y.size),
      })),
      stopped: x.stopped === true,
    })),
    budget: finite(v.budget),
    config: {
      ...fields(v.config, ['model', 'resolution', 'ratio', 'rateSource', 'capability']),
      rate: finite(v.config?.rate),
      reserveFactor: Math.max(1, finite(v.config?.reserveFactor, 1.5)),
      audio: v.config?.audio === true,
    },
    edit: {
      ...audioEdit(v.edit),
      width: finite(v.edit?.width, 1280),
      height: finite(v.edit?.height, 720),
      fps: finite(v.edit?.fps, 24),
      clips: list(v.edit?.clips, (x) => ({
        shotId: id(x.shotId),
        artifactId: id(x.artifactId),
        in: finite(x.in),
        out: finite(x.out),
        volume: finite(x.volume, 1),
        fade: finite(x.fade),
        brightness: Math.min(0.2, finite(x.brightness)),
        saturation: Math.min(2, finite(x.saturation, 1)),
        subtitle: text(x.subtitle, 300),
      })),
    },
    exports: list(v.exports, (x) => ({
      ...fields(x, ['id', 'status', 'artifactId', 'error', 'at', 'digest', 'contentDigest']),
      report: text(x.report, 60000),
      edit: cleanEdit(x.edit),
      content: content(x.content),
    })),
  }
}
function cleanEdit(x) {
  return {
    ...audioEdit(x),
    width: finite(x?.width, 1280),
    height: finite(x?.height, 720),
    fps: finite(x?.fps, 24),
    clips: list(x?.clips, (y) => ({
      ...fields(y, ['shotId', 'artifactId', 'subtitle']),
      in: finite(y.in),
      out: finite(y.out),
      volume: finite(y.volume, 1),
      fade: finite(y.fade),
      brightness: finite(y.brightness),
      saturation: finite(y.saturation, 1),
    })),
  }
}
function audioEdit(x) {
  return {
    audioArtifactId: id(x?.audioArtifactId),
    audioMode: x?.audioMode === 'replace' ? 'replace' : 'mix',
    audioVolume: finite(x?.audioVolume, 1),
    audioIn: finite(x?.audioIn),
    audioFade: finite(x?.audioFade),
  }
}
function freshVideo() {
  return cleanVideo({ schemaVersion: 1, revision: randomUUID(), config: { reserveFactor: 1.5 } })
}
function shotDigest(v, s, p) {
  const refs = [
    ...v.content.references,
    ...v.content.designs.flatMap((d) => d.references),
    s.firstFrame,
    s.lastFrame,
  ]
    .filter(Boolean)
    .map((id) => {
      const a = p.artifacts.find((a) => a.id === id)
      return { id, digest: a?.digest || 'missing' }
    })
  return digest({
    brief: v.content.brief,
    story: v.content.story,
    style: v.content.style,
    characters: v.content.characters,
    scenes: v.content.scenes,
    props: v.content.props,
    colors: v.content.colors,
    designs: v.content.designs,
    shot: { ...s, video: '' },
    order: v.content.shots.map((x) => x.id),
    neighbors: v.content.shots
      .filter((_x, i) => Math.abs(i - v.content.shots.findIndex((x) => x.id === s.id)) === 1)
      .map((x) => ({ ...x, video: '' })),
    refs,
  })
}
function ledger(v) {
  const settled = v.jobs.reduce((n, j) => n + (j.settled ?? 0), 0)
  const reserved = v.jobs.filter((j) => j.settled == null).reduce((n, j) => n + j.reserve, 0)
  return {
    settled,
    reserved,
    remaining: Math.max(0, v.budget - settled - reserved),
    unknown: v.jobs.filter(
      (j) =>
        j.settled == null &&
        ['unknown', 'succeeded', 'failed', 'expired', 'cancelled'].includes(j.status),
    ).length,
  }
}
module.exports = {
  text,
  fields,
  digest,
  now,
  briefKeys,
  shotKeys,
  promptKeys,
  shot,
  content,
  cleanVideo,
  freshVideo,
  shotDigest,
  ledger,
  cleanEdit,
}

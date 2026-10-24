const fsp = require('node:fs/promises')
const JSZip = require('jszip')

const MAX_LOG_BYTES = 256 * 1024
const REDACTED_KEY = /(password|secret|token|api[-_]?key)/i

/** 递归遮蔽设置里的敏感字段；当前设置并不存 Key，但同步密码等字段可能有历史残留。 */
function redactSettings(settings = {}) {
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      const next = {}
      for (const [key, item] of Object.entries(value)) {
        next[key] = REDACTED_KEY.test(key) ? '（已隐藏）' : walk(item)
      }
      return next
    }
    return value
  }
  return walk(JSON.parse(JSON.stringify(settings)))
}

function workspaceSummary(workspace = {}) {
  return {
    structureVersion: workspace.version ?? null,
    courses: (workspace.courses || []).length,
    assignments: (workspace.assignments || []).length,
    experiments: (workspace.experiments || []).length,
    knowledge: (workspace.knowledge || []).length,
    experimentGroups: (workspace.experimentGroups || []).length,
    scheduleCourses: (workspace.schedule?.courses || []).length,
  }
}

async function readLogTail(logFile, maxBytes = MAX_LOG_BYTES) {
  if (!logFile) return ''
  try {
    const stat = await fsp.stat(logFile)
    if (!stat.isFile() || stat.size === 0) return ''
    const length = Math.min(stat.size, maxBytes)
    const handle = await fsp.open(logFile, 'r')
    try {
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, stat.size - length)
      return buffer.toString('utf8')
    } finally {
      await handle.close()
    }
  } catch {
    return ''
  }
}

function readmeText(manifest) {
  return [
    'ZP Workbench 诊断包',
    '',
    `生成时间：${manifest.generatedAt}`,
    '包含内容：',
    '- manifest.json：应用、系统和运行时版本',
    '- settings.json：脱敏后的设置（密码、Token、Key 一律显示为「已隐藏」）',
    '- workspace-summary.json：课程、作业、资料、课表的数量，不含具体内容',
    '- logs/workbench.log：应用日志的最近 256 KB',
    '',
    '隐私说明：',
    '- 不含 API Key、同步密码或加密凭据',
    '- 不含作业标题、资料文件内容等具体学习数据',
    '- 设置与日志里可能包含本机目录路径',
    '- 这个压缩包只保存到你自己选择的位置，应用不会上传',
    '',
  ].join('\n')
}

/**
 * @param {{
 *   appInfo?: Record<string, any>,
 *   settings?: Record<string, any>,
 *   workspace?: Record<string, any>,
 *   logFile?: string,
 *   generatedAt?: Date,
 * }} options
 */
async function collectDiagnostics({
  appInfo = {},
  settings = {},
  workspace = {},
  logFile = '',
  generatedAt = new Date(),
}) {
  const manifest = {
    generatedAt: generatedAt.toISOString(),
    app: {
      name: 'ZP Workbench',
      version: appInfo.appVersion || '',
      electron: appInfo.electronVersion || '',
      chrome: appInfo.chromeVersion || '',
      locale: appInfo.locale || '',
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      release: process.getSystemVersion?.() || '',
      node: process.versions.node,
    },
  }

  const logTail = await readLogTail(logFile)
  const zip = new JSZip()
  zip.file('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
  zip.file('settings.json', `${JSON.stringify(redactSettings(settings), null, 2)}\n`)
  zip.file('workspace-summary.json', `${JSON.stringify(workspaceSummary(workspace), null, 2)}\n`)
  zip.file('logs/workbench.log', logTail || '（没有可读取的日志）\n')
  zip.file('README.txt', readmeText(manifest))

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return { buffer, manifest, logBytes: Buffer.byteLength(logTail, 'utf8') }
}

module.exports = {
  MAX_LOG_BYTES,
  collectDiagnostics,
  readLogTail,
  redactSettings,
  workspaceSummary,
}

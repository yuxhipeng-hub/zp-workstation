const fsp = require('node:fs/promises')
const path = require('node:path')
const { fileURLToPath } = require('node:url')

const MAX_REFERENCE_LENGTH = 64 * 1024
const MAX_REFERENCES = 64

function decodeHtmlEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function stripWrappingQuotes(value) {
  return value.trim().replace(/^(?:"|'|`)+|(?:"|'|`)+$/g, '')
}

function addCandidate(target, value) {
  const candidate = stripWrappingQuotes(String(value || ''))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
  if (!candidate || candidate.length > 32 * 1024) return
  if (!target.includes(candidate)) target.push(candidate)
}

function extractDropReferenceCandidates(value) {
  if (typeof value !== 'string' || !value.trim()) return []
  const text = decodeHtmlEntities(value.slice(0, MAX_REFERENCE_LENGTH))
  const candidates = []

  const attributePattern = /(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi
  for (const match of text.matchAll(attributePattern)) {
    addCandidate(candidates, match[1] || match[2] || match[3])
  }

  const fileUriPattern = /file:(?:\/\/\/|\/\/)[^\s"'<>]+/gi
  for (const match of text.matchAll(fileUriPattern)) {
    addCandidate(candidates, match[0])
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    addCandidate(candidates, line)
  }

  const absolutePathPattern = /(?:[A-Za-z]:[\\/]|\\\\)[^<>"|?*\r\n]+/g
  for (const match of text.matchAll(absolutePathPattern)) {
    addCandidate(candidates, match[0])
  }

  return candidates
}

function decodeUriPath(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function toFilesystemPath(value) {
  let candidate = stripWrappingQuotes(decodeHtmlEntities(String(value || '')))
  if (!candidate) return ''

  if (/^file:/i.test(candidate)) {
    try {
      return fileURLToPath(new URL(candidate))
    } catch {
      candidate = decodeUriPath(
        candidate.replace(/^file:\/\/(?:localhost)?/i, '').replace(/^file:/i, ''),
      )
    }
  } else {
    candidate = decodeUriPath(candidate)
  }

  if (/^\/[A-Za-z]:[\\/]/.test(candidate)) candidate = candidate.slice(1)
  if (/^[A-Za-z]:[\\/]/.test(candidate) || candidate.startsWith('\\\\')) {
    return path.normalize(candidate)
  }
  return path.isAbsolute(candidate) ? path.normalize(candidate) : ''
}

async function resolveDropReferences(values, options = {}) {
  const readStat = options.stat || fsp.stat
  const input = Array.isArray(values) ? values.slice(0, MAX_REFERENCES) : [values]
  const resolved = []
  const seen = new Set()

  for (const value of input) {
    const candidates = extractDropReferenceCandidates(value)
    for (const candidate of candidates) {
      const filePath = toFilesystemPath(candidate)
      if (!filePath || !path.isAbsolute(filePath)) continue
      const absolutePath = path.resolve(filePath)
      const key = process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath
      if (seen.has(key)) continue
      seen.add(key)

      try {
        const stats = await readStat(absolutePath)
        if (!stats.isFile()) continue
        resolved.push({
          path: absolutePath,
          name: path.basename(absolutePath),
          size: stats.size,
        })
      } catch {
        // WPS may provide stale temp paths. Keep trying the remaining references.
      }
    }
  }

  return resolved
}

module.exports = {
  extractDropReferenceCandidates,
  resolveDropReferences,
  toFilesystemPath,
}

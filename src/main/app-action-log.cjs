const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

function sanitizeValue(value, key = '') {
  if (/password|passwd|secret|token|api.?key/i.test(key)) return '<redacted>'
  if (typeof value === 'string') {
    return value
      .replaceAll(os.homedir(), '%USERPROFILE%')
      .replaceAll(os.tmpdir(), '%TEMP%')
      .slice(0, 1000)
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeValue(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([childKey, childValue]) => [childKey, sanitizeValue(childValue, childKey)]),
    )
  }
  return value
}

class AppActionLog {
  constructor(userDataDir, { maxEntries = 5000, retentionDays = 30 } = {}) {
    this.filePath = path.join(userDataDir, 'tool-actions.jsonl')
    this.maxEntries = maxEntries
    this.retentionDays = retentionDays
  }

  append(entry = {}) {
    const record = {
      id: randomUUID(),
      at: new Date().toISOString(),
      appId: String(entry.appId || ''),
      sessionId: String(entry.sessionId || ''),
      displayName: String(entry.displayName || '').slice(0, 120),
      kind: String(entry.kind || 'action').slice(0, 80),
      action: String(entry.action || '').slice(0, 160),
      selector:
        entry.selector && typeof entry.selector === 'object' ? sanitizeValue(entry.selector) : null,
      effect: String(entry.effect || '').slice(0, 40),
      confirmed: Boolean(entry.confirmed),
      error: sanitizeValue(String(entry.error || '').slice(0, 800)),
      detail: entry.detail && typeof entry.detail === 'object' ? sanitizeValue(entry.detail) : null,
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8')
    this.trim()
    return record
  }

  clear() {
    try {
      fs.rmSync(this.filePath, { force: true })
    } catch {
      // Clearing an already missing log is harmless.
    }
    return true
  }

  list({ sessionId = '', limit = 100 } = {}) {
    const max = Math.min(500, Math.max(1, Number(limit) || 100))
    const records = []
    try {
      for (const line of fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const record = JSON.parse(line)
          if (sessionId && record.sessionId !== sessionId) continue
          records.push(record)
        } catch {
          // Ignore a torn final line or manually damaged entry.
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    return records.slice(-max).reverse()
  }

  trim() {
    let records
    try {
      records = fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/).filter(Boolean)
    } catch {
      return
    }
    const cutoff =
      this.retentionDays > 0 ? Date.now() - this.retentionDays * 24 * 60 * 60 * 1000 : 0
    const retained = records.filter((line) => {
      try {
        return Date.parse(JSON.parse(line).at) >= cutoff
      } catch {
        return false
      }
    })
    if (retained.length <= this.maxEntries) {
      if (retained.length === records.length) return
      const temporary = `${this.filePath}.tmp`
      fs.writeFileSync(temporary, retained.length ? `${retained.join('\n')}\n` : '', 'utf8')
      fs.renameSync(temporary, this.filePath)
      return
    }
    const temporary = `${this.filePath}.tmp`
    fs.writeFileSync(temporary, `${retained.slice(-this.maxEntries).join('\n')}\n`, 'utf8')
    fs.renameSync(temporary, this.filePath)
  }
}

module.exports = { AppActionLog, sanitizeValue }

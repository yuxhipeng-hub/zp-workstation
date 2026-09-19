const EventEmitter = require('node:events')
const fs = require('node:fs')
const path = require('node:path')

class Logger extends EventEmitter {
  constructor(userDataDir) {
    super()
    this.logDir = path.join(userDataDir, 'logs')
    this.logFile = path.join(this.logDir, 'launcher.log')
    this.entries = []
    fs.mkdirSync(this.logDir, { recursive: true })
  }

  write(scope, level, message) {
    const clean = String(message ?? '').replace(/\r/g, '')
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      scope,
      level,
      message: clean,
    }
    this.entries.push(entry)
    if (this.entries.length > 800) this.entries.shift()
    try {
      fs.appendFileSync(
        this.logFile,
        `${entry.at} [${level.toUpperCase()}] [${scope}] ${clean}\n`,
        'utf8',
      )
    } catch (error) {
      console.error('Unable to write launcher log:', error)
    }
    this.emit('entry', entry)
    return entry
  }

  info(scope, message) {
    return this.write(scope, 'info', message)
  }

  warn(scope, message) {
    return this.write(scope, 'warn', message)
  }

  error(scope, message) {
    return this.write(scope, 'error', message)
  }

  list(limit = 300) {
    return this.entries.slice(-limit)
  }

  clear() {
    this.entries = []
    try {
      fs.writeFileSync(this.logFile, '', 'utf8')
    } catch (error) {
      console.error('Unable to clear launcher log:', error)
    }
  }
}

module.exports = { Logger }

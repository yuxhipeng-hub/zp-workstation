const EventEmitter = require('node:events')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

function samePath(left, right) {
  return (
    path.resolve(left).toLocaleLowerCase('zh-CN') === path.resolve(right).toLocaleLowerCase('zh-CN')
  )
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

async function moveEntry(source, targetDirectory) {
  const destination = await uniqueDestination(targetDirectory, path.basename(source))
  try {
    await fsp.rename(source, destination)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    await fsp.copyFile(source, destination)
    await fsp.unlink(source)
  }
  return destination
}

class Logger extends EventEmitter {
  constructor(userDataDir, preferredLogDir = '') {
    super()
    this.defaultLogDir = path.join(userDataDir, 'logs')
    const requested = String(preferredLogDir || '').trim()
    this.logDir = this.defaultLogDir
    try {
      this.logDir = requested ? path.resolve(requested) : this.defaultLogDir
      fs.mkdirSync(this.logDir, { recursive: true })
    } catch (error) {
      console.warn('Unable to use the configured log directory, falling back:', error.message)
      this.logDir = this.defaultLogDir
      fs.mkdirSync(this.logDir, { recursive: true })
    }
    this.logFile = path.join(this.logDir, 'workbench.log')
    const legacyLogFile = path.join(this.logDir, 'launcher.log')
    try {
      if (!fs.existsSync(this.logFile) && fs.existsSync(legacyLogFile)) {
        fs.renameSync(legacyLogFile, this.logFile)
      }
    } catch (error) {
      console.warn('Unable to rename the legacy log file:', error.message)
    }
    this.entries = []
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

  async changeDirectory(nextDir) {
    const requested = String(nextDir || '').trim()
    if (!requested || !path.isAbsolute(requested)) {
      throw new Error('日志目录必须是绝对路径。')
    }
    const next = path.resolve(requested)
    if (samePath(this.logDir, next)) {
      return { oldDir: this.logDir, newDir: this.logDir, movedFiles: 0 }
    }
    if (isPathInside(this.logDir, next) || isPathInside(next, this.logDir)) {
      throw new Error('新日志目录不能与当前目录互相包含，请选择另一个位置。')
    }
    await fsp.mkdir(next, { recursive: true })
    const entries = await fsp.readdir(this.logDir, { withFileTypes: true }).catch(() => [])
    let movedFiles = 0
    for (const entry of entries) {
      if (!entry.isFile()) continue
      await moveEntry(path.join(this.logDir, entry.name), next)
      movedFiles += 1
    }
    const oldDir = this.logDir
    this.logDir = next
    this.logFile = path.join(next, 'workbench.log')
    const legacyLogFile = path.join(next, 'launcher.log')
    if (!fs.existsSync(this.logFile) && fs.existsSync(legacyLogFile)) {
      await fsp.rename(legacyLogFile, this.logFile).catch(() => {})
    }
    await fsp.rmdir(oldDir).catch(() => {})
    return { oldDir, newDir: next, movedFiles }
  }
}

module.exports = { Logger }

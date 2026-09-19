const fs = require('node:fs')
const path = require('node:path')
const { DEFAULT_SETTINGS } = require('./constants.cjs')

class SettingsStore {
  constructor(userDataDir) {
    this.filePath = path.join(userDataDir, 'settings.json')
    this.data = this.load()
  }

  load() {
    try {
      const stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      return { ...DEFAULT_SETTINGS, ...stored }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to read settings, using defaults:', error)
      }
      return { ...DEFAULT_SETTINGS }
    }
  }

  get() {
    return { ...this.data, updateHistory: [...(this.data.updateHistory || [])] }
  }

  patch(patch) {
    this.data = { ...this.data, ...patch }
    this.save()
    return this.get()
  }

  reset() {
    this.data = { ...DEFAULT_SETTINGS }
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

module.exports = { SettingsStore }

const fs = require('node:fs')
const path = require('node:path')

class AiSecretStore {
  constructor(userDataDir, safeStorage) {
    this.safeStorage = safeStorage
    this.secretFile = path.join(path.resolve(userDataDir), 'ai-secrets.bin')
  }

  loadSecrets() {
    try {
      const encrypted = fs.readFileSync(this.secretFile)
      if (!this.safeStorage?.isEncryptionAvailable?.()) return {}
      const parsed = JSON.parse(this.safeStorage.decryptString(encrypted))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Unable to read encrypted AI credentials:', error.message)
      }
      return {}
    }
  }

  saveSecrets(secrets) {
    if (!this.safeStorage?.isEncryptionAvailable?.()) {
      throw new Error('当前系统无法使用安全凭据存储，不能保存模型 API Key。')
    }
    const encrypted = this.safeStorage.encryptString(JSON.stringify(secrets))
    fs.mkdirSync(path.dirname(this.secretFile), { recursive: true })
    const temporary = `${this.secretFile}.tmp`
    fs.writeFileSync(temporary, encrypted)
    fs.renameSync(temporary, this.secretFile)
  }

  has(id) {
    return Boolean(this.get(id))
  }

  get(id) {
    return String(this.loadSecrets()[id] || '')
  }

  set(id, value) {
    const key = String(id || '').trim()
    const secret = String(value || '').trim()
    if (!key || !secret) throw new Error('模型配置 ID 和 API Key 不能为空。')
    if (secret.length > 4096 || /[\u0000-\u001f]/.test(secret)) {
      throw new Error('API Key 格式无效。')
    }
    const secrets = this.loadSecrets()
    secrets[key] = secret
    this.saveSecrets(secrets)
  }

  delete(id) {
    const secrets = this.loadSecrets()
    if (!Object.hasOwn(secrets, id)) return false
    delete secrets[id]
    this.saveSecrets(secrets)
    return true
  }
}

module.exports = { AiSecretStore }

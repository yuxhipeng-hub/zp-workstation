const { randomUUID } = require('node:crypto')

class ToolPathGrantStore {
  constructor({ ttlMs = 5 * 60 * 1000, now = () => Date.now(), createId = randomUUID } = {}) {
    this.ttlMs = ttlMs
    this.now = now
    this.createId = createId
    this.grants = new Map()
  }

  prune() {
    for (const [id, grant] of this.grants.entries()) {
      if (grant.expiresAt < this.now()) this.grants.delete(id)
    }
  }

  issue(targetPath, senderId) {
    const path = String(targetPath || '')
    if (!path) throw new Error('没有选择可用路径。')
    this.prune()
    const grantId = this.createId()
    this.grants.set(grantId, {
      path,
      senderId,
      expiresAt: this.now() + this.ttlMs,
    })
    return { grantId, path }
  }

  consume(grantId, senderId) {
    const id = String(grantId || '')
    const grant = this.grants.get(id)
    this.grants.delete(id)
    if (!grant || grant.senderId !== senderId || grant.expiresAt < this.now()) {
      throw new Error('文件或目录授权无效或已过期。')
    }
    return grant.path
  }
}

module.exports = { ToolPathGrantStore }

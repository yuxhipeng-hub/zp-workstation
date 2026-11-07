const fs = require('node:fs/promises')
const { createWriteStream } = require('node:fs')
const { Readable, Transform } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
class SeedanceAdapter {
  constructor({ key, fetchImpl = fetch }) {
    this.key = key
    this.fetch = fetchImpl
  }
  async request(method, suffix = '', body) {
    if (!this.key()) throw new Error('请先安全保存火山方舟 API Key。')
    const r = await this.fetch(ENDPOINT + suffix, {
      method,
      headers: { Authorization: `Bearer ${this.key()}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(45000),
    })
    if (!r.ok) {
      const error = Object.assign(
        new Error(
          `火山方舟 HTTP ${r.status}：${{ 401: '凭证无效或失效', 403: '无模型权限、额度或账户限制', 429: '限流或额度不足', 400: '参数或模型能力不匹配' }[r.status] || '服务请求失败，请在控制台核查'}`,
        ),
        { definitive: [400, 401, 403, 404, 422, 429].includes(r.status) },
      )
      throw error
    }
    return r.status === 204 ? {} : /** @type {any} */ (await r.json())
  }
  check() {
    return this.request('GET', '?page_size=1')
  }
  async submit(job, images) {
    const content = [{ type: 'text', text: job.request.prompt }]
    for (const [role, file] of [
      ['first_frame', images[0]],
      ['last_frame', images[1]],
    ]) {
      if (!file) continue
      const bytes = await fs.readFile(file)
      const expected = job.images?.[role === 'first_frame' ? 0 : 1]
      if (
        expected &&
        require('node:crypto').createHash('sha256').update(bytes).digest('hex') !== expected.digest
      )
        throw Object.assign(new Error('素材已替换，提交已阻止。'), { definitive: true })
      const ext = require('node:path').extname(file).toLowerCase()
      content.push(
        /** @type {any} */ ({
          type: 'image_url',
          image_url: {
            url: `data:image/${ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : ext.slice(1)};base64,${bytes.toString('base64')}`,
          },
          role,
        }),
      )
    }
    return this.request('POST', '', {
      model: job.model,
      content,
      duration: job.duration,
      resolution: job.resolution,
      ratio: job.ratio,
      ...(job.capability?.startsWith('seedance-2') ? { generate_audio: job.audio } : {}),
      watermark: true,
    })
  }
  query(id) {
    if (!/^[\w-]{1,200}$/.test(id)) throw new Error('供应商任务 ID 无效。')
    return this.request('GET', '/' + id)
  }
  async cancel(id) {
    if (!id) throw new Error('供应商任务 ID 无效。')
    throw new Error(
      '当前供应商 DELETE 可能删除已完成任务，无法原子保证只取消排队任务。请在控制台核查操作；工作室未取消供应商任务。',
    )
  }
  async download(url, file) {
    const u = new URL(url)
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      !/(^|\.)(volces\.com|volccdn\.com|byteimg\.com|ibytedtos\.com|volcengineapi\.com)$/.test(
        u.hostname,
      )
    )
      throw new Error('结果下载地址不在供应商 HTTPS 域名范围。')
    const response = await this.fetch(u, { signal: AbortSignal.timeout(180000), redirect: 'error' })
    if (!response.ok || !response.body)
      throw new Error('结果下载失败，请重新查询任务取得有效链接。')
    let bytes = 0
    await pipeline(
      Readable.fromWeb(/** @type {any} */ (response.body)),
      new Transform({
        transform(chunk, _enc, cb) {
          bytes += chunk.length
          cb(bytes > 1024 ** 3 ? new Error('下载超过 1 GB 限制。') : null, chunk)
        },
      }),
      createWriteStream(file, { flags: 'wx' }),
    )
  }
}
module.exports = { SeedanceAdapter, ENDPOINT }

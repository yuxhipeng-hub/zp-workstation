const { randomUUID } = require('node:crypto')
const { AiSecretStore } = require('./ai-secret-store.cjs')
const { cleanAiPlan } = require('./ai-plan.cjs')
const {
  MAX_EXTRACT_TEXT_LENGTH,
  buildExtractMessages,
  cleanExtractImages,
  cleanDueDate,
  parseExtractContent,
} = require('./ai-extract.cjs')

const MAX_PROFILES = 20
const REQUEST_TIMEOUT_MS = 90_000
const MODEL_LIST_TIMEOUT_MS = 15_000
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const API_PROTOCOLS = new Set(['chat-completions', 'responses'])
const REASONING_EFFORTS = new Set(['', 'low', 'medium', 'high'])
const RESERVED_HEADERS = new Set([
  'authorization',
  'api-key',
  'connection',
  'content-length',
  'content-type',
  'host',
  'x-api-key',
  'x-auth-token',
  'x-goog-api-key',
])

function cleanText(value, maxLength) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength)
}

function normalizeBaseUrl(value) {
  const raw = cleanText(value, 2048)
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('模型接口地址不是有效 URL。')
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('模型接口只支持 HTTP 或 HTTPS。')
  }
  if (url.username || url.password) {
    throw new Error('模型接口地址不能包含用户名或密码。')
  }
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error('远程模型接口必须使用 HTTPS；本机 Ollama 等允许使用 HTTP。')
  }
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
  return url.toString().replace(/\/$/, '')
}

function isLocalBaseUrl(value) {
  try {
    return LOCAL_HOSTS.has(new URL(value).hostname)
  } catch {
    return false
  }
}

function apiEndpoint(baseUrl, protocol = 'chat-completions') {
  const suffix = protocol === 'responses' ? '/responses' : '/chat/completions'
  return `${normalizeBaseUrl(baseUrl)}${suffix}`
}

function modelsEndpoint(baseUrl) {
  const base = normalizeBaseUrl(baseUrl).replace(/\/models$/i, '')
  return `${base}/models`
}

function parseModelList(payload) {
  const source = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : []
  const models = []
  for (const item of source) {
    const id = typeof item === 'string' ? item.trim() : String(item?.id || item?.name || '').trim()
    if (!id || id.length > 160 || models.includes(id)) continue
    models.push(id)
    if (models.length >= 500) break
  }
  return models
}

function chatEndpoint(baseUrl) {
  return apiEndpoint(baseUrl, 'chat-completions')
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.round(number)))
}

function cleanHeaders(value) {
  let source = value
  if (typeof source === 'string') {
    if (!source.trim()) return {}
    try {
      source = JSON.parse(source)
    } catch {
      throw new Error('附加请求头必须是 JSON 对象。')
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}
  const headers = {}
  for (const [rawName, rawValue] of Object.entries(source).slice(0, 20)) {
    const name = String(rawName || '').trim()
    const headerValue = String(rawValue ?? '').trim()
    if (!name || !headerValue || RESERVED_HEADERS.has(name.toLowerCase())) continue
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) continue
    if (headerValue.length > 1000 || /[\u0000-\u001f\u007f]/.test(headerValue)) continue
    headers[name] = headerValue
  }
  return headers
}

function extractMessageContent(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim()
  if (Array.isArray(payload?.output)) {
    const text = payload.output
      .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
      .map((part) => part?.text || '')
      .join('')
      .trim()
    if (text) return text
  }
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim()
  }
  if (content && typeof content === 'object') return JSON.stringify(content)
  return ''
}

function messageText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text')
    .map((part) => String(part.text || ''))
    .join('\n\n')
}

function messagesHaveImages(messages) {
  return messages.some(
    (message) =>
      Array.isArray(message?.content) &&
      message.content.some((part) => part?.type === 'image_url' && part.image_url?.url),
  )
}

function toResponsesInput(messages) {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role,
      content: Array.isArray(message.content)
        ? message.content.flatMap((part) => {
            if (part?.type === 'text') {
              return [{ type: 'input_text', text: String(part.text || '') }]
            }
            if (part?.type === 'image_url') {
              return [
                {
                  type: 'input_image',
                  image_url: String(part.image_url?.url || ''),
                },
              ]
            }
            return []
          })
        : [{ type: 'input_text', text: String(message.content || '') }],
    }))
}

function parsePlanContent(content) {
  const raw = String(content || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('模型没有返回 JSON 格式的执行计划。')
  let parsed
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('模型返回的执行计划无法解析，请重试或更换模型。')
  }
  const plan = cleanAiPlan(parsed)
  if (!plan) throw new Error('模型返回的执行计划缺少有效步骤。')
  return plan
}

class AiService {
  constructor({ userDataDir, settings, safeStorage, logger = null, fetchImpl = fetch }) {
    this.settings = settings
    this.logger = logger
    this.fetchImpl = fetchImpl
    this.secrets = new AiSecretStore(userDataDir, safeStorage)
  }

  storedProfiles() {
    const profiles = this.settings.get().aiProfiles
    const cleaned = []
    for (const profile of Array.isArray(profiles) ? profiles : []) {
      try {
        const value = this.cleanProfile(profile, profile)
        if (value) cleaned.push(value)
      } catch (error) {
        this.logger?.warn?.('ai-config', `忽略无效的模型配置：${error.message}`)
      }
    }
    return cleaned
  }

  cleanProfile(input = {}, existing = {}) {
    const label = cleanText(input.label || input.name || existing.label, 80)
    const baseUrl = normalizeBaseUrl(input.baseUrl || existing.baseUrl || '')
    const model = cleanText(input.model || existing.model, 160)
    if (!label || !model) return null
    const protocol = API_PROTOCOLS.has(input.protocol)
      ? input.protocol
      : API_PROTOCOLS.has(existing.protocol)
        ? existing.protocol
        : 'chat-completions'
    const reasoningEffort = REASONING_EFFORTS.has(input.reasoningEffort)
      ? input.reasoningEffort
      : REASONING_EFFORTS.has(existing.reasoningEffort)
        ? existing.reasoningEffort
        : ''
    return {
      id: cleanText(existing.id || input.id, 80) || randomUUID(),
      label,
      baseUrl,
      model,
      protocol,
      timeoutMs: boundedInteger(
        input.timeoutMs ?? existing.timeoutMs,
        REQUEST_TIMEOUT_MS,
        5_000,
        300_000,
      ),
      contextWindow: boundedInteger(
        input.contextWindow ?? existing.contextWindow,
        0,
        0,
        10_000_000,
      ),
      maxOutputTokens: boundedInteger(
        input.maxOutputTokens ?? existing.maxOutputTokens,
        1800,
        64,
        100_000,
      ),
      temperature: Math.min(
        2,
        Math.max(
          0,
          Number.isFinite(Number(input.temperature ?? existing.temperature))
            ? Number(input.temperature ?? existing.temperature)
            : 0.2,
        ),
      ),
      reasoningEffort,
      supportsTools: Boolean(input.supportsTools ?? existing.supportsTools),
      supportsVision: Boolean(input.supportsVision ?? existing.supportsVision),
      headers: cleanHeaders(Object.hasOwn(input, 'headers') ? input.headers : existing.headers),
    }
  }

  getConfig() {
    const secrets = this.secrets.loadSecrets()
    const profiles = this.storedProfiles().map((profile) => ({
      ...profile,
      hasKey: Boolean(secrets[profile.id]),
      requiresKey: !isLocalBaseUrl(profile.baseUrl),
    }))
    const configuredActiveId = cleanText(this.settings.get().activeAiProfileId, 80)
    const activeProfileId = profiles.some((profile) => profile.id === configuredActiveId)
      ? configuredActiveId
      : profiles[0]?.id || ''
    return { profiles, activeProfileId }
  }

  persist(profiles, activeProfileId) {
    const ids = new Set(profiles.map((profile) => profile.id))
    this.settings.patch({
      aiProfiles: profiles,
      activeAiProfileId: ids.has(activeProfileId) ? activeProfileId : profiles[0]?.id || '',
    })
    return this.getConfig()
  }

  saveProfile(input = {}, apiKey = '', clearKey = false) {
    const profiles = this.storedProfiles()
    const requestedId = cleanText(input.id, 80)
    const existing = requestedId ? profiles.find((profile) => profile.id === requestedId) : null
    if (requestedId && !existing) throw new Error('没有找到这个模型配置。')
    if (!existing && profiles.length >= MAX_PROFILES) {
      throw new Error(`最多保存 ${MAX_PROFILES} 个模型配置。`)
    }
    const profile = this.cleanProfile(input, existing || {})
    if (!profile) throw new Error('请填写模型名称和模型 ID。')
    const normalizedKey = cleanText(apiKey, 4096)
    if (!existing && !normalizedKey && !isLocalBaseUrl(profile.baseUrl)) {
      throw new Error('远程模型首次添加时需要填写 API Key。')
    }
    if (clearKey && !normalizedKey) this.secrets.delete(profile.id)
    if (normalizedKey) this.secrets.set(profile.id, normalizedKey)
    const next = existing
      ? profiles.map((item) => (item.id === profile.id ? profile : item))
      : [...profiles, profile]
    return this.persist(next, this.getConfig().activeProfileId || profile.id)
  }

  deleteProfile(id) {
    const target = cleanText(id, 80)
    const profiles = this.storedProfiles()
    if (!profiles.some((profile) => profile.id === target))
      throw new Error('没有找到这个模型配置。')
    this.secrets.delete(target)
    return this.persist(
      profiles.filter((profile) => profile.id !== target),
      this.getConfig().activeProfileId,
    )
  }

  activateProfile(id) {
    const target = cleanText(id, 80)
    const profiles = this.storedProfiles()
    if (!profiles.some((profile) => profile.id === target))
      throw new Error('没有找到这个模型配置。')
    return this.persist(profiles, target)
  }

  resolveProfile(profileId = '') {
    const config = this.getConfig()
    const id = cleanText(profileId, 80) || config.activeProfileId
    const profile = config.profiles.find((item) => item.id === id)
    if (!profile) throw new Error('请先在设置中配置 AI 模型。')
    const apiKey = this.secrets.get(profile.id)
    if (!apiKey && profile.requiresKey) throw new Error('当前模型还没有保存 API Key。')
    return { ...profile, apiKey }
  }

  errorFromResponse(response, raw, payload) {
    const detail = cleanText(payload?.error?.message || payload?.message || raw, 300)
    if (response.status === 401 || response.status === 403) {
      return new Error('模型服务拒绝了这个 API Key，请检查 Key 和账户权限。')
    }
    if (response.status === 404) {
      return new Error('模型接口、协议或模型 ID 不存在，请检查 Base URL、协议和模型名称。')
    }
    if (response.status === 429) {
      return new Error('模型请求过于频繁，请稍后重试。')
    }
    if (response.status >= 500) {
      return new Error(`模型服务暂时不可用（${response.status}）。`)
    }
    return new Error(detail || `模型请求失败（${response.status}）。`)
  }

  async requestChat(profile, messages, { maxTokens = 1600, temperature = 0.2 } = {}) {
    const protocol = API_PROTOCOLS.has(profile.protocol) ? profile.protocol : 'chat-completions'
    const body = {
      model: profile.model,
      temperature: Number.isFinite(Number(profile.temperature))
        ? Number(profile.temperature)
        : temperature,
    }
    if (protocol === 'responses') {
      const instructions = messages
        .filter((message) => message.role === 'system')
        .map((message) => messageText(message.content))
        .join('\n\n')
      if (messagesHaveImages(messages)) {
        body.input = toResponsesInput(messages)
      } else {
        body.input = messages
          .filter((message) => message.role !== 'system')
          .map((message) => messageText(message.content))
          .join('\n\n')
      }
      body.max_output_tokens = maxTokens
      if (instructions) body.instructions = instructions
      if (profile.reasoningEffort) body.reasoning = { effort: profile.reasoningEffort }
    } else {
      body.messages = messages
      body.max_tokens = maxTokens
      if (profile.reasoningEffort) body.reasoning_effort = profile.reasoningEffort
    }
    let response
    try {
      response = await this.fetchImpl(apiEndpoint(profile.baseUrl, protocol), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(profile.apiKey ? { Authorization: `Bearer ${profile.apiKey}` } : {}),
          ...(profile.headers || {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(profile.timeoutMs || REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('模型请求超时，请检查网络或更换接口。')
      }
      throw new Error(`无法连接模型服务：${error.message}`)
    }
    const raw = await response.text()
    let payload = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      payload = null
    }
    if (!response.ok) throw this.errorFromResponse(response, raw, payload)
    const content = extractMessageContent(payload)
    if (!content) throw new Error('模型没有返回可用内容。')
    return content
  }

  async testProfile(id) {
    const profile = this.resolveProfile(id)
    const content = await this.requestChat(
      profile,
      [
        {
          role: 'user',
          content: '请只回复 OK，不要输出其他内容。',
        },
      ],
      { maxTokens: Math.min(64, profile.maxOutputTokens || 64), temperature: 0 },
    )
    this.logger?.info('ai', `模型连接测试成功：${profile.label} / ${profile.model}`)
    return { ok: true, message: content.slice(0, 120), profileId: profile.id }
  }

  /**
   * @param {{ baseUrl?: string, apiKey?: string, profileId?: string, headers?: unknown }} [input]
   */
  async listModels(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('模型列表参数无效。')
    }
    const baseUrl = normalizeBaseUrl(input.baseUrl)
    const profileId = cleanText(input.profileId, 80)
    let apiKey = cleanText(input.apiKey, 4096)
    if (/[\u0000-\u001f]/.test(apiKey)) throw new Error('API Key 格式无效。')

    if (!apiKey && profileId) {
      const saved = this.storedProfiles().find((profile) => profile.id === profileId)
      if (saved) {
        if (normalizeBaseUrl(saved.baseUrl) !== baseUrl) {
          throw new Error('更改 Base URL 后请重新填写 API Key，再搜索可用模型。')
        }
        apiKey = this.secrets.get(saved.id)
      }
    }
    if (!apiKey && !isLocalBaseUrl(baseUrl)) {
      throw new Error('请先填写 API Key，再搜索可用模型。')
    }

    const headers = {
      Accept: 'application/json',
      ...cleanHeaders(input.headers),
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    }
    let response
    try {
      response = await this.fetchImpl(modelsEndpoint(baseUrl), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
      })
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new Error('获取模型列表超时，请检查网络或稍后重试。')
      }
      throw new Error(`无法连接模型服务：${error.message}`)
    }

    const raw = await response.text()
    let payload = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      payload = null
    }
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('这个接口没有提供模型列表（/models），请手动填写模型 ID。')
      }
      throw this.errorFromResponse(response, raw, payload)
    }

    const models = parseModelList(payload)
    if (!models.length) {
      throw new Error('接口没有返回可用模型，请手动填写模型 ID。')
    }
    this.logger?.info('ai', `读取可用模型列表：${models.length} 个`)
    return { models }
  }

  async extractAssignments(input) {
    const payload = input && typeof input === 'object' && !Array.isArray(input) ? input : null
    const source = String(payload ? (payload.text ?? '') : (input ?? '')).trim()
    const images = cleanExtractImages(payload?.images)
    const noticeDate = payload?.noticeDate || ''
    if (noticeDate && (typeof noticeDate !== 'string' || cleanDueDate(noticeDate) !== noticeDate)) {
      throw new Error('通知日期无效，请选择有效日期。')
    }
    if (!source && !images.length) throw new Error('请先粘贴通知内容。')
    if (source.length > MAX_EXTRACT_TEXT_LENGTH) {
      throw new Error(`通知内容最多 ${MAX_EXTRACT_TEXT_LENGTH} 字，请分段处理。`)
    }
    const profile = this.resolveProfile()
    if (images.length && !profile.supportsVision) {
      throw new Error(
        '当前模型未开启视觉输入，请先在「模型配置」勾选「支持视觉输入」或换一个支持图片的模型。',
      )
    }
    this.logger?.info(
      'ai',
      `从通知中抽取作业草稿（${source.length} 字，${images.length} 张截图）：${profile.label} / ${profile.model}`,
    )
    const content = await this.requestChat(
      profile,
      buildExtractMessages(source, new Date(), images, noticeDate),
      {
        maxTokens: Math.min(profile.maxOutputTokens || 1400, 2000),
        temperature: 0.1,
      },
    )
    const assignments = parseExtractContent(content)
    for (const draft of assignments) {
      if (draft.sourceImage > images.length) delete draft.sourceImage
      if (!draft.sourceImage && draft.sourceQuote && !source.includes(draft.sourceQuote)) {
        delete draft.sourceQuote
      }
    }
    this.logger?.info('ai', `通知抽取完成：${assignments.length} 条作业草稿`)
    return {
      assignments,
      profile: { id: profile.id, label: profile.label, model: profile.model },
    }
  }

  async generateAssignmentPlan(assignment) {
    const profile = this.resolveProfile()
    const assignmentText = [
      `作业：${cleanText(assignment?.title, 120)}`,
      `课程：${cleanText(assignment?.course, 80) || '未填写'}`,
      `截止日期：${cleanText(assignment?.dueAt, 10) || '未填写'}`,
      `优先级：${cleanText(assignment?.priority, 20) || 'medium'}`,
      `补充说明：${cleanText(assignment?.notes, 2000) || '无'}`,
    ].join('\n')
    this.logger?.info('ai', `生成作业执行计划：${profile.label} / ${profile.model}`)
    const content = await this.requestChat(
      profile,
      [
        {
          role: 'system',
          content:
            '你是大学生学习任务规划助手。请根据作业信息制定可执行计划，不要虚构课程资料或实验结果。只输出一个 JSON 对象，不要使用 Markdown 代码块。',
        },
        {
          role: 'user',
          content: `${assignmentText}\n\n请严格输出以下结构：\n{"summary":"一句话目标","prerequisites":["前置条件"],"steps":["可执行步骤"],"risks":["易错点或风险"],"checklist":["提交前检查项"]}\n要求：steps 3-8 条，其他数组可为空；所有内容使用中文。`,
        },
      ],
      { maxTokens: profile.maxOutputTokens || 1800, temperature: profile.temperature },
    )
    const parsed = parsePlanContent(content)
    const plan = cleanAiPlan({
      ...parsed,
      generatedAt: new Date().toISOString(),
      provider: profile.label,
      model: profile.model,
    })
    if (!plan) throw new Error('模型返回的执行计划不完整。')
    this.logger?.info('ai', `作业执行计划已生成：${plan.steps.length} 个步骤`)
    return {
      plan,
      profile: { id: profile.id, label: profile.label, model: profile.model },
    }
  }
}

module.exports = {
  AiService,
  apiEndpoint,
  chatEndpoint,
  extractMessageContent,
  isLocalBaseUrl,
  normalizeBaseUrl,
  parsePlanContent,
}

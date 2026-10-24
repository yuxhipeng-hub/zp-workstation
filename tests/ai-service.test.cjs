const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { AiService, chatEndpoint, parsePlanContent } = require('../src/main/ai-service.cjs')
const { SettingsStore } = require('../src/main/settings-store.cjs')

function createHarness(fetchImpl) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-ai-service-'))
  const settings = new SettingsStore(directory)
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value, 'utf8').toString('base64'),
    decryptString: (buffer) => Buffer.from(buffer.toString('utf8'), 'base64').toString('utf8'),
  }
  const service = new AiService({
    userDataDir: directory,
    settings,
    safeStorage,
    fetchImpl,
  })
  return { directory, settings, service }
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  }
}

test('stores model metadata without exposing the encrypted API key', (t) => {
  const { directory, service } = createHarness(async () => jsonResponse({}))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const config = service.saveProfile(
    {
      label: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
    'sk-secret-value',
  )

  assert.equal(config.profiles.length, 1)
  assert.equal(config.profiles[0].hasKey, true)
  assert.equal(Object.hasOwn(config.profiles[0], 'apiKey'), false)
  assert.equal(config.activeProfileId, config.profiles[0].id)
  const encrypted = fs.readFileSync(path.join(directory, 'ai-secrets.bin'), 'utf8')
  assert.equal(encrypted.includes('sk-secret-value'), false)

  const renamed = service.saveProfile(
    {
      id: config.profiles[0].id,
      label: 'DeepSeek 主模型',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    },
    '',
  )
  assert.equal(renamed.profiles[0].label, 'DeepSeek 主模型')
  assert.equal(renamed.profiles[0].hasKey, true)

  const cleared = service.saveProfile(
    {
      id: config.profiles[0].id,
      label: 'DeepSeek 主模型',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    },
    '',
    true,
  )
  assert.equal(cleared.profiles[0].hasKey, false)
})

test('tests a profile through an OpenAI compatible chat endpoint', async (t) => {
  const requests = []
  const { directory, service } = createHarness(async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({ choices: [{ message: { content: 'OK' } }] })
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const config = service.saveProfile(
    {
      label: 'Kimi',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'moonshot-v1',
    },
    'sk-kimi',
  )
  const result = await service.testProfile(config.activeProfileId)

  assert.equal(result.ok, true)
  assert.equal(requests[0].url, 'https://api.moonshot.cn/v1/chat/completions')
  assert.match(requests[0].options.headers.Authorization, /^Bearer sk-kimi$/)
  assert.equal(JSON.parse(requests[0].options.body).model, 'moonshot-v1')
})

test('allows a keyless local Ollama profile without sending authorization', async (t) => {
  const requests = []
  const { directory, service } = createHarness(async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({ choices: [{ message: { content: 'OK' } }] })
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const config = service.saveProfile({
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen3:8b',
  })
  assert.equal(config.profiles[0].requiresKey, false)
  assert.equal(config.profiles[0].hasKey, false)

  await service.testProfile(config.activeProfileId)
  assert.equal(Object.hasOwn(requests[0].options.headers, 'Authorization'), false)
})

test('supports Responses API, reasoning effort, and custom request headers', async (t) => {
  const requests = []
  const { directory, service } = createHarness(async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({ output_text: 'OK' })
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const config = service.saveProfile(
    {
      label: 'OpenAI Responses',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-test',
      protocol: 'responses',
      reasoningEffort: 'high',
      maxOutputTokens: 4096,
      headers: {
        'HTTP-Referer': 'https://zp.example',
        Authorization: 'should-not-override',
        'x-api-key': 'should-stay-in-secret-store',
      },
    },
    'sk-responses',
  )
  const profile = config.profiles[0]
  assert.equal(profile.protocol, 'responses')
  assert.equal(profile.reasoningEffort, 'high')
  assert.equal(profile.headers.Authorization, undefined)
  assert.equal(profile.headers['x-api-key'], undefined)

  await service.testProfile(profile.id)
  const body = JSON.parse(requests[0].options.body)
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses')
  assert.equal(body.model, 'gpt-test')
  assert.equal(body.reasoning.effort, 'high')
  assert.equal(body.messages, undefined)
  assert.equal(requests[0].options.headers['HTTP-Referer'], 'https://zp.example')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer sk-responses')
})

test('turns a model JSON response into a structured assignment plan', async (t) => {
  const { directory, service } = createHarness(async () =>
    jsonResponse({
      choices: [
        {
          message: {
            content:
              '```json\n{"summary":"完成实验","prerequisites":["阅读要求"],"steps":["分析需求","实现","验证"],"risks":["边界条件"],"checklist":["运行测试"]}\n```',
          },
        },
      ],
    }),
  )
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  service.saveProfile(
    {
      label: '通义',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
    },
    'sk-qwen',
  )
  const result = await service.generateAssignmentPlan({
    title: '操作系统实验二',
    course: '操作系统',
    dueAt: '2026-10-25',
    priority: 'high',
    notes: '提交实验报告',
  })

  assert.equal(result.plan.provider, '通义')
  assert.equal(result.plan.model, 'qwen-plus')
  assert.deepEqual(result.plan.steps, ['分析需求', '实现', '验证'])
  assert.ok(result.plan.generatedAt)
})

test('rejects malformed plans and insecure remote HTTP endpoints', () => {
  assert.throws(() => parsePlanContent('没有 JSON'), /没有返回 JSON/)
  assert.throws(() => parsePlanContent('{"summary":"缺少步骤"}'), /缺少有效步骤/)
  assert.throws(() => chatEndpoint('http://example.com/v1'), /远程模型接口必须使用 HTTPS/)
  assert.equal(
    chatEndpoint('http://127.0.0.1:11434/v1'),
    'http://127.0.0.1:11434/v1/chat/completions',
  )
  assert.equal(chatEndpoint('http://[::1]:11434/v1'), 'http://[::1]:11434/v1/chat/completions')
})

function seedProfile(service) {
  const config = service.saveProfile(
    { label: '测试模型', baseUrl: 'https://api.example.com/v1', model: 'test-model' },
    'sk-test',
  )
  return config.activeProfileId
}

test('maps model HTTP failures to readable messages', async (t) => {
  const cases = [
    [401, { error: { message: 'bad key' } }, /拒绝了这个 API Key/],
    [403, {}, /拒绝了这个 API Key/],
    [404, {}, /模型接口、协议或模型 ID 不存在/],
    [429, {}, /请求过于频繁/],
    [500, {}, /模型服务暂时不可用（500）/],
    [418, { message: 'teapot' }, /teapot/],
  ]
  for (const [status, payload, pattern] of cases) {
    const { directory, service } = createHarness(async () => jsonResponse(payload, status))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const profileId = seedProfile(service)
    await assert.rejects(() => service.testProfile(profileId), pattern)
  }
})

test('reports a truncated or non-JSON model response', async (t) => {
  const { directory, service } = createHarness(async () => ({
    ok: true,
    status: 200,
    text: async () => '{"choices":[{"message":{"content":"半截',
  }))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  await assert.rejects(() => service.testProfile(seedProfile(service)), /没有返回可用内容/)
})

test('reports model timeouts and connection failures', async (t) => {
  const timeout = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })
  const timeoutHarness = createHarness(async () => {
    throw timeout
  })
  t.after(() => fs.rmSync(timeoutHarness.directory, { recursive: true, force: true }))
  await assert.rejects(
    () => timeoutHarness.service.testProfile(seedProfile(timeoutHarness.service)),
    /模型请求超时/,
  )

  const offlineHarness = createHarness(async () => {
    throw new Error('ECONNREFUSED')
  })
  t.after(() => fs.rmSync(offlineHarness.directory, { recursive: true, force: true }))
  await assert.rejects(
    () => offlineHarness.service.testProfile(seedProfile(offlineHarness.service)),
    /无法连接模型服务：ECONNREFUSED/,
  )
})

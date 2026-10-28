const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { AiService, chatEndpoint, parsePlanContent } = require('../src/main/ai-service.cjs')
const { SettingsStore } = require('../src/main/settings-store.cjs')

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII='

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

test('extracts assignment drafts from pasted text without sending workspace data', async (t) => {
  const requests = []
  const content = JSON.stringify({
    complete: true,
    assignments: [
      {
        title: '操作系统实验二报告',
        course: '操作系统',
        dueAt: '2026-10-30',
        priority: '高',
        notes: '包含源码和实验截图',
      },
      { title: '日期不明确的作业', dueAt: '下周五' },
      { title: '' },
    ],
  })
  const { directory, service } = createHarness(async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({ choices: [{ message: { content } }] })
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  service.saveProfile(
    { label: '本地模型', baseUrl: 'https://api.example.com/v1', model: 'entry-model' },
    'sk-test',
  )

  const notice = '各位同学：本周五 23:59 前提交操作系统实验二报告，包含源码和截图。'
  const result = await service.extractAssignments(notice)

  assert.equal(result.assignments.length, 2)
  assert.equal(result.assignments[0].title, '操作系统实验二报告')
  assert.equal(result.assignments[0].priority, 'high')
  assert.equal(result.assignments[0].dueAt, '2026-10-30')
  assert.equal(result.assignments[1].dueAt, '')
  assert.equal(result.profile.label, '本地模型')
  assert.equal(result.profile.model, 'entry-model')

  const body = JSON.parse(requests[0].options.body)
  assert.equal(body.model, 'entry-model')
  const userMessage = body.messages.at(-1).content
  assert.match(userMessage, /本周五 23:59 前提交操作系统实验二报告/)
  assert.match(userMessage, /今天是 \d{4}-\d{2}-\d{2}/)
  assert.equal(userMessage.includes('workspace'), false)
  assert.equal(userMessage.includes('资料库'), false)
  assert.equal(userMessage.includes('sk-test'), false)
})

test('rejects empty or oversized notice text before calling the model', async (t) => {
  const requests = []
  const { directory, service } = createHarness(async () => {
    requests.push(true)
    return jsonResponse({})
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  await assert.rejects(() => service.extractAssignments('   '), /请先粘贴通知内容/)
  await assert.rejects(() => service.extractAssignments('x'.repeat(4001)), /最多 4000 字/)
  await assert.rejects(
    () => service.extractAssignments({ text: '报告', noticeDate: '2026-02-30' }),
    /通知日期无效/,
  )
  assert.equal(requests.length, 0)
})

test('sends screenshot content to a vision model and extracts drafts', async (t) => {
  const requests = []
  const content = JSON.stringify({
    assignments: [
      {
        title: '平台截图作业',
        course: '操作系统',
        dueAt: '2026-11-01',
        sourceImage: 20,
        sourceQuote: '原文片段',
      },
      { title: '错误来源', sourceImage: 21, sourceQuote: '不存在的摘录' },
    ],
  })
  const { directory, service } = createHarness(async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({ choices: [{ message: { content } }] })
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  service.saveProfile(
    {
      label: '视觉模型',
      baseUrl: 'https://api.example.com/v1',
      model: 'vision-model',
      supportsVision: true,
    },
    'sk-test',
  )

  const result = await service.extractAssignments({
    text: '',
    images: Array.from({ length: 20 }, () => ({ name: '平台通知.png', dataUrl: PNG_DATA_URL })),
    noticeDate: '2026-10-20',
  })

  assert.equal(result.assignments[0].title, '平台截图作业')
  assert.equal(result.assignments[0].sourceImage, 20)
  assert.equal(result.assignments[1].sourceQuote, undefined)
  const body = JSON.parse(requests[0].options.body)
  const userContent = body.messages.at(-1).content
  assert.equal(Array.isArray(userContent), true)
  assert.equal(userContent.filter((part) => part.type === 'image_url').length, 20)
  const textPart = userContent.find((part) => part.type === 'text')
  assert.match(textPart.text, /图片中/)
  assert.match(textPart.text, /换算基准）：2026-10-20/)
  const imagePart = userContent.find((part) => part.type === 'image_url')
  assert.equal(imagePart.image_url.url, PNG_DATA_URL)
})

test('rejects screenshots when the active model has not declared vision support', async (t) => {
  const requests = []
  const { directory, service } = createHarness(async () => {
    requests.push(true)
    return jsonResponse({})
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  service.saveProfile(
    { label: '纯文本模型', baseUrl: 'https://api.example.com/v1', model: 'text-model' },
    'sk-test',
  )

  await assert.rejects(
    () => service.extractAssignments({ images: [{ name: '通知.png', dataUrl: PNG_DATA_URL }] }),
    /未开启视觉输入/,
  )
  assert.equal(requests.length, 0)
})

test('maps screenshots to input_image for the Responses protocol', async (t) => {
  const requests = []
  const content = JSON.stringify({ complete: true, assignments: [{ title: '响应接口截图作业' }] })
  const { directory, service } = createHarness(async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({ output_text: content })
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  service.saveProfile(
    {
      label: '视觉 Responses',
      baseUrl: 'https://api.example.com/v1',
      model: 'vision-responses',
      protocol: 'responses',
      supportsVision: true,
    },
    'sk-test',
  )

  const result = await service.extractAssignments({
    text: '平台通知',
    images: [{ name: '截图.png', dataUrl: PNG_DATA_URL }],
  })

  assert.equal(result.assignments[0].title, '响应接口截图作业')
  const body = JSON.parse(requests[0].options.body)
  assert.equal(Array.isArray(body.input), true)
  const userMessage = body.input.find((message) => message.role === 'user')
  const imagePart = userMessage.content.find((part) => part.type === 'input_image')
  assert.equal(imagePart.image_url, PNG_DATA_URL)
})

test('lists available models from an OpenAI-compatible endpoint', async (t) => {
  const requests = []
  const { directory, service } = createHarness(async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({ data: [{ id: 'vision-model' }, { id: 'chat-model' }] })
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const result = await service.listModels({
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test',
  })

  assert.deepEqual(result.models, ['vision-model', 'chat-model'])
  assert.equal(requests[0].url, 'https://api.example.com/v1/models')
  assert.equal(requests[0].options.method, 'GET')
  assert.equal(requests[0].options.headers.Authorization, 'Bearer sk-test')
  assert.equal(requests[0].options.body, undefined)
})

test('reuses a saved key only when the Base URL is unchanged', async (t) => {
  const requests = []
  const { directory, service } = createHarness(async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({ models: [{ id: 'saved-model' }] })
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const config = service.saveProfile(
    { label: '已保存模型', baseUrl: 'https://api.example.com/v1', model: 'saved-model' },
    'sk-saved',
  )

  const sameBase = await service.listModels({
    baseUrl: 'https://api.example.com/v1',
    profileId: config.profiles[0].id,
    apiKey: '',
  })
  assert.deepEqual(sameBase.models, ['saved-model'])
  assert.equal(requests.at(-1).options.headers.Authorization, 'Bearer sk-saved')

  await assert.rejects(
    () =>
      service.listModels({
        baseUrl: 'https://other.example.com/v1',
        profileId: config.profiles[0].id,
        apiKey: '',
      }),
    /重新填写 API Key/,
  )
  assert.equal(requests.length, 1)
})

test('reports model-list failures without leaking the API key', async (t) => {
  const { directory, service } = createHarness(async () =>
    jsonResponse({ error: { message: 'not found' } }, 404),
  )
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  await assert.rejects(
    () => service.listModels({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-secret' }),
    /没有提供模型列表/,
  )
  await assert.rejects(
    () => service.listModels({ baseUrl: 'https://api.example.com/v1', apiKey: '' }),
    /请先填写 API Key/,
  )
})

test('allows keyless local model discovery', async (t) => {
  const requests = []
  const { directory, service } = createHarness(async (url, options) => {
    requests.push({ url, options })
    return jsonResponse({ data: [{ id: 'qwen3:8b' }] })
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const result = await service.listModels({
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: '',
  })

  assert.deepEqual(result.models, ['qwen3:8b'])
  assert.equal(requests[0].options.headers.Authorization, undefined)
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

test('extractor detects provider truncation, incomplete JSON, and missing completeness without losing them as success', async (t) => {
  for (const protocol of ['chat-completions', 'responses']) {
    for (const mode of ['truncated', 'malformed', 'missing-complete', 'empty-complete']) {
      await t.test(protocol + ': ' + mode, async (t) => {
        let body
        const content =
          mode === 'malformed'
            ? '{"assignments":['
            : JSON.stringify({
                assignments: mode === 'empty-complete' ? [] : [{ title: '未完整结果' }],
                ...(mode === 'missing-complete' ? {} : { complete: true }),
              })
        const { directory, service } = createHarness(async (url, options) => {
          body = JSON.parse(options.body)
          return jsonResponse(
            protocol === 'responses'
              ? {
                  output_text: content,
                  status: mode === 'truncated' ? 'incomplete' : 'completed',
                  ...(mode === 'truncated'
                    ? { incomplete_details: { reason: 'max_output_tokens' } }
                    : {}),
                }
              : {
                  choices: [
                    {
                      message: { content },
                      finish_reason: mode === 'truncated' ? 'length' : 'stop',
                    },
                  ],
                },
          )
        })
        t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
        service.saveProfile(
          {
            label: '批次测试',
            baseUrl: 'https://api.example.com/v1',
            model: 'test',
            protocol,
            maxOutputTokens: 16000,
          },
          'sk-test',
        )
        const result = await service.extractAssignments({ text: '通知' })
        assert.equal(result.incomplete, mode !== 'empty-complete')
        if (mode === 'empty-complete') assert.deepEqual(result.assignments, [])
        assert.equal(body.max_tokens || body.max_output_tokens, 8000)
      })
    }
  }
})

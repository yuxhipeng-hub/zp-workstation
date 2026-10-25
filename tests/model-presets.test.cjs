const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const moduleUrl = pathToFileURL(
  path.join(__dirname, '..', 'src', 'renderer', 'pages', 'model-settings.js'),
).href

test('ships a one-click DeepSeek Flash vision preset', async () => {
  const { AI_PROVIDER_PRESETS } = await import(moduleUrl)
  const flash = AI_PROVIDER_PRESETS.find((preset) => preset.id === 'deepseek-flash')

  assert.ok(flash)
  assert.equal(flash.baseUrl, 'https://api.deepseek.com')
  assert.equal(flash.model, 'deepseek-flash')
  assert.equal(flash.supportsVision, true)
  assert.equal(
    AI_PROVIDER_PRESETS.every((preset) => typeof preset.supportsVision === 'boolean'),
    true,
  )
})

test('covers the mainstream OpenAI-compatible providers with unique ids', async () => {
  const { AI_PROVIDER_PRESETS } = await import(moduleUrl)
  const expected = [
    'deepseek',
    'deepseek-flash',
    'openai',
    'gemini',
    'kimi',
    'qwen',
    'zhipu',
    'doubao',
    'qianfan',
    'hunyuan',
    'spark',
    'minimax',
    'baichuan',
    'yi',
    'stepfun',
    'sensenova',
    'siliconflow',
    'openrouter',
    'groq',
    'mistral',
    'xai',
    'together',
    'fireworks',
    'perplexity',
    'cohere',
    'huggingface',
    'github-models',
    'ollama',
    'lmstudio',
    'custom',
  ]
  const ids = AI_PROVIDER_PRESETS.map((preset) => preset.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of expected) assert.equal(ids.includes(id), true, `缺少预设 ${id}`)
  for (const preset of AI_PROVIDER_PRESETS) {
    if (preset.id === 'custom') continue
    const url = new URL(preset.baseUrl)
    assert.equal(['http:', 'https:'].includes(url.protocol), true, `${preset.id} 的 Base URL 无效`)
  }
})

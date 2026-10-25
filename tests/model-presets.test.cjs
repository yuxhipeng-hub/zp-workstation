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

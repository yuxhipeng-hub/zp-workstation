const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { AiService } = require('../src/main/ai-service.cjs')
const { SettingsStore } = require('../src/main/settings-store.cjs')
const { visionProbe, checkVisionProbe } = require('../src/main/vision-probe.cjs')
const { validateImageData } = require('../src/shared/presentation-canvas.mjs')
const answer = {
  images: [
    [
      { color: 'red', shape: 'circle' },
      { color: 'green', shape: 'square' },
      { color: 'blue', shape: 'triangle' },
    ],
    [
      { color: 'blue', shape: 'circle' },
      { color: 'red', shape: 'square' },
      { color: 'green', shape: 'triangle' },
    ],
  ],
}
function harness(t, protocol, payload = answer) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-vision-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const requests = []
  const service = new AiService({
    userDataDir: directory,
    settings: new SettingsStore(directory),
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s),
      decryptString: (b) => b.toString(),
    },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            model: 'reported-model',
            output: [
              { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'think' }] },
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: JSON.stringify(payload) }],
              },
            ],
            choices: [{ message: { content: JSON.stringify(payload) } }],
          }),
      }
    },
  })
  const profile = service.saveProfile({
    label: '视觉测试',
    model: 'configured-model',
    baseUrl: 'http://localhost:5432/v1',
    protocol,
    supportsVision: true,
  }).profiles[0]
  return { service, profile, requests }
}
test('synthetic image probe has no expected answer in its prompt and rejects guessed or malformed output', () => {
  const probe = visionProbe()
  probe.images.forEach((data) => assert.equal(validateImageData(data), data))
  assert.notEqual(probe.images[0], probe.images[1])
  assert.equal(checkVisionProbe(JSON.stringify(answer), probe.expected), true)
  assert.equal(
    checkVisionProbe(
      JSON.stringify({ images: [answer.images[0], answer.images[0]] }),
      probe.expected,
    ),
    false,
  )
  assert.equal(checkVisionProbe('not json', probe.expected), false)
  assert.ok(!probe.prompt.includes('red:circle'))
})
for (const protocol of ['chat-completions', 'responses'])
  test(`${protocol} sends actual image blocks and reports tested model separately from configured model`, async (t) => {
    const { service, profile, requests } = harness(t, protocol)
    const result = await service.testVisionProfile(profile.id)
    assert.equal(result.passed, true)
    assert.equal(result.model, 'configured-model')
    assert.equal(result.returnedModel, 'reported-model')
    const content =
      protocol === 'responses' ? requests[0].input[0].content : requests[0].messages[0].content
    assert.equal(content.length, 3)
    assert.equal(content[1].type, protocol === 'responses' ? 'input_image' : 'image_url')
    const image = protocol === 'responses' ? content[1].image_url : content[1].image_url.url
    assert.match(image, /^data:image\/png;base64,/)
    assert.doesNotMatch(JSON.stringify(result), /base64/)
    service.setVisionProfile(profile.id)
    assert.equal(service.getConfig().visionProfileId, profile.id)
    assert.equal(service.getConfig().activeProfileId, profile.id)
    service.deleteProfile(profile.id)
    assert.equal(service.getConfig().visionProfileId, '')
  })
test('vision model selection requires the capability declaration and failed observations are not marked passed', async (t) => {
  const { service, profile } = harness(t, 'responses', { images: [] })
  assert.equal((await service.testVisionProfile(profile.id)).passed, false)
  assert.throws(() => service.setVisionProfile({}), /编号/)
  service.saveProfile({ ...profile, supportsVision: false })
  assert.throws(() => service.setVisionProfile(profile.id), /支持视觉/)
  assert.equal(service.setVisionProfile('').visionProfileId, '')
  await assert.rejects(
    service.requestVision(profile, '测试', ['https://example.com/private.png']),
    /PNG/,
  )
})

const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DownloadAccelerator, parseContentRange } = require('../src/main/download-accelerator.cjs')

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function readRequestedRange(options) {
  const value = options?.headers?.Range || options?.headers?.range || ''
  const match = String(value).match(/^bytes=(\d+)-(\d*)$/)
  if (!match) return null
  return {
    start: Number(match[1]),
    end: match[2] ? Number(match[2]) : null,
  }
}

function rangeResponse(payload, requestedRange, delayMs = 0) {
  const start = requestedRange?.start || 0
  const end = Math.min(payload.length - 1, requestedRange?.end ?? payload.length - 1)
  const body = payload.subarray(start, end + 1)
  const stream = new ReadableStream({
    async start(controller) {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
      controller.enqueue(body)
      controller.close()
    },
  })
  return new Response(stream, {
    status: 206,
    headers: {
      'content-length': String(body.length),
      'content-range': `bytes ${start}-${end}/${payload.length}`,
    },
  })
}

test('download accelerator uses the fastest mirror for the first transfer pass', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-download-accelerator-'))
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  const payload = Buffer.alloc(4 * 1024 * 1024 + 73)
  for (let index = 0; index < payload.length; index += 1) payload[index] = index % 251
  const requests = []

  const accelerator = new DownloadAccelerator({
    concurrency: 4,
    segments: 4,
    idleTimeoutMs: 10000,
    probeBytes: 64 * 1024,
    probeTimeoutMs: 1000,
    logger: { warn() {}, info() {} },
    fetchImpl: async (url, options) => {
      const range = readRequestedRange(options)
      requests.push({ url, range })
      assert.ok(range, 'every transfer should use an HTTP range request')
      return rangeResponse(payload, range, url.includes('fast') ? 1 : 250)
    },
  })
  const progress = []
  const target = path.join(tempDir, 'ZP-Workbench-Setup-0.4.2-x64.exe')
  const result = await accelerator.download({
    name: path.basename(target),
    size: payload.length,
    sha256: sha256(payload),
    target,
    sources: [
      { id: 'fast', label: '快速线路', url: 'https://fast.example/setup.exe' },
      { id: 'backup', label: '备用线路', url: 'https://backup.example/setup.exe' },
    ],
    onProgress: (event) => progress.push(event),
  })

  assert.equal(result.mode, 'segmented')
  assert.equal(result.connections, 4)
  assert.deepEqual(fs.readFileSync(target), payload)
  assert.equal(progress.at(-1).phase, 'completed')
  assert.ok(progress.some((event) => Number(event.activeConnections) > 1))

  const transferRequests = requests.filter(
    (request) => request.range.end - request.range.start + 1 >= 256 * 1024,
  )
  assert.equal(transferRequests.length, 4)
  assert.equal(new Set(transferRequests.map((request) => request.url)).size, 1)
})

test('download accelerator falls back when the fastest mirror stops serving data', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-download-fallback-'))
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  const payload = Buffer.alloc(4 * 1024 * 1024 + 137)
  for (let index = 0; index < payload.length; index += 1) payload[index] = index % 239
  const transferUrls = []

  const accelerator = new DownloadAccelerator({
    concurrency: 4,
    segments: 4,
    idleTimeoutMs: 10000,
    probeBytes: 64 * 1024,
    probeTimeoutMs: 1000,
    logger: { warn() {}, info() {} },
    fetchImpl: async (url, options) => {
      const range = readRequestedRange(options)
      assert.ok(range, 'every transfer should use an HTTP range request')
      const requestSize = range.end - range.start + 1
      const isProbe = requestSize <= 64 * 1024
      if (!isProbe) transferUrls.push(url)
      if (url.includes('fast') && !isProbe) {
        return new Response(null, { status: 503 })
      }
      return rangeResponse(payload, range, url.includes('fast') ? 1 : 60)
    },
  })

  const target = path.join(tempDir, 'ZP-Workbench-Setup-0.4.3-x64.exe')
  const result = await accelerator.download({
    name: path.basename(target),
    size: payload.length,
    sha256: sha256(payload),
    target,
    sources: [
      { id: 'fast', label: '快速线路', url: 'https://fast.example/setup.exe' },
      { id: 'backup', label: '备用线路', url: 'https://backup.example/setup.exe' },
    ],
    onProgress() {},
  })

  assert.deepEqual(fs.readFileSync(target), payload)
  assert.equal(result.sourceLabel, '备用线路')
  assert.ok(transferUrls.includes('https://fast.example/setup.exe'))
  assert.ok(transferUrls.includes('https://backup.example/setup.exe'))
})

test('download accelerator resumes an existing partial chunk', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zp-download-resume-'))
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  const payload = Buffer.alloc(1024 * 1024 + 4096, 0x5a)
  const target = path.join(tempDir, 'ZP-Workbench-Setup-0.4.2-x64.exe')
  const partDir = `${target}.parts`
  const partialSize = 8192
  const chunkSize = Math.floor(payload.length / 2)
  fs.mkdirSync(partDir, { recursive: true })
  fs.writeFileSync(
    path.join(partDir, 'meta.json'),
    JSON.stringify({
      name: path.basename(target),
      size: payload.length,
      sha256: sha256(payload),
      segmentCount: 2,
    }),
  )
  fs.writeFileSync(path.join(partDir, 'chunk-000.part'), payload.subarray(0, partialSize))
  const resumedRequests = []

  const accelerator = new DownloadAccelerator({
    concurrency: 2,
    segments: 2,
    idleTimeoutMs: 10000,
    probeBytes: 32 * 1024,
    probeTimeoutMs: 1000,
    logger: { warn() {}, info() {} },
    fetchImpl: async (url, options) => {
      const range = readRequestedRange(options)
      if (range && range.start === partialSize && range.end === chunkSize - 1) {
        resumedRequests.push({ url, range })
      }
      return rangeResponse(payload, range)
    },
  })

  await accelerator.download({
    name: path.basename(target),
    size: payload.length,
    sha256: sha256(payload),
    target,
    sources: [{ id: 'mirror', label: '国内加速', url: 'https://mirror.example/setup.exe' }],
    onProgress() {},
  })

  assert.equal(resumedRequests.length, 1)
  assert.deepEqual(fs.readFileSync(target), payload)
})

test('content range parser accepts standard byte ranges', () => {
  assert.deepEqual(parseContentRange('bytes 10-19/100'), {
    start: 10,
    end: 19,
    total: 100,
  })
  assert.equal(parseContentRange('invalid'), null)
})

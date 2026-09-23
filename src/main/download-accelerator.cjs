const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { pipeline } = require('node:stream/promises')
const { Readable, Transform } = require('node:stream')

const MIN_ACCELERATED_DOWNLOAD_SIZE = 1024 * 1024
const DEFAULT_CONCURRENCY = 8
const DEFAULT_SEGMENTS = 64
const DEFAULT_IDLE_TIMEOUT = 90000
const DEFAULT_SLOW_CHUNK_TIMEOUT = 10000
const DEFAULT_MIN_CHUNK_SPEED = 128 * 1024
const DEFAULT_PROBE_BYTES = 256 * 1024
const DEFAULT_PROBE_CONNECTIONS = 8
const DEFAULT_PROBE_TIMEOUT = 6000
const PROGRESS_INTERVAL = 120
const DYNAMIC_PENDING_MULTIPLIER = 4
const MIN_DYNAMIC_CHUNK_BYTES = 128 * 1024
const MAX_DYNAMIC_SPLIT_PARTS = 64

function parseContentRange(value) {
  const match = String(value || '').match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i)
  if (!match) return null
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: match[3] === '*' ? null : Number(match[3]),
  }
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

function removeFile(filePath) {
  fs.rmSync(filePath, { force: true })
}

function abortErrorMessage(error) {
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
    return '下载线路长时间没有返回数据'
  }
  return error?.message || '网络连接失败'
}

function combineSignals(...signals) {
  const active = signals.filter(Boolean)
  if (!active.length) return undefined
  if (active.length === 1) return active[0]
  return AbortSignal.any(active)
}

function normalizeSources(sources) {
  return (sources || [])
    .map((source, index) => ({
      id: String(source?.id || `download-${index + 1}`),
      label: String(source?.label || `下载线路 ${index + 1}`),
      url: String(source?.url || ''),
    }))
    .filter((source) => source.url)
}

function buildChunks(size, count) {
  const baseSize = Math.floor(size / count)
  return Array.from({ length: count }, (_item, index) => {
    const start = index * baseSize
    const end = index === count - 1 ? size - 1 : start + baseSize - 1
    return {
      index,
      start,
      end,
      length: end - start + 1,
      bytes: 0,
      filePath: '',
    }
  })
}

async function hashFile(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function assembleChunks(chunks, target, expectedSize, expectedSha256) {
  const assembled = `${target}.assembling`
  const hash = createHash('sha256')
  removeFile(assembled)

  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    },
  })

  async function* readChunks() {
    for (const chunk of chunks) {
      for await (const data of fs.createReadStream(chunk.filePath)) yield data
    }
  }

  try {
    await pipeline(Readable.from(readChunks()), hashingStream, fs.createWriteStream(assembled))
    const actualSize = fileSize(assembled)
    if (expectedSize && actualSize !== expectedSize) {
      throw new Error(`安装包大小校验失败，期望 ${expectedSize} 字节，实际 ${actualSize} 字节`)
    }
    const actualSha256 = hash.digest('hex')
    if (expectedSha256 && actualSha256 !== expectedSha256) {
      throw new Error(`SHA-256 校验失败，期望 ${expectedSha256}，实际 ${actualSha256}`)
    }
    removeFile(target)
    fs.renameSync(assembled, target)
    return actualSha256
  } catch (error) {
    removeFile(assembled)
    throw error
  }
}

class DownloadAccelerator {
  constructor({
    fetchImpl = globalThis.fetch,
    logger = console,
    concurrency = DEFAULT_CONCURRENCY,
    segments = DEFAULT_SEGMENTS,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT,
    slowChunkTimeoutMs = DEFAULT_SLOW_CHUNK_TIMEOUT,
    minChunkBytesPerSecond = DEFAULT_MIN_CHUNK_SPEED,
    probeBytes = DEFAULT_PROBE_BYTES,
    probeConnections = DEFAULT_PROBE_CONNECTIONS,
    probeTimeoutMs = DEFAULT_PROBE_TIMEOUT,
  } = {}) {
    this.fetchImpl = fetchImpl
    this.logger = logger
    this.concurrency = Math.max(1, Math.min(16, Number(concurrency) || DEFAULT_CONCURRENCY))
    this.segments = Math.max(this.concurrency, Math.min(128, Number(segments) || DEFAULT_SEGMENTS))
    this.idleTimeoutMs = Math.max(10000, Number(idleTimeoutMs) || DEFAULT_IDLE_TIMEOUT)
    this.slowChunkTimeoutMs = Math.max(
      3000,
      Number(slowChunkTimeoutMs) || DEFAULT_SLOW_CHUNK_TIMEOUT,
    )
    this.minChunkBytesPerSecond = Math.max(
      16 * 1024,
      Number(minChunkBytesPerSecond) || DEFAULT_MIN_CHUNK_SPEED,
    )
    this.probeBytes = Math.max(16 * 1024, Number(probeBytes) || DEFAULT_PROBE_BYTES)
    this.probeConnections = Math.max(
      1,
      Math.min(8, Number(probeConnections) || DEFAULT_PROBE_CONNECTIONS),
    )
    this.probeTimeoutMs = Math.max(1000, Number(probeTimeoutMs) || DEFAULT_PROBE_TIMEOUT)
  }

  async probeSource(source) {
    const startedAt = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.probeTimeoutMs)
    const connectionCount = Math.max(1, Math.min(8, this.probeConnections))
    let received = 0
    let rangeSupported = false
    let successfulConnections = 0

    try {
      await Promise.allSettled(
        Array.from({ length: connectionCount }, async (_item, index) => {
          const start = index * this.probeBytes
          const response = await this.fetchImpl(source.url, {
            headers: {
              Accept: 'application/octet-stream',
              Range: `bytes=${start}-${start + this.probeBytes - 1}`,
              'User-Agent': 'ZP-Workbench-Launcher',
            },
            signal: controller.signal,
          })
          if (!response.ok || !response.body) {
            throw new Error(`HTTP ${response.status}`)
          }
          const contentRange = parseContentRange(response.headers?.get?.('content-range'))
          const connectionSupportsRange =
            response.status === 206 &&
            Boolean(contentRange) &&
            contentRange.start === start &&
            contentRange.end >= start
          if (connectionSupportsRange) rangeSupported = true
          successfulConnections += 1

          let connectionBytes = 0
          const reader = response.body.getReader()
          try {
            while (connectionBytes < this.probeBytes) {
              const { done, value } = await reader.read()
              if (done) break
              const length = value?.byteLength || value?.length || 0
              connectionBytes += length
              received += length
            }
          } finally {
            try {
              await reader.cancel()
            } catch {
              // The stream may already be closed.
            }
          }
        }),
      )
      if (successfulConnections === 0 || received === 0) {
        throw new Error('测速线路没有返回数据')
      }

      const elapsed = Math.max(1, Date.now() - startedAt)
      return {
        ...source,
        reachable: true,
        rangeSupported,
        speed: (received * 1000) / elapsed,
        probeBytes: received,
        probeConnections: successfulConnections,
      }
    } catch (error) {
      return {
        ...source,
        reachable: false,
        rangeSupported: false,
        speed: 0,
        probeBytes: received,
        error: abortErrorMessage(error),
      }
    } finally {
      clearTimeout(timer)
      try {
        controller.abort()
      } catch {
        // The probe has already finished.
      }
    }
  }

  async probeSources(sources) {
    return Promise.all(sources.map((source) => this.probeSource(source)))
  }

  async downloadChunk(chunk, sources, runSignal, onData) {
    const partDir = path.dirname(chunk.filePath)
    fs.mkdirSync(partDir, { recursive: true })
    const existingSize = fileSize(chunk.filePath)
    if (existingSize > chunk.length) removeFile(chunk.filePath)
    chunk.bytes = existingSize > chunk.length ? 0 : existingSize
    if (chunk.bytes === chunk.length) return

    let lastError = null
    const attempts = sources.length === 1 ? 2 : Math.min(6, sources.length * 2)
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const source = attempt === 0 ? sources[0] : sources[attempt % sources.length]
      const start = chunk.start + chunk.bytes
      const controller = new AbortController()
      let idleTimer = null
      let slowTimer = null
      let lastSpeedAt = Date.now()
      let lastSpeedBytes = chunk.bytes
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(
          () => controller.abort(new Error('下载线路长时间没有返回数据')),
          this.idleTimeoutMs,
        )
      }

      resetIdleTimer()
      slowTimer = setInterval(
        () => {
          const now = Date.now()
          const elapsedSeconds = Math.max(0.001, (now - lastSpeedAt) / 1000)
          if (elapsedSeconds * 1000 < this.slowChunkTimeoutMs) return
          const bytesPerSecond = Math.max(0, chunk.bytes - lastSpeedBytes) / elapsedSeconds
          if (bytesPerSecond < this.minChunkBytesPerSecond) {
            controller.abort(
              new Error(
                `下载线路速度过慢（${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s）`,
              ),
            )
          }
          lastSpeedAt = now
          lastSpeedBytes = chunk.bytes
        },
        Math.min(2000, this.slowChunkTimeoutMs),
      )
      try {
        const response = await this.fetchImpl(source.url, {
          headers: {
            Accept: 'application/octet-stream',
            Range: `bytes=${start}-${chunk.end}`,
            'User-Agent': 'ZP-Workbench-Launcher',
          },
          signal: combineSignals(runSignal, controller.signal),
        })
        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`)
        }
        if (response.status !== 206) {
          throw new Error('下载线路不支持分片下载')
        }

        const contentRange = parseContentRange(response.headers?.get?.('content-range'))
        if (!contentRange || contentRange.start !== start || contentRange.end > chunk.end) {
          throw new Error('下载线路返回了错误的分片范围')
        }

        const before = chunk.bytes
        const tracker = new Transform({
          transform: (data, _encoding, callback) => {
            chunk.bytes += data.length
            resetIdleTimer()
            onData()
            callback(null, data)
          },
        })
        await pipeline(
          Readable.fromWeb(response.body),
          tracker,
          fs.createWriteStream(chunk.filePath, {
            flags: before > 0 ? 'a' : 'w',
          }),
        )
        if (chunk.bytes !== chunk.length) {
          throw new Error(`分片下载不完整，期望 ${chunk.length} 字节，实际 ${chunk.bytes} 字节`)
        }
        return source
      } catch (error) {
        lastError = error
        chunk.bytes = Math.min(fileSize(chunk.filePath), chunk.length)
        this.logger.warn?.(
          'launcher-update',
          `分片 ${chunk.index + 1} 第 ${attempt + 1} 次尝试失败：${abortErrorMessage(error)}`,
        )
      } finally {
        if (idleTimer) clearTimeout(idleTimer)
        if (slowTimer) clearInterval(slowTimer)
      }
    }

    throw new Error(
      `${sources[(attempts - 1) % sources.length].label}：${abortErrorMessage(lastError)}`,
    )
  }

  async downloadSegmented({ name, size, sha256, sources, target, onProgress }) {
    const metaDir = `${target}.parts`
    const metaPath = path.join(metaDir, 'meta.json')
    const meta = {
      name,
      size,
      sha256: sha256 || '',
      segmentCount: this.segments,
    }
    let existingMeta = null
    try {
      existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch {
      existingMeta = null
    }
    if (
      !existingMeta ||
      existingMeta.name !== meta.name ||
      existingMeta.size !== meta.size ||
      String(existingMeta.sha256 || '') !== meta.sha256 ||
      existingMeta.segmentCount !== meta.segmentCount
    ) {
      fs.rmSync(metaDir, { recursive: true, force: true })
    }
    fs.mkdirSync(metaDir, { recursive: true })
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')

    const chunkCount = Math.min(
      this.segments,
      Math.max(2, Math.ceil(size / MIN_ACCELERATED_DOWNLOAD_SIZE)),
    )
    const chunks = buildChunks(size, chunkCount)
    for (const chunk of chunks) {
      chunk.filePath = path.join(metaDir, `chunk-${String(chunk.index).padStart(3, '0')}.part`)
      const existingSize = fileSize(chunk.filePath)
      if (existingSize > chunk.length) removeFile(chunk.filePath)
      chunk.bytes = existingSize > chunk.length ? 0 : existingSize
    }

    let completedChunks = chunks.filter((chunk) => chunk.bytes === chunk.length).length
    const pendingChunks = chunks.filter((chunk) => chunk.bytes < chunk.length)
    let nextChunkIndex = chunks.length
    let lastProgressAt = 0
    let lastBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
    let lastSampleAt = Date.now()
    let smoothedSpeed = 0
    let activeTransfers = 0
    const startedAt = Date.now()
    const usedSourceLabels = new Set()
    const sourceLabel = () =>
      usedSourceLabels.size ? Array.from(usedSourceLabels).join(' + ') : sources[0].label

    const createRangeChunk = (start, end) => {
      const rangeChunk = {
        index: nextChunkIndex,
        start,
        end,
        length: end - start + 1,
        bytes: 0,
        filePath: path.join(metaDir, `range-${start}-${end}.part`),
      }
      nextChunkIndex += 1
      const existingSize = fileSize(rangeChunk.filePath)
      if (existingSize > rangeChunk.length) removeFile(rangeChunk.filePath)
      rangeChunk.bytes = existingSize > rangeChunk.length ? 0 : existingSize
      return rangeChunk
    }

    const splitTailChunk = (chunk, targetSize) => {
      const remainingStart = chunk.start + chunk.bytes
      const remainingEnd = chunk.end
      const remainingLength = remainingEnd - remainingStart + 1
      const maxParts = Math.floor(remainingLength / MIN_DYNAMIC_CHUNK_BYTES)
      const partCount = Math.min(
        MAX_DYNAMIC_SPLIT_PARTS,
        maxParts,
        Math.max(2, Math.ceil(remainingLength / Math.max(MIN_DYNAMIC_CHUNK_BYTES, targetSize))),
      )
      if (partCount < 2) return false

      const pendingIndex = pendingChunks.indexOf(chunk)
      if (pendingIndex >= 0) pendingChunks.splice(pendingIndex, 1)

      if (chunk.bytes > 0) {
        chunk.end = remainingStart - 1
        chunk.length = chunk.bytes
        completedChunks += 1
      } else {
        const chunkIndex = chunks.indexOf(chunk)
        if (chunkIndex >= 0) chunks.splice(chunkIndex, 1)
      }

      const baseLength = Math.floor(remainingLength / partCount)
      let start = remainingStart
      for (let index = 0; index < partCount; index += 1) {
        const end =
          index === partCount - 1 ? remainingEnd : Math.min(remainingEnd, start + baseLength - 1)
        const rangeChunk = createRangeChunk(start, end)
        chunks.push(rangeChunk)
        if (rangeChunk.bytes < rangeChunk.length) pendingChunks.push(rangeChunk)
        start = end + 1
      }
      return true
    }

    const expandTailChunks = () => {
      const targetPending = Math.max(
        this.concurrency + 1,
        this.concurrency * DYNAMIC_PENDING_MULTIPLIER,
      )
      const downloadedBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
      if (downloadedBytes < size * 0.75) return

      while (pendingChunks.length > 0 && pendingChunks.length < targetPending) {
        let target = pendingChunks[0]
        let targetRemaining = target.length - target.bytes
        for (const chunk of pendingChunks.slice(1)) {
          const remaining = chunk.length - chunk.bytes
          if (remaining > targetRemaining) {
            target = chunk
            targetRemaining = remaining
          }
        }
        if (targetRemaining < MIN_DYNAMIC_CHUNK_BYTES * 2) break

        const totalRemaining = pendingChunks.reduce(
          (sum, chunk) => sum + (chunk.length - chunk.bytes),
          0,
        )
        const targetSize = Math.max(
          MIN_DYNAMIC_CHUNK_BYTES,
          Math.ceil(totalRemaining / targetPending),
        )
        if (!splitTailChunk(target, targetSize)) break
      }
    }

    const claimNextChunk = () => {
      expandTailChunks()
      return pendingChunks.shift() || null
    }

    const reportProgress = (phase = 'downloading') => {
      const now = Date.now()
      const received = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)
      const interval = Math.max(1, now - lastSampleAt)
      const currentSpeed = Math.max(0, ((received - lastBytes) * 1000) / interval)
      smoothedSpeed = smoothedSpeed ? smoothedSpeed * 0.65 + currentSpeed * 0.35 : currentSpeed
      lastBytes = received
      lastSampleAt = now
      const elapsedSeconds = Math.max(0.001, (now - startedAt) / 1000)
      const averageSpeed = received / elapsedSeconds
      const speed = smoothedSpeed > 0 ? smoothedSpeed : averageSpeed
      onProgress({
        phase,
        sourceId: 'accelerated',
        sourceLabel: sourceLabel(),
        received,
        total: size,
        percent: Math.min(100, Math.max(0, Math.round((received / size) * 100))),
        bytesPerSecond: speed,
        etaSeconds: speed > 0 ? Math.max(0, (size - received) / speed) : null,
        activeConnections: activeTransfers,
        completedChunks,
        totalChunks: chunks.length,
        mode: 'segmented',
      })
    }

    const runController = new AbortController()
    let firstError = null
    const workerCount = Math.min(this.concurrency, chunks.length)
    const workers = Array.from({ length: workerCount }, () =>
      (async () => {
        while (!firstError) {
          const chunk = claimNextChunk()
          if (!chunk) return
          activeTransfers += 1
          try {
            const usedSource = await this.downloadChunk(
              chunk,
              sources,
              runController.signal,
              () => {
                const now = Date.now()
                if (now - lastProgressAt >= PROGRESS_INTERVAL) {
                  lastProgressAt = now
                  reportProgress()
                }
              },
            )
            if (usedSource?.label) usedSourceLabels.add(usedSource.label)
            completedChunks += 1
            reportProgress()
          } catch (error) {
            if (!firstError) {
              firstError = error
              runController.abort()
            }
          } finally {
            activeTransfers = Math.max(0, activeTransfers - 1)
          }
        }
      })(),
    )

    reportProgress('starting')
    await Promise.allSettled(workers)
    if (firstError) throw firstError
    if (chunks.some((chunk) => chunk.bytes !== chunk.length)) {
      throw new Error('部分下载分片不完整，请重新下载。')
    }

    const orderedChunks = [...chunks].sort((left, right) => left.start - right.start)
    let expectedStart = 0
    for (const chunk of orderedChunks) {
      if (chunk.start !== expectedStart) {
        throw new Error('下载分片范围不连续，请重新下载。')
      }
      expectedStart = chunk.end + 1
    }
    if (expectedStart !== size) {
      throw new Error('下载分片没有覆盖完整安装包，请重新下载。')
    }

    const actualSha256 = await assembleChunks(orderedChunks, target, size, sha256)
    fs.rmSync(metaDir, { recursive: true, force: true })
    reportProgress('completed')
    return {
      filePath: target,
      sha256: actualSha256,
      checksumVerified: Boolean(sha256),
      sourceId: 'accelerated',
      sourceLabel: sourceLabel(),
      mode: 'segmented',
      connections: workerCount,
    }
  }

  async downloadSingle({ size, sha256, sources, target, onProgress }) {
    const part = `${target}.part`
    let completed = null

    for (let attempt = 0; attempt < Math.min(6, sources.length * 2); attempt += 1) {
      const source = sources[attempt % sources.length]
      const controller = new AbortController()
      let idleTimer = null
      let received = Math.min(fileSize(part), size || Number.MAX_SAFE_INTEGER)
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(
          () => controller.abort(new Error('下载线路长时间没有返回数据')),
          this.idleTimeoutMs,
        )
      }

      resetIdleTimer()
      try {
        const response = await this.fetchImpl(source.url, {
          headers: {
            Accept: 'application/octet-stream',
            ...(received > 0 ? { Range: `bytes=${received}-` } : {}),
            'User-Agent': 'ZP-Workbench-Launcher',
          },
          signal: controller.signal,
        })
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
        if (received > 0 && response.status !== 206) {
          removeFile(part)
          received = 0
          throw new Error('下载线路不支持断点续传')
        }

        const tracker = new Transform({
          transform: (data, _encoding, callback) => {
            received += data.length
            resetIdleTimer()
            onProgress({
              phase: 'downloading',
              sourceId: source.id,
              sourceLabel: source.label,
              received,
              total: size || 0,
              percent: size ? Math.min(100, Math.round((received / size) * 100)) : null,
              mode: 'single',
            })
            callback(null, data)
          },
        })

        await pipeline(
          Readable.fromWeb(response.body),
          tracker,
          fs.createWriteStream(part, {
            flags: received > 0 && response.status === 206 ? 'a' : 'w',
          }),
        )
        if (size && fileSize(part) !== size) {
          throw new Error(`安装包大小校验失败，期望 ${size} 字节，实际 ${fileSize(part)} 字节`)
        }
        const actualSha256 = await hashFile(part)
        if (sha256 && actualSha256 !== sha256) {
          removeFile(part)
          throw new Error(`SHA-256 校验失败，期望 ${sha256}，实际 ${actualSha256}`)
        }
        removeFile(target)
        fs.renameSync(part, target)
        completed = {
          filePath: target,
          sha256: actualSha256,
          checksumVerified: Boolean(sha256),
          sourceId: source.id,
          sourceLabel: source.label,
          mode: 'single',
          connections: 1,
        }
        onProgress({
          phase: 'completed',
          received: size || received,
          total: size || received,
          percent: 100,
          ...completed,
        })
        return completed
      } catch (error) {
        this.logger.warn?.(
          'launcher-update',
          `${source.label} 下载失败：${abortErrorMessage(error)}`,
        )
      } finally {
        if (idleTimer) clearTimeout(idleTimer)
      }
    }

    throw new Error(completed ? '安装包下载失败。' : '所有下载线路均失败。')
  }

  async download({ name, size, sha256, sources, target, onProgress = () => {} }) {
    const normalized = normalizeSources(sources)
    if (!normalized.length) throw new Error('发布包中没有找到匹配的安装程序。')

    let probedSources = normalized
    if (Number(size) >= MIN_ACCELERATED_DOWNLOAD_SIZE) {
      const probed = await this.probeSources(normalized)
      const reachable = probed
        .filter((source) => source.reachable && source.speed > 0)
        .sort((left, right) => right.speed - left.speed)
      if (reachable.length) probedSources = reachable

      const rangeSources = probedSources.filter((source) => source.rangeSupported)
      if (rangeSources.length) {
        try {
          return await this.downloadSegmented({
            name,
            size,
            sha256,
            sources: rangeSources,
            target,
            onProgress,
          })
        } catch (error) {
          this.logger.warn?.(
            'launcher-update',
            `分片下载未完成，正在回退到单线路续传：${abortErrorMessage(error)}`,
          )
        }
      }
    }

    return this.downloadSingle({
      size,
      sha256,
      sources: probedSources,
      target,
      onProgress,
    })
  }
}

module.exports = {
  DownloadAccelerator,
  MIN_ACCELERATED_DOWNLOAD_SIZE,
  parseContentRange,
}

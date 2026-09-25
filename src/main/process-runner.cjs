const { spawn } = require('node:child_process')

function stripAnsi(value) {
  return String(value).replace(
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    '',
  )
}

class ProcessRunner {
  constructor(logger) {
    this.logger = logger
    this.active = new Map()
  }

  run(executable, args, options = {}) {
    const taskId = options.taskId || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const scope = options.scope || 'process'
    const onOutput = options.onOutput
    const cwd = options.cwd
    const env = options.env || process.env
    let capturedStdout = ''
    let timedOut = false

    return new Promise((resolve, reject) => {
      this.logger.info(scope, `$ ${executable} ${args.join(' ')}`)
      const child = spawn(executable, args, {
        cwd,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.active.set(taskId, child)
      const timeout = Number(options.timeoutMs)
      const timer =
        Number.isFinite(timeout) && timeout > 0
          ? setTimeout(() => {
              timedOut = true
              child.kill()
            }, timeout)
          : null
      timer?.unref?.()

      const forward = (stream, level) => {
        let buffer = ''
        stream.setEncoding('utf8')
        stream.on('data', (chunk) => {
          buffer += chunk
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() || ''
          for (const rawLine of lines) {
            const line = stripAnsi(rawLine)
            if (!line) continue
            this.logger[level](scope, line)
            if (options.captureOutput && level === 'info') capturedStdout += `${line}\n`
            onOutput?.({ stream: level === 'error' ? 'stderr' : 'stdout', line, taskId })
          }
        })
        stream.on('end', () => {
          const line = stripAnsi(buffer)
          if (line) {
            this.logger[level](scope, line)
            if (options.captureOutput && level === 'info') capturedStdout += `${line}\n`
            onOutput?.({ stream: level === 'error' ? 'stderr' : 'stdout', line, taskId })
          }
        })
      }

      forward(child.stdout, 'info')
      forward(child.stderr, 'warn')

      child.once('error', (error) => {
        if (timer) clearTimeout(timer)
        this.active.delete(taskId)
        reject(error)
      })
      child.once('exit', (code, signal) => {
        if (timer) clearTimeout(timer)
        this.active.delete(taskId)
        if (timedOut) {
          reject(
            Object.assign(new Error(`${scope} timed out`), {
              code: 'ETIMEDOUT',
              signal,
              taskId,
            }),
          )
          return
        }
        if (code === 0) {
          resolve({
            code,
            signal,
            taskId,
            stdout: options.captureOutput ? capturedStdout : undefined,
          })
          return
        }
        reject(
          Object.assign(new Error(`${scope} exited with code ${code ?? 'unknown'}`), {
            code,
            signal,
            taskId,
          }),
        )
      })
    })
  }

  kill(taskId, signal = 'SIGTERM') {
    const child = this.active.get(taskId)
    if (!child) return false
    child.kill(signal)
    return true
  }

  killAll() {
    for (const child of this.active.values()) {
      try {
        child.kill()
      } catch {
        // The process may already have exited.
      }
    }
  }
}

module.exports = { ProcessRunner, stripAnsi }

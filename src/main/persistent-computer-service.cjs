const { randomUUID } = require('node:crypto')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')

function buildServiceScript({ inspectionScript, actionScript, windowScript }) {
  const inspection = Buffer.from(inspectionScript || '', 'utf8').toString('base64')
  const action = Buffer.from(actionScript || '', 'utf8').toString('base64')
  const window = Buffer.from(windowScript || '', 'utf8').toString('base64')
  return String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$inspectionScriptBase64 = '${inspection}'
$actionScriptBase64 = '${action}'
$windowScriptBase64 = '${window}'

function Decode-Script {
  param([string]$Value)
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
}

function Invoke-CapturedScript {
  param([string]$Script)
  return (& ([scriptblock]::Create($Script)) 2>&1 | Out-String)
}

function Send-Response {
  param([string]$Id, [bool]$Ok, [object]$Result, [string]$Error)
  $response = [PSCustomObject]@{
    id = $Id
    ok = $Ok
    result = $Result
    error = $Error
  }
  $response | ConvertTo-Json -Compress -Depth 16
  [Console]::Out.Flush()
}

Send-Response '__READY__' $true $null ''
$stopService = $false

while (-not $stopService) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }

  $requestId = ''
  try {
    $request = ConvertFrom-Json $line
    $requestId = [string]$request.id
    switch ([string]$request.method) {
      'inspect' {
        $script = Decode-Script $inspectionScriptBase64
        $script = $script.Replace('__PROCESS_ID__', [string]$request.params.processId)
        $script = $script.Replace('__MAX_DEPTH__', [string]$request.params.maxDepth)
        $script = $script.Replace('__MAX_NODES__', [string]$request.params.maxNodes)
        $raw = Invoke-CapturedScript $script
        $nodes = New-Object System.Collections.Generic.List[object]
        foreach ($outputLine in ($raw -split "\r?\n")) {
          if ([string]::IsNullOrWhiteSpace($outputLine)) { continue }
          try { $nodes.Add((ConvertFrom-Json $outputLine)) } catch {}
        }
        $nodeJson = @()
        foreach ($node in $nodes) {
          $nodeJson += ($node | ConvertTo-Json -Compress -Depth 5)
        }
        Send-Response $requestId $true ([PSCustomObject]@{
          processId = [int]$request.params.processId
          available = $nodes.Count -gt 0
          nodesJson = ('[' + ($nodeJson -join ',') + ']')
        }) ''
      }
      'action' {
        $env:ZP_UIA_ACTION_PAYLOAD = [string]$request.params.payload
        $script = Decode-Script $actionScriptBase64
        $raw = Invoke-CapturedScript $script
        $result = $null
        foreach ($outputLine in ($raw -split "\r?\n")) {
          if ([string]::IsNullOrWhiteSpace($outputLine)) { continue }
          try { $result = ConvertFrom-Json $outputLine } catch {}
        }
        if ($null -eq $result) { throw 'The action script returned no JSON result.' }
        Send-Response $requestId $true $result ''
      }
      'windows' {
        $env:ZP_WINDOW_PROCESS_ID = [string]$request.params.processId
        $script = Decode-Script $windowScriptBase64
        $raw = Invoke-CapturedScript $script
        $windows = New-Object System.Collections.Generic.List[object]
        foreach ($outputLine in ($raw -split "\r?\n")) {
          if ([string]::IsNullOrWhiteSpace($outputLine)) { continue }
          try { $windows.Add((ConvertFrom-Json $outputLine)) } catch {}
        }
        $windowJson = @()
        foreach ($window in $windows) {
          $windowJson += ($window | ConvertTo-Json -Compress -Depth 3)
        }
        Send-Response $requestId $true ([PSCustomObject]@{
          processId = [int]$request.params.processId
          windowsJson = ('[' + ($windowJson -join ',') + ']')
        }) ''
      }
      'shutdown' {
        Send-Response $requestId $true $null ''
        $stopService = $true
      }
      default {
        throw "Unknown computer service method: $($request.method)"
      }
    }
  } catch {
    Send-Response $requestId $false $null ([string]$_.Exception.Message)
  }
}
`
}

class PersistentComputerService {
  constructor({
    logger,
    inspectionScript,
    actionScript,
    windowScript,
    executable = 'powershell.exe',
    requestTimeoutMs = 25000,
  }) {
    this.logger = logger
    this.executable = executable
    this.requestTimeoutMs = requestTimeoutMs
    this.script = buildServiceScript({ inspectionScript, actionScript, windowScript })
    this.child = null
    this.reader = null
    this.pending = new Map()
    this.readyPromise = null
    this.scriptPath = ''
  }

  async start() {
    if (this.child && !this.child.killed) return
    if (this.readyPromise) return this.readyPromise
    this.scriptPath = path.join(
      os.tmpdir(),
      `zp-computer-service-${process.pid}-${randomUUID()}.ps1`,
    )
    fs.writeFileSync(this.scriptPath, `\uFEFF${this.script}`, 'utf8')
    const child = spawn(
      this.executable,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.scriptPath,
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    this.child = child
    this.reader = readline.createInterface({ input: child.stdout })
    this.readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Computer service start timed out.')),
        10000,
      )
      this.readyResolve = (value) => {
        clearTimeout(timeout)
        resolve(value)
      }
      this.readyReject = (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    })
    this.reader.on('line', (line) => this.handleLine(line))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text) this.logger?.warn?.('computer-service', text)
    })
    child.once('error', (error) => this.handleExit(error))
    child.once('exit', (code, signal) => {
      this.handleExit(
        new Error(
          `Computer service exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`,
        ),
      )
    })
    return this.readyPromise
  }

  handleLine(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.id === '__READY__') {
      this.readyResolve?.(true)
      this.readyResolve = null
      this.readyReject = null
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    if (message.ok) pending.resolve(message.result)
    else pending.reject(new Error(message.error || 'Computer service request failed.'))
  }

  handleExit(error) {
    const wasStarting = Boolean(this.readyPromise)
    this.readyReject?.(error)
    this.readyResolve = null
    this.readyReject = null
    this.readyPromise = null
    this.child = null
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.removeScriptFile()
    if (!wasStarting) this.logger?.warn?.('computer-service', error.message)
  }

  removeScriptFile() {
    if (!this.scriptPath) return
    try {
      fs.rmSync(this.scriptPath, { force: true })
    } catch {
      // Temporary service scripts are best-effort cleanup.
    }
    this.scriptPath = ''
  }

  async call(method, params = {}) {
    await this.start()
    if (!this.child?.stdin?.writable) throw new Error('Computer service is unavailable.')
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Computer service request timed out: ${method}`))
      }, this.requestTimeoutMs)
      timer.unref?.()
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }

  async stop() {
    const child = this.child
    if (!child) return
    try {
      await this.call('shutdown')
    } catch {
      // The process may already be gone or unresponsive.
    }
    this.reader?.close()
    this.reader = null
    if (!child.killed) child.kill()
    this.child = null
    this.readyPromise = null
    this.removeScriptFile()
  }
}

module.exports = {
  PersistentComputerService,
  buildServiceScript,
}

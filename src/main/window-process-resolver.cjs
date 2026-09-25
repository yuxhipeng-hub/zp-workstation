const { ProcessRunner } = require('./process-runner.cjs')

const WINDOW_PROCESS_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not ('ZpWindowEnum' -as [type])) {
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ZpWindowEnum {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@
}

$rootProcessId = [int]$env:ZP_WINDOW_PROCESS_ID
$allWindows = $rootProcessId -le 0
$allowed = $null
if (-not $allWindows) {
  $processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
  $allowed = New-Object 'System.Collections.Generic.HashSet[int]'
  [void]$allowed.Add($rootProcessId)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($process in $processes) {
      if ($allowed.Contains([int]$process.ParentProcessId) -and -not $allowed.Contains([int]$process.ProcessId)) {
        [void]$allowed.Add([int]$process.ProcessId)
        $changed = $true
      }
    }
  }
}

$items = New-Object System.Collections.Generic.List[object]
$callback = [ZpWindowEnum+EnumWindowsProc]{
  param([IntPtr]$window, [IntPtr]$unused)
  $processId = [uint32]0
  [void][ZpWindowEnum]::GetWindowThreadProcessId($window, [ref]$processId)
  if ($allWindows -or $allowed.Contains([int]$processId)) {
    $title = New-Object System.Text.StringBuilder 512
    [void][ZpWindowEnum]::GetWindowText($window, $title, $title.Capacity)
    $items.Add([PSCustomObject]@{
      handle = $window.ToInt64()
      processId = [int]$processId
      title = $title.ToString()
      visible = [bool][ZpWindowEnum]::IsWindowVisible($window)
    })
  }
  return $true
}
[void][ZpWindowEnum]::EnumWindows($callback, [IntPtr]::Zero)

foreach ($item in $items) {
  $item | ConvertTo-Json -Compress -Depth 3
}
`

function parseWindowOutput(output) {
  const windows = []
  for (const line of String(output || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const item = JSON.parse(trimmed)
      windows.push({
        handle: String(item.handle),
        processId: Number(item.processId),
        title: String(item.title || ''),
        visible: Boolean(item.visible),
      })
    } catch {
      // Ignore non-JSON process output.
    }
  }
  return windows
}

class WindowProcessResolver {
  /**
   * @param {{ logger?: object, runner?: ProcessRunner, cacheMs?: number, persistentService?: object }} options
   */
  constructor(options = {}) {
    const {
      logger = null,
      runner = new ProcessRunner(logger),
      cacheMs = 1200,
      persistentService = null,
    } = options
    this.logger = logger
    this.runner = runner
    this.cacheMs = cacheMs
    this.persistentService = persistentService
    this.cache = new Map()
  }

  async resolve(processId) {
    const pid = Number(processId)
    if (!Number.isInteger(pid) || pid <= 0) return []
    const cached = this.cache.get(pid)
    if (cached && cached.expiresAt > Date.now()) return cached.windows
    if (this.persistentService) {
      const result = await this.persistentService.call('windows', { processId: pid })
      let sourceWindows = Array.isArray(result?.windows) ? result.windows : []
      if (typeof result?.windowsJson === 'string') {
        try {
          sourceWindows = JSON.parse(result.windowsJson)
        } catch {
          sourceWindows = []
        }
      }
      const windows = sourceWindows.map((item) => ({
        handle: String(item.handle),
        processId: Number(item.processId),
        title: String(item.title || ''),
        visible: Boolean(item.visible),
      }))
      this.cache.set(pid, {
        windows,
        expiresAt: Date.now() + this.cacheMs,
      })
      return windows
    }
    const encodedCommand = Buffer.from(WINDOW_PROCESS_SCRIPT, 'utf16le').toString('base64')
    const result = await this.runner.run(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
      {
        scope: 'window-resolver',
        taskId: `window-resolver-${pid}-${Date.now()}`,
        captureOutput: true,
        timeoutMs: 8000,
        env: {
          ...process.env,
          ZP_WINDOW_PROCESS_ID: String(pid),
        },
      },
    )
    const windows = parseWindowOutput(result.stdout)
    this.cache.set(pid, {
      windows,
      expiresAt: Date.now() + this.cacheMs,
    })
    return windows
  }

  async resolveAll() {
    const cacheKey = 0
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.windows
    if (this.persistentService) {
      const result = await this.persistentService.call('windows', { processId: 0 })
      let sourceWindows = Array.isArray(result?.windows) ? result.windows : []
      if (typeof result?.windowsJson === 'string') {
        try {
          sourceWindows = JSON.parse(result.windowsJson)
        } catch {
          sourceWindows = []
        }
      }
      const windows = sourceWindows.map((item) => ({
        handle: String(item.handle),
        processId: Number(item.processId),
        title: String(item.title || ''),
        visible: Boolean(item.visible),
      }))
      this.cache.set(cacheKey, {
        windows,
        expiresAt: Date.now() + this.cacheMs,
      })
      return windows
    }
    return []
  }

  clear(processId) {
    if (processId) this.cache.delete(Number(processId))
    else this.cache.clear()
  }
}

module.exports = {
  WINDOW_PROCESS_SCRIPT,
  WindowProcessResolver,
  parseWindowOutput,
}

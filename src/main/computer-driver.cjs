const { ProcessRunner } = require('./process-runner.cjs')

const INSPECTION_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$processId = __PROCESS_ID__
$maxDepth = __MAX_DEPTH__
$maxNodes = __MAX_NODES__
$script:nodeCount = 0
$script:windowIndex = 0

function Safe-Text {
  param([object]$Value, [int]$Limit = 240)
  if ($null -eq $Value) { return '' }
  $text = [string]$Value
  $normalized = $text.Replace([char]13, ' ').Replace([char]10, ' ').Trim()
  return $normalized.Substring(0, [Math]::Min($Limit, $normalized.Length))
}

function Emit-Node {
  param(
    [Windows.Automation.AutomationElement]$Element,
    [int]$Depth,
    [string]$Path
  )

  if ($script:nodeCount -ge $maxNodes) { return }

  try {
    $current = $Element.Current
    $bounds = $current.BoundingRectangle
    $patterns = @()
    foreach ($pattern in $Element.GetSupportedPatterns()) {
      $patterns += Safe-Text $pattern.ProgrammaticName 120
    }
    $selected = $false
    try {
      $selectionPattern = $Element.GetCurrentPattern(
        [Windows.Automation.SelectionItemPattern]::Pattern
      )
      $selected = [bool]$selectionPattern.Current.IsSelected
    } catch {}
    $node = [PSCustomObject]@{
      depth = $Depth
      path = $Path
      name = Safe-Text $current.Name
      automationId = Safe-Text $current.AutomationId 160
      controlType = Safe-Text $current.ControlType.ProgrammaticName 80
      className = Safe-Text $current.ClassName 160
      enabled = [bool]$current.IsEnabled
      offscreen = [bool]$current.IsOffscreen
      x = [int]$bounds.X
      y = [int]$bounds.Y
      width = [int]$bounds.Width
      height = [int]$bounds.Height
      patterns = $patterns
      selected = $selected
    }
    $node | ConvertTo-Json -Compress -Depth 3
    $script:nodeCount += 1
  } catch {
    return
  }

  if ($Depth -ge $maxDepth -or $script:nodeCount -ge $maxNodes) { return }
  try {
    $children = $Element.FindAll(
      [Windows.Automation.TreeScope]::Children,
      [Windows.Automation.Condition]::TrueCondition
    )
    $childIndex = 0
    foreach ($child in $children) {
      if ($script:nodeCount -ge $maxNodes) { break }
      Emit-Node $child ($Depth + 1) "$Path.$childIndex"
      $childIndex += 1
    }
  } catch {
    return
  }
}

$root = [Windows.Automation.AutomationElement]::RootElement
$condition = New-Object Windows.Automation.PropertyCondition(
  [Windows.Automation.AutomationElement]::ProcessIdProperty,
  $processId
)
$windows = $root.FindAll([Windows.Automation.TreeScope]::Children, $condition)
if ($windows.Count -eq 0) {
  throw "No top-level UI Automation window was found for process $processId."
}

foreach ($window in $windows) {
  if ($script:nodeCount -ge $maxNodes) { break }
  Emit-Node $window 0 ([string]$script:windowIndex)
  $script:windowIndex += 1
}
`

const ACTION_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

if (-not ('ZpNativeWindow' -as [type])) {
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ZpNativeWindow {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);
  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

  public static bool Activate(IntPtr hWnd) {
    IntPtr foreground = GetForegroundWindow();
    uint foregroundThread = GetWindowThreadProcessId(foreground, IntPtr.Zero);
    uint targetThread = GetWindowThreadProcessId(hWnd, IntPtr.Zero);
    uint currentThread = GetCurrentThreadId();
    bool attachedForeground = AttachThreadInput(currentThread, foregroundThread, true);
    bool attachedTarget = AttachThreadInput(currentThread, targetThread, true);
    ShowWindow(hWnd, 9);
    BringWindowToTop(hWnd);
    SetWindowPos(hWnd, new IntPtr(-1), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040);
    SetWindowPos(hWnd, new IntPtr(-2), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0040);
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    bool activated = SetForegroundWindow(hWnd);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
    if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
    return activated || GetForegroundWindow() == hWnd;
  }
}
"@
}

$payloadJson = [Text.Encoding]::UTF8.GetString(
  [Convert]::FromBase64String($env:ZP_UIA_ACTION_PAYLOAD)
)
$payload = ConvertFrom-Json $payloadJson
$processId = [int]$payload.processId
$action = [string]$payload.action
$selector = $payload.selector
$value = [string]$payload.value

function Safe-Text {
  param([object]$Value, [int]$Limit = 240, [switch]$PreserveLines)
  if ($null -eq $Value) { return '' }
  $text = [string]$Value
  $normalized = if ($PreserveLines) {
    $text.Replace([string][char]13, '').Trim()
  } else {
    $text.Replace([char]13, ' ').Replace([char]10, ' ').Trim()
  }
  return $normalized.Substring(0, [Math]::Min($Limit, $normalized.Length))
}

function Test-Selector {
  param(
    [Windows.Automation.AutomationElement]$Element,
    [object]$Selector
  )

  $current = $Element.Current
  if ($Selector.automationId -and $current.AutomationId -ne $Selector.automationId) {
    return $false
  }
  if ($Selector.name -and $current.Name -ne $Selector.name) {
    return $false
  }
  if ($Selector.controlType -and $current.ControlType.ProgrammaticName -ne $Selector.controlType) {
    return $false
  }
  return $true
}

function Find-ByPath {
  param(
    [Windows.Automation.AutomationElement]$Root,
    [string]$Path
  )

  $indices = $Path.Split('.') | ForEach-Object { [int]$_ }
  $current = $Root
  foreach ($index in $indices) {
    $children = $current.FindAll(
      [Windows.Automation.TreeScope]::Children,
      [Windows.Automation.Condition]::TrueCondition
    )
    if ($index -lt 0 -or $index -ge $children.Count) { return $null }
    $current = $children.Item($index)
  }
  return $current
}

function Find-Element {
  param([object]$Selector)

  $root = [Windows.Automation.AutomationElement]::RootElement
  $processCondition = New-Object Windows.Automation.PropertyCondition(
    [Windows.Automation.AutomationElement]::ProcessIdProperty,
    $processId
  )
  $windows = $root.FindAll([Windows.Automation.TreeScope]::Children, $processCondition)
  if ($windows.Count -eq 0) { throw "No top-level UI Automation window was found." }

  if ($Selector.path) {
    $parts = $Selector.path.Split('.')
    $windowIndex = [int]$parts[0]
    if ($windowIndex -ge 0 -and $windowIndex -lt $windows.Count) {
      $window = $windows.Item($windowIndex)
      $byPath = if ($parts.Count -eq 1) {
        $window
      } else {
        Find-ByPath $window (($parts | Select-Object -Skip 1) -join '.')
      }
      if ($null -ne $byPath -and (Test-Selector $byPath $Selector)) {
        return $byPath
      }
    }
  }

  $conditions = New-Object System.Collections.Generic.List[object]
  if ($Selector.automationId) {
    $conditions.Add((New-Object Windows.Automation.PropertyCondition(
      [Windows.Automation.AutomationElement]::AutomationIdProperty,
      $Selector.automationId
    )))
  }
  if ($Selector.name) {
    $conditions.Add((New-Object Windows.Automation.PropertyCondition(
      [Windows.Automation.AutomationElement]::NameProperty,
      $Selector.name
    )))
  }

  $condition = [Windows.Automation.Condition]::TrueCondition
  if ($conditions.Count -eq 1) {
    $condition = $conditions[0]
  } elseif ($conditions.Count -gt 1) {
    $array = New-Object 'Windows.Automation.Condition[]' $conditions.Count
    for ($index = 0; $index -lt $conditions.Count; $index += 1) {
      $array[$index] = $conditions[$index]
    }
    $condition = New-Object Windows.Automation.AndCondition($array)
  }

  foreach ($window in $windows) {
    $matches = $window.FindAll([Windows.Automation.TreeScope]::Descendants, $condition)
    foreach ($candidate in $matches) {
      if (Test-Selector $candidate $Selector) { return $candidate }
    }
  }
  throw "The requested UI Automation element was not found."
}

function Get-PatternName {
  param([object]$Pattern)
  if ($null -eq $Pattern) { return '' }
  return Safe-Text $Pattern.ProgrammaticName 120
}

function Get-TopLevelWindow {
  param([Windows.Automation.AutomationElement]$Element)
  $current = $Element
  while ($null -ne $current) {
    $parent = [Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($current)
    if ($null -eq $parent -or $parent -eq [Windows.Automation.AutomationElement]::RootElement) {
      return $current
    }
    $current = $parent
  }
  return $null
}

function Convert-ToSendKeysLiteral {
  param([string]$Text)
  $builder = New-Object System.Text.StringBuilder
  foreach ($character in $Text.ToCharArray()) {
    $value = [string]$character
    if ('+^%~(){}[]'.Contains($value)) {
      [void]$builder.Append('{' + $value + '}')
    } else {
      [void]$builder.Append($value)
    }
  }
  return $builder.ToString()
}

function Activate-Target {
  param([Windows.Automation.AutomationElement]$Element)
  $window = Get-TopLevelWindow $Element
  if ($null -eq $window) { throw "The target window could not be resolved." }
  $handle = [IntPtr]$window.Current.NativeWindowHandle
  if ($handle -ne [IntPtr]::Zero) {
    $foreground = [IntPtr]::Zero
    for ($attempt = 0; $attempt -lt 3; $attempt += 1) {
      [void][ZpNativeWindow]::Activate($handle)
      Start-Sleep -Milliseconds 140
      $foreground = [ZpNativeWindow]::GetForegroundWindow()
      if ($foreground -eq $handle) { break }
    }
    if ($foreground -ne $handle) {
      throw "The target window did not become the foreground window."
    }
  } else {
    try { $window.SetFocus() } catch {}
  }
  try { $Element.SetFocus() } catch {}
  if ($handle -eq [IntPtr]::Zero -and -not $Element.Current.HasKeyboardFocus) {
    throw "The target element did not receive keyboard focus."
  }
  Start-Sleep -Milliseconds 120
}

$result = $null
try {
  $element = Find-Element $selector
  $effect = 'unverifiable'
  $confirmed = $false
  $text = ''

  switch ($action) {
    'focus' {
      $element.SetFocus()
      Start-Sleep -Milliseconds 180
      $confirmed = [bool]$element.Current.HasKeyboardFocus
      $effect = if ($confirmed) { 'confirmed' } else { 'unverifiable' }
    }
    'invoke' {
      $pattern = $element.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern)
      $pattern.Invoke()
      $effect = 'unverifiable'
    }
    'select' {
      $pattern = $element.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern)
      $pattern.Select()
      Start-Sleep -Milliseconds 180
      $confirmed = [bool]$pattern.Current.IsSelected
      $effect = if ($confirmed) { 'confirmed' } else { 'unverifiable' }
    }
    'expand' {
      $pattern = $element.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern)
      $pattern.Expand()
      Start-Sleep -Milliseconds 180
      $confirmed = $pattern.Current.ExpandCollapseState -eq [Windows.Automation.ExpandCollapseState]::Expanded
      $effect = if ($confirmed) { 'confirmed' } else { 'unverifiable' }
    }
    'collapse' {
      $pattern = $element.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern)
      $pattern.Collapse()
      Start-Sleep -Milliseconds 180
      $confirmed = $pattern.Current.ExpandCollapseState -eq [Windows.Automation.ExpandCollapseState]::Collapsed
      $effect = if ($confirmed) { 'confirmed' } else { 'unverifiable' }
    }
    'setValue' {
      $pattern = $element.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
      $pattern.SetValue($value)
      Start-Sleep -Milliseconds 180
      $confirmed = [string]$pattern.Current.Value -eq $value
      $effect = if ($confirmed) { 'confirmed' } else { 'unverifiable' }
    }
    'sendKeys' {
      Activate-Target $element
      [System.Windows.Forms.SendKeys]::SendWait($value)
      $effect = 'unverifiable'
    }
    'typeText' {
      Activate-Target $element
      [System.Windows.Forms.SendKeys]::SendWait((Convert-ToSendKeysLiteral $value))
      $effect = 'unverifiable'
    }
    'readText' {
      $pattern = $element.GetCurrentPattern([Windows.Automation.TextPattern]::Pattern)
      $text = $pattern.DocumentRange.GetText(8000)
      $confirmed = -not [string]::IsNullOrWhiteSpace($text)
      $effect = if ($confirmed) { 'confirmed' } else { 'unverifiable' }
    }
    default {
      throw "Unsupported UI Automation action: $action"
    }
  }

  $current = $element.Current
  $patterns = @()
  foreach ($pattern in $element.GetSupportedPatterns()) {
    $patterns += Get-PatternName $pattern
  }
  $result = [PSCustomObject]@{
    ok = $true
    action = $action
    effect = $effect
    confirmed = $confirmed
    name = Safe-Text $current.Name
    automationId = Safe-Text $current.AutomationId 160
    controlType = Safe-Text $current.ControlType.ProgrammaticName 80
    patterns = $patterns
    text = Safe-Text $text 8000 -PreserveLines
  }
} catch {
  $result = [PSCustomObject]@{
    ok = $false
    action = $action
    effect = 'failed'
    confirmed = $false
    error = Safe-Text $_.Exception.Message 500
  }
}

$result | ConvertTo-Json -Compress -Depth 4
`

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)))
}

function parseNodeOutput(output) {
  const nodes = []
  for (const line of String(output || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      nodes.push(JSON.parse(trimmed))
    } catch {
      // Ignore non-JSON process output.
    }
  }
  return nodes
}

function summarizeNodes(nodes) {
  const counts = {}
  for (const node of nodes) {
    const type = String(node.controlType || '').replace(/^ControlType\./, '') || 'Unknown'
    counts[type] = (counts[type] || 0) + 1
  }
  return {
    total: nodes.length,
    buttons: counts.Button || 0,
    edits: counts.Edit || 0,
    menus: (counts.Menu || 0) + (counts.MenuItem || 0) + (counts.MenuBar || 0),
    lists: (counts.List || 0) + (counts.ListItem || 0) + (counts.DataGrid || 0),
    trees: (counts.Tree || 0) + (counts.TreeItem || 0),
    documents: counts.Document || 0,
    panes: counts.Pane || 0,
    windows: counts.Window || 0,
    controlTypes: counts,
  }
}

function parseActionOutput(output) {
  const text = String(output || '').trim()
  if (!text) throw new Error('界面动作没有返回结果。')
  const line = text.split(/\r?\n/).filter(Boolean).at(-1)
  return JSON.parse(line)
}

function normalizeSelector(selector = {}) {
  return {
    path: String(selector.path || '').slice(0, 120),
    automationId: String(selector.automationId || '').slice(0, 160),
    name: String(selector.name || '').slice(0, 240),
    controlType: String(selector.controlType || '').slice(0, 80),
  }
}

class ComputerDriver {
  constructor({ logger, runner = new ProcessRunner(logger), persistentService = null }) {
    this.logger = logger
    this.runner = runner
    this.persistentService = persistentService
  }

  async inspectProcess(processId, { maxDepth = 14, maxNodes = 1200, timeoutMs = 20000 } = {}) {
    const pid = clampInteger(processId, 1, 2_147_483_647, 0)
    if (!pid) throw new Error('目标进程标识无效。')
    const depth = clampInteger(maxDepth, 0, 20, 14)
    const nodes = clampInteger(maxNodes, 1, 3000, 1200)
    if (this.persistentService) {
      const result = await this.persistentService.call('inspect', {
        processId: pid,
        maxDepth: depth,
        maxNodes: nodes,
      })
      let parsedNodes = Array.isArray(result?.nodes) ? result.nodes : []
      if (typeof result?.nodesJson === 'string') {
        try {
          parsedNodes = JSON.parse(result.nodesJson)
        } catch {
          parsedNodes = []
        }
      }
      return {
        processId: pid,
        available: Boolean(result?.available),
        nodes: parsedNodes,
        summary: summarizeNodes(parsedNodes),
      }
    }
    const script = INSPECTION_SCRIPT.replace('__PROCESS_ID__', String(pid))
      .replace('__MAX_DEPTH__', String(depth))
      .replace('__MAX_NODES__', String(nodes))
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64')
    const result = await this.runner.run(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
      {
        scope: 'computer-driver',
        taskId: `computer-driver-inspect-${pid}-${Date.now()}`,
        captureOutput: true,
        timeoutMs,
      },
    )
    const parsedNodes = parseNodeOutput(result.stdout)
    return {
      processId: pid,
      available: parsedNodes.length > 0,
      nodes: parsedNodes,
      summary: summarizeNodes(parsedNodes),
    }
  }

  async executeAction(
    processId,
    { action = '', selector = {}, value = '', timeoutMs = 15000 } = {},
  ) {
    const pid = clampInteger(processId, 1, 2_147_483_647, 0)
    if (!pid) throw new Error('目标进程标识无效。')
    const allowedActions = new Set([
      'focus',
      'invoke',
      'select',
      'expand',
      'collapse',
      'setValue',
      'sendKeys',
      'typeText',
      'readText',
    ])
    const normalizedAction = String(action || '')
    if (!allowedActions.has(normalizedAction)) throw new Error('不支持的界面动作。')
    const payload = Buffer.from(
      JSON.stringify({
        processId: pid,
        action: normalizedAction,
        selector: normalizeSelector(selector),
        value: String(value || '').slice(0, 4000),
      }),
      'utf8',
    ).toString('base64')
    if (this.persistentService) {
      return this.persistentService.call('action', { payload })
    }
    const encodedCommand = Buffer.from(ACTION_SCRIPT, 'utf16le').toString('base64')
    const result = await this.runner.run(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
      {
        scope: 'computer-driver',
        taskId: `computer-driver-action-${pid}-${Date.now()}`,
        captureOutput: true,
        timeoutMs,
        env: {
          ...process.env,
          ZP_UIA_ACTION_PAYLOAD: payload,
        },
      },
    )
    return parseActionOutput(result.stdout)
  }
}

module.exports = {
  ACTION_SCRIPT,
  ComputerDriver,
  INSPECTION_SCRIPT,
  normalizeSelector,
  parseActionOutput,
  parseNodeOutput,
  summarizeNodes,
}

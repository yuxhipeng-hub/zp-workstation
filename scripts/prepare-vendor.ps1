param(
  [string]$NodeVersion = "",
  [string]$NpmVersion = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$rootDir = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $rootDir "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$runtime = $package.bundledRuntime

if (-not $NodeVersion) {
  $NodeVersion = [string]$runtime.node
}
if (-not $NpmVersion) {
  $NpmVersion = [string]$runtime.npm
}
if (-not $NodeVersion -or -not $NpmVersion) {
  throw "package.json bundledRuntime must define Node.js and npm versions."
}

$vendorDir = Join-Path $rootDir "vendor"
$nodeDir = Join-Path $vendorDir "node"
$nodeExecutable = Join-Path $nodeDir "node.exe"
$npmDir = Join-Path $vendorDir "npm"
$npmCli = Join-Path $npmDir "node_modules\npm\bin\npm-cli.js"

$nodeReady = $false
if (-not $Force -and (Test-Path -LiteralPath $nodeExecutable)) {
  $installedNode = (& $nodeExecutable --version).Trim()
  $nodeReady = $installedNode -eq "v$NodeVersion"
}

$npmReady = $false
if (-not $Force -and (Test-Path -LiteralPath $npmCli)) {
  try {
    $installedNpm = (& $nodeExecutable $npmCli --version).Trim()
    $npmReady = $installedNpm -eq $NpmVersion
  } catch {
    $npmReady = $false
  }
}

if ($nodeReady -and $npmReady) {
  Write-Host "Bundled runtime is ready: Node.js $NodeVersion, npm $NpmVersion"
  exit 0
}

New-Item -ItemType Directory -Path $vendorDir -Force | Out-Null
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "zp-workbench-vendor-$PID"
if (Test-Path -LiteralPath $tempDir) {
  [System.IO.Directory]::Delete($tempDir, $true)
}
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
  if (-not $nodeReady) {
    $nodeMirror = ([string]$runtime.nodeMirror).TrimEnd("/")
    $archiveName = "node-v$NodeVersion-win-x64.zip"
    $archivePath = Join-Path $tempDir $archiveName
    $extractDir = Join-Path $tempDir "node"
    $nodeUrl = "$nodeMirror/v$NodeVersion/$archiveName"

    Write-Host "Downloading Node.js $NodeVersion from $nodeUrl"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $archivePath
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDir

    $sourceDir = Join-Path $extractDir "node-v$NodeVersion-win-x64"
    $sourceNode = Join-Path $sourceDir "node.exe"
    if (-not (Test-Path -LiteralPath $sourceNode)) {
      throw "Node.js archive does not contain node.exe: $nodeUrl"
    }
    New-Item -ItemType Directory -Path $nodeDir -Force | Out-Null
    Copy-Item -LiteralPath $sourceNode -Destination $nodeExecutable -Force
    $nodeLicense = Join-Path $sourceDir "LICENSE"
    if (Test-Path -LiteralPath $nodeLicense) {
      Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $nodeDir "LICENSE") -Force
    }
  }

  if (-not $npmReady) {
    if (Test-Path -LiteralPath $npmDir) {
      [System.IO.Directory]::Delete($npmDir, $true)
    }
    New-Item -ItemType Directory -Path $npmDir -Force | Out-Null
    @{
      private = $true
      dependencies = @{
        npm = $NpmVersion
      }
    } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $npmDir "package.json") -Encoding utf8

    Write-Host "Installing npm $NpmVersion into the bundled runtime"
    Push-Location $npmDir
    try {
      & npm install --ignore-scripts --no-audit --no-fund --save-exact
      if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE"
      }
    } finally {
      Pop-Location
    }
  }

  $actualNode = (& $nodeExecutable --version).Trim()
  $actualNpm = (& $nodeExecutable $npmCli --version).Trim()
  if ($actualNode -ne "v$NodeVersion" -or $actualNpm -ne $NpmVersion) {
    throw "Bundled runtime verification failed: Node.js $actualNode, npm $actualNpm"
  }

  Write-Host "Bundled runtime prepared: Node.js $actualNode, npm $actualNpm"
} finally {
  if (Test-Path -LiteralPath $tempDir) {
    [System.IO.Directory]::Delete($tempDir, $true)
  }
}

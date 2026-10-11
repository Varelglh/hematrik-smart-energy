param(
  [string]$BackendEnvFile = "$PSScriptRoot\.env",
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
)

function Read-DotEnv([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }

  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith('#')) { return }

    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }

    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()

    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }

    if ($key) { $map[$key] = $val }
  }

  return $map
}

function Get-PortFromUrl([string]$url) {
  try {
    $u = [System.Uri]$url
    return $u.Port
  } catch {
    return $null
  }
}

function Test-HttpOk([string]$url, [int]$timeoutSec = 2) {
  try {
    $prev = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    $res = Invoke-RestMethod -Method Get -Uri $url -TimeoutSec $timeoutSec
    $ProgressPreference = $prev
    return $true
  } catch {
    return $false
  }
}

function Wait-HttpOk([string]$url, [int]$maxWaitSec = 15) {
  $deadline = (Get-Date).AddSeconds($maxWaitSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-HttpOk -url $url -timeoutSec 2) { return $true }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

$envMap = Read-DotEnv $BackendEnvFile

$backendPort = if ($envMap.ContainsKey('PORT') -and $envMap['PORT']) { $envMap['PORT'] } else { '3000' }
$yoloUrl = if ($envMap.ContainsKey('YOLO_SERVICE_URL') -and $envMap['YOLO_SERVICE_URL']) { $envMap['YOLO_SERVICE_URL'] } else { 'http://127.0.0.1:8000' }

$yoloPort = $null
if ($envMap.ContainsKey('YOLO_PORT') -and $envMap['YOLO_PORT']) {
  $yoloPort = $envMap['YOLO_PORT']
} else {
  $p = Get-PortFromUrl $yoloUrl
  if ($p) { $yoloPort = "$p" }
}
if (-not $yoloPort) { $yoloPort = '8000' }

# Normalize URL to match chosen port (so backend always points correctly)
try {
  $u = [System.Uri]$yoloUrl
  $host = if ($u.Host) { $u.Host } else { '127.0.0.1' }
  $scheme = if ($u.Scheme) { $u.Scheme } else { 'http' }
  $yoloUrl = "$scheme`://$host`:$yoloPort"
} catch {
  $yoloUrl = "http://127.0.0.1:$yoloPort"
}

$reload = if ($envMap.ContainsKey('RELOAD') -and $envMap['RELOAD']) { $envMap['RELOAD'] } else { '0' }

$pythonExe = Join-Path $RepoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
  $pythonExe = "python"
}

Write-Host "RepoRoot: $RepoRoot"
Write-Host "Backend: http://127.0.0.1:$backendPort"
Write-Host "YOLO:    $yoloUrl"

# Start (or reuse) YOLO service
$yoloHealth = "$yoloUrl/health"
$yoloProc = $null
$startedYolo = $false

if (Test-HttpOk -url $yoloHealth -timeoutSec 2) {
  Write-Host "YOLO already running (health OK): $yoloHealth"
} else {
  $env:PORT = $yoloPort
  $env:RELOAD = $reload
  $yoloMain = Join-Path $RepoRoot "main.py"

  if (-not (Test-Path $yoloMain)) {
    throw "main.py tidak ditemukan di $RepoRoot"
  }

  Write-Host "Starting YOLO service..."
  $yoloProc = Start-Process -FilePath $pythonExe -ArgumentList @($yoloMain) -WorkingDirectory $RepoRoot -NoNewWindow -PassThru
  $startedYolo = $true

  if (-not (Wait-HttpOk -url $yoloHealth -maxWaitSec 45)) {
    throw "YOLO service tidak siap (health tidak OK) di $yoloHealth"
  }
}

# Start backend in foreground (so Ctrl+C stops backend)
Write-Host "Starting backend..."
$env:PORT = $backendPort
$env:YOLO_SERVICE_URL = $yoloUrl

try {
  Set-Location $PSScriptRoot
  node .\app.js
} finally {
  if ($startedYolo -and $yoloProc -and -not $yoloProc.HasExited) {
    Write-Host "Stopping YOLO service (pid $($yoloProc.Id))..."
    try { Stop-Process -Id $yoloProc.Id -Force } catch {}
  }
}

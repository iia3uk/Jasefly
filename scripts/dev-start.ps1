# start.bat → launch PHP API + Vite, open browser
. "$PSScriptRoot\dev-lib.ps1"

$Host.UI.RawUI.WindowTitle = 'Jasefly CMS — Dev Server'
Clear-Host
Write-Host ''
Write-Host '  Jasefly CMS — Starting local environment' -ForegroundColor White
Write-Host '  ──────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host ''

Ensure-DevDir
Ensure-StorageDirs

# Prerequisite checks (lightweight)
$phpExe = Find-Php
if (-not $phpExe) {
  Write-Err 'PHP not found. Run install.bat first.'
  exit 1
}
if (-not (Test-Command 'node') -or -not (Test-Command 'npm')) {
  Write-Err 'Node.js/npm not found. Run install.bat first.'
  exit 1
}
if (-not (Test-Path (Join-Path $Root 'frontend\node_modules'))) {
  Write-Err 'Frontend dependencies missing. Run install.bat first.'
  exit 1
}

$configPath = Join-Path $Root 'backend\config\config.local.php'
if (-not (Test-Path $configPath)) {
  Write-Warn 'config.local.php missing — running installer hooks...'
  & "$PSScriptRoot\dev-install.ps1"
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

# Stop any previous instance
Write-Info 'Cleaning up previous instances...'
[void](Stop-TrackedProcesses)

# Free ports
Write-Info 'Allocating ports...'
$phpPort = Get-FreePort 8080
$vitePort = Get-FreePort 5173
Save-Ports $phpPort $vitePort
Write-Ok "PHP API  → http://127.0.0.1:$phpPort"
Write-Ok "Vite App → http://localhost:$vitePort"

# Sync env so Vite proxies to the right PHP port and CORS matches
$db = Read-DbEnv
$jwt = Get-OrCreateJwt
Write-BackendConfig $db $vitePort $jwt
Write-FrontendEnv $phpPort $vitePort
Write-Ok 'Config + .env synced for these ports'

# Log files
$phpOut = Join-Path $DevDir 'php.out.log'
$phpErr = Join-Path $DevDir 'php.err.log'
$viteOut = Join-Path $DevDir 'vite.out.log'
$viteErr = Join-Path $DevDir 'vite.err.log'
Remove-Item $phpOut, $phpErr, $viteOut, $viteErr -Force -ErrorAction SilentlyContinue

# Start PHP built-in server
Write-Info 'Starting PHP backend...'
$phpProc = Start-Process -FilePath $phpExe `
  -ArgumentList @('-S', "127.0.0.1:$phpPort", (Join-Path $Root 'backend\router.php')) `
  -WorkingDirectory (Join-Path $Root 'backend') `
  -RedirectStandardOutput $phpOut `
  -RedirectStandardError $phpErr `
  -WindowStyle Hidden `
  -PassThru

# Start Vite via Node directly (reliable PID + Windows-friendly)
Write-Info 'Starting Vite frontend...'
$viteBin = Join-Path $Root 'frontend\node_modules\vite\bin\vite.js'
if (-not (Test-Path $viteBin)) {
  Write-Err 'Vite is not installed. Run install.bat first.'
  [void](Stop-TrackedProcesses)
  exit 1
}

$viteProc = Start-Process -FilePath 'node' `
  -ArgumentList @(
    $viteBin,
    '--host', '127.0.0.1',
    '--port', "$vitePort",
    '--strictPort'
  ) `
  -WorkingDirectory (Join-Path $Root 'frontend') `
  -RedirectStandardOutput $viteOut `
  -RedirectStandardError $viteErr `
  -WindowStyle Hidden `
  -PassThru

Save-Pids $phpProc.Id $viteProc.Id $phpPort $vitePort
Write-Ok "PHP PID $($phpProc.Id) · Node PID $($viteProc.Id)"

# Wait until healthy
Write-Info 'Waiting for servers...'
$apiReady = Wait-Http "http://127.0.0.1:$phpPort/api/v1/health" 45
if (-not $apiReady) {
  # Legacy alias
  $apiReady = Wait-Http "http://127.0.0.1:$phpPort/api/health" 15
}
$webReady = Wait-Http "http://127.0.0.1:$vitePort/" 60

if (-not $apiReady) {
  Write-Err 'PHP API did not become ready in time.'
  Write-Host "  Check logs: .dev\php.out.log / .dev\php.err.log" -ForegroundColor Yellow
  Write-Host '  Common fix: run install.bat (DB/JWT). Ensure MySQL is running.' -ForegroundColor Yellow
  [void](Stop-TrackedProcesses)
  exit 1
}
Write-Ok 'PHP API is ready'

if (-not $webReady) {
  Write-Err 'Vite frontend did not become ready in time.'
  Write-Host "  Check logs: .dev\vite.out.log / .dev\vite.err.log" -ForegroundColor Yellow
  [void](Stop-TrackedProcesses)
  exit 1
}
Write-Ok 'Vite frontend is ready'

$url = "http://localhost:$vitePort"
Write-Info "Opening browser → $url"
Start-Process $url | Out-Null

Write-Host ''
Write-Host '  ╔══════════════════════════════════════════════════╗' -ForegroundColor Green
Write-Host '  ║  Jasefly CMS is running                       ║' -ForegroundColor Green
Write-Host '  ╠══════════════════════════════════════════════════╣' -ForegroundColor Green
Write-Host "  ║  Site:   http://localhost:$vitePort" -ForegroundColor Green
Write-Host "  ║  Admin:  http://localhost:$vitePort/admin/login" -ForegroundColor Green
Write-Host "  ║  API:    http://127.0.0.1:$phpPort/api/v1" -ForegroundColor Green
Write-Host '  ╠══════════════════════════════════════════════════╣' -ForegroundColor Green
Write-Host '  ║  Close this window OR press Ctrl+C to stop       ║' -ForegroundColor Green
Write-Host '  ║  (also: double-click stop.bat)                   ║' -ForegroundColor Green
Write-Host '  ╚══════════════════════════════════════════════════╝' -ForegroundColor Green
Write-Host ''
Write-Host "  Logs: .dev\*.log" -ForegroundColor DarkGray
Write-Host ''

# Keep alive — stop children when this window closes / Ctrl+C
try {
  while ($true) {
    if (-not (Get-Process -Id $phpProc.Id -ErrorAction SilentlyContinue)) {
      Write-Err 'PHP process exited unexpectedly. See .dev\php.log'
      break
    }
    if (-not (Get-Process -Id $viteProc.Id -ErrorAction SilentlyContinue)) {
      Write-Err 'Vite process exited unexpectedly. See .dev\vite.log'
      break
    }
    Start-Sleep -Seconds 2
  }
} finally {
  Write-Info 'Shutting down...'
  [void](Stop-TrackedProcesses)
  Write-Ok 'Stopped.'
}

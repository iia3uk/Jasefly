# stop.bat → stop local PHP + Vite
. "$PSScriptRoot\dev-lib.ps1"

$Host.UI.RawUI.WindowTitle = 'Jasefly CMS — Stop'
Write-Host ''
Write-Info 'Stopping local development servers...'

$killed = Stop-TrackedProcesses
if ($killed.Count -gt 0) {
  foreach ($k in $killed) { Write-Ok "Stopped $k" }
} else {
  Write-Warn 'No running Jasefly CMS servers were found.'
}

Write-Ok 'Environment stopped.'
Write-Host ''

# install.bat → full local environment setup
. "$PSScriptRoot\dev-lib.ps1"

$Host.UI.RawUI.WindowTitle = 'Jasefly CMS — Install'
Clear-Host
Write-Host ''
Write-Host '  Jasefly CMS — Local Installer' -ForegroundColor White
Write-Host '  ────────────────────────────────' -ForegroundColor DarkGray
Write-Host ''

Ensure-DevDir
Ensure-StorageDirs

# ── Node.js ──────────────────────────────────────────────────────────────────
Write-Info 'Checking Node.js...'
if (-not (Test-Command 'node')) {
  Write-Err 'Node.js is not installed or not in PATH.'
  Write-Host '  Download: https://nodejs.org/ (LTS recommended)' -ForegroundColor Yellow
  Write-Host '  After installing, reopen this installer.' -ForegroundColor Yellow
  exit 1
}
$nodeVer = (& node -v 2>$null)
Write-Ok "Node.js $nodeVer"

Write-Info 'Checking npm...'
if (-not (Test-Command 'npm')) {
  Write-Err 'npm was not found. Reinstall Node.js with npm included.'
  exit 1
}
Write-Ok "npm $(& npm -v)"

# ── PHP ──────────────────────────────────────────────────────────────────────
Write-Info 'Checking PHP...'
$phpExe = Find-Php
if (-not $phpExe) {
  Write-Err 'PHP was not found.'
  Write-Host '  Install one of:' -ForegroundColor Yellow
  Write-Host '    • XAMPP  https://www.apachefriends.org/' -ForegroundColor Yellow
  Write-Host '    • Laragon https://laragon.org/' -ForegroundColor Yellow
  Write-Host '    • PHP for Windows https://windows.php.net/download/' -ForegroundColor Yellow
  Write-Host '  Then add php.exe to PATH, or install under C:\xampp\php\' -ForegroundColor Yellow
  exit 1
}
$phpVer = & $phpExe -r "echo PHP_VERSION;"
Write-Ok "PHP $phpVer ($phpExe)"

# Check PDO MySQL
$pdoOk = & $phpExe -r "echo extension_loaded('pdo_mysql') ? '1' : '0';"
if ($pdoOk -ne '1') {
  Write-Err 'PHP extension pdo_mysql is not enabled.'
  Write-Host '  Edit php.ini and enable: extension=pdo_mysql' -ForegroundColor Yellow
  exit 1
}
Write-Ok 'PHP extension pdo_mysql enabled'

# ── Database env ─────────────────────────────────────────────────────────────
Write-Info 'Preparing database settings...'
$db = Read-DbEnv
Write-DbEnv $db
Write-Ok "Wrote .dev/database.env (host=$($db.DB_HOST) db=$($db.DB_NAME) user=$($db.DB_USER))"

Write-Info 'Testing MySQL connection...'
$mysqlCli = Find-MysqlCli
if ($mysqlCli) { Write-Ok "mysql client found: $mysqlCli" }
else { Write-Warn 'mysql CLI not found — connection will be tested via PHP PDO only.' }

$probe = Test-MysqlConnection $db $phpExe
if (-not $probe.ok) {
  Write-Err "Cannot connect to MySQL: $($probe.error)"
  Write-Host ''
  Write-Host '  Fix credentials in: .dev\database.env' -ForegroundColor Yellow
  Write-Host '  Then run install.bat again.' -ForegroundColor Yellow
  Write-Host '  Typical XAMPP/Laragon defaults: user=root, password empty.' -ForegroundColor Yellow
  Write-Host '  Make sure MySQL/MariaDB is running.' -ForegroundColor Yellow
  exit 1
}
Write-Ok 'MySQL connection successful'

# ── Config + JWT ─────────────────────────────────────────────────────────────
Write-Info 'Generating local backend config + JWT secret...'
$jwt = Get-OrCreateJwt
Write-BackendConfig $db 5173 $jwt
Write-Ok 'backend/config/config.local.php ready'

Write-FrontendEnv 8080 5173
Write-Ok 'frontend/.env.development.local ready'

# ── npm install ──────────────────────────────────────────────────────────────
Write-Info 'Installing frontend dependencies (npm install)...'
Push-Location (Join-Path $Root 'frontend')
try {
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Err 'npm install failed.'
    exit 1
  }
} finally {
  Pop-Location
}
Write-Ok 'Frontend dependencies installed'

# ── Database schema ──────────────────────────────────────────────────────────
if (-not (Install-Database $db $phpExe)) {
  Write-Err 'Database installer failed. Check MySQL permissions and logs above.'
  exit 1
}
Write-Ok 'Database schema + seed ready'

# Re-sync config after install.php (it may rewrite config.local.php)
$jwt = Get-OrCreateJwt
Write-BackendConfig $db 5173 $jwt
Write-Ok 'Finalized local config + JWT'

# Ensure storage lock note
Write-Ok 'Storage directories prepared'

Write-Host ''
Write-Host '  Install complete!' -ForegroundColor Green
Write-Host ''
Write-Host '  Next step: double-click  start.bat' -ForegroundColor White
Write-Host ''
Write-Host '  Default admin login (change after first login):' -ForegroundColor DarkGray
Write-Host '    Email:    admin@example.com' -ForegroundColor Cyan
Write-Host '    Password: Admin123!' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Site:  http://localhost:5173' -ForegroundColor Cyan
Write-Host '  Admin: http://localhost:5173/admin/login' -ForegroundColor Cyan
Write-Host ''

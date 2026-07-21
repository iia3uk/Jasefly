# Shared helpers for Jasefly CMS local DX (Windows)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DevDir = Join-Path $Root '.dev'
$PidFile = Join-Path $DevDir 'pids.json'
$PortFile = Join-Path $DevDir 'ports.json'
$DbEnvFile = Join-Path $DevDir 'database.env'

function Write-Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[!!] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[XX] $msg" -ForegroundColor Red }

function Ensure-DevDir {
  if (-not (Test-Path $DevDir)) {
    New-Item -ItemType Directory -Path $DevDir -Force | Out-Null
  }
}

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Find-Php {
  $portable = Join-Path $Root '.tools\php\php.exe'
  if (Test-Path $portable) { return $portable }
  if ($env:PORTFOLIO_PHP -and (Test-Path $env:PORTFOLIO_PHP)) { return $env:PORTFOLIO_PHP }
  if (Test-Command 'php') { return (Get-Command php).Source }
  $candidates = @(
    'C:\xampp\php\php.exe',
    'C:\laragon\bin\php\php-8.3*\php.exe',
    'C:\laragon\bin\php\php-8.2*\php.exe',
    'C:\php\php.exe',
    'C:\Program Files\PHP\*\php.exe',
    'C:\tools\php\php.exe'
  )
  foreach ($pattern in $candidates) {
    $hits = @(Get-Item $pattern -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
    if ($hits.Count -gt 0) { return $hits[0].FullName }
  }
  return $null
}

function Find-MysqlCli {
  if (Test-Command 'mysql') { return (Get-Command mysql).Source }
  $candidates = @(
    'C:\xampp\mysql\bin\mysql.exe',
    'C:\laragon\bin\mysql\mysql-*\bin\mysql.exe',
    'C:\Program Files\MySQL\MySQL Server *\bin\mysql.exe',
    'C:\Program Files\MariaDB*\bin\mysql.exe'
  )
  foreach ($pattern in $candidates) {
    $hits = @(Get-Item $pattern -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
    if ($hits.Count -gt 0) { return $hits[0].FullName }
  }
  return $null
}

function Test-PortInUse([int]$Port) {
  try {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    $listener.Stop()
    return $false
  } catch {
    return $true
  }
}

function Get-FreePort([int]$StartPort, [int]$Span = 40) {
  for ($p = $StartPort; $p -lt ($StartPort + $Span); $p++) {
    if (-not (Test-PortInUse $p)) { return $p }
  }
  throw "No free port found near $StartPort"
}

function Wait-Http([string]$Url, [int]$TimeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { return $true }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  return $false
}

function New-JwtSecret {
  $bytes = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}

function Read-DbEnv {
  $defaults = @{
    DB_HOST = '127.0.0.1'
    DB_PORT = '3306'
    DB_NAME = 'jasefly_cms'
    DB_USER = 'root'
    DB_PASS = ''
  }
  if (Test-Path $DbEnvFile) {
    Get-Content $DbEnvFile | ForEach-Object {
      if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
      if ($_ -match '^\s*([^=]+)=(.*)$') {
        $defaults[$Matches[1].Trim()] = $Matches[2].Trim()
      }
    }
  }
  return $defaults
}

function Write-DbEnv($map) {
  Ensure-DevDir
  @(
    '# Local database settings for DX scripts (edit if MySQL credentials differ)',
    "DB_HOST=$($map.DB_HOST)",
    "DB_PORT=$($map.DB_PORT)",
    "DB_NAME=$($map.DB_NAME)",
    "DB_USER=$($map.DB_USER)",
    "DB_PASS=$($map.DB_PASS)"
  ) | Set-Content -Path $DbEnvFile -Encoding UTF8
}

function Save-Ports($phpPort, $vitePort) {
  Ensure-DevDir
  @{ php = $phpPort; vite = $vitePort; updated = (Get-Date).ToString('o') } |
    ConvertTo-Json | Set-Content -Path $PortFile -Encoding UTF8
}

function Load-Ports {
  if (-not (Test-Path $PortFile)) { return $null }
  return Get-Content $PortFile -Raw | ConvertFrom-Json
}

function Save-Pids($phpPid, $nodePid, $phpPort, $vitePort) {
  Ensure-DevDir
  @{
    php = $phpPid
    node = $nodePid
    phpPort = $phpPort
    vitePort = $vitePort
    started = (Get-Date).ToString('o')
  } | ConvertTo-Json | Set-Content -Path $PidFile -Encoding UTF8
}

function Load-Pids {
  if (-not (Test-Path $PidFile)) { return $null }
  return Get-Content $PidFile -Raw | ConvertFrom-Json
}

function Stop-TrackedProcesses {
  $pids = Load-Pids
  if (-not $pids) {
    Write-Warn 'No tracked process file (.dev/pids.json). Trying by port...'
  }

  $killed = @()

  if ($pids) {
    foreach ($name in @('node', 'php')) {
      $id = $pids.$name
      if ($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) {
        try {
          Stop-Process -Id $id -Force -ErrorAction Stop
          $killed += "$name#$id"
        } catch {
          Write-Warn "Could not stop $name (PID $id)"
        }
      }
    }
  }

  $ports = @()
  if ($pids) { $ports += @($pids.phpPort, $pids.vitePort) }
  $saved = Load-Ports
  if ($saved) { $ports += @($saved.php, $saved.vite) }
  $ports += @(8080, 5173)
  $ports = $ports | Where-Object { $_ } | Select-Object -Unique

  foreach ($port in $ports) {
    try {
      $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
      foreach ($c in $conns) {
        if ($c.OwningProcess -and (Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue)) {
          $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
          if ($proc -and ($proc.ProcessName -match 'php|node')) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            $killed += "$($proc.ProcessName)#$($c.OwningProcess)"
          }
        }
      }
    } catch { }
  }

  if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
  return $killed | Select-Object -Unique
}

function Write-FrontendEnv([int]$phpPort, [int]$vitePort) {
  $lines = @(
    '# Auto-generated by start.bat / install.bat - do not commit secrets'
    "VITE_API_URL=http://127.0.0.1:$phpPort"
    "VITE_DEV_PORT=$vitePort"
  )
  $path = Join-Path $Root 'frontend\.env.development.local'
  Set-Content -Path $path -Value $lines -Encoding UTF8
}

function Write-BackendConfig($db, [int]$vitePort, [string]$jwtSecret) {
  $configPath = Join-Path $Root 'backend\config\config.local.php'
  $pass = $db.DB_PASS -replace '\\', '\\\\' -replace "'", "\\'"
  $lines = @(
    '<?php'
    'declare(strict_types=1);'
    '/** Auto-generated by install.bat / start.bat for local development. */'
    'return array('
    "    'app_name' => 'Jasefly CMS',"
    "    'app_url' => 'http://localhost:$vitePort',"
    "    'app_env' => 'local',"
    "    'jwt_secret' => '$jwtSecret',"
    "    'jwt_ttl' => 3600,"
    "    'refresh_ttl' => 604800,"
    "    'cors_origins' => 'http://localhost:$vitePort,http://127.0.0.1:$vitePort',"
    "    'upload_max_mb' => 10,"
    "    'db_host' => '$($db.DB_HOST)',"
    "    'db_name' => '$($db.DB_NAME)',"
    "    'db_user' => '$($db.DB_USER)',"
    "    'db_pass' => '$pass',"
    "    'db_charset' => 'utf8mb4',"
    ');'
  )
  Set-Content -Path $configPath -Value $lines -Encoding UTF8
}

function Ensure-StorageDirs {
  $dirs = @(
    'backend\storage\uploads'
    'backend\storage\thumbnails'
    'backend\storage\backups'
    'backend\storage\logs'
  )
  foreach ($rel in $dirs) {
    $path = Join-Path $Root $rel
    if (-not (Test-Path $path)) {
      New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
    $keep = Join-Path $path '.gitkeep'
    if (-not (Test-Path $keep)) { New-Item -ItemType File -Path $keep -Force | Out-Null }
  }
}

function Test-MysqlConnection($db, [string]$phpExe) {
  $passEsc = $db.DB_PASS -replace '\\', '\\\\' -replace '"', '\"'
  $lines = @(
    '<?php'
    'try {'
    '  $pdo = new PDO('
    "    `"mysql:host=$($db.DB_HOST);port=$($db.DB_PORT);charset=utf8mb4`","
    "    `"$($db.DB_USER)`","
    "    `"$passEsc`""
    '  );'
    '  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);'
    '  echo "OK";'
    '} catch (Throwable $ex) {'
    '  fwrite(STDERR, $ex->getMessage());'
    '  exit(1);'
    '}'
  )
  $tmp = Join-Path $env:TEMP ("portfolio-db-check-" + [guid]::NewGuid().ToString('N') + '.php')
  Set-Content -Path $tmp -Value $lines -Encoding UTF8
  try {
    $out = & $phpExe $tmp 2>&1
    if ($LASTEXITCODE -ne 0) {
      return @{ ok = $false; error = ($out | Out-String).Trim() }
    }
    return @{ ok = $true; error = $null }
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Install-Database($db, [string]$phpExe) {
  $lock = Join-Path $Root 'backend\storage\.installed'
  if (Test-Path $lock) {
    Write-Info 'Database already installed (storage/.installed present). Skipping schema.'
    return $true
  }

  Write-Info 'Running backend installer (schema + demo seed)...'
  $passArg = if ($db.DB_PASS) { "--pass=$($db.DB_PASS)" } else { '--pass=' }
  $cors = 'http://localhost:5173,http://127.0.0.1:5173'
  Push-Location (Join-Path $Root 'backend')
  try {
    & $phpExe install.php `
      "--host=$($db.DB_HOST)" `
      "--name=$($db.DB_NAME)" `
      "--user=$($db.DB_USER)" `
      $passArg `
      '--url=http://localhost:5173' `
      "--cors=$cors" `
      '--email=admin@example.com' `
      '--demo=1'
    if ($LASTEXITCODE -ne 0) { return $false }
    return $true
  } finally {
    Pop-Location
  }
}

function Get-OrCreateJwt {
  $configPath = Join-Path $Root 'backend\config\config.local.php'
  if (Test-Path $configPath) {
    $raw = Get-Content $configPath -Raw
    if ($raw -match "jwt_secret'\s*=>\s*'([^']+)'") {
      $existing = $Matches[1]
      if ($existing -and $existing -ne 'change-me-to-a-long-random-string' -and $existing.Length -ge 32) {
        return $existing
      }
    }
  }
  return New-JwtSecret
}

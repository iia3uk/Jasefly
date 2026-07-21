# Download portable Node.js + PHP into .tools/ (Windows, no admin).
# Requires only PowerShell + tar (Win10+).

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Tools = Join-Path $Root '.tools'
$NodeDir = Join-Path $Tools 'node'
$PhpDir = Join-Path $Tools 'php'
$Cache = Join-Path $Tools 'cache'

function Write-Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "[..] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[!!] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[XX] $msg" -ForegroundColor Red }

function Ensure-Tls {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
  } catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  }
}

function Download-File([string]$Url, [string]$OutFile) {
  Ensure-Tls
  $dir = Split-Path $OutFile -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Write-Info "Downloading: $Url"
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    & curl.exe -fsSL --retry 3 --retry-delay 2 -o $OutFile $Url
    if ($LASTEXITCODE -ne 0) { throw "curl failed for $Url" }
  } else {
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
  }
  if (-not (Test-Path $OutFile) -or ((Get-Item $OutFile).Length -lt 1000)) {
    throw "Download empty/failed: $Url"
  }
}

function Get-NodeExe {
  $p = Join-Path $NodeDir 'node.exe'
  if (Test-Path $p) { return $p }
  return $null
}

function Get-PhpExe {
  $p = Join-Path $PhpDir 'php.exe'
  if (Test-Path $p) { return $p }
  return $null
}

function Get-SystemNode {
  $c = Get-Command node -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}

function Get-SystemPhp {
  $c = Get-Command php -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($pattern in @(
      'C:\xampp\php\php.exe',
      'C:\laragon\bin\php\php-8.3*\php.exe',
      'C:\laragon\bin\php\php-8.2*\php.exe',
      'C:\php\php.exe'
    )) {
    $hits = @(Get-Item $pattern -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
    if ($hits.Count -gt 0) { return $hits[0].FullName }
  }
  return $null
}

function Install-PortableNode {
  if (Get-NodeExe) {
    Write-Ok "Portable Node ready: $(Get-NodeExe)"
    return (Get-NodeExe)
  }
  if (-not (Test-Path $Cache)) { New-Item -ItemType Directory -Path $Cache -Force | Out-Null }

  Write-Info 'Resolving latest Node.js LTS...'
  Ensure-Tls
  $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing
  $lts = $index | Where-Object { $_.lts } | Select-Object -First 1
  if (-not $lts) { throw 'Could not resolve Node.js LTS from nodejs.org' }
  $ver = $lts.version.TrimStart('v')
  $zipName = "node-v$ver-win-x64.zip"
  $url = "https://nodejs.org/dist/v$ver/$zipName"
  $zip = Join-Path $Cache $zipName

  if (-not (Test-Path $zip)) {
    Download-File $url $zip
  } else {
    Write-Info "Cache hit: $zip"
  }

  $extract = Join-Path $Cache ("node-extract-" + $ver)
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  New-Item -ItemType Directory -Path $extract -Force | Out-Null
  Write-Info 'Extracting Node...'
  tar -xf $zip -C $extract
  $inner = Get-ChildItem $extract -Directory | Select-Object -First 1
  if (-not $inner) { throw 'Unexpected Node zip layout' }

  if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
  New-Item -ItemType Directory -Path $Tools -Force | Out-Null
  Move-Item $inner.FullName $NodeDir

  $exe = Get-NodeExe
  if (-not $exe) { throw 'node.exe missing after extract' }
  Write-Ok "Node $($lts.version) -> $exe"
  return $exe
}

function Install-PortablePhp {
  if (Get-PhpExe) {
    Write-Ok "Portable PHP ready: $(Get-PhpExe)"
    return (Get-PhpExe)
  }
  if (-not (Test-Path $Cache)) { New-Item -ItemType Directory -Path $Cache -Force | Out-Null }

  $url = 'https://windows.php.net/downloads/releases/latest/php-8.3-nts-Win32-vs16-x64-latest.zip'
  $zip = Join-Path $Cache 'php-8.3-nts-win-x64-latest.zip'

  if (-not (Test-Path $zip)) {
    Download-File $url $zip
  } else {
    Write-Info "Cache hit: $zip"
  }

  if (Test-Path $PhpDir) { Remove-Item $PhpDir -Recurse -Force }
  New-Item -ItemType Directory -Path $PhpDir -Force | Out-Null
  Write-Info 'Extracting PHP...'
  tar -xf $zip -C $PhpDir

  $phpIni = Join-Path $PhpDir 'php.ini'
  $prod = Join-Path $PhpDir 'php.ini-production'
  $dev = Join-Path $PhpDir 'php.ini-development'
  if (-not (Test-Path $phpIni)) {
    if (Test-Path $prod) { Copy-Item $prod $phpIni }
    elseif (Test-Path $dev) { Copy-Item $dev $phpIni }
    else { throw 'php.ini template missing in PHP zip' }
  }

  $ini = Get-Content $phpIni -Raw
  $ini = $ini -replace ';?\s*extension_dir\s*=\s*"ext"', 'extension_dir = "ext"'
  if ($ini -notmatch 'extension_dir\s*=') {
    $ini = "extension_dir = `"ext`"`r`n" + $ini
  }
  foreach ($ext in @('openssl', 'curl', 'mbstring', 'fileinfo', 'pdo_sqlite', 'sqlite3', 'pdo_mysql', 'mysqli', 'gd', 'zip')) {
    if ($ini -match "(?m)^\s*;?\s*extension\s*=\s*$ext\s*$") {
      $ini = [regex]::Replace($ini, "(?m)^\s*;?\s*extension\s*=\s*$ext\s*$", "extension=$ext")
    } elseif ($ini -notmatch "(?m)^\s*extension\s*=\s*$ext\s*$") {
      $ini = $ini + "`r`nextension=$ext"
    }
  }
  if ($ini -match '(?m)^\s*;?\s*date\.timezone\s*=') {
    $ini = [regex]::Replace($ini, '(?m)^\s*;?\s*date\.timezone\s*=.*$', 'date.timezone = UTC')
  } else {
    $ini = $ini + "`r`ndate.timezone = UTC"
  }
  Set-Content -Path $phpIni -Value $ini -Encoding ASCII

  $exe = Get-PhpExe
  if (-not $exe) { throw 'php.exe missing after extract' }

  $ver = & $exe -r "echo PHP_VERSION;"
  $pdoSqlite = & $exe -r "echo extension_loaded('pdo_sqlite') ? '1' : '0';"
  if ($pdoSqlite -ne '1') { throw 'pdo_sqlite not enabled - check php.ini' }
  Write-Ok "PHP $ver -> $exe (pdo_sqlite OK)"
  return $exe
}

function Use-ToolsPath {
  $parts = @()
  if (Test-Path $NodeDir) { $parts += $NodeDir }
  if (Test-Path $PhpDir) { $parts += $PhpDir }
  if ($parts.Count -gt 0) {
    $env:PATH = ($parts -join ';') + ';' + $env:PATH
  }
}

function Ensure-DevTools {
  param([switch]$ForcePortable)

  New-Item -ItemType Directory -Path $Tools -Force | Out-Null

  $sysNode = Get-SystemNode
  $sysPhp = Get-SystemPhp
  $usedPortableNode = $false
  $usedPortablePhp = $false

  if ($ForcePortable -or -not $sysNode) {
    if (-not $sysNode) { Write-Warn 'Node.js not in PATH - downloading portable into .tools\node' }
    $node = Install-PortableNode
    $usedPortableNode = $true
  } else {
    $node = $sysNode
    Write-Ok "System Node: $node"
  }

  if ($ForcePortable -or -not $sysPhp) {
    if (-not $sysPhp) { Write-Warn 'PHP not in PATH - downloading portable into .tools\php' }
    $php = Install-PortablePhp
    $usedPortablePhp = $true
  } else {
    $php = $sysPhp
    Write-Ok "System PHP: $php"
  }

  Use-ToolsPath
  return @{
    Node = $node
    Php  = $php
    UsedPortableNode = $usedPortableNode
    UsedPortablePhp  = $usedPortablePhp
  }
}

if ($MyInvocation.InvocationName -ne '.' -and $MyInvocation.Line -notmatch '^\s*\.') {
  Write-Host ''
  Write-Host '  Jasefly CMS - portable Node + PHP' -ForegroundColor White
  Write-Host ''
  $t = Ensure-DevTools
  Write-Host ''
  Write-Ok "node = $($t.Node)"
  Write-Ok "php  = $($t.Php)"
  Write-Host ''
}

$files = @(
  'c:\portfolio\scripts\dev-lib.ps1',
  'c:\portfolio\scripts\dev-install.ps1',
  'c:\portfolio\scripts\dev-start.ps1',
  'c:\portfolio\scripts\dev-stop.ps1'
)
$failed = $false
foreach ($f in $files) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$tokens, [ref]$errors)
  if ($errors -and $errors.Count -gt 0) {
    Write-Host "FAIL $f" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host $_.Message }
    $failed = $true
  } else {
    Write-Host "OK   $f" -ForegroundColor Green
  }
}
if ($failed) { exit 1 }

@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

title Jasefly CMS — Pack for transfer
echo.
echo   Jasefly CMS — архив для переноса на другой ПК
echo   ================================================
echo.

:: --- options ---
::   pack-transfer.bat           — обычный перенос (рекомендуется)
::   pack-transfer.bat /full     — + node_modules (тяжелее, без npm install)
::   pack-transfer.bat /nogit    — без папки .git
::   pack-transfer.bat /full /nogit
set "INCLUDE_NM=0"
set "INCLUDE_GIT=1"
for %%A in (%*) do (
  if /I "%%~A"=="/full" set "INCLUDE_NM=1"
  if /I "%%~A"=="/nogit" set "INCLUDE_GIT=0"
)

where tar >nul 2>&1
if errorlevel 1 (
  echo [XX] Нужен tar.exe ^(есть в Windows 10/11^).
  pause
  exit /b 1
)

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set "STAMP=%%I"
set "OUTDIR=%~dp0transfer"
set "OUTZIP=%OUTDIR%\jasefly-cms-transfer-%STAMP%.zip"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"

echo Режим:
if "%INCLUDE_NM%"=="1" (echo   - node_modules: ДА) else (echo   - node_modules: НЕТ ^(на новом ПК: install.bat^))
if "%INCLUDE_GIT%"=="1" (echo   - .git: ДА) else (echo   - .git: НЕТ)
echo   - .env / config.local.php: ДА ^(секреты для переноса^)
echo   - release/*.zip, uploads, dist: НЕТ
echo.
echo Собираю: %OUTZIP%
echo.

:: Staging list via tar excludes (bsdtar on Windows)
:: Create from repo root contents
set "EXCLUDES=--exclude=.git"
if "%INCLUDE_GIT%"=="1" set "EXCLUDES="

set "EXCLUDES=!EXCLUDES! --exclude=transfer"
set "EXCLUDES=!EXCLUDES! --exclude=release"
set "EXCLUDES=!EXCLUDES! --exclude=.tools"
set "EXCLUDES=!EXCLUDES! --exclude=.cursor"
set "EXCLUDES=!EXCLUDES! --exclude=.dev"
set "EXCLUDES=!EXCLUDES! --exclude=frontend/dist"
set "EXCLUDES=!EXCLUDES! --exclude=frontend/.vite"
set "EXCLUDES=!EXCLUDES! --exclude=backend/storage/uploads"
set "EXCLUDES=!EXCLUDES! --exclude=backend/storage/thumbnails"
set "EXCLUDES=!EXCLUDES! --exclude=backend/storage/backups"
set "EXCLUDES=!EXCLUDES! --exclude=backend/storage/logs"
set "EXCLUDES=!EXCLUDES! --exclude=backend/storage/cache"
set "EXCLUDES=!EXCLUDES! --exclude=mcp-cms/.tmp-php-lint"
set "EXCLUDES=!EXCLUDES! --exclude=mcp-cms/.gate-state.json"
set "EXCLUDES=!EXCLUDES! --exclude=*.log"
set "EXCLUDES=!EXCLUDES! --exclude=Thumbs.db"
set "EXCLUDES=!EXCLUDES! --exclude=.DS_Store"

if "%INCLUDE_NM%"=="0" (
  set "EXCLUDES=!EXCLUDES! --exclude=frontend/node_modules"
  set "EXCLUDES=!EXCLUDES! --exclude=mcp-cms/node_modules"
)

:: Keep folder placeholders in storage
:: (uploads content skipped; .gitkeep inside still may be skipped if parent excluded —
::  we recreate keepers after extract note in README below)

if exist "%OUTZIP%" del /f /q "%OUTZIP%" >nul 2>&1

:: tar -a = auto compress by extension (.zip)
tar -a -c -f "%OUTZIP%" !EXCLUDES! --exclude=./transfer --exclude=./release ^
  --exclude=./.cursor --exclude=./.dev ^
  -C "%~dp0." .

if errorlevel 1 (
  echo.
  echo [XX] tar не смог собрать архив.
  pause
  exit /b 1
)

for %%F in ("%OUTZIP%") do (
  set "SIZE=%%~zF"
)
set /a "SIZE_MB=!SIZE! / 1048576" 2>nul

echo.
echo [OK] Готово
echo     Файл: %OUTZIP%
echo     Размер: ~!SIZE_MB! МБ
echo.
echo На другом ПК:
echo   1. Распакуй архив в папку ^(например C:\JASEFLY_CMS^)
echo   2. Запусти setup.bat  ^(сам скачает Node/PHP, поставит всё, SQLite если нет MySQL^)
echo   3. Или start.bat если setup уже спрашивал запуск
echo   4. По желанию: mcp-cms\.env для удалённого MCP
echo.
echo Доп. флаги этого батника:
echo   pack-transfer.bat /full     — включить node_modules
echo   pack-transfer.bat /nogit    — без истории git
echo.
explorer "%OUTDIR%"
pause
exit /b 0

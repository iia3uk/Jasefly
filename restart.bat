@echo off
setlocal
cd /d "%~dp0"

title Jasefly CMS — Restart
where node >nul 2>&1
if errorlevel 1 (
  echo [XX] Node.js is required.
  pause
  exit /b 1
)

node "%~dp0dev.js" restart
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo Restart failed.
  pause
)
exit /b %ERR%

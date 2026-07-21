@echo off
setlocal
cd /d "%~dp0"

title Jasefly CMS — Stop
where node >nul 2>&1
if errorlevel 1 (
  echo [XX] Node.js is required.
  pause
  exit /b 1
)

node "%~dp0dev.js" stop
echo.
echo Press any key to close...
pause >nul
exit /b 0

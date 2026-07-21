@echo off
setlocal
cd /d "%~dp0"

title Jasefly CMS — Build Hosting Package
where node >nul 2>&1
if errorlevel 1 (
  echo [XX] Node.js is required. Install from https://nodejs.org/
  pause
  exit /b 1
)

echo.
echo   Jasefly CMS — Production Hosting Packager
echo   ===========================================
echo.

node "%~dp0scripts\build-hosting.js" %*
set ERR=%ERRORLEVEL%

echo.
if not "%ERR%"=="0" (
  echo Packaging failed. See messages above.
  pause
  exit /b %ERR%
)

echo Press any key to close...
pause >nul
exit /b 0

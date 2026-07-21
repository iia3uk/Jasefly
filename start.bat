@echo off
setlocal
cd /d "%~dp0"

title Jasefly CMS — Dev Server

:: Portable tools from setup.bat
if exist "%~dp0.tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
if exist "%~dp0.tools\php\php.exe" set "PATH=%~dp0.tools\php;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo [XX] Node.js не найден. Запусти setup.bat на новом ПК.
  pause
  exit /b 1
)

node "%~dp0dev.js" start
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo Startup failed. На новом ПК сначала: setup.bat
  pause
)
exit /b %ERR%

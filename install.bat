@echo off
setlocal
cd /d "%~dp0"

title Jasefly CMS — Install
echo.
echo   Если Node/PHP нет — сначала запусти setup.bat ^(скачает сам^).
echo   Или продолжаем с тем, что есть в PATH / .tools\
echo.

:: Prefer portable tools from setup.bat
if exist "%~dp0.tools\node\node.exe" set "PATH=%~dp0.tools\node;%PATH%"
if exist "%~dp0.tools\php\php.exe" set "PATH=%~dp0.tools\php;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo [XX] Node.js не найден.
  echo     Запусти setup.bat — он скачает Node и PHP автоматически.
  pause
  exit /b 1
)

node "%~dp0dev.js" install
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo Install finished with errors. See messages above.
  echo Если нет PHP/MySQL — проще: setup.bat ^(SQLite без сервера БД^).
  pause
  exit /b %ERR%
)

echo Press any key to close...
pause >nul
exit /b 0

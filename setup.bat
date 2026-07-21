@echo off
setlocal
cd /d "%~dp0"

title Jasefly CMS — Setup (новый ПК)
echo.
echo   Нужен только Windows 10/11 ^(PowerShell + tar^).
echo   Node/PHP скачаются сами, если их нет.
echo.

where powershell >nul 2>&1
if errorlevel 1 (
  echo [XX] PowerShell не найден. Нужен Windows 10/11.
  pause
  exit /b 1
)

where tar >nul 2>&1
if errorlevel 1 (
  echo [XX] tar.exe не найден. Обнови Windows или поставь tar.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-transfer.ps1"
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo Установка завершилась с ошибкой. Смотри сообщения выше.
  pause
  exit /b %ERR%
)
exit /b 0

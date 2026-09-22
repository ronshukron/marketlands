@echo off
setlocal
cd /d "%~dp0.."
set BROWSER=none

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://localhost:3000 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo Starting B2C dev server on http://localhost:3000 ...
  start "B2C Dev Server" /min cmd /k "set BROWSER=none&& npm start"
)

echo Waiting for http://localhost:3000 ...
call npx wait-on -t 180000 http://localhost:3000
if errorlevel 1 (
  echo Failed to reach http://localhost:3000
  pause
  exit /b 1
)

start "" /min cmd /c "npx electron . --route=/admin/delivery-v7?autoload=today"
endlocal

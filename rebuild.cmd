@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "LOG=%~dp0rebuild.log"
> "%LOG%" echo ===== Automation Studio rebuild started =====

echo [1/2] frontend build
echo ==== [1/2] frontend build ==== >> "%LOG%"

rem locate node.exe inside codex runtime (works without pnpm/npm)
set "NODE_DIR="
for /d %%D in ("%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime*") do if exist "%%D\dependencies\node\bin\node.exe" set "NODE_DIR=%%D\dependencies\node\bin"
if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo WARNING: node not found - skip frontend, keep existing UI >> "%LOG%"
  goto :PACKAGE
)
echo node dir: %NODE_DIR% >> "%LOG%"

cd frontend
call "node_modules\.bin\tsc.CMD" -b >> "%LOG%" 2>&1
echo tsc exit %errorlevel% >> "%LOG%"
if errorlevel 1 (
  echo frontend TYPE error - see log. packaging stale UI. >> "%LOG%"
) else (
  call "node_modules\.bin\vite.CMD" build >> "%LOG%" 2>&1
  echo vite exit %errorlevel% >> "%LOG%"
)
cd ..

:PACKAGE
echo [2/2] package exe (PyInstaller)
echo ==== [2/2] package exe ==== >> "%LOG%"

rem close any running AutomationStudio.exe so the exe can be overwritten
taskkill /IM AutomationStudio.exe /F >nul 2>nul
echo closed running app (if any) >> "%LOG%"

set "PATH=%~dp0.venv\Scripts;%PATH%"
powershell -NoProfile -ExecutionPolicy Bypass -File "build\windows\build.ps1" >> "%LOG%" 2>&1
echo package exit %errorlevel% >> "%LOG%"
if errorlevel 1 goto :FAIL
goto :OK

:FAIL
echo ===== FAILED ===== >> "%LOG%"
echo.
echo FAILED - see rebuild.log
start "" "%LOG%"
pause
exit /b 1

:OK
echo ===== SUCCESS ===== >> "%LOG%"
echo.
echo SUCCESS - new exe: dist\AutomationStudio.exe
start "" "%LOG%"
pause
exit /b 0

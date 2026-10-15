@echo off
rem GitHub is the source of truth; startup.mjs checks, fast-forwards, builds and launches.
cd /d "%~dp0"
where node >nul 2>nul || goto nonode
node startup.mjs
if errorlevel 1 goto failed
timeout /t 3 /nobreak >nul
exit /b 0
:nonode
echo Node.js is not installed or is missing from PATH. Install Node.js LTS, then launch again.
echo The game was not opened because its version and build could not be verified.
:failed
echo.
echo Startup stopped. Read the message above before closing this window.
pause
exit /b 1

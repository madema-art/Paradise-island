@echo off
rem Opens the Wildlife Scale Comparison Viewer (development tool, separate from the game).
rem Starts the local server if it is not already running, builds the viewer bundle, and opens the viewer in your browser.
cd /d "%~dp0"
where node >nul 2>nul || goto nonode
node build.mjs >nul 2>nul
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul || start "Paradise Island server" /min node serve.mjs 5173
timeout /t 2 /nobreak >nul
start "" "http://localhost:5173/dev/scale_viewer.html"
goto end
:nonode
echo Node.js is needed to run the viewer. Install it from https://nodejs.org and try again.
pause
:end

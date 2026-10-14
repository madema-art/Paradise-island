@echo off
rem Starts the island's local server (the notebook saves its notes through it) and opens the game in your browser.
rem If node is installed, refresh the music playlist first so newly added songs are picked up.
cd /d "%~dp0"
where node >nul 2>nul || goto nonode
node build.mjs >nul 2>nul
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul || start "Paradise Island server" /min node serve.mjs 5173
timeout /t 2 /nobreak >nul
start "" "http://localhost:5173/"
goto end
:nonode
rem Without node the island still opens, but the notebook is read-only: it needs the local server.
start "" "%~dp0index.html"
:end

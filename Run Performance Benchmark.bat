@echo off
rem Runs the Paradise Island performance benchmark in your browser (development tool, separate from the game).
rem It starts the local server if it is not already running, builds the game, and opens the game with the benchmark on.
rem When the game is ready the benchmark runs its five camera scenarios (about 2 minutes) and saves paradise-island-benchmark.json
rem to your Downloads folder. Keep the browser window at 1920 x 1080 and in front while it runs.
cd /d "%~dp0"
where node >/dev/null 2>/dev/null || goto nonode
node build.mjs >/dev/null 2>nul
netstat -ano | findstr /R /C:":5173 .*LISTENING" >/dev/null || start "Paradise Island server" /min node serve.mjs 5173
timeout /t 2 /nobreak >nul
start "" "http://localhost:5173/?perf=1&bench=1&noauto=1"
goto end
:nonode
echo Node.js is needed to run the benchmark. Install it from https://nodejs.org and try again.
pause
:end

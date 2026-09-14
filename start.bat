@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 goto nodeok
if exist "C:\nodejs\node.exe" set "PATH=C:\nodejs;%PATH%"
where node >nul 2>nul
if %errorlevel%==0 goto nodeok
echo [ERROR] Node.js not found. Install it from nodejs.org
pause
exit /b 1

:nodeok
if exist "node_modules" goto deps
echo Installing dependencies...
call npm install
if %errorlevel%==0 goto deps
echo [ERROR] npm install failed. See output above
pause
exit /b 1

:deps
if exist "dist" goto serve
echo Building frontend...
call npm run build
if %errorlevel%==0 goto serve
echo [ERROR] Build failed. See output above
pause
exit /b 1

:serve
start "Movie Database (server)" cmd /c "node server\server.js"
echo Server starting at http://localhost:3000
echo To stop it, close the "Movie Database (server)" window
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:3000"
endlocal
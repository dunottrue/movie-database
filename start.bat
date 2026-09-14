@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 goto nodeok
if exist "C:\nodejs\node.exe" set "PATH=C:\nodejs;%PATH%"
where node >nul 2>nul
if %errorlevel%==0 goto nodeok
echo [ОШИБКА] Node.js не найден. Установите Node.js с nodejs.org
pause
exit /b 1

:nodeok
if exist "node_modules" goto run
echo Установка зависимостей...
call npm install
if %errorlevel%==0 goto run
echo [ОШИБКА] npm install не завершился успешно
pause
exit /b 1

:run
start "" "http://localhost:3000"
echo Запуск сервера Кинотека на http://localhost:3000
echo Для остановки закройте это окно или нажмите Ctrl+C
node server\server.js
pause
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
if exist "node_modules" goto deps
echo Установка зависимостей...
call npm install
if %errorlevel%==0 goto deps
echo [ОШИБКА] npm install не завершился успешно
pause
exit /b 1

:deps
if exist "dist" goto serve
echo Сборка фронтенда...
call npm run build
if %errorlevel%==0 goto serve
echo [ОШИБКА] Не удалось собрать фронтенд. Проверьте вывод выше
pause
exit /b 1

:serve
start "Кинотека (сервер)" cmd /c "node server\server.js"
echo Запуск сервера Кинотека на http://localhost:3000
echo Для остановки сервера закройте окно "Кинотека (сервер)"
ping -n 3 127.0.0.1 >nul
start "" "http://localhost:3000"
pause
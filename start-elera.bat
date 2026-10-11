@echo off
title Elera
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo  Elera needs Node.js, which is not installed on this computer.
    echo  Download the LTS version from https://nodejs.org , install it,
    echo  then double-click start-elera.bat again.
    echo.
    start "" https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo Installing Elera for the first time. This can take a minute...
    call npm install
    if errorlevel 1 (
        echo.
        echo  Installing failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
)

echo Starting Elera. Your browser will open shortly.
echo Close this window to stop Elera.
call npm run dev -- --open
pause

@echo off
REM Runs at Windows startup (via Task Scheduler). Starts Nginx and the PM2 backend "22i-2641".
REM deploy.ps1 copies this file to C:\hospital-startup\start-hospital.cmd

set APP_BACKEND=%~1
if "%APP_BACKEND%"=="" set APP_BACKEND=C:\HospitalApp\backend

REM ---- Nginx ----
tasklist /FI "IMAGENAME eq nginx.exe" | find /I "nginx.exe" >nul
if errorlevel 1 (
    cd /d C:\nginx
    start "" /B nginx.exe
)

REM ---- Backend via PM2 ----
call pm2 resurrect
call pm2 describe 22i-2641 >nul 2>&1
if errorlevel 1 (
    cd /d "%APP_BACKEND%"
    call pm2 start ecosystem.config.cjs
    call pm2 save
)
exit /b 0

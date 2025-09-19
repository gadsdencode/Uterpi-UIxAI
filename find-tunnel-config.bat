@echo off
echo Looking for Cloudflare tunnel configuration files...
echo.
echo Checking common locations:
echo ========================================

echo.
echo 1. Checking user profile .cloudflared folder:
if exist "%USERPROFILE%\.cloudflared\config.yml" (
    echo [FOUND] %USERPROFILE%\.cloudflared\config.yml
    echo.
    echo Contents:
    echo ----------------------------------------
    type "%USERPROFILE%\.cloudflared\config.yml"
    echo ----------------------------------------
) else (
    echo [NOT FOUND] %USERPROFILE%\.cloudflared\config.yml
)

echo.
echo 2. Checking for tunnel credentials:
dir "%USERPROFILE%\.cloudflared\*.json" 2>nul
if %errorlevel% neq 0 (
    echo [NOT FOUND] No tunnel credential files
)

echo.
echo 3. Checking if cloudflared service is installed:
sc query cloudflared >nul 2>&1
if %errorlevel% equ 0 (
    echo [FOUND] Cloudflared service is installed
    echo.
    echo Service status:
    sc query cloudflared | findstr "STATE"
) else (
    echo [NOT FOUND] Cloudflared service not installed
)

echo.
echo 4. Checking if cloudflared.exe is running:
tasklist | findstr cloudflared >nul 2>&1
if %errorlevel% equ 0 (
    echo [RUNNING] Cloudflared process is active
) else (
    echo [NOT RUNNING] Cloudflared process not found
)

echo.
echo ========================================
echo.
pause

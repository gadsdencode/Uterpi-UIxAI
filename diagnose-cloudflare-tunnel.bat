@echo off
echo =========================================================
echo CLOUDFLARE TUNNEL DIAGNOSTIC SCRIPT
echo =========================================================
echo.
echo This script will diagnose your Cloudflare Tunnel setup
echo for LM Studio integration.
echo.
echo CRITICAL: This script must run on your DESKTOP PC
echo (the machine where LM Studio is installed)
echo.
echo =========================================================
echo STEP 1: Checking if we're on the right machine
echo =========================================================
echo Current Computer Name: %COMPUTERNAME%
echo Current User: %USERNAME%
echo.
echo Is this your DESKTOP PC with LM Studio? (not your laptop)
echo.
pause

echo.
echo =========================================================
echo STEP 2: Checking for LM Studio
echo =========================================================

REM Check if LM Studio is running
tasklist /FI "IMAGENAME eq LM Studio.exe" 2>NUL | find /I /N "LM Studio.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [OK] LM Studio is running
) else (
    echo [WARNING] LM Studio is not running
    echo Please start LM Studio and ensure the server is started
)

echo.
echo Testing LM Studio API on localhost:
curl -s http://localhost:1234/v1/models > nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] LM Studio API is accessible on localhost:1234
) else (
    echo [ERROR] Cannot connect to LM Studio on localhost:1234
    echo Make sure:
    echo   1. LM Studio is running
    echo   2. Server is started in Developer tab
    echo   3. A model is loaded
)

echo.
echo =========================================================
echo STEP 3: Checking for cloudflared
echo =========================================================

where cloudflared >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] cloudflared is installed
    cloudflared version
) else (
    echo [ERROR] cloudflared is NOT installed on this machine!
    echo.
    echo This is likely your problem!
    echo The Cloudflare tunnel connector MUST run on the SAME machine as LM Studio.
    echo.
    echo To fix: Download and install cloudflared on THIS DESKTOP PC
    echo Download from: https://github.com/cloudflare/cloudflared/releases
    goto :missing_cloudflared
)

echo.
echo =========================================================
echo STEP 4: Checking if cloudflared service is running
echo =========================================================

sc query cloudflared >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [INFO] cloudflared service exists
    sc query cloudflared | find "RUNNING" >nul 2>&1
    if %ERRORLEVEL% == 0 (
        echo [OK] cloudflared service is RUNNING
    ) else (
        echo [WARNING] cloudflared service exists but is NOT running
        echo Try: sc start cloudflared
    )
) else (
    echo [INFO] cloudflared is not installed as a Windows service
    echo Checking for running cloudflared process...
    tasklist /FI "IMAGENAME eq cloudflared.exe" 2>NUL | find /I /N "cloudflared.exe">NUL
    if "%ERRORLEVEL%"=="0" (
        echo [OK] cloudflared.exe is running as a process
    ) else (
        echo [ERROR] cloudflared is NOT running at all!
        echo.
        echo The tunnel connector is not active on this machine.
        echo This is why you're getting 502 errors!
    )
)

echo.
echo =========================================================
echo STEP 5: Checking tunnel configuration
echo =========================================================

if exist "%USERPROFILE%\.cloudflared\config.yml" (
    echo [OK] Found config file at %USERPROFILE%\.cloudflared\config.yml
    echo.
    echo Checking tunnel configuration:
    findstr /C:"url:" "%USERPROFILE%\.cloudflared\config.yml"
    echo.
    echo Does the URL above point to http://localhost:1234 or http://127.0.0.1:1234?
    echo If not, that's a problem!
) else (
    echo [WARNING] No config file found at %USERPROFILE%\.cloudflared\config.yml
    echo Tunnel might be configured differently or not at all
)

echo.
echo =========================================================
echo STEP 6: Testing tunnel status
echo =========================================================

cloudflared tunnel list >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Active tunnels:
    cloudflared tunnel list
) else (
    echo [ERROR] Cannot list tunnels - cloudflared may not be authenticated
)

echo.
echo =========================================================
echo DIAGNOSIS SUMMARY
echo =========================================================
echo.
echo If you're getting 502 errors, check that:
echo.
echo 1. You are running this on your DESKTOP PC (not laptop)
echo 2. LM Studio is running and server is started
echo 3. cloudflared is installed ON THIS DESKTOP PC
echo 4. cloudflared is running as a service or process
echo 5. The tunnel config points to http://localhost:1234
echo.
echo The tunnel connector (cloudflared) MUST run on the SAME
echo machine as LM Studio. It cannot run on a different computer!
echo.
echo =========================================================
echo.
pause
goto :end

:missing_cloudflared
echo.
echo =========================================================
echo HOW TO INSTALL CLOUDFLARED
echo =========================================================
echo.
echo 1. Download the Windows executable:
echo    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
echo.
echo 2. Rename it to: cloudflared.exe
echo.
echo 3. Move it to: C:\Program Files\Cloudflare\
echo.
echo 4. Add to PATH or run from that directory
echo.
echo 5. Then run: setup-cloudflare-tunnel-desktop.bat
echo.
pause

:end

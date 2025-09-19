@echo off
echo ========================================
echo CLOUDFLARE TUNNEL 502 FIX
echo ========================================
echo.
echo Both LM Studio and Cloudflare are on THIS machine
echo Fixing the tunnel configuration...
echo.

:: Step 1: Check LM Studio binding
echo [1] Checking LM Studio network binding...
echo --------------------------------------
netstat -an | findstr :1234
echo.

:: Step 2: Test LM Studio locally
echo [2] Testing LM Studio access methods...
echo --------------------------------------

echo Testing localhost:1234...
curl -s -o nul -w "HTTP Status: %%{http_code}\n" http://localhost:1234/v1/models
echo.

echo Testing 127.0.0.1:1234...
curl -s -o nul -w "HTTP Status: %%{http_code}\n" http://127.0.0.1:1234/v1/models
echo.

echo Testing 0.0.0.0:1234...
curl -s -o nul -w "HTTP Status: %%{http_code}\n" http://0.0.0.0:1234/v1/models
echo.

:: Step 3: Check current tunnel config
echo [3] Checking Cloudflare tunnel configuration...
echo --------------------------------------
echo Current tunnel config location:
dir /s /b "%USERPROFILE%\.cloudflared\*.yml" 2>nul
echo.

:: Show the config
set CONFIG_FILE=%USERPROFILE%\.cloudflared\config.yml
if exist "%CONFIG_FILE%" (
    echo Current tunnel configuration:
    type "%CONFIG_FILE%" | findstr "hostname service"
) else (
    echo No config.yml found in default location
)
echo.

:: Step 4: Fix the tunnel configuration
echo [4] SOLUTION: Update your Cloudflare tunnel configuration
echo ==========================================================
echo.
echo In Cloudflare Dashboard (https://one.dash.cloudflare.com/):
echo.
echo 1. Go to: Zero Trust -^> Access -^> Tunnels
echo 2. Click on your tunnel (uterpi-tunnel-desktop)
echo 3. Click on the "Public Hostname" tab
echo 4. Edit the hostname: lmstudio.uterpi.com
echo.
echo 5. CRITICAL: Change the Service settings to:
echo    ----------------------------------------
echo    Type: HTTP
echo    URL:  http://127.0.0.1:1234
echo    
echo    OR try these alternatives if the above doesn't work:
echo    - http://localhost:1234
echo    - http://host.docker.internal:1234 (if cloudflared is in Docker)
echo.
echo 6. Under "Additional application settings" (optional):
echo    - HTTP Host Header: localhost
echo    - Origin Server Name: localhost
echo.
echo 7. Save the configuration
echo.

:: Step 5: Alternative - Local config fix
echo [5] ALTERNATIVE: Fix via local config file
echo --------------------------------------
echo.
echo If you're using a local config.yml, it should look like:
echo.
echo tunnel: ^<your-tunnel-id^>
echo credentials-file: %USERPROFILE%\.cloudflared\^<tunnel-id^>.json
echo.
echo ingress:
echo   - hostname: lmstudio.uterpi.com
echo     service: http://127.0.0.1:1234
echo     originRequest:
echo       noTLSVerify: true
echo   - service: http_status:404
echo.

:: Step 6: Restart cloudflared
echo [6] After updating configuration, restart cloudflared:
echo --------------------------------------
echo.
echo Option A: If running as Windows Service:
echo   net stop cloudflared
echo   net start cloudflared
echo.
echo Option B: If running manually:
echo   1. Stop current cloudflared process (Ctrl+C)
echo   2. Run: cloudflared tunnel run uterpi-tunnel-desktop
echo.

:: Step 7: Test the tunnel
echo [7] Test commands after fix:
echo --------------------------------------
echo.
echo From this machine:
echo   curl http://127.0.0.1:1234/v1/models
echo.
echo From anywhere (after config update):
echo   curl https://lmstudio.uterpi.com/v1/models
echo.
echo ========================================
pause

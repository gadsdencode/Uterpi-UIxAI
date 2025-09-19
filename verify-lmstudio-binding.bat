@echo off
echo ========================================
echo VERIFY LM STUDIO BINDING
echo ========================================
echo.

echo [1] Checking if LM Studio server is actually running...
echo --------------------------------------
netstat -an | findstr :1234
echo.
echo If you see "0.0.0.0:1234" or "127.0.0.1:1234" with LISTENING, LM Studio is running.
echo If you see nothing, LM Studio server is NOT started!
echo.

echo [2] Testing direct access from this machine...
echo --------------------------------------
curl -v http://127.0.0.1:1234/v1/models
echo.

echo [3] Checking LM Studio process...
echo --------------------------------------
tasklist | findstr -i "lm studio"
echo.

echo [4] Alternative test with PowerShell...
echo --------------------------------------
powershell -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:1234/v1/models' -Method GET -TimeoutSec 2 } catch { Write-Host 'Failed:' $_.Exception.Message -ForegroundColor Red }"
echo.

echo ========================================
echo IMPORTANT: If LM Studio is not listening on port 1234,
echo you need to START THE SERVER in LM Studio!
echo.
echo In LM Studio:
echo 1. Go to the "Local Server" tab (left sidebar)
echo 2. Make sure "Server Port" is set to 1234
echo 3. Click "Start Server" button
echo 4. Verify it says "Server is running"
echo ========================================
pause

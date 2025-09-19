@echo off
echo ========================================
echo CLOUDFLARE TUNNEL DIAGNOSTIC
echo ========================================
echo.

echo [1] Checking where LM Studio is running...
echo --------------------------------------
netstat -an | findstr :1234
echo.

echo [2] Checking cloudflared process...
echo --------------------------------------
tasklist | findstr cloudflared
echo.

echo [3] Testing LM Studio locally...
echo --------------------------------------
curl -X GET http://localhost:1234/v1/models 2>nul
if %ERRORLEVEL% EQU 0 (
    echo SUCCESS: LM Studio responding on localhost:1234
) else (
    echo FAILED: LM Studio not responding on localhost:1234
)
echo.

curl -X GET http://127.0.0.1:1234/v1/models 2>nul
if %ERRORLEVEL% EQU 0 (
    echo SUCCESS: LM Studio responding on 127.0.0.1:1234
) else (
    echo FAILED: LM Studio not responding on 127.0.0.1:1234
)
echo.

curl -X GET http://192.168.86.44:1234/v1/models 2>nul
if %ERRORLEVEL% EQU 0 (
    echo SUCCESS: LM Studio responding on 192.168.86.44:1234
) else (
    echo FAILED: LM Studio not responding on 192.168.86.44:1234
)
echo.

echo [4] Checking Windows Firewall...
echo --------------------------------------
netsh advfirewall firewall show rule name=all | findstr "1234"
echo.

echo [5] Getting machine hostname...
echo --------------------------------------
hostname
echo.

echo [6] Getting IP configuration...
echo --------------------------------------
ipconfig | findstr /i "ipv4 address"
echo.

echo ========================================
echo DIAGNOSTIC COMPLETE
echo ========================================
pause

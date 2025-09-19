@echo off
echo =========================================================
echo IPv4 vs IPv6 Localhost Testing for LM Studio
echo =========================================================
echo.

echo Testing LM Studio connectivity...
echo.
echo ---------------------------------------------------------
echo Test 1: IPv4 (127.0.0.1) - This SHOULD work
echo ---------------------------------------------------------
curl -s -o nul -w "Status: %%{http_code}\n" http://127.0.0.1:1234/v1/models
if %ERRORLEVEL% == 0 (
    echo [SUCCESS] LM Studio responds on IPv4
) else (
    echo [FAILED] LM Studio NOT responding on IPv4
)

echo.
echo ---------------------------------------------------------
echo Test 2: IPv6 ([::1]) - This might FAIL
echo ---------------------------------------------------------
curl -s -o nul -w "Status: %%{http_code}\n" http://[::1]:1234/v1/models
if %ERRORLEVEL% == 0 (
    echo [SUCCESS] LM Studio responds on IPv6
) else (
    echo [FAILED] LM Studio NOT responding on IPv6 - This is normal
)

echo.
echo ---------------------------------------------------------
echo Test 3: localhost - Let's see what it resolves to
echo ---------------------------------------------------------
curl -s -o nul -w "Status: %%{http_code}\n" http://localhost:1234/v1/models
if %ERRORLEVEL% == 0 (
    echo [SUCCESS] LM Studio responds on 'localhost'
) else (
    echo [FAILED] LM Studio NOT responding on 'localhost'
)

echo.
echo =========================================================
echo DIAGNOSIS:
echo =========================================================
echo If IPv4 works but localhost fails, that's your problem!
echo Cloudflare tunnel MUST use http://127.0.0.1:1234
echo NOT http://localhost:1234
echo.
echo Fix this in:
echo 1. Cloudflare Dashboard - Service URL
echo 2. Any local config.yml files
echo =========================================================
echo.
pause

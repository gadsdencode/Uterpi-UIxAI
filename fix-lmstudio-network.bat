@echo off
echo =================================================
echo LM Studio Network Configuration Fix
echo =================================================
echo.
echo This script will configure LM Studio to accept connections
echo from Cloudflare tunnel by changing networkInterface to 0.0.0.0
echo.

set CONFIG_FILE=%userprofile%\.cache\lm-studio\.internal\http-server-config.json

echo Checking for LM Studio configuration file...
echo.

if exist "%CONFIG_FILE%" (
    echo [FOUND] Configuration file at:
    echo %CONFIG_FILE%
    echo.
    echo Current configuration:
    echo ----------------------------------------
    type "%CONFIG_FILE%"
    echo.
    echo ----------------------------------------
    echo.
    
    echo Creating backup...
    copy "%CONFIG_FILE%" "%CONFIG_FILE%.backup" >nul 2>&1
    echo [BACKED UP] to %CONFIG_FILE%.backup
    echo.
    
    echo Updating configuration...
    powershell -Command "(Get-Content '%CONFIG_FILE%') -replace '\"networkInterface\":\s*\"127\.0\.0\.1\"', '\"networkInterface\": \"0.0.0.0\"' | Set-Content '%CONFIG_FILE%'"
    
    echo.
    echo New configuration:
    echo ----------------------------------------
    type "%CONFIG_FILE%"
    echo.
    echo ----------------------------------------
    echo.
    echo [SUCCESS] Configuration updated!
    echo.
    echo IMPORTANT: You must now:
    echo 1. Stop LM Studio server (in Developer tab)
    echo 2. Start LM Studio server again
    echo 3. The server will now accept connections from Cloudflare tunnel
    
) else (
    echo [NOT FOUND] Configuration file not found at:
    echo %CONFIG_FILE%
    echo.
    echo Trying alternative location...
    
    set ALT_CONFIG=%userprofile%\.lmstudio\http-server-config.json
    if exist "!ALT_CONFIG!" (
        echo [FOUND] at alternative location: !ALT_CONFIG!
        echo Please run this script again with the correct path.
    ) else (
        echo.
        echo Please ensure:
        echo 1. LM Studio is installed
        echo 2. You have started the server at least once
        echo 3. Check if the file exists in:
        echo    - %userprofile%\.cache\lm-studio\.internal\
        echo    - %userprofile%\.lmstudio\
        echo    - %APPDATA%\LM Studio\
    )
)

echo.
pause

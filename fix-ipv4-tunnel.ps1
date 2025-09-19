# PowerShell Script to Fix Cloudflare Tunnel IPv4/IPv6 Issue
# This script MUST run on your DESKTOP PC (where LM Studio is installed)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "CLOUDFLARE TUNNEL IPv4 FIX SCRIPT" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check LM Studio is accessible on IPv4
Write-Host "Step 1: Testing LM Studio on IPv4 (127.0.0.1)..." -ForegroundColor Yellow
$testIPv4 = Invoke-WebRequest -Uri "http://127.0.0.1:1234/v1/models" -UseBasicParsing -ErrorAction SilentlyContinue
if ($testIPv4.StatusCode -eq 200) {
    Write-Host "[OK] LM Studio is accessible on 127.0.0.1:1234" -ForegroundColor Green
} else {
    Write-Host "[ERROR] LM Studio is NOT accessible on 127.0.0.1:1234" -ForegroundColor Red
    Write-Host "Please ensure LM Studio server is running!" -ForegroundColor Red
    exit 1
}

# Step 2: Update cloudflared config if exists
$configPath = "$env:USERPROFILE\.cloudflared\config.yml"
Write-Host ""
Write-Host "Step 2: Checking Cloudflared configuration..." -ForegroundColor Yellow

if (Test-Path $configPath) {
    Write-Host "[FOUND] Config file at: $configPath" -ForegroundColor Green
    
    # Backup original
    $backupPath = "$configPath.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item $configPath $backupPath
    Write-Host "[BACKUP] Created backup at: $backupPath" -ForegroundColor Green
    
    # Read config
    $config = Get-Content $configPath -Raw
    
    # Check if it uses localhost
    if ($config -match "localhost:1234") {
        Write-Host "[FIXING] Found 'localhost:1234' - replacing with '127.0.0.1:1234'" -ForegroundColor Yellow
        $newConfig = $config -replace "http://localhost:1234", "http://127.0.0.1:1234"
        $newConfig = $newConfig -replace "https://localhost:1234", "http://127.0.0.1:1234"
        Set-Content $configPath $newConfig
        Write-Host "[FIXED] Updated config to use IPv4 address" -ForegroundColor Green
        $needsRestart = $true
    } else {
        Write-Host "[OK] Config already uses 127.0.0.1 or different configuration" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "Current tunnel configuration:" -ForegroundColor Cyan
    Get-Content $configPath | Select-String -Pattern "hostname|service:|url:" | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host "[INFO] No local config file found at $configPath" -ForegroundColor Yellow
    Write-Host "Tunnel might be configured via Cloudflare Dashboard only" -ForegroundColor Yellow
}

# Step 3: Check cloudflared service
Write-Host ""
Write-Host "Step 3: Checking Cloudflared service status..." -ForegroundColor Yellow

$serviceExists = Get-Service -Name cloudflared -ErrorAction SilentlyContinue
if ($serviceExists) {
    Write-Host "[OK] Cloudflared service found" -ForegroundColor Green
    if ($serviceExists.Status -eq "Running") {
        Write-Host "[OK] Service is running" -ForegroundColor Green
        if ($needsRestart) {
            Write-Host "[ACTION] Restarting service to apply config changes..." -ForegroundColor Yellow
            Restart-Service cloudflared
            Start-Sleep -Seconds 3
            Write-Host "[OK] Service restarted" -ForegroundColor Green
        }
    } else {
        Write-Host "[WARNING] Service is not running" -ForegroundColor Yellow
        Start-Service cloudflared
        Write-Host "[OK] Service started" -ForegroundColor Green
    }
} else {
    # Check if cloudflared is running as process
    $process = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "[OK] Cloudflared is running as a process (not service)" -ForegroundColor Green
        if ($needsRestart) {
            Write-Host "[ACTION] Please restart cloudflared manually to apply changes" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARNING] Cloudflared is not running!" -ForegroundColor Red
    }
}

# Step 4: Display critical manual steps
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "CRITICAL MANUAL STEPS REQUIRED" -ForegroundColor Red
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "YOU MUST UPDATE CLOUDFLARE DASHBOARD:" -ForegroundColor Red
Write-Host ""
Write-Host "1. Go to: https://one.dash.cloudflare.com/" -ForegroundColor White
Write-Host "2. Navigate to: Zero Trust -> Access -> Tunnels" -ForegroundColor White
Write-Host "3. Click on your tunnel" -ForegroundColor White
Write-Host "4. Edit 'lmstudio.uterpi.com' public hostname" -ForegroundColor White
Write-Host "5. CHANGE Service URL from:" -ForegroundColor Yellow
Write-Host "     http://localhost:1234" -ForegroundColor Red
Write-Host "   TO:" -ForegroundColor Yellow
Write-Host "     http://127.0.0.1:1234" -ForegroundColor Green
Write-Host "6. CHANGE HTTP Host Header to:" -ForegroundColor Yellow
Write-Host "     127.0.0.1:1234" -ForegroundColor Green
Write-Host "7. Save changes" -ForegroundColor White
Write-Host ""
Write-Host "This is REQUIRED - the script cannot do this automatically!" -ForegroundColor Red
Write-Host ""

# Step 5: Test connectivity
Write-Host "Step 5: After updating Cloudflare Dashboard, test with:" -ForegroundColor Yellow
Write-Host "  curl https://lmstudio.uterpi.com/v1/models" -ForegroundColor Cyan
Write-Host ""

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "TROUBLESHOOTING INFO" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The 502 error occurs because:" -ForegroundColor White
Write-Host "- Windows resolves 'localhost' to ::1 (IPv6) first" -ForegroundColor White
Write-Host "- Cloudflared tries to connect via IPv6" -ForegroundColor White
Write-Host "- LM Studio only listens on IPv4 (127.0.0.1)" -ForegroundColor White
Write-Host "- Using 127.0.0.1 explicitly forces IPv4 connection" -ForegroundColor White
Write-Host ""

# Show listening ports
Write-Host "LM Studio listening on:" -ForegroundColor Yellow
netstat -an | Select-String ":1234" | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }

Write-Host ""
Write-Host "Script complete!" -ForegroundColor Green

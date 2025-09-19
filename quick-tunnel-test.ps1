# Quick Cloudflare Tunnel Test Script
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CLOUDFLARE TUNNEL QUICK DIAGNOSTIC" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check if LM Studio is accessible locally
Write-Host "[1] Testing LM Studio locally..." -ForegroundColor Yellow
$localTests = @(
    @{Name="localhost"; URL="http://localhost:1234/v1/models"},
    @{Name="127.0.0.1"; URL="http://127.0.0.1:1234/v1/models"},
    @{Name="0.0.0.0"; URL="http://0.0.0.0:1234/v1/models"}
)

foreach ($test in $localTests) {
    try {
        $response = Invoke-WebRequest -Uri $test.URL -Method GET -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "  ✓ $($test.Name): SUCCESS" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ✗ $($test.Name): FAILED" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[2] Checking network binding..." -ForegroundColor Yellow
$netstat = netstat -an | Select-String ":1234"
if ($netstat) {
    Write-Host "  LM Studio is listening on:" -ForegroundColor White
    $netstat | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} else {
    Write-Host "  ✗ LM Studio not found on port 1234!" -ForegroundColor Red
}

Write-Host ""
Write-Host "[3] Testing Cloudflare tunnel..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://lmstudio.uterpi.com/v1/models" -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  ✓ Tunnel is WORKING!" -ForegroundColor Green
    Write-Host "    Status: $($response.StatusCode)" -ForegroundColor Gray
} catch {
    if ($_.Exception.Response.StatusCode -eq 502) {
        Write-Host "  ✗ 502 Bad Gateway - Tunnel can't reach LM Studio" -ForegroundColor Red
        Write-Host ""
        Write-Host "  FIX REQUIRED:" -ForegroundColor Yellow
        Write-Host "  1. Go to https://one.dash.cloudflare.com/" -ForegroundColor White
        Write-Host "  2. Zero Trust → Access → Tunnels" -ForegroundColor White
        Write-Host "  3. Edit lmstudio.uterpi.com hostname" -ForegroundColor White
        Write-Host "  4. Change Service URL to: http://127.0.0.1:1234" -ForegroundColor Cyan
        Write-Host "     (NOT localhost - use 127.0.0.1)" -ForegroundColor Cyan
        Write-Host "  5. Save and restart cloudflared" -ForegroundColor White
    } else {
        Write-Host "  ✗ Error: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DIAGNOSTIC COMPLETE" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

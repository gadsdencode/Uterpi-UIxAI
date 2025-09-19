# Fix Cloudflare Tunnel 502 Bad Gateway Error

## Problem Summary
- **Error**: 502 Bad Gateway from Cloudflare
- **Symptoms**: 
  - LM Studio server logs show NO activity
  - Cloudflare tunnel is HEALTHY
  - Both services running on same machine (desktop)
  - Accessing from laptop on same network

## Root Cause
The Cloudflare tunnel configuration has an incorrect service URL. Since LM Studio logs show no activity, requests from Cloudflare aren't reaching LM Studio at all.

## Solution Steps

### 1. Verify LM Studio is Running Correctly

On your **desktop PC**, open Command Prompt and run:

```cmd
netstat -an | findstr :1234
```

You should see:
```
TCP    0.0.0.0:1234    0.0.0.0:0    LISTENING
```
or
```
TCP    127.0.0.1:1234    0.0.0.0:0    LISTENING
```

### 2. Test LM Studio Locally (on Desktop)

```cmd
curl http://localhost:1234/v1/models
curl http://127.0.0.1:1234/v1/models
```

Both should return JSON with model data.

### 3. Fix Cloudflare Tunnel Configuration

This is the **CRITICAL FIX**. The tunnel service URL must be corrected.

#### Option A: Via Cloudflare Dashboard (Recommended)

1. Open https://one.dash.cloudflare.com/
2. Navigate to: **Zero Trust** → **Access** → **Tunnels**
3. Click on **uterpi-tunnel-desktop**
4. Go to **Public Hostname** tab
5. Find and edit **lmstudio.uterpi.com**
6. **CHANGE THE SERVICE CONFIGURATION TO**:
   ```
   Type: HTTP
   URL:  http://127.0.0.1:1234
   ```
   
   **NOT** `http://localhost:1234` - use the explicit IP!

7. **Advanced Settings** (expand if available):
   - HTTP Host Header: `127.0.0.1` (or leave blank)
   - Origin Server Name: `127.0.0.1` (or leave blank)
   - Disable TLS Verify: ✓ Check this

8. **Save** the configuration

#### Option B: Via config.yml (if using local config)

Edit `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <your-tunnel-id>
credentials-file: C:\Users\JMart\.cloudflared\<tunnel-id>.json

ingress:
  - hostname: lmstudio.uterpi.com
    service: http://127.0.0.1:1234
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
  - service: http_status:404
```

### 4. Restart Cloudflare Tunnel

After updating configuration:

**If running as Windows Service:**
```cmd
net stop cloudflared
net start cloudflared
```

**If running manually:**
1. Stop current process (Ctrl+C)
2. Restart:
```cmd
cloudflared tunnel run uterpi-tunnel-desktop
```

### 5. Clear DNS Cache

On both desktop and laptop:
```cmd
ipconfig /flushdns
```

### 6. Test the Fix

**From Desktop (where services run):**
```cmd
curl http://127.0.0.1:1234/v1/models
```

**From Laptop or any device:**
```cmd
curl https://lmstudio.uterpi.com/v1/models
```

## Why This Happens

The issue occurs because:

1. **`localhost` ambiguity**: When cloudflared runs as a service or in certain contexts, `localhost` might not resolve correctly
2. **127.0.0.1 is explicit**: Using `127.0.0.1` removes any ambiguity about which interface to use
3. **Network binding**: LM Studio might be binding to `127.0.0.1` specifically, not `0.0.0.0`

## Alternative Solutions if Above Doesn't Work

### Try Different Service URLs

In Cloudflare tunnel config, try these URLs in order:

1. `http://127.0.0.1:1234` ← **Most likely to work**
2. `http://localhost:1234`
3. `http://0.0.0.0:1234`
4. `http://host.docker.internal:1234` (if cloudflared runs in Docker/WSL)

### Check Windows Firewall

Ensure Windows Firewall has an inbound rule for port 1234:

```cmd
netsh advfirewall firewall add rule name="LM Studio" dir=in action=allow protocol=TCP localport=1234
```

### Enable LM Studio Network Access

In LM Studio settings, ensure:
- ✓ **CORS is enabled** (you confirmed this)
- ✓ **"Serve on Local Network"** is enabled
- Server is bound to `0.0.0.0:1234` not just `127.0.0.1:1234`

## Verification Checklist

After applying the fix:

- [ ] Cloudflare tunnel service URL is `http://127.0.0.1:1234`
- [ ] Cloudflared service restarted
- [ ] DNS cache cleared
- [ ] `curl https://lmstudio.uterpi.com/v1/models` returns JSON
- [ ] LM Studio logs now show incoming requests
- [ ] Chat interface works without 502 errors

## Quick Test Script

Save as `test-fix.bat`:

```batch
@echo off
echo Testing LM Studio via Cloudflare...
curl -s https://lmstudio.uterpi.com/v1/models
if %ERRORLEVEL% EQU 0 (
    echo.
    echo SUCCESS! Tunnel is working.
) else (
    echo.
    echo FAILED! Check configuration.
)
pause
```

## Still Not Working?

If you still get 502 after these steps:

1. **Check cloudflared logs**:
   ```cmd
   cloudflared tail
   ```

2. **Verify tunnel status**:
   ```cmd
   cloudflared tunnel info uterpi-tunnel-desktop
   ```

3. **Test with verbose curl**:
   ```cmd
   curl -v https://lmstudio.uterpi.com/v1/models
   ```

The key is ensuring Cloudflare tunnel points to `http://127.0.0.1:1234` exactly, not `localhost`.

---

**Last Updated**: September 19, 2025  
**Issue**: Cloudflare Tunnel 502 Bad Gateway  
**Solution**: Change service URL from `http://localhost:1234` to `http://127.0.0.1:1234`

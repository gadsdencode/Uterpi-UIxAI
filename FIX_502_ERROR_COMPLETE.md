# 🚨 CRITICAL FIX: 502 Bad Gateway - IPv4/IPv6 Issue

## THE REAL PROBLEM

Your 502 error is caused by **Cloudflared trying to connect via IPv6 localhost (::1)** while **LM Studio only listens on IPv4 (127.0.0.1)**.

When you use `localhost` in Cloudflare tunnel configuration, it resolves to `::1` (IPv6) first on Windows, but LM Studio only binds to `127.0.0.1` (IPv4).

## ✅ THE SOLUTION - THREE CRITICAL CHANGES

### 1️⃣ **CLOUDFLARE DASHBOARD - Change Service URL**

**THIS IS THE MOST IMPORTANT STEP:**

1. Go to Cloudflare Dashboard → Zero Trust → Access → Tunnels
2. Click on your tunnel
3. Edit the `lmstudio.uterpi.com` public hostname
4. **CHANGE THE SERVICE URL FROM:**
   ```
   http://localhost:1234
   ```
   **TO:**
   ```
   http://127.0.0.1:1234
   ```
5. **HTTP Host Header:** Set to `127.0.0.1:1234` (not localhost)
6. Save changes

### 2️⃣ **LM STUDIO CONFIGURATION - Ensure IPv4 Binding**

Run this on your **DESKTOP PC**:

```cmd
# Check current LM Studio configuration
type %userprofile%\.cache\lm-studio\.internal\http-server-config.json
```

**Should show:**
```json
{
  "networkInterface": "0.0.0.0",
  "port": 1234
}
```

If not, edit it to exactly that and restart LM Studio server.

### 3️⃣ **CLOUDFLARED CONFIG FILE (if using config.yml)**

If you have a `config.yml` file at `%USERPROFILE%\.cloudflared\config.yml`:

**CHANGE:**
```yaml
ingress:
  - hostname: lmstudio.uterpi.com
    service: http://localhost:1234
  - service: http_status:404
```

**TO:**
```yaml
ingress:
  - hostname: lmstudio.uterpi.com
    service: http://127.0.0.1:1234
  - service: http_status:404
```

Then restart cloudflared:
```cmd
# If running as service
sc stop cloudflared
sc start cloudflared

# Or restart the process manually
```

## 🧪 VERIFICATION STEPS

### Step 1: Test LM Studio on IPv4
On your **DESKTOP PC**:
```cmd
# This MUST work
curl http://127.0.0.1:1234/v1/models

# This might fail (IPv6)
curl http://[::1]:1234/v1/models
```

### Step 2: Check Windows Hosts File
```cmd
type C:\Windows\System32\drivers\etc\hosts
```

Look for:
```
::1         localhost
127.0.0.1   localhost
```

If `::1 localhost` appears BEFORE `127.0.0.1 localhost`, that's causing the issue.

### Step 3: Force Test with IPv4
```cmd
# Test tunnel with explicit IPv4
cloudflared access tcp --hostname lmstudio.uterpi.com --url http://127.0.0.1:1234
```

## 🔍 WHY THIS HAPPENS

1. **Windows resolves `localhost` to `::1` (IPv6) first**
2. **Cloudflared tries to connect to `::1:1234`**
3. **LM Studio only listens on `127.0.0.1:1234` (IPv4)**
4. **Connection fails → 502 Bad Gateway**

By using `127.0.0.1` explicitly everywhere, we force IPv4 connections.

## 📝 DEBUGGING COMMANDS

Run these on your **DESKTOP PC**:

```cmd
# Check what LM Studio is actually listening on
netstat -an | findstr :1234

# Should show:
# TCP    0.0.0.0:1234    0.0.0.0:0    LISTENING
# or
# TCP    127.0.0.1:1234    0.0.0.0:0    LISTENING
```

If it shows `[::]:1234` or `[::1]:1234`, LM Studio is on IPv6 (unlikely).

## 🚀 ALTERNATIVE: Use Machine's Local IP

If the above doesn't work, use your desktop's actual IP:

1. Find your desktop's IP:
   ```cmd
   ipconfig
   # Look for IPv4 Address, e.g., 192.168.86.44
   ```

2. In Cloudflare Dashboard, change Service URL to:
   ```
   http://192.168.86.44:1234
   ```

3. Ensure Windows Firewall allows port 1234

## ⚡ QUICK FIX CHECKLIST

- [ ] Cloudflare Service URL uses `http://127.0.0.1:1234` NOT `http://localhost:1234`
- [ ] HTTP Host Header set to `127.0.0.1:1234`
- [ ] LM Studio config has `"networkInterface": "0.0.0.0"`
- [ ] Cloudflared restarted after changes
- [ ] LM Studio server restarted after config changes
- [ ] Test with `curl http://127.0.0.1:1234/v1/models` works locally

## 🎯 SOURCES

- [GitHub: cloudflare/cloudflared Issue #270](https://github.com/cloudflare/cloudflared/issues/270) - IPv6 localhost issue
- [GitHub: cloudflare/cloudflared Issue #976](https://github.com/cloudflare/cloudflared/issues/976) - Windows vs Docker tunnel differences
- Multiple Cloudflare Community posts confirming IPv4/IPv6 resolution issues

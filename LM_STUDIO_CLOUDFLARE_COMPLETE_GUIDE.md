# 🚀 Complete Guide: LM Studio + Cloudflare Tunnel Setup

## 📋 THE PROBLEM

LM Studio by default only listens on `127.0.0.1` (localhost), which means:
- ✅ Works: Direct local connections
- ❌ Fails: Connections from Cloudflare tunnel
- ❌ Fails: Connections from other network devices
- ❌ Fails: WSL connections

**Error you're seeing:** `502 Bad Gateway` - Cloudflare can't reach LM Studio

## 🛠️ THE SOLUTION

### Step 1: Configure LM Studio Network Interface

#### **Method A: GUI Toggle (Newest Versions)**
1. Open **LM Studio**
2. Go to **Settings** 
3. Enable **"Server on Local Network"** toggle
4. Restart the server

#### **Method B: Manual Configuration (All Versions)**

**On your DESKTOP PC where LM Studio runs:**

1. **Run the fix script** (I've created `fix-lmstudio-network.bat`)
   ```cmd
   fix-lmstudio-network.bat
   ```

**OR manually:**

1. **Navigate to:**
   ```
   %userprofile%\.cache\lm-studio\.internal\
   ```

2. **Edit `http-server-config.json`**
   
   Change:
   ```json
   {
     "networkInterface": "127.0.0.1",
     "port": 1234
   }
   ```
   
   To:
   ```json
   {
     "networkInterface": "0.0.0.0",
     "port": 1234
   }
   ```

3. **Restart LM Studio Server:**
   - Go to Developer tab in LM Studio
   - Stop the server
   - Start the server again

### Step 2: Verify LM Studio is Accessible

On your **DESKTOP**, test:
```cmd
# Should work now (all interfaces)
curl http://0.0.0.0:1234/v1/models

# Should also work
curl http://localhost:1234/v1/models
```

### Step 3: Update Cloudflare Tunnel (if needed)

In Cloudflare Dashboard:
1. Go to your tunnel settings
2. Edit `lmstudio.uterpi.com` hostname
3. Ensure:
   - Service URL: `http://localhost:1234` (or `http://127.0.0.1:1234`)
   - HTTP Host Header: `localhost:1234`
4. Save

### Step 4: Test the Connection

From **ANY** computer:
```bash
curl https://lmstudio.uterpi.com/v1/models
```

Should return JSON with your models!

## 🔍 TROUBLESHOOTING

### Still Getting 502?

1. **Check Windows Firewall:**
   ```cmd
   # Run as Administrator
   netsh advfirewall firewall add rule name="LM Studio" dir=in action=allow protocol=TCP localport=1234
   ```

2. **Verify LM Studio is running:**
   - Check the Developer tab shows "Server Running"
   - Model is loaded

3. **Check the config was applied:**
   ```cmd
   type %userprofile%\.cache\lm-studio\.internal\http-server-config.json
   ```
   Should show `"networkInterface": "0.0.0.0"`

### DNS Not Resolving?

If `lmstudio.uterpi.com` doesn't resolve:
1. Clear DNS cache: `ipconfig /flushdns`
2. Wait 2-3 minutes for propagation
3. Check Cloudflare DNS records

### Alternative: Quick Tunnel

If you need it working RIGHT NOW:

On your **DESKTOP**:
```cmd
cloudflared tunnel --url http://localhost:1234
```

Use the temporary URL it provides (like `https://random.trycloudflare.com`)

## 📝 FOR YOUR REPLIT DEPLOYMENT

Once everything works, set in Replit Secrets:
```
LMSTUDIO_BASE_URL=https://lmstudio.uterpi.com
SESSION_SECRET=your-secure-random-string-here
```

## ⚡ QUICK CHECKLIST

- [ ] LM Studio config shows `"networkInterface": "0.0.0.0"`
- [ ] LM Studio server restarted after config change
- [ ] Windows Firewall allows port 1234
- [ ] Cloudflare tunnel shows HEALTHY status
- [ ] DNS resolves `lmstudio.uterpi.com`
- [ ] Test URL returns models: `curl https://lmstudio.uterpi.com/v1/models`

## 🎯 KEY INSIGHT

**The critical issue:** LM Studio defaults to listening only on localhost (127.0.0.1). Cloudflare tunnel connects to your machine but can't reach LM Studio because it's not listening on the network interface the tunnel uses. Changing to 0.0.0.0 makes LM Studio listen on ALL interfaces, including the one Cloudflare tunnel needs.

## 🔒 SECURITY NOTE

Setting `networkInterface: "0.0.0.0"` makes LM Studio accessible to:
- Your local network (any device on your WiFi/LAN)
- Through the Cloudflare tunnel (internet via authenticated tunnel)

If you only want Cloudflare access, ensure Windows Firewall blocks port 1234 except from localhost and Cloudflare tunnel.

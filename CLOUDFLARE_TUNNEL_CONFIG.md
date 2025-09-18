# Cloudflare Tunnel Configuration for LM Studio

## Current Setup Status

### ✅ LM Studio Server
- **Status**: Running
- **Local Address**: `http://192.168.86.44:1234`
- **Model Loaded**: Pragmanic0/Nomadic-ICDU-v8

### ✅ Cloudflare Tunnel
- **Tunnel Name**: uterpi-tunnel-desktop
- **Status**: HEALTHY
- **Tunnel ID**: 4252ad17-85aa-429b-a9d5-f0c2270ddac1
- **Connector ID**: e5b8eabd-5ef7-4ea5-a6c1-ae1d714ebc7e

## Configuration Options

### Option 1: Local Network (Currently Configured)
The app is currently configured to use your local network IP directly:
```
LMSTUDIO_BASE_URL=http://192.168.86.44:1234
```
This works when both your laptop and desktop are on the same network.

### Option 2: Cloudflare Tunnel (For External Access)
To use your Cloudflare tunnel for external access, you need to:

1. **Configure a public hostname for your tunnel** (if not already done):
   ```bash
   cloudflared tunnel route dns uterpi-tunnel-desktop lmstudio.uterpi.com
   ```

2. **Update the `.env.local` file**:
   ```bash
   LMSTUDIO_BASE_URL=https://lmstudio.uterpi.com
   ```

## Setting Up the Tunnel Route

If you haven't configured a public hostname yet:

1. **Login to Cloudflare** (if needed):
   ```bash
   cloudflared tunnel login
   ```

2. **Create a DNS route** for your tunnel:
   ```bash
   cloudflared tunnel route dns uterpi-tunnel-desktop lmstudio.uterpi.com
   ```

3. **Update tunnel configuration** to point to LM Studio:
   Create/edit `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: 4252ad17-85aa-429b-a9d5-f0c2270ddac1
   credentials-file: ~/.cloudflared/4252ad17-85aa-429b-a9d5-f0c2270ddac1.json

   ingress:
     - hostname: lmstudio.uterpi.com
       service: http://localhost:1234
     - service: http_status:404
   ```

4. **Restart the tunnel**:
   ```bash
   cloudflared tunnel run uterpi-tunnel-desktop
   ```

## Testing Your Configuration

### Test Local Connection (current):
```bash
curl http://192.168.86.44:1234/v1/models
```

### Test Cloudflare Tunnel (after setup):
```bash
curl https://lmstudio.uterpi.com/v1/models
```

## App Configuration

The app now automatically tries these URLs in order:
1. Environment variable `LMSTUDIO_BASE_URL` (from .env.local)
2. Environment variable `VITE_LMSTUDIO_BASE_URL` 
3. Fallback to `http://192.168.86.44:1234`

## Troubleshooting

### If the tunnel isn't working:
1. Check tunnel status: `cloudflared tunnel info uterpi-tunnel-desktop`
2. Check DNS: `nslookup lmstudio.uterpi.com`
3. Verify tunnel logs: `cloudflared tunnel run --loglevel debug uterpi-tunnel-desktop`

### If the local connection isn't working:
1. Verify LM Studio is running on the desktop
2. Check Windows Firewall isn't blocking port 1234
3. Ensure both devices are on the same network
4. Try: `ping 192.168.86.44` from your laptop

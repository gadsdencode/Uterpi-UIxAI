# Complete Cloudflare Tunnel Setup for LM Studio

## Current Status
- **App Deployed at**: https://nomadai.replit.app (accessible via https://uterpi.com)
- **LM Studio Running at**: http://192.168.86.44:1234 (your desktop)
- **Tunnel Name**: uterpi-tunnel-desktop (HEALTHY)
- **Target URL**: https://lmstudio.uterpi.com (needs configuration)

## Step 1: Configure Cloudflare Tunnel Public Hostname

Since your tunnel is already created and healthy, you just need to add the public hostname routing:

### Option A: Via Cloudflare Dashboard (Recommended)

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access** → **Tunnels**
3. Click on `uterpi-tunnel-desktop`
4. Go to **Public Hostname** tab
5. Click **Add a public hostname**
6. Configure:
   - **Subdomain**: `lmstudio`
   - **Domain**: `uterpi.com`
   - **Service Type**: `HTTP`
   - **URL**: `localhost:1234`
7. Save the configuration

### Option B: Via Command Line

Run this on your desktop where the tunnel is installed:

```bash
# First, ensure your tunnel config file exists
cloudflared tunnel route dns uterpi-tunnel-desktop lmstudio.uterpi.com
```

## Step 2: Update Tunnel Configuration File

On your desktop, edit the Cloudflare tunnel configuration:

**Windows Path**: `C:\Users\[YourUsername]\.cloudflared\config.yml`

```yaml
tunnel: 4252ad17-85aa-429b-a9d5-f0c2270ddac1
credentials-file: C:\Users\[YourUsername]\.cloudflared\4252ad17-85aa-429b-a9d5-f0c2270ddac1.json

ingress:
  # Route for LM Studio
  - hostname: lmstudio.uterpi.com
    service: http://localhost:1234
    originRequest:
      noTLSVerify: true
  # Catch-all rule
  - service: http_status:404
```

## Step 3: Restart Cloudflare Tunnel

After updating the configuration, restart the tunnel:

```bash
# If running as a Windows service
sc stop cloudflared
sc start cloudflared

# Or if running manually
# Stop the current process (Ctrl+C) then:
cloudflared tunnel run uterpi-tunnel-desktop
```

## Step 4: Verify DNS Configuration

Check that the DNS record was created:

```bash
nslookup lmstudio.uterpi.com
```

You should see it resolving to Cloudflare's proxy servers.

## Step 5: Test the Connection

Test from any device with internet access:

```bash
# Test the tunnel endpoint
curl https://lmstudio.uterpi.com/v1/models

# Should return your LM Studio models list
```

## Step 6: Configure Replit Environment

In your Replit project:

1. Go to the **Tools** → **Secrets** tab
2. Add a new secret:
   - Key: `LMSTUDIO_BASE_URL`
   - Value: `https://lmstudio.uterpi.com`
3. Restart your Repl

Alternatively, you can set it in the Shell:
```bash
# In Replit Shell
echo "LMSTUDIO_BASE_URL=https://lmstudio.uterpi.com" >> .env
```

## Step 7: Important LM Studio Settings

Make sure LM Studio on your desktop is configured correctly:

1. **Server Settings** in LM Studio:
   - Enable "Allow requests from network"
   - Set server to bind to `0.0.0.0:1234` (not just `localhost:1234`)
   - This ensures it accepts connections from the tunnel

2. **Windows Firewall**:
   - Allow inbound connections on port 1234
   - Or add LM Studio to firewall exceptions

## Troubleshooting

### If you get "fetch failed" error:
1. **Check tunnel is running**: Look for green "HEALTHY" status
2. **Verify LM Studio is running**: Should show "Server Running" in LM Studio
3. **Test locally first**: `curl http://localhost:1234/v1/models` on your desktop
4. **Check tunnel logs**: `cloudflared tunnel info uterpi-tunnel-desktop`

### If DNS doesn't resolve:
1. Wait 1-2 minutes for DNS propagation
2. Check Cloudflare DNS records for uterpi.com
3. Ensure the CNAME record for `lmstudio` exists

### If connection times out:
1. Verify Windows Firewall isn't blocking
2. Check LM Studio is binding to `0.0.0.0` not just `127.0.0.1`
3. Ensure tunnel ingress rules are correct

## Production Deployment Notes

The app code now automatically detects the environment:
- **Development**: Uses `http://192.168.86.44:1234` (local network)
- **Production** (Replit): Uses `https://lmstudio.uterpi.com` (Cloudflare tunnel)

You can override this by setting `LMSTUDIO_BASE_URL` environment variable.

## Security Considerations

1. **API Key**: Consider adding an API key to LM Studio for production
2. **Rate Limiting**: Cloudflare can add rate limiting rules
3. **Access Control**: Use Cloudflare Access to restrict who can use the endpoint

## Quick Test Commands

```bash
# From your laptop (local network)
curl http://192.168.86.44:1234/v1/models

# From anywhere (via Cloudflare tunnel)
curl https://lmstudio.uterpi.com/v1/models

# From your deployed app
curl https://uterpi.com/api/lmstudio/models
```

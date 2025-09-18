# Cloudflare Tunnel Setup for LM Studio

## Current Issues & Solutions

### Issue 1: LM Studio Connection Failing

The app is currently trying to connect to `https://lmstudio.uterpi.com` but getting connection errors. You need to configure the proper Cloudflare tunnel URL.

### Solution Steps:

1. **Create a `.env` file in the project root** with your Cloudflare tunnel URL:

```bash
# Create .env file in the project root
LMSTUDIO_BASE_URL=https://your-cloudflare-tunnel-url.trycloudflare.com
```

Replace `your-cloudflare-tunnel-url` with your actual Cloudflare tunnel URL.

2. **Alternative: Use Local IP** (for testing on same network):
```bash
LMSTUDIO_BASE_URL=http://192.168.1.XXX:1234
```
Replace `192.168.1.XXX` with your desktop's actual IP address.

3. **Restart the server** after creating the .env file:
```bash
npm run dev
```

### Issue 2: Speech-to-Text (STT) Not Working

For debugging STT issues:

1. **Check browser console** (F12) for errors when clicking the microphone button
2. **Ensure HTTPS** - Speech recognition requires HTTPS or localhost
3. **Check microphone permissions** in browser settings
4. **Test in different browsers** - Chrome/Edge work best for Web Speech API

### Verifying Your Setup

1. **Check Cloudflare Tunnel Status**:
   - Ensure your tunnel shows "HEALTHY" status
   - Verify the tunnel is pointing to `localhost:1234` on your desktop

2. **Test LM Studio Directly**:
   ```bash
   # From your desktop (where LM Studio is running)
   curl http://localhost:1234/v1/models
   
   # Through Cloudflare tunnel (from any device)
   curl https://your-cloudflare-tunnel-url.trycloudflare.com/v1/models
   ```

3. **Test from the App**:
   - After setting LMSTUDIO_BASE_URL in .env
   - Restart the dev server
   - Try sending a message in the chat

### Common Cloudflare Tunnel Commands

```bash
# Check tunnel status
cloudflared tunnel list

# View tunnel configuration
cloudflared tunnel route ip show

# Start tunnel (if not using service)
cloudflared tunnel run your-tunnel-name
```

### Debugging Connection Issues

If still having issues, check:

1. **Firewall**: Ensure port 1234 is accessible on your desktop
2. **LM Studio**: Verify it's running and listening on `0.0.0.0:1234` not just `localhost:1234`
3. **Cloudflare Dashboard**: Check tunnel logs for connection attempts
4. **Network**: Ensure both devices can reach the Cloudflare tunnel URL

### For Production Deployment

When deploying, set the environment variable on your hosting platform:
- **Vercel**: Add LMSTUDIO_BASE_URL in project settings
- **Netlify**: Add to environment variables
- **Docker**: Pass via -e flag or docker-compose.yml

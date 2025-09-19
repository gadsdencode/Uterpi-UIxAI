# 🔐 Complete Environment Variables Configuration Guide

## CRITICAL: Production (Replit) Environment Variables

Copy and set these environment variables in your **Replit Secrets** tab:

### 🚨 REQUIRED - LM Studio Connection
```bash
# Option 1: If Cloudflare tunnel DNS is configured (RECOMMENDED)
LMSTUDIO_BASE_URL=https://lmstudio.uterpi.com

# Option 2: If DNS not configured yet, use temporary tunnel URL
# Get this from: cloudflared tunnel info uterpi-tunnel-desktop
# Example: LMSTUDIO_BASE_URL=https://your-temp-tunnel.trycloudflare.com

# Optional: If you set an API key in LM Studio
# LMSTUDIO_API_KEY=your-lm-studio-api-key
```

### 📦 Database Configuration
```bash
# PostgreSQL database URL (if using external database)
# Format: postgresql://user:password@host:port/dbname
DATABASE_URL=postgresql://your_user:your_password@your_host:5432/your_database

# Session secret for secure cookies (CHANGE THIS!)
SESSION_SECRET=your-super-secret-session-key-change-this-in-production
```

### 💳 Stripe Configuration (if using payments)
```bash
# Get these from https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key
```

### 📧 Email Configuration (Resend)
```bash
# Get from https://resend.com/api-keys
RESEND_API_KEY=re_your_resend_api_key
```

### 🤖 AI Provider API Keys (Optional)
```bash
# OpenAI (if using OpenAI directly)
OPENAI_API_KEY=sk-your-openai-api-key

# Google Gemini (if using Gemini)
GEMINI_API_KEY=your-gemini-api-key

# Hugging Face (if using HF models)
HUGGINGFACE_API_KEY=hf_your_huggingface_token

# Azure OpenAI (if using Azure)
AZURE_OPENAI_API_KEY=your-azure-api-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

## 🛠️ How to Set Environment Variables in Replit

1. **Open your Replit project**
2. **Click the 🔒 "Secrets" tab** (in the Tools section)
3. **For each variable:**
   - Click "New Secret"
   - Enter the **Key** (e.g., `LMSTUDIO_BASE_URL`)
   - Enter the **Value** (e.g., `https://lmstudio.uterpi.com`)
   - Click "Add Secret"

## 🌐 Cloudflare Tunnel DNS Configuration

### If you see this error:
```
"Unable to connect to LM Studio via Cloudflare tunnel: Attempted to connect to: https://lmstudio.uterpi.com"
```

### You need to configure DNS:

1. **Go to Cloudflare Dashboard**
   - https://dash.cloudflare.com
   - Select your domain (uterpi.com)

2. **Add DNS Record**
   - Go to DNS → Records
   - Click "Add Record"
   - Type: `CNAME`
   - Name: `lmstudio`
   - Target: `your-tunnel-id.cfargotunnel.com`
   - Proxy status: **Proxied** (orange cloud ON)
   - Save

3. **Configure Tunnel Public Hostname**
   - Go to Zero Trust → Access → Tunnels
   - Click on `uterpi-tunnel-desktop`
   - Public Hostname tab → Add hostname
   - Subdomain: `lmstudio`
   - Domain: `uterpi.com`
   - Service: `http://localhost:1234`
   - Save

## 📋 Environment Variables Checklist

### ✅ Minimum Required for Basic Functionality:
- [x] `LMSTUDIO_BASE_URL` - Connection to your LM Studio server
- [x] `SESSION_SECRET` - Secure session management

### 🔧 Optional but Recommended:
- [ ] `DATABASE_URL` - For persistent data storage
- [ ] `RESEND_API_KEY` - For email notifications
- [ ] `STRIPE_SECRET_KEY` - For payment processing

### 🎯 For Specific AI Providers:
- [ ] `OPENAI_API_KEY` - If using OpenAI
- [ ] `GEMINI_API_KEY` - If using Google Gemini
- [ ] `HUGGINGFACE_API_KEY` - If using Hugging Face

## 🐛 Debugging Connection Issues

### Test your configuration:
```bash
# From your local machine
curl https://lmstudio.uterpi.com/v1/models

# Should return JSON with your LM Studio models
```

### Common Issues:

1. **"fetch failed" error**
   - ❌ DNS not configured
   - ✅ Configure Cloudflare tunnel DNS (see above)

2. **"ECONNREFUSED" error**
   - ❌ LM Studio not running
   - ✅ Start LM Studio server on desktop

3. **"404 Not Found" error**
   - ❌ Tunnel not pointing to correct port
   - ✅ Ensure tunnel → localhost:1234

4. **Protocol mismatch (http vs https)**
   - ❌ Using http:// for Cloudflare tunnel
   - ✅ Always use https:// for *.uterpi.com

## 🚀 Quick Start Commands

### Local Development:
```bash
# Create .env.local file
echo "LMSTUDIO_BASE_URL=http://192.168.86.44:1234" > .env.local

# Run development server
npm run dev
```

### Production Deployment:
```bash
# Build the application
npm run build

# Push to GitHub (Replit auto-deploys)
git add .
git commit -m "Configure environment variables"
git push
```

## 📝 Important Notes

1. **NEVER commit secrets to Git** - Use Replit Secrets or .env.local
2. **Cloudflare tunnels ALWAYS use HTTPS** - Never http://
3. **LM Studio must bind to 0.0.0.0:1234** not just localhost
4. **Test locally first** before deploying to production
5. **Session secret MUST be changed** from default value

## 🆘 Need Help?

If you're still having issues:
1. Check the server logs in Replit console
2. Test with: `node test-lmstudio-connection.js`
3. Verify Cloudflare tunnel status: `cloudflared tunnel info uterpi-tunnel-desktop`
4. Ensure Windows Firewall allows port 1234

---

**Last Updated**: September 18, 2025
**App URL**: https://uterpi.com
**Tunnel Target**: https://lmstudio.uterpi.com

#!/usr/bin/env node

/**
 * Test script to verify LM Studio connectivity
 * Run: node test-lmstudio-connection.js
 */

const urls = {
  local: "http://192.168.86.44:1234",
  cloudflare: "https://lmstudio.uterpi.com",
  localhost: "http://localhost:1234"
};

async function testConnection(name, baseUrl) {
  console.log(`\n📡 Testing ${name}: ${baseUrl}`);
  console.log("─".repeat(50));
  
  try {
    // Test /v1/models endpoint
    const modelsUrl = `${baseUrl}/v1/models`;
    console.log(`  → Fetching models from ${modelsUrl}...`);
    
    const startTime = Date.now();
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`  ✅ Success! Response time: ${responseTime}ms`);
    console.log(`  📦 Found ${data.data?.length || 0} models:`);
    
    if (data.data && data.data.length > 0) {
      data.data.slice(0, 3).forEach((model, i) => {
        console.log(`     ${i + 1}. ${model.id}`);
      });
      if (data.data.length > 3) {
        console.log(`     ... and ${data.data.length - 3} more`);
      }
    }
    
    return true;
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message}`);
    
    if (error.cause) {
      console.log(`     Cause: ${error.cause.message || error.cause}`);
    }
    
    // Provide specific troubleshooting tips
    if (name === "Cloudflare Tunnel") {
      console.log("\n  💡 Troubleshooting tips for Cloudflare:");
      console.log("     1. Check tunnel status: cloudflared tunnel info uterpi-tunnel-desktop");
      console.log("     2. Verify DNS: nslookup lmstudio.uterpi.com");
      console.log("     3. Ensure tunnel config includes lmstudio.uterpi.com → localhost:1234");
      console.log("     4. Check that LM Studio is running on your desktop");
    } else if (name === "Local Network") {
      console.log("\n  💡 Troubleshooting tips for Local Network:");
      console.log("     1. Ensure both devices are on the same network");
      console.log("     2. Check Windows Firewall on desktop (port 1234)");
      console.log("     3. Verify LM Studio is binding to 0.0.0.0:1234");
      console.log("     4. Try: ping 192.168.86.44");
    } else if (name === "Localhost") {
      console.log("\n  💡 Troubleshooting tips for Localhost:");
      console.log("     1. Make sure LM Studio is running");
      console.log("     2. Check LM Studio server is started (green status)");
      console.log("     3. Verify port 1234 is not in use by another app");
    }
    
    return false;
  }
}

async function main() {
  console.log("🔍 LM Studio Connection Tester");
  console.log("================================");
  console.log(`Running from: ${process.cwd()}`);
  console.log(`Node version: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  const results = [];
  
  // Test localhost first (if running on desktop)
  if (process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux') {
    results.push({
      name: "Localhost",
      success: await testConnection("Localhost", urls.localhost)
    });
  }
  
  // Test local network
  results.push({
    name: "Local Network",
    success: await testConnection("Local Network", urls.local)
  });
  
  // Test Cloudflare tunnel
  results.push({
    name: "Cloudflare Tunnel",
    success: await testConnection("Cloudflare Tunnel", urls.cloudflare)
  });
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 SUMMARY");
  console.log("=".repeat(50));
  
  results.forEach(result => {
    const icon = result.success ? "✅" : "❌";
    console.log(`${icon} ${result.name}: ${result.success ? "Working" : "Failed"}`);
  });
  
  const successCount = results.filter(r => r.success).length;
  
  if (successCount === 0) {
    console.log("\n⚠️  No connections are working. Please check:");
    console.log("   1. LM Studio is running on your desktop");
    console.log("   2. The server is started (shows 'Running' status)");
    console.log("   3. A model is loaded");
  } else if (successCount < results.length) {
    console.log("\n⚠️  Some connections are not working. See troubleshooting tips above.");
  } else {
    console.log("\n✨ All connections are working perfectly!");
  }
  
  // Environment variable check
  if (process.env.LMSTUDIO_BASE_URL) {
    console.log(`\n📝 Note: LMSTUDIO_BASE_URL is set to: ${process.env.LMSTUDIO_BASE_URL}`);
  }
}

// Run the tests
main().catch(console.error);

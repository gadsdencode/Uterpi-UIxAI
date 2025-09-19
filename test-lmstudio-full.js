#!/usr/bin/env node

/**
 * Complete LM Studio connectivity and functionality test
 * Tests all endpoints and configurations
 * Run: node test-lmstudio-full.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  // Try environment variables first, then defaults
  baseUrl: process.env.LMSTUDIO_BASE_URL || 'https://lmstudio.uterpi.com',
  apiKey: process.env.LMSTUDIO_API_KEY || 'lm-studio',
  modelName: 'nomadai-lcdu-v8',  // Model name as shown in LM Studio
  testLocal: process.env.TEST_LOCAL === 'true',
  localUrl: 'http://192.168.86.44:1234'
};

// Test configurations
const testConfigs = [
  { name: 'Production (Cloudflare)', url: CONFIG.baseUrl },
  ...(CONFIG.testLocal ? [{ name: 'Local (Direct)', url: CONFIG.localUrl }] : [])
];

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

// Test results collector
const results = {
  passed: [],
  failed: [],
  warnings: []
};

/**
 * Log with color
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Test endpoint availability
 */
async function testEndpoint(baseUrl, endpoint, method = 'GET', body = null) {
  const url = `${baseUrl}${endpoint}`;
  
  try {
    log(`\n  Testing ${method} ${endpoint}...`, 'cyan');
    
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const startTime = Date.now();
    const response = await fetch(url, options);
    const responseTime = Date.now() - startTime;
    
    const text = await response.text();
    let data;
    
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    
    if (response.ok) {
      log(`    ✅ Success (${response.status}) - ${responseTime}ms`, 'green');
      
      // Show relevant response data
      if (endpoint === '/v1/models' && data.data) {
        log(`    📋 Available models:`, 'yellow');
        data.data.forEach(model => {
          log(`       - ${model.id} (owned by: ${model.owned_by})`, 'yellow');
        });
      } else if (endpoint === '/v1/chat/completions' && data.choices) {
        const content = data.choices[0]?.message?.content || data.choices[0]?.text;
        if (content) {
          log(`    💬 Response: ${content.substring(0, 100)}...`, 'yellow');
        }
        if (data.usage) {
          log(`    📊 Tokens: ${data.usage.total_tokens} (prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens})`, 'blue');
        }
      } else if (endpoint === '/v1/embeddings' && data.data) {
        log(`    📐 Embeddings generated: ${data.data.length} vectors`, 'yellow');
        if (data.data[0]?.embedding) {
          log(`    📏 Embedding dimensions: ${data.data[0].embedding.length}`, 'blue');
        }
      }
      
      results.passed.push(`${method} ${endpoint}`);
      return { success: true, data, responseTime };
    } else {
      log(`    ❌ Failed (${response.status}): ${text.substring(0, 200)}`, 'red');
      results.failed.push(`${method} ${endpoint}: ${response.status}`);
      return { success: false, error: text, status: response.status };
    }
  } catch (error) {
    log(`    ❌ Error: ${error.message}`, 'red');
    results.failed.push(`${method} ${endpoint}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test chat completion with various features
 */
async function testChatCompletion(baseUrl) {
  log('\n📝 Testing Chat Completions...', 'magenta');
  
  // Basic chat completion
  const basicChat = {
    model: CONFIG.modelName,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say "LM Studio is connected!" in exactly 5 words.' }
    ],
    max_tokens: 50,
    temperature: 0.7
  };
  
  const basicResult = await testEndpoint(baseUrl, '/v1/chat/completions', 'POST', basicChat);
  
  // Test with tools/functions
  log('\n📝 Testing Chat Completions with Tools...', 'magenta');
  
  const toolChat = {
    model: CONFIG.modelName,
    messages: [
      { role: 'user', content: 'What is the weather in San Francisco?' }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            },
            required: ['location']
          }
        }
      }
    ],
    tool_choice: 'auto'
  };
  
  const toolResult = await testEndpoint(baseUrl, '/v1/chat/completions', 'POST', toolChat);
  if (toolResult.data?.choices?.[0]?.message?.tool_calls) {
    log(`    🔧 Tool calls detected!`, 'green');
    console.log('    ', JSON.stringify(toolResult.data.choices[0].message.tool_calls, null, 2));
  }
  
  return basicResult.success;
}

/**
 * Test text completion
 */
async function testCompletion(baseUrl) {
  log('\n📝 Testing Text Completions...', 'magenta');
  
  const completion = {
    model: CONFIG.modelName,
    prompt: 'Once upon a time',
    max_tokens: 50,
    temperature: 0.8
  };
  
  const result = await testEndpoint(baseUrl, '/v1/completions', 'POST', completion);
  return result.success;
}

/**
 * Test embeddings
 */
async function testEmbeddings(baseUrl) {
  log('\n📝 Testing Embeddings...', 'magenta');
  
  const embedding = {
    model: CONFIG.modelName,
    input: 'This is a test sentence for embeddings.'
  };
  
  const result = await testEndpoint(baseUrl, '/v1/embeddings', 'POST', embedding);
  return result.success;
}

/**
 * Test streaming (SSE)
 */
async function testStreaming(baseUrl) {
  log('\n📝 Testing Streaming (SSE)...', 'magenta');
  
  const streamRequest = {
    model: CONFIG.modelName,
    messages: [
      { role: 'user', content: 'Count from 1 to 5 slowly.' }
    ],
    max_tokens: 100,
    stream: true
  };
  
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(streamRequest)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunks = 0;
    
    log(`    📡 Streaming response...`, 'cyan');
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      chunks++;
      
      // Just count chunks, don't print all content
      if (chunks === 1) {
        log(`    ✅ Stream started successfully`, 'green');
      }
    }
    
    log(`    ✅ Stream completed (${chunks} chunks received)`, 'green');
    results.passed.push('Streaming (SSE)');
    return true;
  } catch (error) {
    log(`    ❌ Streaming failed: ${error.message}`, 'red');
    results.failed.push(`Streaming: ${error.message}`);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n🚀 LM Studio Complete Test Suite', 'magenta');
  log('=====================================', 'magenta');
  
  log('\n📋 Configuration:', 'yellow');
  console.log(`  Base URL: ${CONFIG.baseUrl}`);
  console.log(`  Model: ${CONFIG.modelName}`);
  console.log(`  API Key: ${CONFIG.apiKey === 'lm-studio' ? 'default (lm-studio)' : 'custom'}`);
  
  for (const config of testConfigs) {
    log(`\n\n🔍 Testing ${config.name}: ${config.url}`, 'blue');
    log('━'.repeat(50), 'blue');
    
    // Test /v1/models endpoint
    await testEndpoint(config.url, '/v1/models');
    
    // Test chat completions
    await testChatCompletion(config.url);
    
    // Test text completions
    await testCompletion(config.url);
    
    // Test embeddings
    await testEmbeddings(config.url);
    
    // Test streaming
    await testStreaming(config.url);
  }
  
  // Summary
  log('\n\n📊 TEST SUMMARY', 'magenta');
  log('═'.repeat(50), 'magenta');
  
  if (results.passed.length > 0) {
    log(`\n✅ PASSED (${results.passed.length}):`, 'green');
    results.passed.forEach(test => {
      log(`   - ${test}`, 'green');
    });
  }
  
  if (results.failed.length > 0) {
    log(`\n❌ FAILED (${results.failed.length}):`, 'red');
    results.failed.forEach(test => {
      log(`   - ${test}`, 'red');
    });
  }
  
  if (results.warnings.length > 0) {
    log(`\n⚠️  WARNINGS (${results.warnings.length}):`, 'yellow');
    results.warnings.forEach(warning => {
      log(`   - ${warning}`, 'yellow');
    });
  }
  
  const successRate = (results.passed.length / (results.passed.length + results.failed.length)) * 100;
  
  log('\n' + '═'.repeat(50), 'magenta');
  if (successRate === 100) {
    log('🎉 All tests passed! LM Studio integration is working correctly.', 'green');
  } else if (successRate >= 75) {
    log(`✅ ${successRate.toFixed(1)}% tests passed. Most features are working.`, 'yellow');
  } else {
    log(`❌ Only ${successRate.toFixed(1)}% tests passed. Please check your configuration.`, 'red');
  }
  
  // Configuration recommendations
  log('\n💡 Configuration Checklist:', 'cyan');
  console.log('  1. LM Studio server is running on 192.168.86.44:1234');
  console.log('  2. Cloudflare tunnel is configured for lmstudio.uterpi.com');
  console.log('  3. CORS is enabled in LM Studio settings');
  console.log('  4. "Serve on Local Network" is enabled');
  console.log('  5. Model "nomadai-lcdu-v8" is loaded');
  console.log('  6. Environment variables are set in Replit/production');
  
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

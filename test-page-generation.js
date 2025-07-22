// Test script to verify page generation fixes
const fetch = require('node-fetch');

async function testPageGeneration() {
  try {
    console.log('🧪 Testing page generation API...');
    
    const response = await fetch('http://localhost:3000/api/create-page/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // You might need to adjust this
      },
      body: JSON.stringify({
        template: 'landing',
        requirements: 'A simple landing page with header, hero section, and footer',
        style: 'modern'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Page generation successful!');
      console.log('Generated files:', result.files?.length || 0);
      
      // Check if any generated code contains object rendering issues
      const appFile = result.files?.find(f => f.name === 'App.tsx');
      if (appFile) {
        const hasObjectRendering = appFile.content.includes('{routes}') || 
                                  appFile.content.includes('{route}') ||
                                  appFile.content.match(/\{[^}]*\.[^}]*\}/g)?.some(match => 
                                    !match.includes('.') || match.includes('{component}') || match.includes('{purpose}')
                                  );
        
        if (hasObjectRendering) {
          console.log('⚠️  Warning: Generated code might still have object rendering issues');
        } else {
          console.log('✅ Generated code looks safe from object rendering issues');
        }
      }
      
      return true;
    } else {
      console.log('❌ Page generation failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error details:', errorText);
      return false;
    }
  } catch (error) {
    console.log('❌ Test failed with error:', error.message);
    return false;
  }
}

// Run the test
testPageGeneration().then(success => {
  console.log(success ? '🎉 Test completed successfully!' : '💥 Test failed!');
  process.exit(success ? 0 : 1);
}); 
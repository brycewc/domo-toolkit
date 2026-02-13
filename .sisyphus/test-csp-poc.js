const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testCSPPOC() {
  const extensionPath = path.resolve(__dirname, '../dist');
  
  console.log('Starting CSP POC test...');
  console.log('Extension path:', extensionPath);
  
  // Launch Chrome with extension
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--load-extension=${extensionPath}`,
      '--disable-extensions-except=' + extensionPath
    ]
  });

  try {
    // Create a new page
    const page = await context.newPage();
    
    // Navigate to Domo page
    console.log('Navigating to Domo page...');
    await page.goto('https://demo.domo.com/page/123', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    }).catch(err => {
      console.log('Navigation warning (may be expected):', err.message);
    });
    
    // Wait for POC to inject
    await page.waitForTimeout(2000);
    
    // Get console messages
    const consoleMessages = [];
    page.on('console', msg => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text()
      });
      console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
    });
    
    // Check for CSP errors
    const cspErrors = consoleMessages.filter(msg => 
      msg.text.includes('Content Security Policy') || 
      msg.text.includes('Refused to load')
    );
    
    // Check for POC messages
    const pocMessages = consoleMessages.filter(msg => 
      msg.text.includes('[CSP-POC]')
    );
    
    console.log('\n=== TEST RESULTS ===');
    console.log('POC Messages:', pocMessages.length);
    console.log('CSP Errors:', cspErrors.length);
    
    if (cspErrors.length > 0) {
      console.log('\n❌ FAIL - CSP violations detected:');
      cspErrors.forEach(err => console.log('  -', err.text));
    } else if (pocMessages.length > 0) {
      console.log('\n✅ PASS - No CSP violations detected');
      console.log('POC messages:');
      pocMessages.forEach(msg => console.log('  -', msg.text));
    } else {
      console.log('\n⚠️  WARNING - No POC messages found');
    }
    
    // Take screenshot
    const screenshotPath = path.resolve(__dirname, 'evidence/task-0-csp-poc.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('\nScreenshot saved to:', screenshotPath);
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await context.close();
  }
}

testCSPPOC().catch(console.error);

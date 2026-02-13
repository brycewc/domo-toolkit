# CSP Proof-of-Concept Testing Guide

## Objective
Verify that React Flow (@xyflow/react) can be injected into Domo pages without triggering Content Security Policy (CSP) violations.

## Build Status
✅ **BUILD SUCCESSFUL** - Extension built without errors

### Build Output
- Vite build completed in 5.51s
- All modules transformed (7984 modules)
- POC script compiled: `assets/csp-poc.jsx-Dn-OnvtP.js` (1.92 kB gzipped)
- Manifest includes POC content script: `assets/csp-poc.jsx-loader-DPMuZgqL.js`

## POC Implementation Details

### File: `src/csp-poc.jsx`
- **Purpose**: Minimal React Flow injection test
- **Strategy**: 
  1. Create a React root in the page DOM
  2. Render a simple UI component
  3. Attempt dynamic import of @xyflow/react
  4. Log CSP errors or success to console

### Key Features
- Uses bundled React (no external CDN)
- Dynamic import with string-based path to avoid build-time resolution
- Comprehensive console logging for debugging
- Fixed position UI overlay for visibility

### Manifest Configuration
```json
{
  "js": ["src/csp-poc.jsx"],
  "matches": ["https://*.domo.com/*"],
  "run_at": "document_start",
  "all_frames": true
}
```

## Manual Testing Steps

### 1. Load Extension in Chrome
```
1. Open Chrome
2. Navigate to chrome://extensions/
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select: D:/VS Code/domo-chrome-extension/majordomo-toolkit/dist/
6. Extension should appear in the list
```

### 2. Navigate to Domo Page
```
1. Open any Domo instance (e.g., https://demo.domo.com/page/123)
2. Wait for page to fully load
3. Look for gray box in top-right corner (POC UI)
```

### 3. Check Console for CSP Errors
```
1. Press F12 to open DevTools
2. Go to Console tab
3. Look for messages starting with [CSP-POC]
4. Check for "Content Security Policy" or "Refused to load" errors
```

### 4. Expected Console Output (PASS)
```
[CSP-POC] Initializing React Flow POC...
[CSP-POC] Container created in DOM
[CSP-POC] React component rendered successfully
[CSP-POC] Attempting to import @xyflow/react...
[CSP-POC] ✓ React Flow imported successfully! {...}
[CSP-POC] RESULT: PASS - React Flow can be injected without CSP violations
```

### 5. Expected Console Output (FAIL)
```
[CSP-POC] Initializing React Flow POC...
[CSP-POC] Container created in DOM
[CSP-POC] React component rendered successfully
[CSP-POC] Attempting to import @xyflow/react...
[CSP-POC] ✗ Failed to import React Flow: Error: ...
[CSP-POC] RESULT: FAIL - React Flow import blocked
[CSP-POC] Error details: {
  message: "Failed to fetch dynamically imported module: ...",
  stack: "..."
}
```

## CSP Analysis

### Content Security Policy Context
Domo pages may have strict CSP headers that:
- Block inline scripts
- Block external resources
- Restrict module imports
- Limit dynamic code execution

### Chrome Extension Isolation
- Content scripts run in an **isolated world** by default
- They have access to the page's DOM but not its JavaScript context
- This isolation can help bypass some CSP restrictions

### React Flow Requirements
- Requires DOM access (✓ content scripts have this)
- Requires dynamic module loading (? depends on CSP)
- May require inline styles (✓ content scripts can inject these)
- May require event listeners (✓ content scripts can add these)

## Success Criteria

### PASS Conditions
- ✓ React root created in DOM
- ✓ POC component renders without errors
- ✓ No CSP violation messages in console
- ✓ React Flow module imports successfully
- ✓ No "Refused to load" errors

### FAIL Conditions
- ✗ CSP blocks module import
- ✗ "Content Security Policy" error in console
- ✗ "Refused to load" error for @xyflow/react
- ✗ React component fails to render

## Troubleshooting

### Extension Not Loading
- Check that dist/ folder exists
- Verify manifest.json is valid
- Check Chrome console for extension errors

### POC UI Not Visible
- Check that page is a Domo instance (https://*.domo.com/*)
- Wait 2-3 seconds for script to inject
- Check DevTools Console for [CSP-POC] messages

### CSP Errors
- Document the exact error message
- Check Domo's CSP headers: DevTools → Network → Response Headers
- Research potential workarounds (manifest permissions, inline scripts)

## Next Steps

### If PASS
1. ✓ Proceed with full React Flow implementation
2. ✓ Install @xyflow/react: `npm install @xyflow/react`
3. ✓ Create tracer component with full graph visualization
4. ✓ Integrate with existing extension UI

### If FAIL
1. ✗ Document CSP error verbatim
2. ✗ Research Chrome Extension CSP docs
3. ✗ Explore alternatives:
   - Modify manifest permissions
   - Use inline scripts instead of dynamic imports
   - Implement tracer in popup/sidepanel instead of content script
   - Use iframe with different CSP context

## References

- [React Flow CSP Documentation](https://reactflow.dev/learn/troubleshooting#content-security-policy)
- [Chrome Extension CSP Guide](https://developer.chrome.com/docs/extensions/mv3/intro/mv3-migration/#content-security-policy)
- [Content Security Policy MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)

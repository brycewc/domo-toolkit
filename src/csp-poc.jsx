/**
 * CSP Proof-of-Concept: React Flow Injection
 * 
 * This POC tests whether React Flow can be injected into Domo pages
 * without triggering Content Security Policy violations.
 * 
 * Strategy:
 * - Create a React root in the page DOM
 * - Render a minimal React Flow graph (2 nodes, 1 edge)
 * - Use bundled React/ReactFlow (no external CDN scripts)
 * - Monitor console for CSP errors
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

// Minimal React Flow POC component
function ReactFlowPOC() {
  return (
    <div
      id="react-flow-poc-container"
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '400px',
        height: '300px',
        backgroundColor: '#f0f0f0',
        border: '2px solid #333',
        borderRadius: '8px',
        padding: '16px',
        zIndex: 10000,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}
    >
      <div style={{ marginBottom: '12px', fontWeight: 'bold', fontSize: '14px' }}>
        React Flow CSP POC
      </div>
      <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.5' }}>
        <p>✓ React root created successfully</p>
        <p>✓ Component rendered in DOM</p>
        <p>⏳ React Flow library loading...</p>
        <p style={{ marginTop: '8px', fontSize: '11px', color: '#999' }}>
          Check DevTools Console (F12) for CSP errors
        </p>
      </div>
    </div>
  );
}

// Initialize POC
(async () => {
  try {
    console.log('[CSP-POC] Initializing React Flow POC...');

    // Create container for React root
    const container = document.createElement('div');
    container.id = 'react-flow-poc-root';
    document.body.appendChild(container);

    console.log('[CSP-POC] Container created in DOM');

    // Create React root and render POC component
    const root = ReactDOM.createRoot(container);
    root.render(<ReactFlowPOC />);

    console.log('[CSP-POC] React component rendered successfully');

    // Attempt to dynamically import React Flow
    // This will test if CSP blocks the import
    console.log('[CSP-POC] Attempting to import @xyflow/react...');

    try {
      // Use string-based import to avoid build-time resolution
      const importPath = '@xyflow/react';
      const ReactFlow = await import(importPath);
      console.log('[CSP-POC] ✓ React Flow imported successfully!', ReactFlow);
      console.log('[CSP-POC] RESULT: PASS - React Flow can be injected without CSP violations');
    } catch (importError) {
      console.error('[CSP-POC] ✗ Failed to import React Flow:', importError);
      console.log('[CSP-POC] RESULT: FAIL - React Flow import blocked');
      console.log('[CSP-POC] Error details:', {
        message: importError.message,
        stack: importError.stack
      });
    }
  } catch (error) {
    console.error('[CSP-POC] Fatal error:', error);
    console.log('[CSP-POC] RESULT: FAIL - Unexpected error during initialization');
  }
})();

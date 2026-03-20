// ============================================
// Main Entry Point
// ============================================
// Bootstraps the React application

import { createRoot } from 'react-dom/client';
import { html } from 'htm/react';
import { App } from './components/App.js';

// ============================================
// Initialize App
// ============================================

const container = document.getElementById('root');
const root = createRoot(container);

root.render(html`<${App} />`);

console.log('Lineage Explorer initialized');

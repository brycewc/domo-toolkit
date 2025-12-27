import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './views/App.jsx';
import styleText from './views/App.css?inline';

// console.log('[CRXJS] Hello world from content script!')

// Create a container for the shadow DOM
const shadowHost = document.createElement('div');
shadowHost.id = 'crxjs-shadow-host';
document.body.appendChild(shadowHost);

// Create shadow DOM
const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

// Create style element and inject CSS
const style = document.createElement('style');
style.textContent = styleText;
shadowRoot.appendChild(style);

// Create the React app container inside shadow DOM
const container = document.createElement('div');
container.id = 'crxjs-app';
shadowRoot.appendChild(container);

// Render React app inside shadow DOM
createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>
);

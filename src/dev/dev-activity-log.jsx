// Chrome API polyfill — must be imported before any extension code
import './chromePolyfill';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/assets/global.css';
import { ActivityLogTable } from '@/activityLog/ActivityLogTable';
import { useTheme } from '@/hooks/useTheme';

function DevApp() {
  useTheme();
  return (
    <div className='flex h-screen w-full justify-center'>
      <div className='flex h-full w-full flex-col'>
        <ActivityLogTable />
      </div>
    </div>
  );
}

// After any edit in this file's import chain, plugin-react's refresh footer
// self-imports it under a `?t=` URL and evaluates it a second time. Reusing the
// root stops that from leaving a duplicate tree mounted and running effects.
const container = document.getElementById('root');
container.__devRoot ??= createRoot(container);
container.__devRoot.render(
  <StrictMode>
    <DevApp />
  </StrictMode>
);

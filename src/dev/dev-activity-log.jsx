// Chrome API polyfill — must be imported before any extension code
import './chromePolyfill';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/assets/global.css';
import { ActivityLogTable } from '@/activityLog/ActivityLogTable';
import { useTheme } from '@/hooks';

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DevApp />
  </StrictMode>
);

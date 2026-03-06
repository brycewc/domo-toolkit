import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

import manifest from './manifest.config.js';

export default defineConfig({
  build: {
    // Extensions load from disk, not network - large chunks are fine
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Group related modules into the same chunk to avoid cross-chunk circular dependencies
        manualChunks: (id) => {
          if (id.includes('/src/components/options/')) {
            return 'options-components';
          }
          if (id.includes('/src/components/')) {
            return 'components';
          }
          if (id.includes('/src/hooks/')) {
            return 'hooks';
          }
          if (id.includes('/src/models/')) {
            return 'models';
          }
          if (id.includes('/src/services/')) {
            return 'services';
          }
          if (id.includes('/src/utils/')) {
            return 'utils';
          }
        }
      }
    },
    sourcemap: false
  },
  esbuild: {
    pure: ['console.log', 'console.warn']
  },
  plugins: [react(), crx({ manifest }), tailwindcss()],
  resolve: {
    alias: {
      '@': `${path.resolve(__dirname, 'src')}`
    }
  },
  server: {
    cors: {
      origin: [/chrome-extension:\/\//]
    },
    hmr: {
      host: 'localhost',
      port: 5173,
      protocol: 'ws'
    },
    port: 5173
  }
});

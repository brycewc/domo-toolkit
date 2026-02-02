import { defineConfig } from 'vite';
import manifest from './manifest.config.js';
import { name, version } from './package.json';
import path from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import zip from 'vite-plugin-zip-pack';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': `${path.resolve(__dirname, 'src')}`
    }
  },
  plugins: [
    react(),
    crx({ manifest }),
    tailwindcss(),
    zip({ outDir: 'release', outFileName: `crx-${name}-${version}.zip` })
  ],
  build: {
    // Extensions load from disk, not network - large chunks are fine
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Group related modules into the same chunk to avoid cross-chunk circular dependencies
        manualChunks: (id) => {
          // All components in one chunk (options components share StatusBar with others)
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
    }
  },
  server: {
    port: 5173,
    cors: {
      origin: [/chrome-extension:\/\//]
    },
    hmr: {
      host: 'localhost',
      protocol: 'ws',
      port: 5173
    }
  }
});

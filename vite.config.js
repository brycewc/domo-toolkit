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
  server: {
    port: 3000,
    cors: {
      origin: [/chrome-extension:\/\//]
    },
    hmr: {
      host: 'localhost',
      protocol: 'ws',
      port: 3000
    }
  }
});

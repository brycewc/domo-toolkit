import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, loadEnv } from 'vite';

import manifest from './manifest.config.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  // Proxy /api/* to the real Domo instance when env vars are configured.
  // Only active for standalone dev pages (dev-lineage, dev-activity-log); the extension's own dev mode is unaffected because it uses chrome-extension:// origins.
  const proxy = env.VITE_DOMO_BASE_URL
    ? {
        '/api': {
          changeOrigin: true,
          headers: {
            'X-Domo-Developer-Token': env.VITE_DOMO_TOKEN
          },
          target: env.VITE_DOMO_BASE_URL
        }
      }
    : undefined;

  return {
    build: {
      // Extensions load from disk, not network - large chunks are fine
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          // Group related modules into the same chunk to avoid cross-chunk circular dependencies
          manualChunks: (id) => {
            if (
              id.includes('/src/lineage/') ||
              id.includes('@xyflow/react') ||
              id.includes('@dagrejs/dagre')
            ) {
              return 'lineage';
            }
            if (id.includes('/src/activityLog/')) {
              return 'activity-log';
            }
            if (id.includes('/src/components/options/')) {
              return 'options-components';
            }
            // Note: /src/components/views/ intentionally falls through to
            // the 'components' chunk. Splitting views out produces a
            // circular chunk dependency because src/components/index.js
            // does `export * from './views'`, so the components chunk
            // imports from the views chunk and vice versa — which can
            // leave React undefined during initialization.
            if (
              id.includes('/src/components/') ||
              id.includes('/src/hooks/')
            ) {
              return 'components';
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
      pure: mode === 'production' ? ['console.log', 'console.warn'] : []
    },
    plugins: [
      // Serve the standalone lineage dev page via middleware so CRXJS
      // doesn't intercept and strip its script tags.
      {
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url !== '/dev-lineage') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end([
              '<!doctype html>',
              '<html lang="en"><head>',
              '<meta charset="UTF-8" />',
              '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
              '<title>Dev Lineage - Domo Toolkit</title>',
              '</head>',
              '<body class="w-full appearance-none bg-background">',
              '<div id="root"></div>',
              '<script type="module" src="/@vite/client"><\/script>',
              '<script type="module">',
              'import RefreshRuntime from "/@react-refresh";',
              'RefreshRuntime.injectIntoGlobalHook(window);',
              'window.$RefreshReg$ = () => {};',
              'window.$RefreshSig$ = () => (type) => type;',
              'window.__vite_plugin_react_preamble_installed__ = true;',
              '<\/script>',
              '<script type="module" src="/src/dev/dev-lineage.jsx"><\/script>',
              '</body></html>'
            ].join('\n'));
          });
        },
        name: 'dev-lineage-page'
      },
      {
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url !== '/dev-activity-log') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end([
              '<!doctype html>',
              '<html lang="en"><head>',
              '<meta charset="UTF-8" />',
              '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
              '<title>Dev Activity Log - Domo Toolkit</title>',
              '</head>',
              '<body class="w-full appearance-none bg-background">',
              '<div id="root"></div>',
              '<script type="module" src="/@vite/client"><\/script>',
              '<script type="module">',
              'import RefreshRuntime from "/@react-refresh";',
              'RefreshRuntime.injectIntoGlobalHook(window);',
              'window.$RefreshReg$ = () => {};',
              'window.$RefreshSig$ = () => (type) => type;',
              'window.__vite_plugin_react_preamble_installed__ = true;',
              '<\/script>',
              '<script type="module" src="/src/dev/dev-activity-log.jsx"><\/script>',
              '</body></html>'
            ].join('\n'));
          });
        },
        name: 'dev-activity-log-page'
      },
      react(),
      crx({ manifest }),
      tailwindcss(),
      visualizer({ filename: '.visuals/bundle-analysis.html', gzipSize: true })
    ],
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
      port: 5173,
      proxy
    }
  };
});

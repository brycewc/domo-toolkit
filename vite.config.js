import { crx } from '@crxjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, loadEnv } from 'vite';
import svgr from 'vite-plugin-svgr';

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
        treeshake: {
          manualPureFunctions: mode === 'production' ? ['console.log', 'console.warn'] : []
        },
        output: {
          // Group related modules into the same chunk to avoid cross-chunk circular dependencies
          manualChunks: (id) => {
            if (id.includes('/src/lineage/') || id.includes('@xyflow/react') || id.includes('@dagrejs/dagre')) {
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
            if (id.includes('/src/components/') || id.includes('/src/hooks/')) {
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
    // Pre-bundle the lineage graph deps at server startup. They're only
    // reached by lazily-loaded extension surfaces (the side panel), so Vite
    // would otherwise discover them mid-session and re-optimize, which bumps
    // the dep browserHash and asks the page to reload. A chrome-extension://
    // surface frequently ignores that reload request and stays stranded on the
    // now-outdated dep chunk, whose export map predates the request, surfacing
    // as "does not provide an export named 'Position'". Pre-bundling avoids the
    // mid-session re-optimize entirely.
    //
    // react18-json-view is here for the same reason, by a different route. It
    // is linked with portal: into vendor/, and Vite skips pre-bundling linked
    // packages by default on the assumption you are editing them. This one is a
    // committed build artifact nobody edits in place, and at ~110KB in a single
    // module it is exactly the kind of dep that strands a surface when it gets
    // discovered mid-session, which is why a popup opens once and fails on
    // reopen. Naming it here forces the pre-bundle that a plain node_modules
    // package would get for free.
    //
    // domo-codeengine-manifest is an ordinary node_modules package again now
    // that it resolves from a git tag instead of a portal: link, so Vite would
    // pre-bundle it unprompted. It stays listed so its own acorn and
    // comment-parser imports land in the startup pre-bundle rather than being
    // discovered the first time the side panel opens the JSDoc view.
    //
    // @internationalized/date is a third route to the same stranding. It is a
    // transitive dep (HeroUI's date components pull it in) that our own code
    // imports directly, and the only importer is ActivityLogTable, which the
    // options page loads with lazy(). So the startup scan never reaches it and
    // it is always discovered the first time Activity Log opens, surfacing as
    // "does not provide an export named 'getLocalTimeZone'".
    optimizeDeps: {
      include: [
        '@dagrejs/dagre',
        '@internationalized/date',
        '@xyflow/react',
        'domo-codeengine-manifest',
        'react18-json-view'
      ]
    },
    plugins: [
      // Serve the standalone lineage dev page via middleware so CRXJS
      // doesn't intercept and strip its script tags.
      {
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url !== '/dev-lineage') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end(
              [
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
              ].join('\n')
            );
          });
        },
        name: 'dev-lineage-page'
      },
      {
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url !== '/dev-activity-log') return next();
            res.setHeader('Content-Type', 'text/html');
            res.end(
              [
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
              ].join('\n')
            );
          });
        },
        name: 'dev-activity-log-page'
      },
      svgr({ svgrOptions: { icon: true, titleProp: true } }),
      react(),
      crx({ manifest }),
      tailwindcss(),
      visualizer({ filename: '.visuals/bundle-analysis.html', gzipSize: true })
    ],
    resolve: {
      alias: [
        // Replace react-stately's tooltip state hook with a patched copy that
        // makes the hover "warm-up" per-tooltip instead of page-wide, so every
        // tooltip waits its own delay rather than insta-showing when the cursor
        // sweeps between nearby triggers. See src/vendor/useTooltipTriggerState.js.
        // Exact-match regex so only this subpath is intercepted; the patch
        // imports from the 'react-stately' package root, which must stay resolvable.
        {
          find: /^react-stately\/useTooltipTriggerState$/,
          replacement: path.resolve(__dirname, 'src/vendor/useTooltipTriggerState.js')
        },
        { find: '@', replacement: path.resolve(__dirname, 'src') },
        { find: '@icons', replacement: path.resolve(__dirname, 'src/assets/icons') }
      ],
      // react18-json-view is linked with portal:, so Vite resolves it through a
      // symlink into vendor/react18-json-view. That vendored ES build leaves
      // react, react/jsx-runtime, and react-dom external, so those bare imports
      // resolve from here rather than from the fork. Pinning both to a single
      // copy keeps a second React from slipping in and turning into an
      // "invalid hook call" at runtime.
      dedupe: ['react', 'react-dom']
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
      proxy,
      watch: {
        // Only src/ and public/ feed the extension bundle. Everything else here
        // (docs, tooling, editor config, generated build output) isn't in the
        // module graph, so a change there can't hot-swap and Vite falls back to
        // a full page reload. Ignore those so they don't interrupt dev sessions.
        // Merged with Vite's defaults (.git, node_modules, cache dir).
        ignored: [
          '**/*.md', // CLAUDE.md, READMEs, rule docs (never imported into the bundle)
          '**/.agents/**', // vendored skill definitions
          '**/.claude/**', // Claude rules, skills, commands, settings
          '**/.cursor/**', // Cursor rules
          '**/.github/**', // CI workflows
          '**/.visuals/**', // generated bundle analysis
          '**/.vscode/**', // editor settings
          '**/dist/**', // build output
          '**/docs/**', // release notes, TODO, Jekyll site
          '**/release/**', // packaged Chrome/Edge zips
          '**/scripts/**', // Node release/build scripts (not browser code)
          '**/store-listing/**' // Chrome Web Store assets
        ]
      }
    }
  };
});

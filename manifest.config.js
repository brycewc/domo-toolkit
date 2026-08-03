import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';
import { EXCLUDED_HOSTNAMES, LOCAL_MATCH_PATTERN } from './src/utils/constants.js';

// Excluded Domo hosts (support, developer, marketing, embed, etc.) as content-script
// exclude_matches patterns, so the content script never injects there at all. Derived
// from the shared EXCLUDED_HOSTNAMES list so this stays in sync with the rest of the
// extension's exclusion logic.
const EXCLUDED_MATCHES = EXCLUDED_HOSTNAMES.map((hostname) => `*://${hostname}/*`);

export default defineManifest({
  manifest_version: 3,
  name: 'Domo Toolkit',
  version: pkg.version,
  description: pkg.description,
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1MNZyAkJW2/F7JTETTSpzS/RJFe92laTr0smLRyHFKNlFEK3TEi2NbrCuPzag7ll7yXbFK9I3P6xOIHX/Qwt2jg17Yg4QyEQDZjhxQpvPoNHQzkVKCU1iYufcZritggsTpgqzkAivmva+AJDZzRnNMVHVTzssSeyniEMkjXpDjKqiDN1GuXc9hIDHHHPgaJVphMzZlWYQDUn39Z3UNBY37bKDvZOmbpsP7JBZx3rMNVDS7GKOVEoVNYTp2NpsRki8/YM8WE1UfC+FK/3YRTqzm0sQmGoYh5Vlve2xr/GpBwYdTMB1IsgOs3xQs8MTXDcE9bCdOMHvz07IHo+i4i6PwIDAQAB',
  homepage_url: pkg.homepage,
  version: pkg.version,
  version_name: pkg.version,
  minimum_chrome_version: '88',
  icons: {
    16: 'public/toolkit-16.png',
    24: 'public/toolkit-24.png',
    32: 'public/toolkit-32.png',
    48: 'public/toolkit-48.png',
    128: 'public/toolkit-128.png',
    512: 'public/toolkit-512.png'
  },
  permissions: [
    'sidePanel',
    'storage',
    'scripting',
    'activeTab',
    'clipboardRead',
    'clipboardWrite',
    'cookies',
    'webNavigation',
    'webRequest'
  ],
  host_permissions: ['*://*.domo.com/*'],
  // Locally run Domo instances (Domo's own web developers) are off by default so
  // regular users never see a broader install warning. The options page requests
  // this from a user gesture and registers the content script dynamically, since
  // a static content_scripts entry would reintroduce the warning.
  optional_host_permissions: [LOCAL_MATCH_PATTERN],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
  },
  action: {
    default_icon: {
      16: 'public/toolkit-16.png',
      24: 'public/toolkit-24.png',
      32: 'public/toolkit-32.png',
      48: 'public/toolkit-48.png',
      128: 'public/toolkit-128.png',
      512: 'public/toolkit-512.png'
    },
    default_popup: 'src/popup/index.html',
    default_title: 'Domo Toolkit'
  },
  background: {
    service_worker: 'src/background.js',
    type: 'module'
  },
  content_scripts: [
    {
      js: ['src/contentScript.js'],
      // `*://` rather than `https://` so a local instance reached as
      // <customer>.localhost.domo.com over http is covered. host_permissions
      // already grants both schemes, so this adds no install warning.
      matches: ['*://*.domo.com/*'],
      exclude_matches: EXCLUDED_MATCHES,
      run_at: 'document_idle',
      all_frames: false
    },
    {
      // Runs in all frames so it also covers Domo App iframes (*.domoapps.*.domo.com),
      // where the app's own failed requests originate.
      js: ['src/apiErrorCapture.js'],
      matches: ['https://*.domo.com/*'],
      exclude_matches: EXCLUDED_MATCHES,
      run_at: 'document_idle',
      all_frames: true
    }
  ],
  side_panel: {
    default_path: 'src/sidepanel/index.html'
  },
  options_page: 'src/options/index.html',
  commands: {
    copy_id: {
      suggested_key: {
        default: 'Ctrl+Shift+1',
        mac: 'Command+Shift+1'
      },
      description: 'Copy current Domo object ID to clipboard'
    }
  },
  web_accessible_resources: [
    {
      resources: ['public/apiErrors.js', 'public/domo-logo-no-background.png', 'public/domo-logo.png'],
      // The content script injects apiErrors.js into the page via <script src>,
      // which requires the page's origin to be listed here. Declaring localhost
      // is safe: web_accessible_resources grants no host access on its own.
      matches: ['*://*.domo.com/*', LOCAL_MATCH_PATTERN]
    }
  ]
});

import { defineManifest } from '@crxjs/vite-plugin';

import pkg from './package.json';

export default defineManifest({
  action: {
    default_icon: {
      128: 'public/toolkit-128.png',
      16: 'public/toolkit-16.png',
      24: 'public/toolkit-24.png',
      32: 'public/toolkit-32.png',
      48: 'public/toolkit-48.png'
    },
    default_popup: 'src/popup/index.html',
    default_title: 'Domo Toolkit'
  },
  background: {
    service_worker: 'src/background.js',
    type: 'module'
  },
  commands: {
    copy_id: {
      description: 'Copy current Domo object ID to clipboard',
      suggested_key: {
        default: 'Ctrl+Shift+1',
        mac: 'Command+Shift+1'
      }
    }
  },
  content_scripts: [
    {
      all_frames: false,
      js: ['src/contentScript.js'],
      matches: ['https://*.domo.com/*'],
      run_at: 'document_idle'
    }
  ],
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
  },
  host_permissions: ['*://*.domo.com/*'],
  icons: {
    128: 'public/toolkit-128.png',
    16: 'public/toolkit-16.png',
    24: 'public/toolkit-24.png',
    32: 'public/toolkit-32.png',
    48: 'public/toolkit-48.png'
  },
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1MNZyAkJW2/F7JTETTSpzS/RJFe92laTr0smLRyHFKNlFEK3TEi2NbrCuPzag7ll7yXbFK9I3P6xOIHX/Qwt2jg17Yg4QyEQDZjhxQpvPoNHQzkVKCU1iYufcZritggsTpgqzkAivmva+AJDZzRnNMVHVTzssSeyniEMkjXpDjKqiDN1GuXc9hIDHHHPgaJVphMzZlWYQDUn39Z3UNBY37bKDvZOmbpsP7JBZx3rMNVDS7GKOVEoVNYTp2NpsRki8/YM8WE1UfC+FK/3YRTqzm0sQmGoYh5Vlve2xr/GpBwYdTMB1IsgOs3xQs8MTXDcE9bCdOMHvz07IHo+i4i6PwIDAQAB',
  manifest_version: 3,
  name: 'Domo Toolkit',
  options_page: 'src/options/index.html',
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
  side_panel: {
    default_path: 'src/sidepanel/index.html'
  },
  version: pkg.version,
  web_accessible_resources: [
    {
      matches: ['https://*.domo.com/*'],
      resources: [
        'public/toolkit-dark-16.png',
        'public/toolkit-dark-24.png',
        'public/toolkit-dark-32.png',
        'public/toolkit-dark-48.png',
        'public/toolkit-dark-128.png',
        'public/cardErrors.js'
      ]
    }
  ]
});

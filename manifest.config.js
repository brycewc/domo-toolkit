import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Domo Toolkit',
  version: pkg.version,
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1MNZyAkJW2/F7JTETTSpzS/RJFe92laTr0smLRyHFKNlFEK3TEi2NbrCuPzag7ll7yXbFK9I3P6xOIHX/Qwt2jg17Yg4QyEQDZjhxQpvPoNHQzkVKCU1iYufcZritggsTpgqzkAivmva+AJDZzRnNMVHVTzssSeyniEMkjXpDjKqiDN1GuXc9hIDHHHPgaJVphMzZlWYQDUn39Z3UNBY37bKDvZOmbpsP7JBZx3rMNVDS7GKOVEoVNYTp2NpsRki8/YM8WE1UfC+FK/3YRTqzm0sQmGoYh5Vlve2xr/GpBwYdTMB1IsgOs3xQs8MTXDcE9bCdOMHvz07IHo+i4i6PwIDAQAB',
  icons: {
    16: 'public/toolkit-16.png',
    24: 'public/toolkit-24.png',
    32: 'public/toolkit-32.png',
    48: 'public/toolkit-48.png',
    128: 'public/toolkit-128.png'
  },
  permissions: [
    'sidePanel',
    'contentSettings',
    'storage',
    'scripting',
    'activeTab',
    'clipboardRead',
    'clipboardWrite',
    'cookies',
    'webNavigation',
    'webRequest',
    'tabs'
  ],
  host_permissions: [
    '*://*.domo.com/*',
    '*://outlook.office.com/*',
    '*://outlook.office365.com/*',
    '*://outlook.live.com/*',
    '*://app.gong.io/*',
    '*://teams.microsoft.com/*',
    'http://localhost/*'
  ],
  action: {
    default_icon: {
      16: 'public/toolkit-16.png',
      24: 'public/toolkit-24.png',
      32: 'public/toolkit-32.png',
      48: 'public/toolkit-48.png',
      128: 'public/toolkit-128.png'
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
      js: ['src/csp-poc.jsx'],
      matches: ['https://*.domo.com/*'],
      run_at: 'document_start',
      all_frames: true
    },
    {
      js: ['src/contentScript.js'],
      matches: ['https://*.domo.com/*'],
      run_at: 'document_idle',
      all_frames: true
    },
    {
      js: ['src/contentScript-outlook.js'],
      matches: [
        'https://outlook.office.com/mail/*',
        'https://outlook.office365.com/mail/*',
        'https://outlook.live.com/mail/*'
      ],
      run_at: 'document_idle',
      all_frames: false
    },
    {
      js: ['src/contentScript-gong.js'],
      matches: ['https://app.gong.io/*'],
      run_at: 'document_idle',
      all_frames: false
    },
    {
      js: ['src/contentScript-teams.js'],
      matches: ['https://teams.microsoft.com/*'],
      run_at: 'document_idle',
      all_frames: false
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
      resources: [
        'public/toolkit-dark-16.png',
        'public/toolkit-dark-24.png',
        'public/toolkit-dark-32.png',
        'public/toolkit-dark-48.png',
        'public/toolkit-dark-128.png'
      ],
      matches: ['<all_urls>']
    }
  ]
});

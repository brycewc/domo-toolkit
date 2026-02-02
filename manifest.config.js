import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Domo Toolkit',
  version: pkg.version,
  icons: {
    48: 'public/toolkit.png'
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
    'webRequest'
  ],
  host_permissions: ['*://*.domo.com/*'],
  action: {
    default_icon: {
      48: 'public/toolkit.png'
    },
    default_popup: 'src/popup/index.html'
  },
  background: {
    service_worker: 'src/background.js',
    type: 'module'
  },
  content_scripts: [
    {
      js: ['src/contentScript.js'],
      matches: ['https://*.domo.com/*'],
      run_at: 'document_idle'
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
  }
});

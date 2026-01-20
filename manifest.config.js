import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: pkg.name,
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
    'webNavigation'
  ],
  host_permissions: ['https://*.domo.com/*'],
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
    check_clipboard: {
      suggested_key: {
        default: 'Ctrl+Shift+V',
        mac: 'Command+Shift+V'
      },
      description: 'Check clipboard for Domo object ID'
    }
  }
});

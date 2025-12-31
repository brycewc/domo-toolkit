import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
	manifest_version: 3,
	name: pkg.name,
	version: pkg.version,
	icons: {
		48: 'public/logo.png'
	},
	permissions: [
		'sidePanel',
		'contentSettings',
		'storage',
		'scripting',
		'activeTab',
		'clipboardRead',
		'cookies'
	],
	host_permissions: ['https://*.domo.com/*'],
	action: {
		default_icon: {
			48: 'public/logo.png'
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
	options_page: 'src/options/index.html'
});

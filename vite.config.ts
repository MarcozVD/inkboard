import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],

	// Tauri expects a fixed dev server port
	server: {
		port: 1420,
		strictPort: true
	},
	// Prebundle everything up front: a dep discovered mid-run triggers a full
	// page reload (CI: the first click is lost before hydration).
	optimizeDeps: {
		include: [
			'@tauri-apps/api/core',
			'@tauri-apps/api/event',
			'@tauri-apps/api/window',
			'@tauri-apps/plugin-dialog',
			'@tauri-apps/plugin-updater',
			'@tauri-apps/plugin-process',
			'perfect-freehand',
			'rbush',
			'uuid'
		]
	},
	envPrefix: ['VITE_', 'TAURI_ENV_*']
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
	// Inkboard dev server runs on port 1420 (Tauri requirement).
	// Playwright hits the Vite dev server directly.
	use: {
		baseURL: 'http://localhost:1420',
		viewport: { width: 1400, height: 900 },
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' }
		}
	],
	webServer: {
		command: 'npm run dev',
		port: 1420,
		reuseExistingServer: true,
		timeout: 120_000
	},
	testDir: './e2e',
	timeout: 60_000
});

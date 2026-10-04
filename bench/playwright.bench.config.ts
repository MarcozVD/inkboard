import { defineConfig } from '@playwright/test';

// M3 benchmark harness — separate from the E2E suite (bench/*.bench.ts).
// `pnpm bench` runs this config only; `pnpm exec playwright test` uses the
// root config (testDir ./e2e) and CI never picks these files up.
export default defineConfig({
	// config lives in bench/, so the suite dir is the config dir itself
	testDir: '.',
	testMatch: '**/*.bench.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 20 * 60_000,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:1420',
		viewport: { width: 1400, height: 900 },
		screenshot: 'off',
		trace: 'off',
		launchOptions: {
			args: [
				'--enable-precise-memory-info',
				'--js-flags=--expose-gc',
				// uncap the frame loop so frame time reflects real render cost
				'--disable-frame-rate-limit',
				'--disable-gpu-vsync'
			]
		}
	},
	webServer: {
		command: 'pnpm dev',
		cwd: '..',
		port: 1420,
		reuseExistingServer: true,
		timeout: 120_000
	}
});

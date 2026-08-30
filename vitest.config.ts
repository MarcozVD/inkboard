import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		// node by default (fast); add `// @vitest-environment jsdom` at the top
		// of a test file when it needs a DOM (components)
		environment: 'node'
	}
});

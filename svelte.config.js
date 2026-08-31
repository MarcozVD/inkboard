import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// fallback: single index.html served for any unprerendered route —
		// required for dynamic routes (/board/[id]) in a static Tauri build
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;
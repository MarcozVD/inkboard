// M3-01 baseline harness — synthetic boards measured with Playwright.
// Run with `pnpm bench`; results land in bench/results/<timestamp>.json.
import { test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { boardExtent, generateBoard } from './generator';
import type { BenchBridge, BenchMemory } from '../src/lib/board/benchBridge';
import type { RenderProfile } from '../src/lib/canvas/renderProfile';
import type { CanvasObject, CameraState } from '../src/lib/objects/types';

declare global {
	interface Window {
		__inkboard?: BenchBridge;
		__renderProfile?: RenderProfile;
		__pen?: { samples: number[]; pending: number | null; running: boolean };
		__longTasks?: { start: number; duration: number }[];
	}
}

// env overrides keep a quick smoke-run possible without editing the harness
const SIZES = (process.env.BENCH_SIZES ?? '2000,5000,10000').split(',').map(Number);
const FRAMES = Number(process.env.BENCH_FRAMES ?? 150);
const STORAGE_KEY = 'inkboard:boards';
const LOAD_OBJECTS = 1000;

interface Stats {
	samples: number;
	p50: number;
	p95: number;
	mean: number;
	min: number;
	max: number;
	fps: number;
}

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[index];
}

function stats(values: number[]): Stats {
	const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
	return {
		samples: values.length,
		p50: percentile(values, 50),
		p95: percentile(values, 95),
		mean,
		min: Math.min(...values),
		max: Math.max(...values),
		fps: mean > 0 ? 1000 / mean : 0
	};
}

const boards = new Map<number, CanvasObject[]>();
function boardFor(size: number): CanvasObject[] {
	let objects = boards.get(size);
	if (!objects) {
		objects = generateBoard(size);
		boards.set(size, objects);
	}
	return objects;
}

async function openEmptyBoard(page: Page): Promise<void> {
	await page.goto('/');
	await page.goto(`/board/${randomUUID()}`);
	await page.locator('canvas.board-canvas').waitFor({ state: 'visible' });
	await page.waitForFunction(() => typeof window.__inkboard !== 'undefined');
}

async function loadObjects(page: Page, objects: CanvasObject[]): Promise<void> {
	await page.evaluate((payload) => window.__inkboard?.load(payload), objects);
	await page.waitForFunction((count) => window.__inkboard?.objectCount() === count, objects.length);
}

async function fitCamera(page: Page, size: number): Promise<void> {
	const box = await page.locator('canvas.board-canvas').boundingBox();
	if (!box) throw new Error('canvas not visible');
	const extent = boardExtent(size);
	const zoom = Math.min(box.width / extent.width, box.height / extent.height) * 0.95;
	const camera = {
		x: (box.width - extent.width * zoom) / 2,
		y: (box.height - extent.height * zoom) / 2,
		zoom
	};
	await page.evaluate((next) => window.__inkboard?.setCamera(next), camera);
	await page.waitForTimeout(150);
}

/** rAF deltas while panning or zooming the camera (uncapped in bench config). */
async function measureFrames(page: Page, kind: 'pan' | 'zoom', frames: number): Promise<number[]> {
	return page.evaluate(
		({ kind, frames }) =>
			new Promise<number[]>((resolve) => {
				const api = window.__inkboard;
				if (!api) {
					resolve([]);
					return;
				}
				const start = api.camera();
				const deltas: number[] = [];
				let last = -1;
				let frame = 0;
				const step = (now: number) => {
					// use the rAF timestamp consistently (performance.now() can
					// share a different time base on some builds)
					if (last >= 0) deltas.push(now - last);
					last = now;
					frame++;
					if (kind === 'pan') {
						// oscillate over the content instead of drifting off-screen
						api.setCamera({
							x: start.x + Math.sin(frame / 18) * 400,
							y: start.y + Math.cos(frame / 24) * 250
						});
					} else {
						api.setCamera({ zoom: start.zoom * (1 + 0.25 * Math.sin(frame / 25)) });
					}
					if (frame >= frames) resolve(deltas);
					else requestAnimationFrame(step);
				};
				requestAnimationFrame(step);
			}),
		{ kind, frames }
	);
}

/** Pointer → next painted frame, sampled while drawing with the pen tool. */
async function measurePen(page: Page): Promise<number[]> {
	await page.getByTestId('tool-pen').click();
	const box = await page.locator('canvas.board-canvas').boundingBox();
	if (!box) throw new Error('canvas not visible');
	await page.evaluate(() => {
		window.__pen = { samples: [], pending: null, running: true };
		window.addEventListener(
			'pointermove',
			() => {
				if (window.__pen) window.__pen.pending = performance.now();
			},
			{ capture: true, passive: true }
		);
		const tick = () => {
			const state = window.__pen;
			if (state && state.pending !== null) {
				state.samples.push(performance.now() - state.pending);
				state.pending = null;
			}
			if (state?.running) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});

	const y = box.y + box.height / 2;
	await page.mouse.move(box.x + 80, y);
	await page.mouse.down();
	for (let i = 0; i < 24; i++) {
		await page.mouse.move(box.x + 80 + i * 42, y + Math.sin(i / 2) * 70);
		await page.waitForTimeout(35);
	}
	await page.mouse.up();
	return page.evaluate(() => {
		const state = window.__pen;
		if (state) state.running = false;
		return state?.samples ?? [];
	});
}

/** Marquee selection: pointerup → N objects selected. */
async function measureMarquee(page: Page, expected: number): Promise<number> {
	await page.getByTestId('tool-select').click();
	await page.keyboard.press('Escape');
	const box = await page.locator('canvas.board-canvas').boundingBox();
	if (!box) throw new Error('canvas not visible');
	await page.mouse.move(box.x + 4, box.y + 4);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4, { steps: 6 });
	// let the drag frames drain so the timer measures the release path only
	await page.evaluate(
		() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
	);
	await page.waitForTimeout(50);
	const start = performance.now();
	await page.mouse.up();
	await page.waitForFunction((count) => (window.__inkboard?.selectionCount() ?? 0) >= count, expected, {
		timeout: 60_000
	});
	return performance.now() - start;
}

/** Long tasks on the main thread during one autosave of the 5k board. */
async function measureAutosave(page: Page): Promise<{ count: number; totalMs: number; maxMs: number }> {
	const triggeredAt = await page.evaluate(() => {
		window.__longTasks = [];
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				window.__longTasks?.push({ start: entry.startTime, duration: entry.duration });
			}
		});
		observer.observe({ type: 'longtask', buffered: false });
		const now = performance.now();
		window.__inkboard?.scheduleAutosave();
		return now;
	});
	await page.waitForTimeout(6000);
	return page.evaluate((start) => {
		const tasks = (window.__longTasks ?? []).filter((task) => task.start >= start);
		return {
			count: tasks.length,
			totalMs: tasks.reduce((sum, task) => sum + task.duration, 0),
			maxMs: tasks.reduce((max, task) => Math.max(max, task.duration), 0)
		};
	}, triggeredAt);
}

async function seedLocalBoard(page: Page, id: string, objects: CanvasObject[]): Promise<void> {
	const camera: CameraState = { x: 0, y: 0, zoom: 1, minZoom: 0.05, maxZoom: 32 };
	const file = JSON.stringify({
		schemaVersion: '1.1.0',
		version: 1,
		board: {
			id,
			workspaceId: 'default',
			name: `bench-load-${LOAD_OBJECTS}`,
			version: 1,
			schemaVersion: '1.1.0',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			camera,
			objects,
			background: { type: 'solid', color: '#0f1013' },
			grid: { enabled: true, size: 32, color: 'grid', opacity: 0.6 },
			metadata: {}
		}
	});
	await page.evaluate(
		([key, boardId, json]) => {
			const all = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>;
			all[boardId] = json;
			localStorage.setItem(key, JSON.stringify(all));
		},
		[STORAGE_KEY, id, file] as const
	);
}

test('M3-01 baseline — synthetic 2k/5k/10k boards', async ({ page, browser }) => {
	test.slow();
	const results: Record<string, unknown> = {};

	// ── metadata ──
	const cpus = os.cpus();
	const userAgent = await page.evaluate(() => navigator.userAgent);
	const dpr = await page.evaluate(() => window.devicePixelRatio);
	results.machine = {
		platform: os.platform(),
		release: os.release(),
		arch: os.arch(),
		cpu: cpus[0]?.model ?? 'unknown',
		cores: cpus.length,
		totalMemBytes: os.totalmem(),
		node: process.versions.node
	};
	results.browser = { name: browser.browserType().name(), version: browser.version(), userAgent, dpr };
	results.date = new Date().toISOString();
	results.targets = {
		'RNF-01 pan/zoom 2k FPS': 60,
		'RNF-02 pen latency (ms)': 16,
		'RNF-03/§19 load 1k (ms)': 1000,
		'RNF-04 memory 5k heap (bytes)': 300 * 1024 * 1024,
		'RNF-05/§19 autosave long task (ms)': 50,
		'§19 marquee select 5k (ms)': 50
	};

	// ── pan / zoom / pen / marquee / autosave per size ──
	const pan: Record<string, Stats> = {};
	const zoom: Record<string, Stats> = {};
	for (const size of SIZES) {
		await openEmptyBoard(page);
		await loadObjects(page, boardFor(size));
		await fitCamera(page, size);
		await measureFrames(page, 'pan', 30); // warmup (JIT)

		await fitCamera(page, size);
		pan[`${size}`] = stats(await measureFrames(page, 'pan', FRAMES));
		await fitCamera(page, size);
		zoom[`${size}`] = stats(await measureFrames(page, 'zoom', FRAMES));
		console.log(`[bench] ${size} pan fps=${pan[`${size}`].fps.toFixed(1)} zoom fps=${zoom[`${size}`].fps.toFixed(1)}`);

		if (size === 2000) {
			await fitCamera(page, size);
			const profile = await page.evaluate(async () => {
				const prof = window.__renderProfile;
				const api = window.__inkboard;
				if (!prof || !api) return null;
				prof.enabled = true;
				prof.reset();
				await new Promise<void>((resolve) => {
					const start = api.camera();
					let frame = 0;
					const step = () => {
						frame++;
						api.setCamera({
							x: start.x + Math.sin(frame / 18) * 400,
							y: start.y + Math.cos(frame / 24) * 250
						});
						if (frame >= 120) resolve();
						else requestAnimationFrame(step);
					};
					requestAnimationFrame(step);
				});
				prof.enabled = false;
				return { top: prof.top(15), counters: { ...prof.counters } };
			});
			if (profile) {
				results.profile2kPan = profile;
				console.log('[bench] profile 2k pan (per frame, ms):');
				for (const row of profile.top.slice(0, 8)) {
					console.log(
						`  ${row.phase.padEnd(16)} perFrame=${row.perFrame.toFixed(2)} total=${row.total.toFixed(1)} max=${row.max.toFixed(2)}`
					);
				}
				console.log(`  visible/frame=${((profile.counters.visible ?? 0) / (profile.counters.frames || 1)).toFixed(0)}`);
			}
		}

		if (size === 5000) {
			await fitCamera(page, size);
			const pen = stats(await measurePen(page));
			await fitCamera(page, size);
			await page.evaluate(() => {
				const prof = window.__renderProfile;
				if (prof) {
					prof.enabled = true;
					prof.reset();
				}
			});
			const marqueeMs = await measureMarquee(page, size);
			const marqueeProfile = await page.evaluate(() => {
				const prof = window.__renderProfile;
				if (!prof) return null;
				prof.enabled = false;
				return {
					top: prof.top(6),
					select: prof.phases['select:rect'] ?? null,
					ctxbar: prof.phases['ui:ctxbar'] ?? null
				};
			});
			if (marqueeProfile) {
				results.marqueeProfile = marqueeProfile;
				console.log('[bench] marquee 5k profile:');
				for (const row of marqueeProfile.top) {
					console.log(`  ${row.phase.padEnd(16)} total=${row.total.toFixed(1)} count=${row.count}`);
				}
				console.log(
					`  select:rect=${marqueeProfile.select?.total.toFixed(1) ?? 'n/a'}ms ui:ctxbar=${marqueeProfile.ctxbar?.total.toFixed(1) ?? 'n/a'}ms`
				);
			}
			const autosave = await measureAutosave(page);
			const memory: BenchMemory | null = await page.evaluate(() => window.__inkboard?.memory() ?? null);
			results.pen = pen;
			results.marquee5kMs = marqueeMs;
			results.autosave5k = autosave;
			results.memory5k = memory;
			console.log(
				`[bench] 5k pen p95=${pen.p95.toFixed(1)}ms marquee=${marqueeMs.toFixed(1)}ms autosaveLongTasks=${autosave.count}`
			);
		}
	}
	results.pan = pan;
	results.zoom = zoom;

	// ── board load: 1k objects from storage ──
	await page.goto('/');
	const loadId = randomUUID();
	await seedLocalBoard(page, loadId, boardFor(LOAD_OBJECTS));
	const start = performance.now();
	await page.goto(`/board/${loadId}`);
	await page.waitForFunction((count) => window.__inkboard?.objectCount() === count, LOAD_OBJECTS, {
		timeout: 60_000
	});
	await page.evaluate(
		() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
	);
	results.load1kMs = performance.now() - start;
	console.log(`[bench] load ${LOAD_OBJECTS} objects: ${(results.load1kMs as number).toFixed(0)}ms`);

	// ── output ──
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const output = process.env.BENCH_OUTPUT ?? path.join('bench', 'results', `${stamp}.json`);
	fs.mkdirSync(path.dirname(output), { recursive: true });
	fs.writeFileSync(output, JSON.stringify(results, null, 2));
	console.log(`[bench] wrote ${output}`);
});

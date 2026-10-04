// Synthetic boards for the M3 benchmark harness (reuses objects/factory).
import { createImage, createShape, createStickyNote, createStroke, createText } from '../src/lib/objects/factory';
import type { CanvasObject, ShapeType } from '../src/lib/objects/types';

/** 1×1 transparent PNG used for the sparse image objects. */
const PNG_1X1 =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const CELL_WIDTH = 320;
const CELL_HEIGHT = 240;

const SHAPES: ShapeType[] = ['rect', 'ellipse', 'triangle', 'diamond', 'star'];
const COLORS = ['#e8e9ec', '#7cc4ff', '#ffb86b', '#ff7a7a', '#b79cff', '#7de2a8', '#f0f3f6'];
const WORDS = [
	'discovery',
	'sprint',
	'ideas',
	'risk',
	'owner',
	'deadline',
	'scope',
	'metric',
	'hypothesis',
	'customer',
	'release',
	'blocker',
	'design',
	'retro',
	'goal',
	'flow'
];

/** Deterministic PRNG (mulberry32) so every run generates the same boards. */
export function makePrng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(rng: () => number, values: T[]): T {
	return values[Math.floor(rng() * values.length)];
}

/** Realistic freehand stroke: a smooth random walk with ~40-120 samples. */
function makeStroke(rng: () => number, x: number, y: number): CanvasObject {
	const points: number[] = [];
	const count = 40 + Math.floor(rng() * 80);
	let px = x;
	let py = y;
	let angle = rng() * Math.PI * 2;
	for (let i = 0; i < count; i++) {
		angle += (rng() - 0.5) * 0.7;
		px += Math.cos(angle) * (4 + rng() * 6);
		py += Math.sin(angle) * (4 + rng() * 6);
		points.push(Number(px.toFixed(2)), Number(py.toFixed(2)), Number((0.3 + rng() * 0.7).toFixed(2)));
	}
	return createStroke(points, {
		width: 2 + Math.floor(rng() * 4),
		isHighlighter: rng() < 0.15,
		color: pick(rng, COLORS)
	});
}

function makeWord(rng: () => number, words = 3): string {
	return Array.from({ length: words }, () => pick(rng, WORDS)).join(' ');
}

/**
 * Mixed synthetic board: 40% strokes, 22% shapes, 15% text, 15% stickies,
 * 8% images. A deterministic seed keeps benchmarks comparable over time.
 */
export function generateBoard(count: number, seed = 20261004): CanvasObject[] {
	const rng = makePrng(seed);
	const columns = Math.ceil(Math.sqrt(count));
	const objects: CanvasObject[] = [];
	for (let i = 0; i < count; i++) {
		const x = (i % columns) * CELL_WIDTH + rng() * 90;
		const y = Math.floor(i / columns) * CELL_HEIGHT + rng() * 70;
		const roll = rng();
		if (roll < 0.4) {
			objects.push(makeStroke(rng, x, y));
		} else if (roll < 0.62) {
			objects.push(
				createShape(x, y, 90 + rng() * 180, 70 + rng() * 140, pick(rng, SHAPES), {
					stroke: pick(rng, COLORS),
					fill: rng() < 0.3 ? pick(rng, COLORS) : 'none',
					strokeWidth: 1 + Math.floor(rng() * 3)
				})
			);
		} else if (roll < 0.77) {
			objects.push(
				createText(x, y, makeWord(rng, 2 + Math.floor(rng() * 4)), { fontSize: 16 + Math.floor(rng() * 16) })
			);
		} else if (roll < 0.92) {
			objects.push(createStickyNote(x, y, makeWord(rng, 3 + Math.floor(rng() * 4))));
		} else {
			objects.push(createImage(x, y, PNG_1X1, 1, 1));
		}
	}
	return objects;
}

/** World extent of a generated board (grid layout + slack). */
export function boardExtent(count: number): { width: number; height: number } {
	const columns = Math.ceil(Math.sqrt(count));
	const rows = Math.ceil(count / columns);
	return { width: columns * CELL_WIDTH + 120, height: rows * CELL_HEIGHT + 120 };
}

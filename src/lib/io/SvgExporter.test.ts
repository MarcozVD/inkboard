import { describe, expect, it } from 'vitest';
import { boardToSvg } from './SvgExporter';
import {
	createConnector,
	createImage,
	createShape,
	createStickyNote,
	createStroke,
	createText
} from '$lib/objects/factory';
import { INK } from '$lib/objects/colors';

const DARK = { theme: 'dark' as const };

describe('SvgExporter', () => {
	it('produces a valid svg document', () => {
		const svg = boardToSvg([createShape(0, 0, 100, 50, 'rect')]);
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg.endsWith('</svg>')).toBe(true);
	});

	it('includes a rect element for shape objects', () => {
		const svg = boardToSvg([createShape(10, 20, 100, 50, 'rect')]);
		expect(svg).toContain('<rect');
		// the shape lives in the same center-based transform as the canvas
		expect(svg).toContain('translate(60 45)');
		expect(svg).toContain('width="100"');
		expect(svg).toContain('height="50"');
	});

	it('includes text elements with escaped content', () => {
		const svg = boardToSvg([createText(0, 0, 'a<b & c "d" > e')]);
		expect(svg).toContain('<text');
		expect(svg).toContain('a&lt;b &amp; c &quot;d&quot; &gt; e');
		// no raw markup can leak from user content
		expect(svg).not.toContain('<b>');
	});

	it('includes sticky note background + text', () => {
		const svg = boardToSvg([createStickyNote(0, 0, 'note')]);
		expect(svg).toContain('rx="4"');
		expect(svg).toContain('>note<');
	});

	it('includes stroke path', () => {
		const svg = boardToSvg([createStroke([0, 0, 1, 10, 10, 1])]);
		expect(svg).toContain('<path');
		// perfect-freehand outline: closed, filled path
		const d = svg.match(/<path d="([^"]+)"/)![1];
		expect(d.startsWith('M')).toBe(true);
		expect(d.endsWith('Z')).toBe(true);
		expect(svg).toContain('fill=');
	});

	it('computes viewBox covering all objects', () => {
		const svg = boardToSvg([createShape(100, 100, 50, 50, 'rect')]);
		expect(svg).toContain('viewBox="80 80');
	});

	it('adds background rect when requested', () => {
		const svg = boardToSvg([createShape(0, 0, 10, 10, 'rect')], { background: '#fff' });
		expect(svg).toContain('fill="#fff"');
		expect(svg).toContain('<rect x="-20" y="-20"');
	});

	it('handles empty board gracefully', () => {
		const svg = boardToSvg([]);
		expect(svg).toContain('<svg');
		expect(svg).toContain('</svg>');
	});
});

describe('boardToSvg fidelity (M2-10)', () => {
	it('emits star polygons with 2×sides points', () => {
		const star = createShape(0, 0, 100, 100, 'star', { stroke: '#ffffff' });
		star.sides = 5;
		const svg = boardToSvg([star], DARK);
		const match = svg.match(/<polygon points="([^"]+)"/);
		expect(match).toBeTruthy();
		expect(match![1].split(' ')).toHaveLength(10);
	});

	it('draws arrow heads for arrow shapes and connector ends', () => {
		const arrow = createShape(0, 0, 100, 50, 'arrow', { stroke: '#ffffff', strokeWidth: 2 });
		const arrowSvg = boardToSvg([arrow], DARK);
		expect((arrowSvg.match(/<polygon/g) ?? []).length).toBe(1);

		const connector = createConnector(
			{ x: 0, y: 0 },
			{ x: 50, y: 50 },
			{ startArrow: 'dot', endArrow: 'arrow', stroke: '#ffffff' }
		);
		const connectorSvg = boardToSvg([connector], DARK);
		expect(connectorSvg).toContain('<circle');
		expect(connectorSvg).toContain('<polygon');
	});

	it('uses the perfect-freehand outline for strokes', () => {
		const stroke = createStroke([0, 0, 0.5, 10, 10, 0.5, 20, 0, 0.5], { color: INK, width: 4 });
		const svg = boardToSvg([stroke], DARK);
		const d = svg.match(/<path d="([^"]+)"/)![1];
		expect(d.startsWith('M')).toBe(true);
		expect(d.endsWith('Z')).toBe(true);
		expect(d.split('L').length).toBeGreaterThan(3); // outlined, not a 2-point line
		expect(svg).toContain('fill=');
	});

	it('wraps text, honors rotation and resolves the theme ink', () => {
		const text = createText(0, 0, 'one two three four five six seven', { fontSize: 20 });
		text.transform.width = 60;
		text.transform.rotation = Math.PI / 2;
		text.style.color = INK;

		const light = boardToSvg([text], { theme: 'light' });
		expect(light).toContain('rotate(90)');
		expect((light.match(/<text /g) ?? []).length).toBeGreaterThan(1);
		expect(light).toContain('#1b1d22');
		expect(boardToSvg([text], DARK)).toContain('#e8e9ec');
	});

	it('keeps sticky background + wrapped text and images as data URLs', () => {
		const note = createStickyNote(0, 0, 'alpha beta gamma delta epsilon zeta');
		note.transform.width = 80;
		const image = createImage(0, 0, 'data:image/png;base64,AAAA', 10, 10);
		const svg = boardToSvg([note, image], DARK);
		expect(svg).toContain('rx="4"');
		expect(svg).toContain('<image href="data:image/png;base64,AAAA"');
		expect((svg.match(/<text /g) ?? []).length).toBeGreaterThan(1);
	});

	it('exports regions with exact pixel dimensions (M2-09 modes)', () => {
		const rect = createShape(50, 60, 100, 40, 'rect', { stroke: '#ffffff' });
		const svg = boardToSvg([rect], {
			region: { minX: 0, minY: 0, width: 200, height: 100 },
			width: 400,
			height: 200
		});
		expect(svg).toContain('viewBox="0 0 200 100"');
		expect(svg).toContain('width="400" height="200"');
	});
});

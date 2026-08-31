import { describe, expect, it } from 'vitest';
import { boardToSvg } from './SvgExporter';
import { createShape, createText, createStickyNote, createStroke } from '$lib/objects/factory';

describe('SvgExporter', () => {
	it('produces a valid svg document', () => {
		const svg = boardToSvg([createShape(0, 0, 100, 50, 'rect')]);
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg.endsWith('</svg>')).toBe(true);
	});

	it('includes a rect element for shape objects', () => {
		const svg = boardToSvg([createShape(10, 20, 100, 50, 'rect')]);
		expect(svg).toContain('<rect');
		expect(svg).toContain('x="10"');
		expect(svg).toContain('y="20"');
		expect(svg).toContain('width="100"');
	});

	it('includes text elements with escaped content', () => {
		const svg = boardToSvg([createText(0, 0, 'a<b & c')]);
		expect(svg).toContain('<text');
		expect(svg).toContain('a&lt;b &amp; c');
	});

	it('includes sticky note background + text', () => {
		const svg = boardToSvg([createStickyNote(0, 0, 'note')]);
		expect(svg).toContain('rx="4"');
		expect(svg).toContain('note');
	});

	it('includes stroke path', () => {
		const svg = boardToSvg([createStroke([0, 0, 1, 10, 10, 1])]);
		expect(svg).toContain('<path');
		expect(svg).toContain('M0.00 0.00');
	});

	it('computes viewBox covering all objects', () => {
		const svg = boardToSvg([createShape(100, 100, 50, 50, 'rect')]);
		expect(svg).toContain('viewBox="80 80');
	});

	it('adds background rect when requested', () => {
		const svg = boardToSvg([createShape(0, 0, 10, 10, 'rect')], { background: '#fff' });
		expect(svg).toContain('fill="#fff"');
	});

	it('handles empty board gracefully', () => {
		const svg = boardToSvg([]);
		expect(svg).toContain('<svg');
		expect(svg).toContain('</svg>');
	});
});

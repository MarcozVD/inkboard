import { describe, expect, it } from 'vitest';
import {
	GRID,
	GRID_DARK,
	GRID_LIGHT,
	INK,
	INK_DARK,
	INK_LIGHT,
	LEGACY_GRID,
	LEGACY_INK,
	migrateLegacyInk,
	resolveColor
} from './colors';
import { createConnector, createShape, createStroke, createText } from './factory';

describe('colors — ink resolution (D1 §28 option b)', () => {
	it('resolves the semantic ink per theme', () => {
		expect(resolveColor(INK, 'dark')).toBe(INK_DARK);
		expect(resolveColor(INK, 'light')).toBe(INK_LIGHT);
	});

	it('resolves legacy defaults with the active theme too', () => {
		expect(resolveColor(LEGACY_INK, 'dark')).toBe(INK_DARK);
		expect(resolveColor(LEGACY_INK, 'light')).toBe(INK_LIGHT);
		expect(resolveColor(GRID, 'dark')).toBe(GRID_DARK);
		expect(resolveColor(GRID, 'light')).toBe(GRID_LIGHT);
		expect(resolveColor(LEGACY_GRID, 'light')).toBe(GRID_LIGHT);
	});

	it('passes absolute user colors through', () => {
		expect(resolveColor('#ff0000', 'dark')).toBe('#ff0000');
		expect(resolveColor('#ff0000', 'light')).toBe('#ff0000');
	});
});

describe('colors — legacy default migration', () => {
	it('migrates only the exact legacy default white', () => {
		const stroke = createStroke([0, 0, 1, 10, 10, 1]);
		stroke.style.color = LEGACY_INK;
		const shape = createShape(0, 0, 10, 10, 'rect');
		shape.style.stroke = LEGACY_INK;
		const text = createText(0, 0, 'x');
		text.style.color = LEGACY_INK;
		const connector = createConnector({ x: 0, y: 0 }, { x: 1, y: 1 });
		connector.style.stroke = LEGACY_INK;
		const userWhite = createStroke([0, 0, 1, 1, 1, 1]);
		userWhite.style.color = '#ffffff';

		const migrated = migrateLegacyInk([stroke, shape, text, connector, userWhite]);
		expect(migrated).toBe(4);
		expect(stroke.style.color).toBe(INK);
		expect(shape.style.stroke).toBe(INK);
		expect(text.style.color).toBe(INK);
		expect(connector.style.stroke).toBe(INK);
		expect(userWhite.style.color).toBe('#ffffff');
	});

	it('leaves non-default colors untouched', () => {
		const stroke = createStroke([0, 0, 1, 10, 10, 1]);
		const original = stroke.style.color;
		expect(migrateLegacyInk([stroke])).toBe(0);
		expect(stroke.style.color).toBe(original);
	});
});

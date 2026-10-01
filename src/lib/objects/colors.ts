// colors — semantic color resolution (§M1-10, D1 §28 option b).
// 'ink' is a semantic value resolved per theme (light ink in dark, dark ink in
// light); user-picked colors are absolute. Legacy default colors are migrated
// to the semantic value on load.
import type { CanvasObject } from '$lib/objects/types';

export type ResolvedTheme = 'dark' | 'light';

/** semantic values */
export const INK = 'ink';
export const GRID = 'grid';

/** legacy defaults (pre-M1-10) */
export const LEGACY_INK = '#e8e9ec';
export const LEGACY_GRID = '#2a2d34';

/** resolved ink per theme (kept in sync with the --ink CSS token) */
export const INK_DARK = '#e8e9ec';
export const INK_LIGHT = '#1b1d22';

/** resolved grid line per theme (kept in sync with --color-grid) */
export const GRID_DARK = '#2a2d34';
export const GRID_LIGHT = '#e2e2e8';

/** Resolve semantic content colors with the active theme; absolutes pass through. */
export function resolveColor(color: string, theme: ResolvedTheme): string {
	if (color === INK || color === LEGACY_INK) return theme === 'light' ? INK_LIGHT : INK_DARK;
	if (color === GRID || color === LEGACY_GRID) return theme === 'light' ? GRID_LIGHT : GRID_DARK;
	return color;
}

/** Read a CSS custom property from the document (with fallback outside the browser). */
export function cssVar(name: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value || fallback;
}

/**
 * Migrate legacy default-white defaults to the semantic 'ink' value (§M1-10).
 * Exact-match rule: only the old default ('#e8e9ec') is migrated, so any other
 * color (including a user-picked white) stays absolute.
 */
export function migrateLegacyInk(objects: CanvasObject[]): number {
	let migrated = 0;
	for (const obj of objects) {
		if (obj.type === 'stroke' && obj.style.color === LEGACY_INK) {
			obj.style.color = INK;
			migrated++;
		} else if (obj.type === 'shape' && obj.style.stroke === LEGACY_INK) {
			obj.style.stroke = INK;
			migrated++;
		} else if (obj.type === 'text' && obj.style.color === LEGACY_INK) {
			obj.style.color = INK;
			migrated++;
		} else if (obj.type === 'connector' && obj.style.stroke === LEGACY_INK) {
			obj.style.stroke = INK;
			migrated++;
		}
	}
	return migrated;
}

// theme — workspace theme choice + live system preference (§M1-10).
// Persisted in localStorage in the browser (workspace settings in Tauri later).
import type { ResolvedTheme } from '$lib/objects/colors';

export type ThemeChoice = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'inkboard:theme';

function loadStoredChoice(): ThemeChoice {
	if (typeof localStorage === 'undefined') return 'dark';
	const value = localStorage.getItem(STORAGE_KEY);
	return value === 'light' || value === 'system' ? value : 'dark';
}

function systemPrefersDark(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return true;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function createThemeController() {
	let choice = $state<ThemeChoice>(loadStoredChoice());
	let systemDark = $state(systemPrefersDark());

	if (typeof window !== 'undefined' && window.matchMedia) {
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
			systemDark = e.matches;
		});
	}

	const resolved = $derived<ResolvedTheme>(choice === 'system' ? (systemDark ? 'dark' : 'light') : choice);

	function set(next: ThemeChoice): void {
		choice = next;
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// storage unavailable — theme still applies for this session
		}
	}

	return {
		get choice(): ThemeChoice {
			return choice;
		},
		get resolved(): ResolvedTheme {
			return resolved;
		},
		set
	};
}

export const themeController = createThemeController();

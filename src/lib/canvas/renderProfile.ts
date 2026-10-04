// renderProfile — DEV-only per-phase timing for the renderer (M3 baseline).
// Enabled by the bench harness; zero-ish overhead when disabled.

export interface PhaseStat {
	count: number;
	total: number;
	max: number;
}

export interface RenderProfile {
	enabled: boolean;
	phases: Record<string, PhaseStat>;
	counters: Record<string, number>;
	reset(): void;
	add(phase: string, ms: number): void;
	bump(name: string, amount?: number): void;
	top(limit?: number): { phase: string; total: number; count: number; max: number; perFrame: number }[];
}

function createProfile(): RenderProfile {
	const profile: RenderProfile = {
		enabled: false,
		phases: {},
		counters: {},
		reset() {
			profile.phases = {};
			profile.counters = {};
		},
		add(phase, ms) {
			let stat = profile.phases[phase];
			if (!stat) {
				stat = { count: 0, total: 0, max: 0 };
				profile.phases[phase] = stat;
			}
			stat.count++;
			stat.total += ms;
			if (ms > stat.max) stat.max = ms;
		},
		bump(name, amount = 1) {
			profile.counters[name] = (profile.counters[name] ?? 0) + amount;
		},
		top(limit = 10) {
			const frames = profile.counters.frames || 1;
			return Object.entries(profile.phases)
				.map(([phase, stat]) => ({
					phase,
					total: stat.total,
					count: stat.count,
					max: stat.max,
					perFrame: stat.total / frames
				}))
				.sort((a, b) => b.total - a.total)
				.slice(0, limit);
		}
	};
	if (typeof window !== 'undefined' && import.meta.env.DEV) {
		(window as unknown as { __renderProfile?: RenderProfile }).__renderProfile = profile;
	}
	return profile;
}

export const renderProfile: RenderProfile = createProfile();

/** Time a phase when profiling is enabled (ms, high-res). */
export function profileNow(): number {
	return renderProfile.enabled ? performance.now() : 0;
}

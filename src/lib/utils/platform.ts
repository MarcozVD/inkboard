// platform — OS detection for native chrome differences (M4-02).
// Pure enough to unit test: pass any userAgent/platform strings.

export type PlatformKind = 'macos' | 'windows' | 'linux' | 'other';

export function detectPlatform(userAgent: string, platform = ''): PlatformKind {
	const probe = `${platform} ${userAgent}`.toLowerCase();
	if (probe.includes('mac')) return 'macos';
	if (probe.includes('win')) return 'windows';
	if (probe.includes('linux') || probe.includes('x11')) return 'linux';
	return 'other';
}

export function currentPlatform(): PlatformKind {
	if (typeof navigator === 'undefined') return 'other';
	return detectPlatform(navigator.userAgent, navigator.platform ?? '');
}

/** macOS uses native traffic lights (titleBarStyle Overlay), not our buttons. */
export function isMacos(): boolean {
	return currentPlatform() === 'macos';
}

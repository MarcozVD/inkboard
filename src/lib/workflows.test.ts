import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import pkg from '../../package.json';
import tauriConfig from '../../src-tauri/tauri.conf.json';
import cargoToml from '../../src-tauri/Cargo.toml?raw';
import releaseYaml from '../../.github/workflows/release.yml?raw';
import benchYaml from '../../.github/workflows/bench.yml?raw';
import buildYaml from '../../.github/workflows/build.yml?raw';
import ciYaml from '../../.github/workflows/ci.yml?raw';

describe('app version consistency (M4-06)', () => {
	it('package.json, tauri.conf.json and Cargo.toml share the same version', () => {
		const cargo = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
		expect(pkg.version).toBeTruthy();
		expect(tauriConfig.version).toBe(pkg.version);
		expect(cargo).toBe(pkg.version);
	});
});

describe('release workflow (M4-06)', () => {
	const workflow = parse(releaseYaml) as {
		on: { workflow_dispatch?: unknown; push: { tags: string[] } };
		jobs: {
			release: {
				strategy: { matrix: { include: { platform: string; args: string }[] } };
				steps: {
					name?: string;
					uses?: string;
					run?: string;
					with?: Record<string, unknown>;
					env?: Record<string, string>;
				}[];
			};
		};
	};
	const steps = workflow.jobs.release.steps;
	const stepText = JSON.stringify(steps);
	const guardRun = steps.find((step) => step.name === 'Require updater signing secrets')?.run ?? '';

	it('runs manually and on v* tags only', () => {
		expect(workflow.on.workflow_dispatch).toBeDefined();
		expect(workflow.on.push.tags).toEqual(['v*']);
	});

	it('builds on the three platforms with NSIS/MSI, universal macOS and AppImage/deb', () => {
		const include = workflow.jobs.release.strategy.matrix.include;
		expect(include.map((entry) => entry.platform)).toEqual(['windows-latest', 'macos-latest', 'ubuntu-22.04']);
		const macArgs = include.find((entry) => entry.platform === 'macos-latest')?.args ?? '';
		expect(macArgs).toContain('universal-apple-darwin');
		expect(stepText).toContain('libwebkit2gtk-4.1-dev');
	});

	it('uses tauri-action with drafts and the updater json', () => {
		const action = steps.find((step) => step.uses?.includes('tauri-apps/tauri-action'));
		expect(action).toBeDefined();
		expect(action?.with?.includeUpdaterJson).toBe(true);
		expect(action?.with?.releaseDraft).toBe(true);
	});

	it('fails clearly when the signing secrets are missing', () => {
		expect(stepText).toContain('TAURI_SIGNING_PRIVATE_KEY');
		expect(stepText).toContain('TAURI_SIGNING_PRIVATE_KEY_PASSWORD');
		expect(stepText).toContain('check-versions.mjs');
		expect(guardRun).toContain('is empty or not set');
	});

	it('guards the signing secrets against BOM, CRLF, trailing whitespace and bad base64', () => {
		// UTF-8 BOM (EF BB BF) rejected for key and password
		expect(guardRun.match(/\\xef\\xbb\\xbf/g)?.length).toBeGreaterThanOrEqual(2);
		// carriage returns rejected
		expect(guardRun).toMatch(/contains carriage returns/);
		// trailing whitespace/newlines rejected
		expect(guardRun).toMatch(/\[\[:space:\]\]\$/);
		// key must be valid base64 decoding to a minisign secret key
		expect(guardRun).toContain('base64 -d');
		expect(guardRun).toContain('untrusted comment');
		// never leak secret material: no echo of the values, no redirections, no set -x
		expect(guardRun).not.toMatch(/echo[^\n]*\$TAURI_SIGNING_PRIVATE_KEY/);
		expect(guardRun).not.toMatch(/TAURI_SIGNING_PRIVATE_KEY[^=\n]*>/);
		expect(guardRun).not.toContain('set -x');
	});

	it('parses every workflow in .github/workflows', () => {
		for (const content of [releaseYaml, benchYaml, buildYaml, ciYaml]) {
			expect(() => parse(content)).not.toThrow();
		}
	});
});

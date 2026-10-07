#!/usr/bin/env node
// Release/CI guard:
//  1) package.json, tauri.conf.json and Cargo.toml share the same app version
//  2) every tauri* crate in src-tauri/Cargo.lock shares major.minor with its
//     npm counterpart in pnpm-lock.yaml (@tauri-apps/api or plugin-*)
// `tauri build` enforces (2); `cargo build` does not, hence this check.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const minor = (version) => version.split('.').slice(0, 2).join('.');

export function readVersions(base = root) {
	const pkg = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
	const tauri = JSON.parse(readFileSync(join(base, 'src-tauri/tauri.conf.json'), 'utf8'));
	const cargo = readFileSync(join(base, 'src-tauri/Cargo.toml'), 'utf8');
	const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
	return { package: pkg.version, tauri: tauri.version, cargo: cargoVersion };
}

/** tauri + tauri-plugin-* crate versions resolved in Cargo.lock. */
export function readCrateVersions(base = root) {
	const lock = readFileSync(join(base, 'src-tauri/Cargo.lock'), 'utf8');
	const versions = {};
	const re = /^name = "(tauri|tauri-plugin-[a-z0-9-]+)"\nversion = "([^"]+)"/gm;
	for (const [, name, version] of lock.matchAll(re)) versions[name] = version;
	return versions;
}

/** @tauri-apps/* versions resolved in pnpm-lock.yaml (first resolved key). */
export function readNpmVersions(base = root) {
	const lock = readFileSync(join(base, 'pnpm-lock.yaml'), 'utf8');
	const versions = {};
	const re = /^\s{2}'?(@tauri-apps\/(?:api|plugin-[a-z0-9-]+))@(\d+\.\d+\.\d+)'?:/gm;
	for (const [, name, version] of lock.matchAll(re)) {
		if (!versions[name]) versions[name] = version;
	}
	return versions;
}

function crateToNpmPackage(crate) {
	if (crate === 'tauri') return '@tauri-apps/api';
	if (crate.startsWith('tauri-plugin-')) return `@tauri-apps/${crate.replace('tauri-', '')}`;
	return null;
}

/** Crate/npm pairs whose major.minor differ (only installed npm packages). */
export function versionMismatches(base = root) {
	const crates = readCrateVersions(base);
	const npm = readNpmVersions(base);
	const mismatches = [];
	for (const [crate, crateVersion] of Object.entries(crates)) {
		const pkg = crateToNpmPackage(crate);
		if (!pkg) continue;
		const npmVersion = npm[pkg];
		if (!npmVersion) continue; // plugin not used from JS
		if (minor(crateVersion) !== minor(npmVersion)) {
			mismatches.push({ crate, crateVersion, pkg, npmVersion });
		}
	}
	return mismatches;
}

function main() {
	let failed = false;

	const versions = readVersions();
	const unique = new Set(Object.values(versions));
	if (unique.size !== 1 || [...unique][0] === undefined) {
		console.error(
			`::error::version mismatch — package.json=${versions.package} tauri.conf.json=${versions.tauri} Cargo.toml=${versions.cargo}`
		);
		failed = true;
	} else {
		console.log(`versions consistent: ${versions.package}`);
	}

	const mismatches = versionMismatches();
	if (mismatches.length > 0) {
		for (const mismatch of mismatches) {
			console.error(
				`::error::tauri package mismatch — ${mismatch.crate} (v${mismatch.crateVersion}) vs ${mismatch.pkg} (v${mismatch.npmVersion}); major.minor must match`
			);
		}
		failed = true;
	} else {
		console.log('tauri crate/npm versions aligned (major.minor)');
	}

	if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}

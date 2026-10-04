#!/usr/bin/env node
// Fails when package.json, tauri.conf.json and Cargo.toml versions differ.
// Used by the release workflow (M4-06): the tag must match all three files.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readVersions(base = root) {
	const pkg = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
	const tauri = JSON.parse(readFileSync(join(base, 'src-tauri/tauri.conf.json'), 'utf8'));
	const cargo = readFileSync(join(base, 'src-tauri/Cargo.toml'), 'utf8');
	const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
	return { package: pkg.version, tauri: tauri.version, cargo: cargoVersion };
}

function main() {
	const versions = readVersions();
	const unique = new Set(Object.values(versions));
	if (unique.size !== 1 || [...unique][0] === undefined) {
		console.error(
			`::error::version mismatch — package.json=${versions.package} tauri.conf.json=${versions.tauri} Cargo.toml=${versions.cargo}`
		);
		process.exit(1);
	}
	console.log(`versions consistent: ${versions.package}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}

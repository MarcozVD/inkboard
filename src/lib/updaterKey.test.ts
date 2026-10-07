import { describe, expect, it } from 'vitest';
import tauriConfig from '../../src-tauri/tauri.conf.json';
import ciYaml from '../../.github/workflows/ci.yml?raw';

// base64 helpers without Node types (ASCII-safe, all key material is ASCII)
function decodeBase64(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
function encodeBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/**
 * Validates the updater pubkey (M4-05): a base64 blob whose decoded text is
 * "untrusted comment: minisign public key: <ID>" + a second line that is a
 * 42-byte minisign public key ("Ed" + 8-byte little-endian key id + 32 bytes).
 */
function parseMinisignPubkey(pubkey: string): void {
	const blob = decodeBase64(pubkey);
	const text = new TextDecoder().decode(blob);
	const lines = text.split('\n').filter((line) => line.length > 0);
	if (lines.length !== 2) throw new Error('pubkey must decode to exactly two lines');

	const commentId = lines[0].match(/minisign public key: ([0-9A-F]+)/)?.[1];
	if (!commentId) throw new Error('comment line must carry the key id');

	// atob throws on malformed input; re-encoding must round-trip exactly
	const raw = decodeBase64(lines[1]);
	if (encodeBase64(raw) !== lines[1]) throw new Error('key line is not canonical base64');
	if (raw.length !== 42) throw new Error(`minisign public key must be 42 bytes, got ${raw.length}`);
	if (raw[0] !== 0x45 || raw[1] !== 0x64) throw new Error("key algorithm must be 'Ed'");

	// bytes 2..10 hold the key id in little-endian
	const keyId = [...raw.slice(2, 10)]
		.map((b) => b.toString(16).padStart(2, '0').toUpperCase())
		.reverse()
		.join('');
	if (keyId !== commentId) throw new Error(`key id mismatch: line says ${commentId}, blob says ${keyId}`);
}

const CORRUPTED =
	'untrusted comment: minisign public key: D566C229B3A1B272\nRWRysqGzKcJm1bzovYCIaycHz0DSXaJ1hmm0O1j53ARuQP6TFsnLJQZ0K\n';
const REAL_KEY_LINE = new TextDecoder().decode(decodeBase64(tauriConfig.plugins.updater.pubkey)).split('\n')[1];

describe('updater pubkey format (M4-05)', () => {
	it('configured pubkey is valid minisign and its key id matches the comment', () => {
		expect(() => parseMinisignPubkey(tauriConfig.plugins.updater.pubkey)).not.toThrow();
	});

	it('fails on the corrupted transcription (wrong-length inner base64)', () => {
		const corrupt = encodeBase64(new TextEncoder().encode(CORRUPTED));
		expect(() => parseMinisignPubkey(corrupt)).toThrow();
	});

	it('fails when the comment id does not match the blob key id', () => {
		const swapped = encodeBase64(
			new TextEncoder().encode(`untrusted comment: minisign public key: 0000000000000000\n${REAL_KEY_LINE}\n`)
		);
		expect(() => parseMinisignPubkey(swapped)).toThrow(/key id mismatch/);
	});
});

describe('release fixes (0.5.0)', () => {
	it('CI runs the tauri crate/npm version guard', () => {
		expect(ciYaml).toContain('node scripts/check-versions.mjs');
	});

	it('the app version is the release version', () => {
		expect(tauriConfig.version).toBe('0.5.0');
	});
});

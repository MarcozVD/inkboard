// versionBridge — module singleton for the version history UI (M2-04).
// BoardRuntime attaches the live board id + a save-flush callback.
import { createVersion, listVersions, restoreVersion } from '$lib/io/persistence';
import type { BoardVersionMeta } from '$lib/objects/types';

export interface VersionBridgeDeps {
	getBoardId: () => string;
	flush: () => Promise<void>;
}

let getBoardId: () => string = () => '';
let flush: () => Promise<void> = async () => {};

/** Called by BoardRuntime once the engine/session exist. */
export function attachVersionBridge(deps: VersionBridgeDeps): void {
	getBoardId = deps.getBoardId;
	flush = deps.flush;
}

function createVersionBridge() {
	let versions = $state<BoardVersionMeta[]>([]);
	let loading = $state(false);

	async function load(): Promise<void> {
		loading = true;
		try {
			versions = await listVersions(getBoardId());
		} catch (err) {
			console.error('list versions failed', err);
			versions = [];
		} finally {
			loading = false;
		}
	}

	/** Manual snapshot: flush the pending autosave first. */
	async function save(): Promise<void> {
		await flush();
		await createVersion(getBoardId(), 'Manual');
		await load();
	}

	/** Restore: flush, snapshot-before-restore (backend) and reload the board. */
	async function restore(versionId: string): Promise<void> {
		await flush();
		await restoreVersion(getBoardId(), versionId);
		window.location.reload();
	}

	return {
		get versions(): BoardVersionMeta[] {
			return versions;
		},
		get loading(): boolean {
			return loading;
		},
		load,
		save,
		restore
	};
}

export const versionBridge = createVersionBridge();

<script lang="ts">
	// TopBar — custom titlebar (decorations:false) with drag region + window controls (§16)
	import { getCurrentWindow } from '@tauri-apps/api/window';

	let {
		title,
		onBack
	}: {
		title: string;
		onBack?: () => void;
	} = $props();

	let isMaximized = $state(false);

	async function toggleMaximize() {
		const win = getCurrentWindow();
		if (await win.isMaximized()) {
			await win.unmaximize();
			isMaximized = false;
		} else {
			await win.maximize();
			isMaximized = true;
		}
	}

	function minimize() {
		getCurrentWindow().minimize();
	}

	function close() {
		getCurrentWindow().close();
	}

	$effect(() => {
		// only in Tauri; no-op in plain browser (dev server / E2E)
		if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
		let unlisten: (() => void) | undefined;
		getCurrentWindow()
			.onResized(async () => {
				isMaximized = await getCurrentWindow().isMaximized();
			})
			.then((fn) => {
				unlisten = fn;
			});
		return () => unlisten?.();
	});
</script>

<header class="topbar">
	<div class="drag-region" data-tauri-drag-region>
		{#if onBack}
			<button class="back-btn" onclick={onBack} title="Back to boards">←</button>
		{/if}
		<span class="title" data-tauri-drag-region>{title}</span>
	</div>
	<div class="window-controls">
		<button class="wc-btn" onclick={minimize} title="Minimize">─</button>
		<button class="wc-btn" onclick={toggleMaximize} title="Maximize">
			{isMaximized ? '❐' : '□'}
		</button>
		<button class="wc-btn close" onclick={close} title="Close">✕</button>
	</div>
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		height: 36px;
		background: var(--bg-panel);
		border-bottom: 1px solid var(--border);
		padding-left: 8px;
		user-select: none;
	}

	.drag-region {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		height: 100%;
		overflow: hidden;
	}

	.title {
		font-size: 13px;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.back-btn {
		width: 26px;
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		color: var(--text-secondary);
		font-size: 15px;
	}

	.back-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.window-controls {
		display: flex;
		height: 100%;
		margin-left: 4px;
	}

	.wc-btn {
		width: 42px;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		font-size: 13px;
	}

	.wc-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.wc-btn.close:hover {
		background: var(--danger);
		color: #fff;
	}
</style>
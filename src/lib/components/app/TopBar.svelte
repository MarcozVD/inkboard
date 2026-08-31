<script lang="ts">
	// TopBar — redesigned per DESIGN.md: 48px, minimal, logo + board name + undo/redo + settings.
	// State flows through uiStore; actions through uiActions (registered by BoardCanvas).
	import Icon from '$lib/components/ui/Icon.svelte';
	import ToolButton from '$lib/components/ui/ToolButton.svelte';
	import { ui, uiActions } from '$lib/stores/ui.svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';

	let editing = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (editing && inputEl) {
			inputEl.focus();
			inputEl.select();
		}
	});

	function commitEdit() {
		editing = false;
		uiActions.rename?.(inputEl?.value ?? ui.boardName);
	}

	// window controls (Tauri decorations: false)
	async function minimize() { getCurrentWindow().minimize(); }
	async function toggleMaximize() {
		const w = getCurrentWindow();
		(await w.isMaximized()) ? w.unmaximize() : w.maximize();
	}
	async function close() { getCurrentWindow().close(); }
</script>

<header class="topbar">
	<div class="left" data-tauri-drag-region>
		<Icon name="image" size={22} class="brand-icon" />
		{#if editing}
			<input
				bind:this={inputEl}
				class="name-input"
				value={ui.boardName}
				onblur={commitEdit}
				onkeydown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') editing = false; }}
			/>
		{:else}
			<button class="name-display" onclick={() => (editing = true)} title="Rename board">
				{ui.boardName}
			</button>
		{/if}
		<span class="save-status" class:saving={ui.saveState === 'saving'} class:saved={ui.saveState === 'saved'} data-testid="save-indicator">
			{ui.saveState === 'saving' ? '●' : ui.saveState === 'saved' ? '✓' : ''}
		</span>
	</div>

	<div class="center" data-tauri-drag-region></div>

	<div class="right">
		<ToolButton icon="undo" label="Undo" shortcut="Ctrl+Z" testid="undo" disabled={!ui.canUndo} onclick={() => uiActions.undo?.()} />
		<ToolButton icon="redo" label="Redo" shortcut="Ctrl+Shift+Z" testid="redo" disabled={!ui.canRedo} onclick={() => uiActions.redo?.()} />
		<span class="divider"></span>
		<ToolButton icon="share" label="Share" disabled />
		<ToolButton icon="settings" label="Settings" onclick={() => uiActions.openSettings?.()} />
		<span class="divider"></span>
		<div class="window-controls">
			<button class="wc-btn" aria-label="Minimize" onclick={minimize}><Icon name="minimize" /></button>
			<button class="wc-btn" aria-label="Maximize" onclick={toggleMaximize}><Icon name="maximize" /></button>
			<button class="wc-btn wc-close" aria-label="Close" onclick={close}><Icon name="close" /></button>
		</div>
	</div>
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		height: var(--topbar-h);
		padding: 0 var(--space-sm) 0 var(--space-sm);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		user-select: none;
		z-index: 30;
	}

	.left {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		height: 100%;
		overflow: hidden;
	}

	:global(.brand-icon) {
		color: var(--color-accent);
		flex-shrink: 0;
	}

	.name-display {
		font-size: 16px;
		font-weight: 500;
		color: var(--color-text);
		padding: 2px 6px;
		border-radius: var(--radius-md);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 240px;
		transition: background var(--dur-micro) var(--ease-out);
	}

	.name-display:hover {
		background: var(--color-surface-hover);
	}

	.name-input {
		font-size: 16px;
		font-weight: 500;
		color: var(--color-text);
		background: var(--color-surface-hover);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 2px 6px;
		max-width: 240px;
		outline: none;
	}

	.name-input:focus {
		border-color: var(--color-accent);
	}

	.save-status {
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--text-size-caption);
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.save-status.saving {
		color: var(--color-accent);
		animation: pulse 1s infinite;
	}

	.save-status.saved {
		color: var(--color-accent);
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.3; }
	}

	.center {
		flex: 1;
		height: 100%;
	}

	.right {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 100%;
	}

	.divider {
		width: 1px;
		height: 20px;
		background: var(--color-border);
		margin: 0 4px;
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
		color: var(--color-text-muted);
		transition:
			background var(--dur-micro) var(--ease-out),
			color var(--dur-micro) var(--ease-out);
	}

	.wc-btn:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.wc-close:hover {
		background: var(--color-danger);
		color: #fff;
	}
</style>

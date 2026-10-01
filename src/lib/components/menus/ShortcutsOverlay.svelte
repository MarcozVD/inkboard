<script lang="ts">
	// ShortcutsOverlay — `?` cheat sheet, built from input/shortcuts.ts (§M1-12).
	import { shortcutGroups } from '$lib/input/shortcuts';

	let { onClose }: { onClose: () => void } = $props();

	const groups = shortcutGroups();

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKey} />

<div
	class="shortcuts-overlay"
	role="presentation"
	data-testid="shortcuts-overlay"
	onclick={onClose}
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
>
	<div
		class="shortcuts-panel"
		role="dialog"
		aria-label="Keyboard shortcuts"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<div class="so-header">
			<span>Keyboard shortcuts</span>
			<button class="so-close" aria-label="Close shortcuts" onclick={onClose}>Esc</button>
		</div>
		<div class="so-body">
			{#each groups as group (group.title)}
				<section class="so-group">
					<h3>{group.title}</h3>
					{#each group.items as item (item.label)}
						<div class="so-row">
							<span class="so-label">{item.label}</span>
							<kbd>{item.keys}</kbd>
						</div>
					{/each}
				</section>
			{/each}
		</div>
	</div>
</div>

<style>
	.shortcuts-overlay {
		position: fixed;
		inset: 0;
		z-index: 180;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		animation: so-fade var(--dur-micro) var(--ease-out);
	}

	@keyframes so-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.shortcuts-panel {
		width: 560px;
		max-width: calc(100vw - 32px);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		overflow: hidden;
	}

	.so-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--color-border);
		font-size: 15px;
		font-weight: 600;
		color: var(--color-text);
	}

	.so-close {
		padding: 2px 8px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--color-text-muted);
	}

	.so-close:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.so-body {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px 24px;
		padding: 12px 16px 16px;
		overflow-y: auto;
	}

	.so-group h3 {
		margin: 8px 0 4px;
		font-size: var(--text-size-label);
		font-weight: 500;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.so-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		min-height: 24px;
	}

	.so-label {
		font-size: 13px;
		color: var(--color-text);
	}

	.so-row kbd {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: 3px;
		padding: 1px 5px;
		white-space: nowrap;
	}
</style>

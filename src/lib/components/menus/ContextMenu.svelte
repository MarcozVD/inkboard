<script lang="ts">
	// ContextMenu — right-click menu per DESIGN.md § ContextMenu.
	// Items: { label, icon?, action?, separator?, danger? }.
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/Icon.svelte';

	export interface MenuItem {
		label?: string;
		icon?: IconName;
		action?: () => void;
		separator?: boolean;
		danger?: boolean;
		disabled?: boolean;
	}

	let {
		x,
		y,
		items,
		onClose
	}: {
		x: number;
		y: number;
		items: MenuItem[];
		onClose: () => void;
	} = $props();

	let menuEl: HTMLDivElement | undefined = $state();

	// clamp to viewport
	$effect(() => {
		if (menuEl && x !== -1) {
			const r = menuEl.getBoundingClientRect();
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			if (x + r.width > vw) menuEl.style.left = `${x - r.width}px`;
			else menuEl.style.left = `${x}px`;
			if (y + r.height > vh) menuEl.style.top = `${y - r.height}px`;
			else menuEl.style.top = `${y}px`;
		}
	});

	function pick(item: MenuItem) {
		onClose();
		item.action?.();
	}

	$effect(() => {
		if (x === -1) return;
		function onDocClick(e: MouseEvent) {
			if (menuEl && !menuEl.contains(e.target as Node)) onClose();
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose();
		}
		document.addEventListener('mousedown', onDocClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDocClick);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

{#if x !== -1 && y !== -1}
	<div class="context-menu" bind:this={menuEl} role="menu">
		{#each items as item}
			{#if item.separator}
				<div class="cm-sep"></div>
			{:else}
				<button
					class="cm-item"
					class:danger={item.danger}
					disabled={item.disabled}
					role="menuitem"
					onclick={() => pick(item)}
				>
					{#if item.icon}
						<Icon name={item.icon} size={14} />
					{/if}
					<span>{item.label}</span>
				</button>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.context-menu {
		position: fixed;
		min-width: 170px;
		padding: var(--space-xs);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		z-index: 100;
		animation: cm-in var(--dur-micro) var(--ease-out);
	}

	@keyframes cm-in {
		from {
			opacity: 0;
			transform: scale(0.97) translateY(-2px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.cm-item {
		width: 100%;
		height: 30px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 8px;
		border-radius: var(--radius-md);
		font-size: var(--text-size-body);
		color: var(--color-text);
		text-align: left;
		transition: background var(--dur-micro) var(--ease-out);
	}

	.cm-item:hover:not(:disabled) {
		background: var(--color-surface-hover);
	}

	.cm-item:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.cm-item.danger {
		color: var(--color-danger);
	}

	.cm-item :global(svg) {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.cm-item.danger :global(svg) {
		color: var(--color-danger);
	}

	.cm-sep {
		height: 1px;
		background: var(--color-border);
		margin: 4px 6px;
	}
</style>

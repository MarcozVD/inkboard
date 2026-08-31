<script lang="ts">
	// CreatePanel — floating "create" panel per DESIGN.md. Sections with actions.
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/Icon.svelte';

	export interface CreateItem {
		id: string;
		icon: IconName;
		label: string;
	}

	let {
		open,
		items,
		onSelect,
		onClose
	}: {
		open: boolean;
		items: CreateItem[];
		onSelect: (id: string) => void;
		onClose: () => void;
	} = $props();

	let panelEl: HTMLDivElement | undefined = $state();

	// close on click outside
	$effect(() => {
		if (!open) return;
		function onDocClick(e: MouseEvent) {
			if (panelEl && !panelEl.contains(e.target as Node)) onClose();
		}
		document.addEventListener('mousedown', onDocClick);
		return () => document.removeEventListener('mousedown', onDocClick);
	});
</script>

{#if open}
	<div class="create-panel" bind:this={panelEl} role="dialog" aria-label="Create">
		<div class="cp-header">
			<span class="cp-title">Create</span>
			<button class="cp-close" aria-label="Close panel" onclick={onClose}>
				<Icon name="close" size={14} />
			</button>
		</div>
		<div class="cp-items">
			{#each items as item}
				<button class="cp-item" onclick={() => onSelect(item.id)}>
					<Icon name={item.icon} size={16} />
					<span>{item.label}</span>
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.create-panel {
		position: absolute;
		top: calc(var(--topbar-h) + 8px);
		left: 64px;
		min-width: 210px;
		padding: var(--space-xs);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		z-index: 25;
		animation: cp-in var(--dur-normal) var(--ease-out);
	}

	@keyframes cp-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.cp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 8px;
	}

	.cp-title {
		font-size: var(--text-size-label);
		font-weight: 500;
		letter-spacing: 0.02em;
		color: var(--color-text-muted);
	}

	.cp-close {
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
	}

	.cp-close:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.cp-items {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding-top: 2px;
	}

	.cp-item {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 32px;
		padding: 0 8px;
		border-radius: var(--radius-md);
		font-size: var(--text-size-body);
		color: var(--color-text);
		transition: background var(--dur-micro) var(--ease-out);
	}

	.cp-item:hover {
		background: var(--color-surface-hover);
	}

	.cp-item :global(svg) {
		color: var(--color-text-muted);
	}
</style>
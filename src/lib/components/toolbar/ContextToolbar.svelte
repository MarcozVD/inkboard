<script lang="ts">
	// ContextToolbar — floating toolbar above the selection, adapts to object type.
	// DESIGN.md § Context Toolbar: [color] [text] [duplicate] [lock] [...] per type.
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/Icon.svelte';

	export interface CtxAction {
		id: string;
		icon: IconName;
		label: string;
		onClick: () => void;
		active?: boolean;
	}

	let {
		x,
		y,
		actions
	}: {
		x: number;
		y: number;
		actions: CtxAction[];
	} = $props();

	let barEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!barEl || x === -1) return;
		const r = barEl.getBoundingClientRect();
		const vw = window.innerWidth;
		// clamp horizontally; keep above the object (y - height - 8)
		barEl.style.left = `${Math.max(8, Math.min(x - r.width / 2, vw - r.width - 8))}px`;
		barEl.style.top = `${Math.max(8, y - r.height - 8)}px`;
	});
</script>

{#if x !== -1 && y !== -1 && actions.length > 0}
	<div class="ctx-toolbar" bind:this={barEl} role="toolbar">
		{#each actions as a}
			<button
				class="ctx-btn"
				class:active={a.active}
				title={a.label}
				aria-label={a.label}
				onclick={a.onClick}
			>
				<Icon name={a.icon} size={15} />
			</button>
		{/each}
	</div>
{/if}

<style>
	.ctx-toolbar {
		position: fixed;
		display: flex;
		align-items: center;
		gap: 1px;
		padding: 3px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		z-index: 60;
		animation: ct-in var(--dur-micro) var(--ease-out);
	}

	@keyframes ct-in {
		from {
			opacity: 0;
			transform: translateY(3px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.ctx-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		transition:
			background var(--dur-micro) var(--ease-out),
			color var(--dur-micro) var(--ease-out);
	}

	.ctx-btn:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.ctx-btn.active {
		background: var(--color-surface-active);
		color: var(--color-accent);
	}
</style>

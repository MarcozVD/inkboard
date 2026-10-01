<script lang="ts">
	// ContextToolbar — floating toolbar above the selection, adapts to object type.
	// DESIGN.md § Context Toolbar: style controls + [duplicate] [layer] [delete].
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/Icon.svelte';
	import StyleControls from './StyleControls.svelte';
	import type { StyleControl } from '$lib/board/styleControls';

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
		bottom = 0,
		offsetX = 0,
		offsetY = 0,
		actions,
		style = []
	}: {
		x: number;
		y: number;
		/** selection bottom in canvas-local coords (for below-placement) */
		bottom?: number;
		/** canvas box origin in viewport coords (the toolbar is position: fixed) */
		offsetX?: number;
		offsetY?: number;
		actions: CtxAction[];
		style?: StyleControl[];
	} = $props();

	let barEl: HTMLDivElement | undefined = $state();
	/** clearance above the selection top that keeps the rotate handle reachable */
	const ROTATE_CLEARANCE = 56;
	const MARGIN = 8;

	$effect(() => {
		if (!barEl || x === -1) return;
		const r = barEl.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const selectionTop = y + offsetY;
		const selectionBottom = bottom + offsetY;
		// above the selection, clear of the rotate handle; below if it does not fit
		let top = selectionTop - ROTATE_CLEARANCE - r.height;
		if (top < MARGIN) top = selectionBottom + MARGIN;
		top = Math.max(MARGIN, Math.min(top, vh - r.height - MARGIN));
		barEl.style.left = `${Math.max(MARGIN, Math.min(x + offsetX - r.width / 2, vw - r.width - MARGIN))}px`;
		barEl.style.top = `${top}px`;
	});
</script>

{#if x !== -1 && y !== -1 && (actions.length > 0 || style.length > 0)}
	<div class="ctx-toolbar" bind:this={barEl} role="toolbar">
		{#if style.length > 0}
			<StyleControls controls={style} />
			<span class="ctx-divider"></span>
		{/if}
		{#each actions as a (a.id)}
			<button class="ctx-btn" class:active={a.active} title={a.label} aria-label={a.label} onclick={a.onClick}>
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

	.ctx-divider {
		width: 1px;
		height: 18px;
		background: var(--color-border);
		margin: 0 3px;
	}
</style>

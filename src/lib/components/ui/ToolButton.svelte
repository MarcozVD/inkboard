<script lang="ts">
	// ToolButton — 32×32 tool control per DESIGN.md. Icon + tooltip + states.
	import Icon from './Icon.svelte';
	import type { IconName } from './Icon.svelte';

	let {
		icon,
		label,
		shortcut,
		active = false,
		disabled = false,
		testid,
		size = 18,
		onclick
	}: {
		icon: IconName;
		label: string;
		shortcut?: string;
		active?: boolean;
		disabled?: boolean;
		testid?: string;
		size?: number;
		onclick?: () => void;
	} = $props();
</script>

<button
	class="tool-btn"
	class:active
	class:disabled
	disabled={disabled}
	aria-label={label}
	aria-pressed={active}
	data-testid={testid}
	onclick={onclick}
>
	<Icon name={icon} size={size} />
	{#if !disabled}
		<span class="tooltip" role="tooltip">
			{label}{#if shortcut}<kbd>{shortcut}</kbd>{/if}
		</span>
	{/if}
</button>

<style>
	.tool-btn {
		position: relative;
		width: var(--control-size);
		height: var(--control-size);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		transition:
			background var(--dur-micro) var(--ease-out),
			color var(--dur-micro) var(--ease-out);
	}

	.tool-btn:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.tool-btn:focus-visible {
		outline: 1px solid var(--color-accent);
		outline-offset: -1px;
	}

	.tool-btn.active {
		background: var(--color-surface-active);
		color: var(--color-accent);
	}

	.tool-btn.disabled {
		opacity: 0.35;
		cursor: default;
		pointer-events: none;
	}

	/* tooltip */
	.tooltip {
		position: absolute;
		left: 100%;
		top: 50%;
		transform: translateY(-50%);
		margin-left: 8px;
		padding: 3px 7px;
		display: flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
		background: var(--color-surface-active);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--text-size-caption);
		color: var(--color-text);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--dur-micro) var(--ease-out);
		z-index: 100;
	}

	.tool-btn:hover .tooltip {
		opacity: 1;
		transition-delay: 350ms;
	}

	kbd {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: 3px;
		padding: 0 3px;
	}
</style>

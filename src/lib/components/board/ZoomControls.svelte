<script lang="ts">
	// ZoomControls — compact bottom-right controls per DESIGN.md: [-] [100%] [+] [Fit].
	import Icon from '$lib/components/ui/Icon.svelte';

	let {
		zoom,
		onZoomIn,
		onZoomOut,
		onReset,
		onFit
	}: {
		zoom: number; // 1 = 100%
		onZoomIn: () => void;
		onZoomOut: () => void;
		onReset: () => void;
		onFit: () => void;
	} = $props();

	// fit view (center + reset zoom)
</script>

<div class="zoom-controls">
	<button
		class="zc-btn"
		aria-label="Zoom out"
		onclick={onZoomOut}
	><Icon name="zoom-out" /></button>
	<button class="zc-label" title="Reset zoom to 100%" onclick={onReset}>
		{Math.round(zoom * 100)}%
	</button>
	<button
		class="zc-btn"
		aria-label="Zoom in"
		onclick={onZoomIn}
	><Icon name="zoom-in" /></button>
	<span class="zc-divider"></span>
	<button
		class="zc-btn"
		aria-label="Fit view"
		title="Fit view"
		onclick={onFit}
	><Icon name="fit" /></button>
</div>

<style>
	.zoom-controls {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 36px;
		padding: 0 4px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
	}

	.zc-btn {
		width: 30px;
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

	.zc-btn:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.zc-label {
		min-width: 44px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 6px;
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: var(--text-size-caption);
		color: var(--color-text-muted);
		transition:
			background var(--dur-micro) var(--ease-out),
			color var(--dur-micro) var(--ease-out);
	}

	.zc-label:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.zc-divider {
		width: 1px;
		height: 18px;
		background: var(--color-border);
		margin: 0 3px;
	}
</style>

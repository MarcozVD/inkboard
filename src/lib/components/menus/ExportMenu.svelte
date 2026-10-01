<script lang="ts">
	// ExportMenu — export/import popover anchored under the floating toolbar.
	import type { ExportFormat } from '$lib/io/transfer';

	let {
		open,
		onExport,
		onImport
	}: {
		open: boolean;
		onExport: (format: ExportFormat) => void;
		onImport: () => void;
	} = $props();
</script>

{#if open}
	<div class="export-menu">
		<button data-testid="export-png" onclick={() => onExport('png')}>Export PNG</button>
		<button data-testid="export-svg" onclick={() => onExport('svg')}>Export SVG</button>
		<button data-testid="export-json" onclick={() => onExport('json')}>Export JSON</button>
		<div class="export-menu-divider"></div>
		<button data-testid="import-file" onclick={onImport}>Import file…</button>
	</div>
{/if}

<style>
	.export-menu {
		position: absolute;
		left: 64px;
		top: calc(var(--topbar-h) + 8px + 190px);
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		z-index: 25;
		min-width: 130px;
		animation: menu-in var(--dur-micro) var(--ease-out);
	}

	@keyframes menu-in {
		from {
			opacity: 0;
			transform: translateY(-3px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.export-menu button {
		width: 100%;
		padding: 6px 12px;
		text-align: left;
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		font-size: 13px;
	}

	.export-menu button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.export-menu-divider {
		height: 1px;
		background: var(--color-border);
		margin: 3px 0;
	}
</style>

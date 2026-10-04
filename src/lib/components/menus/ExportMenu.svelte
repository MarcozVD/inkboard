<script lang="ts">
	// ExportMenu — compact export options (M2-09) + import actions.
	// `.inkboard` (M2-06) is Tauri-only; JSON import (M2-07) works everywhere.
	import { isTauri, type ExportFormat, type ExportImageOptions, type ImportMode } from '$lib/io/transfer';
	import { EXPORT_MODES, EXPORT_SCALES, type ExportMode, type ExportScale } from '$lib/io/exportRegion';

	let {
		open,
		onExportImage,
		onExport,
		onImport
	}: {
		open: boolean;
		onExportImage: (options: ExportImageOptions) => void;
		onExport: (format: ExportFormat) => void;
		onImport: (mode?: ImportMode) => void;
	} = $props();

	let format = $state<'png' | 'jpeg' | 'svg' | 'pdf'>('png');
	let mode = $state<ExportMode>('board');
	let scale = $state<ExportScale>(2);
	let quality = $state('0.9');
	let transparent = $state(false);

	function run() {
		onExportImage({ format, mode, scale, quality: Number(quality), transparent });
	}
</script>

{#if open}
	<div class="export-menu">
		<span class="em-title">Export image</span>
		<div class="em-row">
			<label class="em-label" for="em-format">Format</label>
			<select
				id="em-format"
				class="em-select"
				data-testid="export-format"
				value={format}
				onchange={(e) => (format = (e.target as HTMLSelectElement).value as 'png' | 'jpeg' | 'svg' | 'pdf')}
			>
				<option value="png">PNG</option>
				<option value="jpeg">JPG</option>
				<option value="svg">SVG</option>
				{#if isTauri()}
					<option value="pdf">PDF</option>
				{/if}
			</select>
		</div>
		<div class="em-row">
			<label class="em-label" for="em-mode">Area</label>
			<select
				id="em-mode"
				class="em-select"
				data-testid="export-mode"
				value={mode}
				onchange={(e) => (mode = (e.target as HTMLSelectElement).value as ExportMode)}
			>
				{#each EXPORT_MODES as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
		<div class="em-row">
			<label class="em-label" for="em-scale">Scale</label>
			<select
				id="em-scale"
				class="em-select"
				data-testid="export-scale"
				value={scale}
				onchange={(e) => (scale = Number((e.target as HTMLSelectElement).value) as ExportScale)}
			>
				{#each EXPORT_SCALES as option (option)}
					<option value={option}>{option}×</option>
				{/each}
			</select>
		</div>
		{#if format === 'jpeg'}
			<label class="em-row">
				<span class="em-label">Quality</span>
				<select class="em-select" data-testid="export-quality" bind:value={quality}>
					<option value="0.7">Low</option>
					<option value="0.9">High</option>
					<option value="0.98">Maximum</option>
				</select>
			</label>
		{:else if format !== 'pdf'}
			<label class="em-check">
				<input type="checkbox" data-testid="export-transparent" bind:checked={transparent} />
				Transparent background
			</label>
		{/if}
		<button class="em-run" data-testid="export-run" onclick={run}>Export</button>
		{#if isTauri()}
			<button data-testid="export-inkboard" onclick={() => onExport('inkboard')}>Export .inkboard</button>
		{/if}
		<button data-testid="export-json" onclick={() => onExport('json')}>Export JSON</button>
		<div class="export-menu-divider"></div>
		<button data-testid="import-file" onclick={() => onImport('new')}>Import as new board…</button>
		<button data-testid="insert-file" onclick={() => onImport('current')}>Insert into board…</button>
	</div>
{/if}

<style>
	.export-menu {
		position: absolute;
		left: 64px;
		top: calc(var(--topbar-h) + 8px + 190px);
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		z-index: 25;
		width: 208px;
		animation: menu-in var(--dur-micro) var(--ease-out);
	}

	.em-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
		padding: 0 4px 2px;
	}

	.em-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 4px;
	}

	.em-label {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.em-select {
		flex: 1;
		max-width: 118px;
		padding: 3px 6px;
		background: var(--color-bg);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: 12px;
	}

	.em-check {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 4px;
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.em-run {
		margin-top: 2px;
		padding: 6px 12px;
		border-radius: var(--radius-md);
		background: var(--color-surface-hover);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		font-size: 13px;
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
</style>

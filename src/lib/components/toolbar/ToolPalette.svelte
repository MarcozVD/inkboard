<script lang="ts">
	// ToolPalette — contextual popover for the active tool: shapes, sticky colors
	// and the tool's last-used style controls (§M1-03).
	import { SHAPE_TYPES } from '$lib/tools/ShapeTool';
	import { stickyNoteColors } from '$lib/objects/renderers';
	import type { ShapeType } from '$lib/objects/types';
	import StyleControls from './StyleControls.svelte';
	import type { StyleControl } from '$lib/board/styleControls';

	let {
		activeTool,
		currentShape,
		stickyColor,
		styleControls = [],
		onShape,
		onStickyColor
	}: {
		activeTool: string;
		currentShape: ShapeType;
		stickyColor: string | undefined;
		styleControls?: StyleControl[];
		onShape: (shape: ShapeType) => void;
		onStickyColor: (index: number) => void;
	} = $props();

	const icons: Record<ShapeType, string> = {
		rect: '▭',
		ellipse: '⬭',
		line: '╱',
		arrow: '➡',
		triangle: '△',
		diamond: '◇',
		star: '★',
		polygon: '⬡'
	};
</script>

{#if activeTool === 'shape' || activeTool === 'sticky' || styleControls.length > 0}
	<div class="tool-palette">
		{#if activeTool === 'shape'}
			<div class="shape-palette">
				{#each SHAPE_TYPES as shape}
					<button class:active={currentShape === shape} title={shape} onclick={() => onShape(shape)}>
						{icons[shape]}
					</button>
				{/each}
			</div>
		{:else if activeTool === 'sticky'}
			<div class="shape-palette">
				{#each stickyNoteColors() as color, i}
					<button
						class:active={stickyColor === color}
						title={'Color ' + i}
						style="background: {color}; width: 26px; height: 26px; border-radius: 6px; border: 2px solid {stickyColor === color ? '#ffffff' : 'transparent'};"
						onclick={() => onStickyColor(i)}
					></button>
				{/each}
			</div>
		{/if}
		{#if styleControls.length > 0}
			<div class="style-palette">
				<StyleControls controls={styleControls} />
			</div>
		{/if}
	</div>
{/if}

<style>
	.tool-palette {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
	}

	.shape-palette {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		align-self: center;
	}

	.shape-palette button {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		font-size: 14px;
	}

	.shape-palette button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.shape-palette button.active {
		background: var(--color-surface-active);
		color: var(--color-accent);
	}

	.style-palette {
		padding: 4px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
	}
</style>

<script lang="ts">
	// ToolBar — floating vertical tool strip (DESIGN.md § ToolBar).
	// Renders tools with testids, a create button, an export button,
	// and a contextual popover (children) for the active tool.
	import ToolButton from '$lib/components/ui/ToolButton.svelte';
	import type { IconName } from '$lib/components/ui/Icon.svelte';

	export interface ToolItem {
		id: string;
		icon: IconName;
		label: string;
		shortcut?: string;
	}

	let {
		tools,
		activeTool,
		onSelectTool,
		onCreate,
		onExport,
		exportActive = false,
		children
	}: {
		tools: ToolItem[];
		activeTool: string;
		onSelectTool: (id: string) => void;
		onCreate?: () => void;
		onExport?: () => void;
		exportActive?: boolean;
		children?: import('svelte').Snippet;
	} = $props();
</script>

<div class="toolbar-float">
	<div class="tool-strip">
		{#if onCreate}
			<ToolButton icon="plus" label="Create" testid="create" active={false} onclick={onCreate} />
			<span class="strip-divider"></span>
		{/if}
		{#each tools as tool}
			<ToolButton
				icon={tool.icon}
				label={tool.label}
				shortcut={tool.shortcut}
				active={tool.id === activeTool}
				testid={`tool-${tool.id}`}
				onclick={() => onSelectTool(tool.id)}
			/>
		{/each}
		{#if onExport}
			<span class="strip-divider"></span>
			<ToolButton
				icon="export"
				label="Export / Import"
				testid="export"
				active={exportActive}
				onclick={onExport}
			/>
		{/if}
	</div>
	{#if children}
		<div class="toolbar-popover">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.toolbar-float {
		position: absolute;
		left: 8px;
		top: calc(var(--topbar-h) + 8px);
		display: flex;
		align-items: flex-start;
		gap: 4px;
		z-index: 20;
		pointer-events: none;
	}

	.tool-strip {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		pointer-events: auto;
	}

	.strip-divider {
		width: 100%;
		height: 1px;
		background: var(--color-border);
		margin: 3px 0;
	}

	.toolbar-popover {
		pointer-events: auto;
	}
</style>
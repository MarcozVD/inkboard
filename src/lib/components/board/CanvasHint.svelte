<script lang="ts">
	// CanvasHint — empty-state hint shown while the board has no objects.
	import Icon from '$lib/components/ui/Icon.svelte';

	let { visible }: { visible: boolean } = $props();
</script>

{#if visible}
	<div class="canvas-hint" aria-hidden="true">
		<span class="hint-mark"><Icon name="pen" size={20} /></span>
		<p>Start creating — draw, write, or add a sticky note</p>
	</div>
{/if}

<style>
	.canvas-hint {
		position: absolute;
		left: 50%;
		top: 46%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		pointer-events: none;
		color: var(--color-text-muted);
		opacity: 0.55;
		transition: opacity var(--dur-normal) var(--ease-out);
	}

	.hint-mark {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-border);
		border-radius: 14px;
		background: var(--color-surface);
	}

	.canvas-hint p {
		margin: 0;
		font-size: 13px;
	}
</style>

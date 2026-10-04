<script lang="ts">
	// CanvasHint — empty-state onboarding while the board has no objects (M4-07).
	import Icon from '$lib/components/ui/Icon.svelte';

	let { visible }: { visible: boolean } = $props();
</script>

{#if visible}
	<div class="canvas-hint" data-testid="canvas-onboarding">
		<span class="hint-mark"><Icon name="pen" size={20} /></span>
		<p class="hint-title">Start creating</p>
		<ul class="hint-list">
			<li><kbd>P</kbd> Draw with the pen</li>
			<li><kbd>?</kbd> See all shortcuts</li>
			<li><kbd>+</kbd> Add text, shapes, stickies or images</li>
		</ul>
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
		opacity: 0.7;
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

	.hint-title {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--color-text);
	}

	.hint-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
	}

	.hint-list li {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.hint-list kbd {
		min-width: 18px;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: 3px;
		padding: 1px 4px;
		background: var(--color-surface);
	}
</style>

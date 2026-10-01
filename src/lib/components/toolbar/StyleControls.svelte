<script lang="ts">
	// StyleControls — renders style descriptors (swatches, choices, ranges).
	import type { StyleControl } from '$lib/board/styleControls';

	let { controls, orientation = 'horizontal' }: { controls: StyleControl[]; orientation?: 'horizontal' | 'vertical' } =
		$props();
</script>

{#if controls.length > 0}
	<div class="style-controls" class:vertical={orientation === 'vertical'}>
		{#each controls as c (c.testid)}
			{#if c.kind === 'swatch'}
				{#if c.color === 'none'}
					<button
						class="style-choice"
						class:active={c.active}
						title={c.label}
						aria-label={c.label}
						data-testid={c.testid}
						onclick={c.onPick}>∅</button
					>
				{:else if c.color === 'ink'}
					<button
						class="style-swatch"
						class:active={c.active}
						style="background: var(--ink)"
						title={c.label}
						aria-label={c.label}
						data-testid={c.testid}
						onclick={c.onPick}
					></button>
				{:else}
					<button
						class="style-swatch"
						class:active={c.active}
						style="background: {c.color}"
						title={c.label}
						aria-label={c.label}
						data-testid={c.testid}
						onclick={c.onPick}
					></button>
				{/if}
			{:else if c.kind === 'choice'}
				<button
					class="style-choice"
					class:active={c.active}
					title={c.label}
					aria-label={c.label}
					data-testid={c.testid}
					onclick={c.onClick}
				>
					{c.text}
				</button>
			{:else}
				<input
					class="style-range"
					type="range"
					min={c.min}
					max={c.max}
					step={c.step}
					value={c.value}
					title={c.label}
					aria-label={c.label}
					data-testid={c.testid}
					onchange={(e) => c.onInput(Number(e.currentTarget.value))}
				/>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.style-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
		max-width: 148px;
	}

	.style-swatch {
		width: 18px;
		height: 18px;
		border-radius: 5px;
		border: 1px solid var(--color-border);
		transition: transform var(--dur-micro) var(--ease-out);
	}

	.style-swatch.active {
		border: 2px solid #ffffff;
		transform: scale(1.1);
	}

	.style-choice {
		min-width: 20px;
		height: 20px;
		padding: 0 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		color: var(--color-text-muted);
		font-size: 11px;
	}

	.style-choice:hover {
		background: var(--color-surface-hover);
		color: var(--color-text);
	}

	.style-choice.active {
		background: var(--color-surface-active);
		border-color: var(--color-border);
		color: var(--color-accent);
	}

	.style-range {
		width: 64px;
		height: 18px;
		accent-color: var(--color-accent);
	}
</style>

<script lang="ts">
	// CommandPalette — Ctrl+K palette per DESIGN.md § CommandPalette.
	// Search tools, actions, boards, templates, settings.
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { IconName } from '$lib/components/ui/Icon.svelte';

	export interface PaletteCmd {
		id: string;
		label: string;
		hint?: string;
		icon?: IconName;
		action: () => void;
		group?: string;
	}

	let {
		open,
		commands,
		onClose
	}: {
		open: boolean;
		commands: PaletteCmd[];
		onClose: () => void;
	} = $props();

	let query = $state('');
	let selected = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();

	const filtered = $derived(
		query.trim()
			? commands.filter((c) => (c.label + ' ' + (c.hint ?? '') + ' ' + (c.group ?? '')).toLowerCase().includes(query.toLowerCase()))
			: commands
	);

	$effect(() => {
		if (open && inputEl) {
			query = '';
			selected = 0;
			inputEl.focus();
		}
	});

	function run(cmd: PaletteCmd) {
		onClose();
		cmd.action();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, filtered.length - 1); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); }
		else if (e.key === 'Enter') { e.preventDefault(); if (filtered[selected]) run(filtered[selected]); }
		else if (e.key === 'Escape') { onClose(); }
	}

	let groups = $derived([...new Set(filtered.map((c) => c.group ?? ''))]);
</script>

{#if open}
	<div
		class="palette-backdrop"
		role="presentation"
		onclick={onClose}
		onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
	>
		<div
			class="palette"
			role="dialog"
			aria-label="Command palette"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={onKey}
		>
			<div class="palette-input">
				<Icon name="search" size={16} />
				<input
					bind:this={inputEl}
					placeholder="Type a command…"
					value={query}
					oninput={(e) => { query = (e.target as HTMLInputElement).value; selected = 0; }}
				/>
				<kbd>Esc</kbd>
			</div>
			<div class="palette-results">
				{#if filtered.length === 0}
					<div class="palette-empty">No results for “{query}”</div>
				{:else}
					{#each groups as g}
						{#if g}
							<div class="palette-group">{g}</div>
						{/if}
						{#each filtered.filter((c) => (c.group ?? '') === g) as cmd, i}
							{@const idx = filtered.indexOf(cmd)}
							<button
								class="palette-item"
								class:selected={idx === selected}
								onmouseenter={() => (selected = idx)}
								onclick={() => run(cmd)}
							>
								{#if cmd.icon}
									<Icon name={cmd.icon} size={15} />
								{/if}
								<span class="pi-label">{cmd.label}</span>
								{#if cmd.hint}
									<span class="pi-hint">{cmd.hint}</span>
								{/if}
							</button>
						{/each}
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.palette-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 200;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 15vh;
		animation: pd-in var(--dur-micro) var(--ease-out);
	}

	@keyframes pd-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.palette {
		width: 480px;
		max-width: calc(100vw - 32px);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		overflow: hidden;
		animation: palette-in var(--dur-normal) var(--ease-out);
	}

	@keyframes palette-in {
		from {
			opacity: 0;
			transform: translateY(-6px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.palette-input {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text-muted);
	}

	.palette-input input {
		flex: 1;
		border: none;
		outline: none;
		background: none;
		font-size: 14px;
		color: var(--color-text);
	}

	.palette-input input::placeholder {
		color: var(--color-text-muted);
	}

	.palette-input kbd {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: 3px;
		padding: 1px 4px;
	}

	.palette-results {
		max-height: 320px;
		overflow-y: auto;
		padding: 6px;
	}

	.palette-group {
		padding: 6px 10px 4px;
		font-size: var(--text-size-label);
		font-weight: 500;
		letter-spacing: 0.02em;
		color: var(--color-text-muted);
		text-transform: uppercase;
	}

	.palette-item {
		width: 100%;
		height: 32px;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 10px;
		border-radius: var(--radius-md);
		font-size: var(--text-size-body);
		color: var(--color-text);
		text-align: left;
	}

	.palette-item.selected {
		background: var(--color-surface-hover);
	}

	.palette-item :global(svg) {
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.pi-label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pi-hint {
		font-size: var(--text-size-caption);
		color: var(--color-text-muted);
	}

	.palette-empty {
		padding: 20px;
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--text-size-body);
	}
</style>

<script lang="ts">
	// SettingsPanel — slide-in from right, DESIGN.md § Settings.
	// Sections: Canvas, Interaction, Appearance, Data, About.
	import Icon from '$lib/components/ui/Icon.svelte';

	let {
		open,
		onClose,
		grid,
		onGridChange,
		background,
		onBgChange,
		theme,
		onThemeChange
	}: {
		open: boolean;
		onClose: () => void;
		grid: { enabled: boolean; size: number; color: string; opacity: number };
		onGridChange: (g: typeof grid) => void;
		background: string;
		onBgChange: (bg: string) => void;
		theme: 'dark' | 'light' | 'system';
		onThemeChange: (t: 'dark' | 'light' | 'system') => void;
	} = $props();

	let panelEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!open) return;
		function onDocClick(e: MouseEvent) {
			if (panelEl && !panelEl.contains(e.target as Node)) onClose();
		}
		document.addEventListener('mousedown', onDocClick);
		return () => document.removeEventListener('mousedown', onDocClick);
	});
</script>

{#if open}
	<div
		class="settings-overlay"
		role="presentation"
		onclick={onClose}
		onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
	>
		<div
			class="settings-panel"
			bind:this={panelEl}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-label="Settings"
			tabindex="-1"
		>
			<div class="sp-header">
				<span class="sp-title">Settings</span>
				<button class="sp-close" aria-label="Close settings" onclick={onClose}>
					<Icon name="close" size={14} />
				</button>
			</div>

			<div class="sp-body">
				<!-- Canvas -->
				<section class="sp-section">
					<h3 class="sp-sec-title">Canvas</h3>
					<div class="sp-row">
						<label class="sp-label" for="sp-grid-toggle">Grid</label>
						<label class="sp-toggle">
							<input id="sp-grid-toggle" type="checkbox" checked={grid.enabled} onchange={(e) => onGridChange({ ...grid, enabled: (e.target as HTMLInputElement).checked })} />
							<span class="sp-toggle-track"></span>
						</label>
					</div>
					{#if grid.enabled}
						<div class="sp-row">
							<label class="sp-label" for="sp-grid-size">Grid size</label>
							<input id="sp-grid-size" type="number" class="sp-input" value={grid.size} min="8" max="128" onchange={(e) => onGridChange({ ...grid, size: parseInt((e.target as HTMLInputElement).value) || 32 })} />
						</div>
						<div class="sp-row">
							<label class="sp-label" for="sp-grid-opacity">Grid opacity</label>
							<input id="sp-grid-opacity" type="range" class="sp-range" value={grid.opacity * 100} min="0" max="100" oninput={(e) => onGridChange({ ...grid, opacity: parseInt((e.target as HTMLInputElement).value) / 100 })} />
							<span class="sp-value">{Math.round(grid.opacity * 100)}%</span>
						</div>
					{/if}
					<div class="sp-row">
						<label class="sp-label" for="sp-bg">Background</label>
						<div class="sp-color-row">
							<input id="sp-bg" type="color" class="sp-color" value={background} onchange={(e) => onBgChange((e.target as HTMLInputElement).value)} />
							<span class="sp-value">{background}</span>
						</div>
					</div>
				</section>

				<!-- Appearance -->
				<section class="sp-section">
					<h3 class="sp-sec-title">Appearance</h3>
					<div class="sp-row">
						<label class="sp-label" for="sp-theme">Theme</label>
						<select id="sp-theme" class="sp-select" value={theme} onchange={(e) => onThemeChange((e.target as HTMLSelectElement).value as 'dark' | 'light' | 'system')}>
							<option value="dark">Dark</option>
							<option value="light">Light</option>
							<option value="system">System</option>
						</select>
					</div>
				</section>

				<!-- Data -->
				<section class="sp-section">
					<h3 class="sp-sec-title">Data</h3>
					<div class="sp-row">
						<button class="sp-btn" onclick={() => { /* export */ }}>Export board…</button>
					</div>
					<div class="sp-row">
						<button class="sp-btn" onclick={() => { /* import */ }}>Import file…</button>
					</div>
				</section>

				<!-- About -->
				<section class="sp-section">
					<h3 class="sp-sec-title">About</h3>
					<div class="sp-about">
						<p>Inkboard v0.1.0</p>
						<p>Monochrome Workshop</p>
					</div>
				</section>
			</div>
		</div>
	</div>
{/if}

<style>
	.settings-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		z-index: 150;
		display: flex;
		justify-content: flex-end;
		animation: so-in var(--dur-micro) var(--ease-out);
	}
	@keyframes so-in { from { opacity: 0; } to { opacity: 1; } }

	.settings-panel {
		width: 300px;
		max-width: 85vw;
		height: 100%;
		background: var(--color-surface);
		border-left: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: sp-in var(--dur-normal) var(--ease-out);
	}
	@keyframes sp-in { from { transform: translateX(100%); } to { transform: translateX(0); } }

	.sp-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--color-border);
	}
	.sp-title { font-size: 15px; font-weight: 600; color: var(--color-text); }
	.sp-close {
		width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
		border-radius: var(--radius-md); color: var(--color-text-muted);
	}
	.sp-close:hover { background: var(--color-surface-hover); color: var(--color-text); }

	.sp-body {
		flex: 1; overflow-y: auto; padding: 8px 0;
	}

	.sp-section { padding: 0 16px; margin-bottom: 16px; }
	.sp-sec-title {
		font-size: var(--text-size-label); font-weight: 500; letter-spacing: 0.02em;
		color: var(--color-text-muted); text-transform: uppercase; margin: 12px 0 8px;
	}
	.sp-row {
		display: flex; align-items: center; justify-content: space-between;
		gap: 8px; min-height: 32px; padding: 2px 0;
	}
	.sp-label { font-size: 13px; color: var(--color-text); }
	.sp-input {
		width: 60px; padding: 3px 6px; border: 1px solid var(--color-border);
		border-radius: var(--radius-sm); background: var(--color-bg);
		color: var(--color-text); font-size: 12px; text-align: right;
	}
	.sp-range { flex: 1; max-width: 100px; accent-color: var(--color-accent); }
	.sp-value { font-size: 11px; color: var(--color-text-muted); min-width: 30px; text-align: right; }
	.sp-color-row { display: flex; align-items: center; gap: 6px; }
	.sp-color { width: 28px; height: 28px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 0; cursor: pointer; background: none; }
	.sp-select {
		padding: 3px 8px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
		background: var(--color-bg); color: var(--color-text); font-size: 12px;
	}
	.sp-btn {
		width: 100%; padding: 6px 12px; text-align: left; border-radius: var(--radius-md);
		font-size: 13px; color: var(--color-text); transition: background var(--dur-micro) var(--ease-out);
	}
	.sp-btn:hover { background: var(--color-surface-hover); }

	.sp-toggle { position: relative; display: inline-block; width: 32px; height: 18px; cursor: pointer; }
	.sp-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
	.sp-toggle-track {
		position: absolute; inset: 0; background: var(--color-bg); border: 1px solid var(--color-border);
		border-radius: 9px; transition: background var(--dur-micro) var(--ease-out);
	}
	.sp-toggle input:checked + .sp-toggle-track { background: var(--color-accent); border-color: var(--color-accent); }
	.sp-toggle-track::after {
		content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px;
		background: var(--color-text); border-radius: 50%; transition: transform var(--dur-micro) var(--ease-out);
	}
	.sp-toggle input:checked + .sp-toggle-track::after { transform: translateX(14px); }

	.sp-about { padding: 8px 0; }
	.sp-about p { font-size: 12px; color: var(--color-text-muted); margin: 2px 0; }
</style>
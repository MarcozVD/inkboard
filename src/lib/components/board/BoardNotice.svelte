<script lang="ts">
	// BoardNotice — transient in-board banner (M2-11 honest import scope).
	import { ui } from '$lib/stores/ui.svelte';
</script>

{#if ui.notice}
	<div class="board-notice" role="status" data-testid="board-notice">{ui.notice}</div>
{/if}

<style>
	.board-notice {
		position: absolute;
		top: calc(var(--topbar-h) + 12px);
		left: 50%;
		transform: translateX(-50%);
		max-width: 520px;
		padding: 8px 14px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
		color: var(--color-text);
		font-size: 13px;
		z-index: 30;
	}
</style>

<script lang="ts">
	import { page } from '$app/stores';
	import BoardCanvas from '$lib/components/BoardCanvas.svelte';

	const boardId = $derived($page.params.id ?? '');
</script>

<svelte:head>
	<title>Inkboard — {boardId?.slice(0, 8)}</title>
</svelte:head>

<div class="board-view">
	<BoardCanvas {boardId} />
</div>

<style>
	.board-view {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
</style>
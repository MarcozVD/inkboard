<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import TopBar from '$lib/components/TopBar.svelte';
	import { page } from '$app/stores';

	let { children } = $props();

	const boardId = $derived($page.params.id);
	const title = $derived(boardId ? `Inkboard — ${boardId.slice(0, 8)}` : 'Inkboard');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="description" content="Inkboard — infinite whiteboard" />
</svelte:head>

<TopBar {title} />
<main class="app-content">
	{@render children()}
</main>

<style>
	.app-content {
		height: calc(100vh - 36px);
		overflow: hidden;
	}
</style>
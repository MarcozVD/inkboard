<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import TopBar from '$lib/components/app/TopBar.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="description" content="Inkboard — infinite whiteboard" />
</svelte:head>

<TopBar />
<main class="app-content">
	{@render children()}
</main>

<style>
	.app-content {
		height: calc(100vh - var(--topbar-h));
		overflow: hidden;
	}
</style>

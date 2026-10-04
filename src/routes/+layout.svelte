<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import TopBar from '$lib/components/app/TopBar.svelte';

	let { children } = $props();

	// hydration signal for E2E/global setup: no interaction before this point
	onMount(() => {
		document.body.dataset.ready = 'true';
	});
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

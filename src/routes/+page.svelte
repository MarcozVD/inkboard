<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let boardName = $state('');

	// Placeholder: in Fase 12 this lists real boards from the Rust backend
	$effect(() => {
		document.title = 'Inkboard — Home';
	});
</script>

<div class="home">
	<header>
		<h1>Inkboard</h1>
		<p class="subtitle">Infinite whiteboard</p>
	</header>

	<main>
		<section class="board-list">
			<h2>Boards</h2>
			<div class="empty-state">
				<p>No boards yet. Create your first board to get started.</p>
				<button class="btn-primary" onclick={() => {
					const id = crypto.randomUUID();
					goto(`/board/${id}`);
				}}>
					+ New Board
				</button>
			</div>
		</section>
	</main>
</div>

<style>
	.home {
		display: flex;
		flex-direction: column;
		height: 100vh;
		align-items: center;
		justify-content: center;
	}

	header {
		text-align: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
		color: var(--text-primary);
	}

	.subtitle {
		color: var(--text-secondary);
		margin: 0.25rem 0 0;
	}

	.board-list {
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.5rem;
		min-width: 320px;
	}

	.board-list h2 {
		margin: 0 0 1rem;
		font-size: 1rem;
		font-weight: 600;
	}

	.empty-state {
		text-align: center;
		color: var(--text-secondary);
	}

	.btn-primary {
		background: var(--accent);
		color: #fff;
		border: none;
		padding: 0.5rem 1.25rem;
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
		margin-top: 0.75rem;
	}

	.btn-primary:hover {
		filter: brightness(1.1);
	}
</style>
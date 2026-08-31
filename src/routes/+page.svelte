<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { listBoards, freshBoard } from '$lib/io/persistence';
	import { saveBoard } from '$lib/io/persistence';
	import type { BoardMeta } from '$lib/objects/types';

	let boards = $state<BoardMeta[]>([]);
	let loading = $state(true);

	onMount(async () => {
		try {
			const list = await listBoards();
			boards = list.map((b) => ({
				id: b.id,
				name: b.name,
				createdAt: b.updated_at,
				updatedAt: b.updated_at,
				objectCount: 0
			}));
		} finally {
			loading = false;
		}
	});

	async function createBoard() {
		const id = crypto.randomUUID();
		const board = freshBoard(id, `Board ${boards.length + 1}`);
		// persist immediately so the board shows up in the list
		try {
			await saveBoard(board);
		} catch {
			// localStorage/tauri fallback — still navigate
		}
		goto(`/board/${id}`);
	}

	function formatDate(ts: number): string {
		if (!ts) return '';
		return new Date(ts).toLocaleString();
	}
</script>

<svelte:head>
	<title>Inkboard — Home</title>
</svelte:head>

<div class="home">
	<header>
		<h1>Inkboard</h1>
		<p class="subtitle">Infinite whiteboard</p>
	</header>

	<main>
		<section class="board-list">
			<div class="list-header">
				<h2>Boards</h2>
				<button class="btn-primary" data-testid="new-board" onclick={createBoard}>+ New Board</button>
			</div>

			{#if loading}
				<p class="empty-state">Loading…</p>
			{:else if boards.length === 0}
				<div class="empty-state">
					<p>No boards yet. Create your first board to get started.</p>
				</div>
			{:else}
				<ul data-testid="board-list">
					{#each boards as board}
						<li>
							<button class="board-item" data-testid="board-{board.id}" onclick={() => goto(`/board/${board.id}`)}>
								<span class="board-name">{board.name}</span>
								<span class="board-date">{formatDate(board.updatedAt)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</main>
</div>

<style>
	.home {
		display: flex;
		flex-direction: column;
		height: 100%;
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
		padding: 1.25rem;
		min-width: 380px;
		max-width: 90vw;
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.list-header h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 50vh;
		overflow-y: auto;
	}

	.board-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius);
		text-align: left;
	}

	.board-item:hover {
		background: var(--bg-hover);
	}

	.board-name {
		font-weight: 500;
	}

	.board-date {
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.empty-state {
		text-align: center;
		color: var(--text-secondary);
		padding: 1rem 0;
	}

	.btn-primary {
		background: var(--accent);
		color: #fff;
		border: none;
		padding: 0.45rem 1rem;
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
	}

	.btn-primary:hover {
		filter: brightness(1.1);
	}
</style>
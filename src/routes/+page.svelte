<script lang="ts">
	// Home — Board Picker per DESIGN.md § Multi-board UI.
	// Grid of boards with thumbnails, search, favorites, empty state.
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { listBoards, freshBoard } from '$lib/io/persistence';
	import { saveBoard } from '$lib/io/persistence';
	import type { BoardMeta } from '$lib/objects/types';
	import Icon from '$lib/components/ui/Icon.svelte';

	let boards = $state<BoardMeta[]>([]);
	let loading = $state(true);
	let query = $state('');
	let favs = $state<Set<string>>(new Set());

	const FAV_KEY = 'inkboard:favorites';

	function loadFavs() {
		try {
			favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'));
		} catch {
			favs = new Set();
		}
	}
	function persistFavs() {
		localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
	}
	function toggleFav(id: string, e: MouseEvent) {
		e.stopPropagation();
		if (favs.has(id)) favs.delete(id);
		else favs.add(id);
		favs = new Set(favs);
		persistFavs();
	}

	const filtered = $derived(
		query.trim()
			? boards.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
			: boards
	);

	onMount(async () => {
		loadFavs();
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
		try {
			await saveBoard(board);
		} catch {
			// localStorage/tauri fallback — still navigate
		}
		goto(`/board/${id}`);
	}

	function formatDate(ts: number): string {
		if (!ts) return '';
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	// deterministic monochrome thumbnail tint from board id
	function thumbTint(id: string): string {
		let h = 0;
		for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
		return `hsl(${h} 12% 32%)`;
	}
</script>

<svelte:head>
	<title>Inkboard — Home</title>
</svelte:head>

<div class="home">
	<header class="home-header">
		<div class="home-title">
			<Icon name="image" size={26} />
			<div>
				<h1>Inkboard</h1>
				<p class="subtitle">Infinite whiteboard</p>
			</div>
		</div>
	</header>

	<main class="home-main">
		{#if loading}
			<div class="home-empty" aria-live="polite">
				<p class="empty-hint">Loading boards…</p>
			</div>
		{:else if boards.length === 0}
			<!-- Empty state per DESIGN.md § Empty States -->
			<div class="home-empty">
				<div class="empty-mark"><Icon name="sticky" size={28} /></div>
				<h2>Start creating</h2>
				<p class="empty-hint">Open a blank canvas and start thinking visually.</p>
				<div class="empty-actions">
					<button class="btn-primary" data-testid="new-board" onclick={createBoard}>
						<Icon name="plus" size={15} /> New board
					</button>
				</div>
			</div>
		{:else}
			<section class="board-picker">
				<div class="picker-header">
					<div class="search-box">
						<Icon name="search" size={15} />
						<input
							placeholder="Search boards…"
							value={query}
							oninput={(e) => (query = (e.target as HTMLInputElement).value)}
						/>
					</div>
					<button class="btn-primary" data-testid="new-board" onclick={createBoard}>
						<Icon name="plus" size={15} /> New board
					</button>
				</div>

				{#if filtered.length === 0}
					<div class="home-empty">
						<p class="empty-hint">No boards match “{query}”.</p>
					</div>
				{:else}
					<ul class="board-grid" data-testid="board-list">
						{#each filtered as board}
							<li>
								<div
									class="board-card"
									data-testid="board-{board.id}"
									role="button"
									tabindex="0"
									onclick={() => goto(`/board/${board.id}`)}
									onkeydown={(e) => { if (e.key === 'Enter') goto(`/board/${board.id}`); }}
								>
									<span class="board-thumb" style="background: {thumbTint(board.id)}"></span>
									<span class="board-meta">
										<span class="board-name">{board.name}</span>
										<span class="board-sub">
											<span>{formatDate(board.updatedAt)}</span>
											{#if favs.has(board.id)}<span class="fav-dot">★</span>{/if}
										</span>
									</span>
									<button
										class="fav-btn"
										class:faved={favs.has(board.id)}
										aria-label={favs.has(board.id) ? 'Remove favorite' : 'Add favorite'}
										aria-pressed={favs.has(board.id)}
										onclick={(e) => toggleFav(board.id, e)}
									>★</button>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</main>
</div>

<style>
	.home {
		display: flex;
		flex-direction: column;
		height: 100%;
		align-items: center;
		padding: 48px 24px 24px;
		gap: 28px;
	}

	.home-header {
		text-align: center;
	}

	.home-title {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--color-accent);
	}

	.home-title :global(.brand-icon),
	.home-title :global(svg) {
		color: var(--color-accent);
	}

	.home-title h1 {
		font-size: 22px;
		font-weight: 700;
		margin: 0;
		text-align: left;
		color: var(--color-text);
	}

	.subtitle {
		color: var(--color-text-muted);
		margin: 2px 0 0;
		font-size: 13px;
		text-align: left;
	}

	.home-main {
		width: 100%;
		max-width: 900px;
		display: flex;
		justify-content: center;
	}

	.board-picker {
		width: 100%;
	}

	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 20px;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		max-width: 320px;
		height: 34px;
		padding: 0 10px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
	}

	.search-box input {
		flex: 1;
		border: none;
		outline: none;
		background: none;
		font-size: 13px;
		color: var(--color-text);
	}
	.search-box input::placeholder {
		color: var(--color-text-muted);
	}
	.search-box:focus-within {
		border-color: var(--color-accent);
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 34px;
		padding: 0 14px;
		background: var(--color-accent);
		color: var(--color-bg);
		border-radius: var(--radius-md);
		font-size: 13px;
		font-weight: 600;
		transition: opacity var(--dur-micro) var(--ease-out);
	}

	.btn-primary:hover {
		opacity: 0.85;
	}

	.board-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 14px;
		max-height: 60vh;
		overflow-y: auto;
	}

	.board-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 100%;
		padding: 10px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		text-align: left;
		transition:
			border-color var(--dur-micro) var(--ease-out),
			transform var(--dur-micro) var(--ease-out);
	}

	.board-card:hover {
		border-color: var(--color-surface-active);
		transform: translateY(-1px);
	}

	.board-thumb {
		width: 100%;
		aspect-ratio: 16 / 10;
		border-radius: var(--radius-md);
		background-size: 24px 24px;
		background-image: radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1px);
	}

	.board-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 0 2px;
	}

	.board-name {
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.board-sub {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--color-text-muted);
	}

	.fav-dot {
		color: var(--color-accent);
	}

	.fav-btn {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		font-size: 14px;
		color: rgba(255,255,255,0.7);
		opacity: 0;
		transition: opacity var(--dur-micro) var(--ease-out);
	}

	.board-card:hover .fav-btn {
		opacity: 1;
	}
	.fav-btn:hover {
		background: rgba(255,255,255,0.2);
	}
	.fav-btn.faved {
		opacity: 1;
		color: var(--color-accent);
	}

	.home-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		text-align: center;
		padding: 60px 20px;
	}

	.empty-mark {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--color-border);
		border-radius: 16px;
		background: var(--color-surface);
		color: var(--color-text-muted);
		margin-bottom: 6px;
	}

	.home-empty h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--color-text);
	}

	.empty-hint {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 13px;
	}

	.empty-actions {
		margin-top: 8px;
	}
</style>

<script lang="ts">
	// Home — Board Picker per DESIGN.md § Multi-board UI.
	// Grid of boards with search, sorting, favorites, trash (M2-02) and empty state.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import {
		listBoards,
		freshBoard,
		saveBoard,
		renameBoard,
		duplicateBoard,
		deleteBoard,
		restoreBoard,
		purgeBoard,
		setBoardFavorite,
		migrateLegacyFavorites
	} from '$lib/io/persistence';
	import type { BoardMeta } from '$lib/objects/types';
	import Icon from '$lib/components/ui/Icon.svelte';

	let boards = $state<BoardMeta[]>([]);
	let loading = $state(true);
	let query = $state('');
	let view = $state<'active' | 'trash'>('active');
	let sort = $state<'date' | 'name'>('date');
	let menu = $state<{ x: number; y: number; board: BoardMeta } | null>(null);
	let renamingId = $state<string | null>(null);
	let renameValue = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	async function load() {
		boards = await listBoards({ trash: view === 'trash', sort });
	}

	onMount(async () => {
		try {
			await migrateLegacyFavorites();
		} catch {
			// older contexts without a DB — favorites stay in localStorage
		}
		try {
			await load();
		} finally {
			loading = false;
		}
	});

	async function setView(next: 'active' | 'trash') {
		view = next;
		menu = null;
		renamingId = null;
		await load();
	}

	async function changeSort(e: Event) {
		sort = (e.target as HTMLSelectElement).value as 'date' | 'name';
		await load();
	}

	const filtered = $derived(
		query.trim() ? boards.filter((b) => b.name.toLowerCase().includes(query.toLowerCase())) : boards
	);

	async function createBoard() {
		const id = crypto.randomUUID();
		const board = freshBoard(id, `Board ${boards.length + 1}`);
		try {
			await saveBoard(board);
		} catch {
			// localStorage/tauri fallback — still navigate
		}
		goto(resolve('/board/[id]', { id }));
	}

	function openMenu(board: BoardMeta, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		menu = { x: e.clientX, y: e.clientY, board };
	}

	function startRename(board: BoardMeta) {
		menu = null;
		renamingId = board.id;
		renameValue = board.name;
	}

	async function commitRename() {
		const id = renamingId;
		if (!id) return;
		const name = renameValue.trim() || 'Untitled';
		renamingId = null;
		await renameBoard(id, name);
		await load();
	}

	async function duplicate(board: BoardMeta) {
		menu = null;
		await duplicateBoard(board.id, crypto.randomUUID(), `Copy of ${board.name}`);
		await load();
	}

	async function moveToTrash(board: BoardMeta) {
		menu = null;
		await deleteBoard(board.id);
		await load();
	}

	async function restore(board: BoardMeta) {
		menu = null;
		await restoreBoard(board.id);
		await load();
	}

	async function purge(board: BoardMeta) {
		menu = null;
		await purgeBoard(board.id);
		await load();
	}

	async function toggleFavorite(board: BoardMeta, e?: MouseEvent) {
		e?.stopPropagation();
		await setBoardFavorite(board.id, !board.isFavorite);
		await load();
	}

	$effect(() => {
		if (renamingId && inputEl) {
			inputEl.focus();
			inputEl.select();
		}
	});

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

<svelte:window onmousedown={() => (menu = null)} />

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
					<div class="picker-controls">
						<select class="sort-select" data-testid="sort-boards" value={sort} onchange={changeSort}>
							<option value="date">Last edited</option>
							<option value="name">Name</option>
						</select>
						<div class="view-toggle">
							<button class:active={view === 'active'} data-testid="view-active" onclick={() => setView('active')}
								>Boards</button
							>
							<button class:active={view === 'trash'} data-testid="view-trash" onclick={() => setView('trash')}
								>Trash</button
							>
						</div>
						<button class="btn-primary" data-testid="new-board" onclick={createBoard}>
							<Icon name="plus" size={15} /> New board
						</button>
					</div>
				</div>

				{#if filtered.length === 0}
					<div class="home-empty">
						{#if view === 'active' && boards.length === 0}
							<!-- Empty state per DESIGN.md § Empty States -->
							<div class="empty-mark"><Icon name="sticky" size={28} /></div>
							<h2>Start creating</h2>
							<p class="empty-hint">Open a blank canvas and start thinking visually.</p>
						{:else}
							<p class="empty-hint">
								{view === 'trash' ? 'Trash is empty.' : `No boards match “${query}”.`}
							</p>
						{/if}
					</div>
				{:else}
					<ul class="board-grid" data-testid="board-list">
						{#each filtered as board (board.id)}
							<li>
								<div
									class="board-card"
									data-testid="board-{board.id}"
									role="button"
									tabindex="0"
									onclick={() => {
										if (view === 'active' && renamingId !== board.id) goto(resolve('/board/[id]', { id: board.id }));
									}}
									onkeydown={(e) => {
										if (e.key === 'Enter' && view === 'active') goto(resolve('/board/[id]', { id: board.id }));
									}}
									oncontextmenu={(e) => openMenu(board, e)}
								>
									<span class="board-thumb" style="background: {thumbTint(board.id)}"></span>
									<span class="board-meta">
										{#if renamingId === board.id}
											<input
												bind:this={inputEl}
												class="board-name-input"
												value={renameValue}
												oninput={(e) => (renameValue = (e.target as HTMLInputElement).value)}
												onblur={commitRename}
												onkeydown={(e) => {
													e.stopPropagation();
													if (e.key === 'Enter') commitRename();
													if (e.key === 'Escape') renamingId = null;
												}}
												onclick={(e) => e.stopPropagation()}
											/>
										{:else}
											<span class="board-name">{board.name}</span>
										{/if}
										<span class="board-sub">
											<span>{formatDate(board.updatedAt)}</span>
											{#if board.isFavorite}<span class="fav-dot">★</span>{/if}
											{#if view === 'trash'}<span class="trash-tag">deleted</span>{/if}
										</span>
									</span>
									{#if view === 'active'}
										<button
											class="fav-btn"
											class:faved={board.isFavorite}
											aria-label={board.isFavorite ? 'Remove favorite' : 'Add favorite'}
											aria-pressed={board.isFavorite}
											onclick={(e) => toggleFavorite(board, e)}>★</button
										>
									{/if}
									<button
										class="card-menu"
										data-testid="board-menu-{board.id}"
										aria-label="Board actions"
										onclick={(e) => openMenu(board, e)}>…</button
									>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</main>
</div>

{#if menu}
	<div
		class="card-menu-pop"
		style="left: {menu.x}px; top: {menu.y}px"
		role="menu"
		tabindex="-1"
		onmousedown={(e) => e.stopPropagation()}
	>
		{#if view === 'active'}
			<button role="menuitem" onclick={() => startRename(menu!.board)}>Rename</button>
			<button role="menuitem" onclick={() => duplicate(menu!.board)}>Duplicate</button>
			<button role="menuitem" onclick={() => toggleFavorite(menu!.board)}>
				{menu.board.isFavorite ? 'Unfavorite' : 'Favorite'}
			</button>
			<button role="menuitem" class="danger" onclick={() => moveToTrash(menu!.board)}>Move to trash</button>
		{:else}
			<button role="menuitem" onclick={() => restore(menu!.board)}>Restore</button>
			<button role="menuitem" class="danger" onclick={() => purge(menu!.board)}>Delete forever</button>
		{/if}
	</div>
{/if}

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

	.picker-controls {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.sort-select {
		height: 34px;
		padding: 0 8px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text);
		font-size: 13px;
	}

	.view-toggle {
		display: flex;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.view-toggle button {
		height: 34px;
		padding: 0 12px;
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.view-toggle button.active {
		background: var(--color-surface-active);
		color: var(--color-text);
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
		background-image: radial-gradient(circle, rgba(255, 255, 255, 0.14) 1px, transparent 1px);
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

	.board-name-input {
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text);
		background: var(--color-surface-hover);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		padding: 1px 4px;
		outline: none;
		max-width: 100%;
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

	.trash-tag {
		font-style: italic;
	}

	.fav-btn {
		position: absolute;
		top: 14px;
		right: 40px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		font-size: 14px;
		color: rgba(255, 255, 255, 0.7);
		opacity: 0;
		transition: opacity var(--dur-micro) var(--ease-out);
	}

	.card-menu {
		position: absolute;
		top: 14px;
		right: 14px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		font-size: 15px;
		color: rgba(255, 255, 255, 0.7);
		opacity: 0;
		transition: opacity var(--dur-micro) var(--ease-out);
	}

	.board-card:hover .fav-btn,
	.board-card:hover .card-menu,
	.card-menu:focus-visible {
		opacity: 1;
	}
	.fav-btn:hover,
	.card-menu:hover {
		background: rgba(255, 255, 255, 0.2);
	}
	.fav-btn.faved {
		opacity: 1;
		color: var(--color-accent);
	}

	.card-menu-pop {
		position: fixed;
		z-index: 120;
		min-width: 160px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 4px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-float);
	}

	.card-menu-pop button {
		padding: 6px 10px;
		text-align: left;
		border-radius: var(--radius-md);
		font-size: 13px;
		color: var(--color-text);
	}

	.card-menu-pop button:hover {
		background: var(--color-surface-hover);
	}

	.card-menu-pop button.danger {
		color: var(--color-danger);
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
</style>

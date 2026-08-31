<script lang="ts">
	// Icon — single consistent icon language (stroke 1.5, 18px) per DESIGN.md.
	// Inline SVG paths, no external icon pack.
	export type IconName =
		| 'select'
		| 'hand'
		| 'pen'
		| 'highlighter'
		| 'eraser'
		| 'text'
		| 'sticky'
		| 'shapes'
		| 'connector'
		| 'image'
		| 'more'
		| 'undo'
		| 'redo'
		| 'share'
		| 'settings'
		| 'plus'
		| 'zoom-in'
		| 'zoom-out'
		| 'fit'
		| 'close'
		| 'minimize'
		| 'maximize'
		| 'trash'
		| 'duplicate'
		| 'lock'
		| 'copy'
		| 'cut'
		| 'back'
		| 'grid'
		| 'sun'
		| 'export'
		| 'import'
		| 'search';

	let {
		name,
		size = 18,
		class: className = ''
	}: {
		name: IconName;
		size?: number;
		class?: string;
	} = $props();
</script>

<svg
	class={className}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'select'}
		<path d="M5 3l14 8-6 1.5L10 19z" />
	{:else if name === 'hand'}
		<path d="M8 11V6a1.5 1.5 0 0 1 3 0v4m0-3a1.5 1.5 0 0 1 3 0v3m0-2a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2l-2.5-3.5a1.5 1.5 0 0 1 2.4-1.8L8 15" />
	{:else if name === 'pen'}
		<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
		<path d="M14 7l3 3" />
	{:else if name === 'highlighter'}
		<path d="M9 11l6-6 4 4-6 6z" />
		<path d="M12 8l4 4" />
		<path d="M7 14l4-4 3 3-4 4z" />
	{:else if name === 'eraser'}
		<path d="M6 14l8-8 5 5-8 8z" />
		<path d="M6 14l-2 2a1.5 1.5 0 0 0 0 2.1l3 3H20" />
	{:else if name === 'text'}
		<path d="M5 6V4h14v2M12 4v16m-3 0h6" />
	{:else if name === 'sticky'}
		<rect x="4" y="4" width="16" height="16" rx="2" />
		<path d="M4 10h16" />
	{:else if name === 'shapes'}
		<rect x="3" y="4" width="8" height="8" rx="1" />
		<circle cx="17" cy="8" r="4" />
		<path d="M8 14l-4 6h8z" />
	{:else if name === 'connector'}
		<path d="M5 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
		<path d="M7 16l8-8" />
		<path d="M19 10v4a2 2 0 0 1-2 2h-6" />
	{:else if name === 'image'}
		<rect x="3" y="5" width="18" height="14" rx="2" />
		<circle cx="9" cy="10" r="1.5" />
		<path d="M3 17l5-5 4 4 3-3 6 6" />
	{:else if name === 'more'}
		<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
		<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
		<circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
	{:else if name === 'undo'}
		<path d="M9 7L4 12l5 5" />
		<path d="M4 12h11a5 5 0 0 1 0 10h-2" />
	{:else if name === 'redo'}
		<path d="M15 7l5 5-5 5" />
		<path d="M20 12H9a5 5 0 0 0 0 10h2" />
	{:else if name === 'share'}
		<circle cx="6" cy="12" r="2.5" />
		<circle cx="18" cy="6" r="2.5" />
		<circle cx="18" cy="18" r="2.5" />
		<path d="M8.5 11l7-3.5M8.5 13l7 3.5" />
	{:else if name === 'settings'}
		<circle cx="12" cy="12" r="3" />
		<path d="M12 2v3m0 14v3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1l2.1-2.1m10-10 2.1-2.1" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'zoom-in'}
		<circle cx="11" cy="11" r="7" />
		<path d="M21 21l-4.5-4.5M11 8v6M8 11h6" />
	{:else if name === 'zoom-out'}
		<circle cx="11" cy="11" r="7" />
		<path d="M21 21l-4.5-4.5M8 11h6" />
	{:else if name === 'fit'}
		<path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6L6 18" />
	{:else if name === 'minimize'}
		<path d="M5 12h14" />
	{:else if name === 'maximize'}
		<rect x="5" y="5" width="14" height="14" rx="1" />
	{:else if name === 'trash'}
		<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7" />
	{:else if name === 'duplicate'}
		<rect x="9" y="9" width="11" height="11" rx="2" />
		<path d="M5 15V6a1 1 0 0 1 1-1h9" />
	{:else if name === 'lock'}
		<rect x="5" y="11" width="14" height="9" rx="2" />
		<path d="M8 11V8a4 4 0 0 1 8 0v3" />
	{:else if name === 'copy'}
		<rect x="9" y="9" width="11" height="11" rx="2" />
		<path d="M5 15V6a1 1 0 0 1 1-1h9" />
	{:else if name === 'cut'}
		<circle cx="7" cy="18" r="3" />
		<circle cx="7" cy="6" r="3" />
		<path d="M9.5 8.5L21 19M9.5 15.5L21 5" />
	{:else if name === 'back'}
		<path d="M15 5l-7 7 7 7" />
	{:else if name === 'grid'}
		<rect x="3" y="3" width="18" height="18" rx="2" />
		<path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
	{:else if name === 'sun'}
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
	{:else if name === 'export'}
		<path d="M12 15V3m0 0L7 8m5-5 5 5" />
		<path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
	{:else if name === 'import'}
		<path d="M12 3v12m0 0 5-5m-5 5-5-5" />
		<path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="7" />
		<path d="M21 21l-4.5-4.5" />
	{/if}
</svg>

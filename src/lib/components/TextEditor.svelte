<script lang="ts">
	// TextEditor — HTML textarea overlay positioned over the canvas for in-canvas
	// text editing (§6 decision: HTML overlay instead of canvas text editing).
	import { onMount } from 'svelte';
	import type { TextObject } from '$lib/objects/types';

	let {
		obj,
		camera,
		onCommit,
		onCancel
	}: {
		obj: TextObject;
		camera: { x: number; y: number; zoom: number };
		onCommit: (content: string) => void;
		onCancel: () => void;
	} = $props();

	let textarea: HTMLTextAreaElement | null = null;

	// compute screen position from world transform + camera
	const left = $derived(obj.transform.x * camera.zoom + camera.x);
	const top = $derived(obj.transform.y * camera.zoom + camera.y);
	const width = $derived(Math.max(obj.transform.width * camera.zoom, 120));
	const height = $derived(Math.max(obj.transform.height * camera.zoom, 60));

	onMount(() => {
		textarea?.focus();
		textarea?.select();
	});

	function commit() {
		onCommit(textarea?.value ?? '');
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
		// commit on blur happens naturally; Enter inserts newline (multiline text)
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<textarea
	bind:this={textarea}
	value={obj.content}
	style="left: {left}px; top: {top}px; width: {width}px; height: {height}px;
		font-family: {obj.style.fontFamily}; font-size: {obj.style.fontSize * camera.zoom}px;
		font-weight: {obj.style.fontWeight}; font-style: {obj.style.fontStyle};
		text-align: {obj.style.textAlign}; color: {obj.style.color}; line-height: 1.3;"
	class="text-editor"
	onblur={commit}
	onkeydown={(e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			commit();
			textarea?.blur();
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	}}
></textarea>

<style>
	.text-editor {
		position: fixed;
		background: transparent;
		border: 1px dashed rgba(91, 140, 255, 0.7);
		outline: none;
		resize: none;
		padding: 0;
		margin: 0;
		overflow: hidden;
		white-space: pre-wrap;
		word-wrap: break-word;
		z-index: 100;
	}
</style>
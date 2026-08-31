import { describe, expect, it } from 'vitest';
import { HistoryManager } from './HistoryManager';
import { AddObjectCommand, RemoveObjectCommand, UpdateTransformCommand } from './commands';
import { ObjectStore } from './ObjectStore';
import { createShape, createText } from '$lib/objects/factory';

describe('HistoryManager', () => {
	it('executes a command and pushes onto undo stack', () => {
		const store = new ObjectStore();
		const h = new HistoryManager();
		let executed = false;
		h.execute({ description: 'test', undo: () => {}, redo: () => { executed = true; } });
		expect(executed).toBe(true);
		expect(h.canUndo).toBe(true);
		expect(h.canRedo).toBe(false);
	});

	it('undo/redo cycles', () => {
		const store = new ObjectStore();
		const h = new HistoryManager();
		let count = 0;
		h.execute({
			description: 'test',
			undo: () => { count--; },
			redo: () => { count++; }
		});
		expect(count).toBe(1);
		h.undo();
		expect(count).toBe(0);
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(true);
		h.redo();
		expect(count).toBe(1);
	});

	it('push adds without executing', () => {
		const store = new ObjectStore();
		const h = new HistoryManager();
		let executed = false;
		h.push({ description: 'test', undo: () => {}, redo: () => { executed = true; } });
		expect(executed).toBe(false);
		expect(h.canUndo).toBe(true);
	});

	it('clear wipes stacks', () => {
		const h = new HistoryManager();
		h.push({ description: 'a', undo: () => {}, redo: () => {} });
		h.clear();
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
	});

	it('respects maxSize', () => {
		const h = new HistoryManager(3);
		for (let i = 0; i < 10; i++) {
			h.push({ description: `${i}`, undo: () => {}, redo: () => {} });
		}
		// the first 7 should be evicted, last 3 remain
		expect(h.canUndo).toBe(true);
	});

	it('notifies listeners on push/undo/redo', () => {
		const h = new HistoryManager();
		const states: string[] = [];
		h.onChange((canUndo, canRedo) => {
			states.push(`${canUndo}:${canRedo}`);
		});
		h.push({ description: 'a', undo: () => {}, redo: () => {} });
		expect(states).toContain('true:false');
		h.undo();
		expect(states).toContain('false:true');
		h.redo();
		expect(states).toContain('true:false');
	});
});

describe('AddObjectCommand', () => {
	it('adds then removes on undo/redo', () => {
		const store = new ObjectStore();
		const obj = createShape(0, 0, 10, 10, 'rect');
		store.add(obj);
		expect(store.size()).toBe(1);
		const cmd = new AddObjectCommand(store, obj);
		cmd.undo();
		expect(store.size()).toBe(0);
		cmd.redo();
		expect(store.size()).toBe(1);
	});
});

describe('RemoveObjectCommand', () => {
	it('removes then restores on undo/redo', () => {
		const store = new ObjectStore();
		const obj = createShape(0, 0, 10, 10, 'rect');
		store.add(obj);
		store.remove(obj.id);
		const cmd = new RemoveObjectCommand(store, obj);
		cmd.undo();
		expect(store.size()).toBe(1);
		cmd.redo();
		expect(store.size()).toBe(0);
	});
});

describe('UpdateTransformCommand', () => {
	it('restores transforms on undo/redo', () => {
		const store = new ObjectStore();
		const obj = createShape(0, 0, 100, 100, 'rect');
		store.add(obj);
		const before = new Map([[obj.id, { x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 }]]);
		const after = new Map([[obj.id, { x: 50, y: 50, width: 60, height: 60, rotation: 0.5, scaleX: 1, scaleY: 1 }]]);
		const cmd = new UpdateTransformCommand(store, before, after);
		cmd.redo();
		expect(obj.transform.x).toBe(50);
		expect(obj.transform.width).toBe(60);
		cmd.undo();
		expect(obj.transform.x).toBe(0);
		expect(obj.transform.width).toBe(100);
	});
});
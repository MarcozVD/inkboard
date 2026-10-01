import { describe, expect, it } from 'vitest';
import { HistoryManager } from './HistoryManager';
import { AddObjectsCommand, RemoveObjectsCommand, UpdateTransformCommand } from './commands';
import { ObjectStore } from './ObjectStore';
import { createShape, createStroke } from '$lib/objects/factory';
import { captureGeometry, translateObject } from '$lib/objects/geometry';

describe('HistoryManager', () => {
	it('executes a command and pushes onto undo stack', () => {
		const h = new HistoryManager();
		let executed = false;
		h.execute({
			description: 'test',
			undo: () => {},
			redo: () => {
				executed = true;
			}
		});
		expect(executed).toBe(true);
		expect(h.canUndo).toBe(true);
		expect(h.canRedo).toBe(false);
	});

	it('undo/redo cycles', () => {
		const h = new HistoryManager();
		let count = 0;
		h.execute({
			description: 'test',
			undo: () => {
				count--;
			},
			redo: () => {
				count++;
			}
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
		const h = new HistoryManager();
		let executed = false;
		h.push({
			description: 'test',
			undo: () => {},
			redo: () => {
				executed = true;
			}
		});
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

describe('HistoryManager transactions', () => {
	function counterCommand(counter: { value: number }, delta: number) {
		return {
			description: 'count',
			undo: () => {
				counter.value -= delta;
			},
			redo: () => {
				counter.value += delta;
			}
		};
	}

	it('commitTransaction groups commands into one undo step', () => {
		const h = new HistoryManager();
		const counter = { value: 0 };
		h.beginTransaction('tx');
		h.execute(counterCommand(counter, 1));
		h.execute(counterCommand(counter, 2));
		h.commitTransaction();

		expect(counter.value).toBe(3);
		expect(h.canUndo).toBe(true);
		h.undo();
		expect(counter.value).toBe(0);
		h.redo();
		expect(counter.value).toBe(3);
	});

	it('rollbackTransaction undoes executed commands and leaves history untouched', () => {
		const h = new HistoryManager();
		const counter = { value: 0 };
		h.beginTransaction('tx');
		h.execute(counterCommand(counter, 5));
		h.execute(counterCommand(counter, 5));
		expect(counter.value).toBe(10);
		h.rollbackTransaction();

		expect(counter.value).toBe(0);
		expect(h.canUndo).toBe(false);
	});
});

describe('AddObjectsCommand', () => {
	it('adds then removes on undo/redo', () => {
		const store = new ObjectStore();
		const obj = createShape(0, 0, 10, 10, 'rect');
		const cmd = new AddObjectsCommand(store, [obj]);
		cmd.redo();
		expect(store.size()).toBe(1);
		cmd.undo();
		expect(store.size()).toBe(0);
		cmd.redo();
		expect(store.size()).toBe(1);
	});
});

describe('RemoveObjectsCommand', () => {
	it('removes then restores on undo/redo', () => {
		const store = new ObjectStore();
		const obj = createShape(0, 0, 10, 10, 'rect');
		store.add(obj);
		const cmd = new RemoveObjectsCommand(store, [obj]);
		cmd.redo();
		expect(store.size()).toBe(0);
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
		const before = new Map([
			[obj.id, { transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 } }]
		]);
		const after = new Map([
			[obj.id, { transform: { x: 50, y: 50, width: 60, height: 60, rotation: 0.5, scaleX: 1, scaleY: 1 } }]
		]);
		const cmd = new UpdateTransformCommand(store, before, after);
		cmd.redo();
		expect(obj.transform.x).toBe(50);
		expect(obj.transform.width).toBe(60);
		cmd.undo();
		expect(obj.transform.x).toBe(0);
		expect(obj.transform.width).toBe(100);
	});

	it('restores stroke points on undo/redo (B11)', () => {
		const store = new ObjectStore();
		const stroke = createStroke([0, 0, 1, 10, 10, 1]);
		store.add(stroke);
		const before = new Map([[stroke.id, captureGeometry(stroke)]]);
		translateObject(stroke, 50, 50);
		const after = new Map([[stroke.id, captureGeometry(stroke)]]);

		const cmd = new UpdateTransformCommand(store, before, after);
		cmd.undo();
		expect(stroke.points[0]).toBe(0);
		expect(stroke.points[1]).toBe(0);
		cmd.redo();
		expect(stroke.points[0]).toBe(50);
		expect(stroke.points[1]).toBe(50);
	});
});

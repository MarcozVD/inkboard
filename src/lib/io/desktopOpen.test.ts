import { describe, expect, it, vi } from 'vitest';
import { wireDesktopOpen } from './desktopOpen';

describe('wireDesktopOpen (M4-03)', () => {
	it('does nothing outside Tauri', async () => {
		const takePendingOpens = vi.fn(async () => ['a']);
		const listenOpen = vi.fn(async () => () => {});
		const navigate = vi.fn();
		const dispose = await wireDesktopOpen({
			isTauri: () => false,
			takePendingOpens,
			listenOpen,
			navigate
		});
		expect(takePendingOpens).not.toHaveBeenCalled();
		expect(listenOpen).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
		expect(typeof dispose).toBe('function');
	});

	it('drains pending boards and follows live open events', async () => {
		const navigate = vi.fn();
		const capture: { emit: ((boardId: string) => void) | null } = { emit: null };
		const unlisten = vi.fn();
		const dispose = await wireDesktopOpen({
			isTauri: () => true,
			takePendingOpens: async () => ['pending-1', 'pending-2'],
			listenOpen: async (handler) => {
				capture.emit = handler;
				return unlisten;
			},
			navigate
		});

		expect(navigate.mock.calls.map(([id]) => id)).toEqual(['pending-1', 'pending-2']);
		capture.emit?.('live-1');
		expect(navigate).toHaveBeenLastCalledWith('live-1');
		dispose();
		expect(unlisten).toHaveBeenCalledTimes(1);
	});
});

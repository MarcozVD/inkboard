// HistoryManager — Command pattern undo/redo (§15).
// Deltas, no full snapshots. Max size configurable (default 200).

export interface Command {
	description: string;
	undo(): void;
	redo(): void;
}

export class HistoryManager {
	private undoStack: Command[] = [];
	private redoStack: Command[] = [];
	private listeners = new Set<(canUndo: boolean, canRedo: boolean) => void>();

	constructor(private maxSize = 200) {}

	/** Execute a command and push it onto the undo stack. */
	execute(command: Command): void {
		command.redo();
		this.push(command);
	}

	/**
	 * Register a command WITHOUT executing it — for tools that already
	 * mutated the store live (e.g. a stroke added during pointerdown).
	 */
	push(command: Command): void {
		this.undoStack.push(command);
		if (this.undoStack.length > this.maxSize) this.undoStack.shift();
		this.redoStack.length = 0;
		this.notify();
	}

	undo(): boolean {
		const cmd = this.undoStack.pop();
		if (!cmd) return false;
		cmd.undo();
		this.redoStack.push(cmd);
		this.notify();
		return true;
	}

	redo(): boolean {
		const cmd = this.redoStack.pop();
		if (!cmd) return false;
		cmd.redo();
		this.undoStack.push(cmd);
		this.notify();
		return true;
	}

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/** Clear history (e.g. after loading a board). */
	clear(): void {
		this.undoStack.length = 0;
		this.redoStack.length = 0;
		this.notify();
	}

	onChange(fn: (canUndo: boolean, canRedo: boolean) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private notify(): void {
		for (const fn of this.listeners) fn(this.canUndo, this.canRedo);
	}
}

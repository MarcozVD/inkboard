// HistoryManager — Command pattern undo/redo (§15).
// Deltas, no full snapshots. Max size configurable (default 200).

export interface Command {
	description: string;
	undo(): void;
	redo(): void;
}

/** Several commands as one undo step. */
export class CompositeCommand implements Command {
	constructor(
		public description: string,
		private commands: Command[]
	) {}

	undo(): void {
		for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i].undo();
	}

	redo(): void {
		for (const cmd of this.commands) cmd.redo();
	}
}

export class HistoryManager {
	private undoStack: Command[] = [];
	private redoStack: Command[] = [];
	private listeners = new Set<(canUndo: boolean, canRedo: boolean) => void>();
	private transaction: { description: string; commands: Command[] } | null = null;

	constructor(private maxSize = 200) {}

	/** Execute a command and record it (or collect it into the open transaction). */
	execute(command: Command): void {
		command.redo();
		if (this.transaction) {
			this.transaction.commands.push(command);
			return;
		}
		this.push(command);
	}

	/** Commands grouped as one undo step. */
	batch(commands: Command[], description = 'Batch'): Command {
		return new CompositeCommand(description, commands);
	}

	/** Open a transaction: everything executed until commit is one undo step. */
	beginTransaction(description = 'Transaction'): void {
		if (this.transaction) throw new Error('HistoryManager: transaction already open');
		this.transaction = { description, commands: [] };
	}

	/** Close the transaction and push it as a single command (if anything ran). */
	commitTransaction(): void {
		const tx = this.transaction;
		if (!tx) return;
		this.transaction = null;
		if (tx.commands.length === 0) return;
		if (tx.commands.length === 1) {
			this.push(tx.commands[0]);
			return;
		}
		this.push(new CompositeCommand(tx.description, tx.commands));
	}

	/** Abort the transaction, undoing every command executed inside it. */
	rollbackTransaction(): void {
		const tx = this.transaction;
		if (!tx) return;
		this.transaction = null;
		for (let i = tx.commands.length - 1; i >= 0; i--) tx.commands[i].undo();
		this.notify();
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
		this.transaction = null;
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

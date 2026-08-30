// Lightweight typed event bus — the ONLY bridge between Canvas Engine and Svelte UI (§6).
// The canvas engine emits; Svelte stores subscribe.

type Listener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
	private listeners = new Map<keyof Events, Set<Listener<unknown>>>();

	on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
		let set = this.listeners.get(event);
		if (!set) {
			set = new Set();
			this.listeners.set(event, set);
		}
		set.add(listener as Listener<unknown>);
		return () => this.off(event, listener);
	}

	off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
		this.listeners.get(event)?.delete(listener as Listener<unknown>);
	}

	emit<K extends keyof Events>(event: K, payload: Events[K]): void {
		const set = this.listeners.get(event);
		if (!set) return;
		// copy: listeners may unsubscribe during dispatch
		for (const listener of [...set]) {
			(listener as Listener<Events[K]>)(payload);
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}

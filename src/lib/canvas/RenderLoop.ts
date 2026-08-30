// Dirty-flag render loop (§19) — only renders when something changed.

export class RenderLoop {
	private animFrameId: number | null = null;
	private isDirty = false;
	private isRunning = false;

	constructor(private readonly renderFn: () => void) {}

	start(): void {
		if (this.isRunning) return;
		this.isRunning = true;
		this.isDirty = true;
		const frame = () => {
			if (this.isDirty) {
				this.renderFn();
				this.isDirty = false;
			}
			this.animFrameId = requestAnimationFrame(frame);
		};
		this.animFrameId = requestAnimationFrame(frame);
	}

	stop(): void {
		if (this.animFrameId !== null) {
			cancelAnimationFrame(this.animFrameId);
			this.animFrameId = null;
		}
		this.isRunning = false;
	}

	markDirty(): void {
		this.isDirty = true;
	}
}

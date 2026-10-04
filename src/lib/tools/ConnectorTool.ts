// ConnectorTool — drag from an anchor (or free point) to another anchor/free point
// to create a straight connector (§M1-09, RF-07).
import { BaseTool, type ToolContext, type ToolPointerEvent } from './BaseTool';
import { createConnector } from '$lib/objects/factory';
import type { ConnectorObject, ConnectorStyle } from '$lib/objects/types';
import { AddObjectsCommand } from '$lib/canvas/commands';
import { ANCHOR_HIT_SCREEN, nearestAnchor } from '$lib/board/connectors';
import { INK } from '$lib/objects/colors';
import type { Vec2 } from '$lib/utils/math';

export interface ConnectorConfig {
	stroke: string;
	strokeWidth: number;
	startArrow: ConnectorStyle['startArrow'];
	endArrow: ConnectorStyle['endArrow'];
	opacity: number;
}

export const DEFAULT_CONNECTOR_CONFIG: ConnectorConfig = {
	stroke: INK,
	strokeWidth: 2,
	startArrow: 'none',
	endArrow: 'arrow',
	opacity: 1
};

export class ConnectorTool extends BaseTool {
	config: ConnectorConfig = { ...DEFAULT_CONNECTOR_CONFIG };

	private draft: ConnectorObject | null = null;
	private start: { point: Vec2; objectId?: string } | null = null;
	private moved = false;

	constructor(ctx: ToolContext) {
		super(ctx);
	}

	pointerDown(e: ToolPointerEvent): void {
		const world = this.world(e);
		const tolerance = ANCHOR_HIT_SCREEN / this.ctx.camera().zoom;
		const hit = nearestAnchor(this.ctx.store, world, tolerance);
		this.start = hit ? { point: hit.point, objectId: hit.objectId } : { point: world };
		this.moved = false;

		const connector = createConnector(this.start.point, this.start.point, {
			stroke: this.config.stroke,
			strokeWidth: this.config.strokeWidth,
			startArrow: this.config.startArrow,
			endArrow: this.config.endArrow,
			opacity: this.config.opacity
		});
		if (hit) connector.startObjectId = hit.objectId;
		this.draft = connector;
		this.ctx.execute(new AddObjectsCommand(this.ctx.store, [connector]));
		this.ctx.setLiveObject?.(connector.id);
		this.ctx.onDirty();
	}

	pointerMove(e: ToolPointerEvent): void {
		if (!this.draft || !this.start) return;
		const world = this.world(e);
		if (Math.hypot(world.x - this.start.point.x, world.y - this.start.point.y) > 3) this.moved = true;

		const tolerance = ANCHOR_HIT_SCREEN / this.ctx.camera().zoom;
		const hit = nearestAnchor(this.ctx.store, world, tolerance, [this.draft.id]);
		this.draft.endPoint = hit ? { ...hit.point } : { ...world };
		this.draft.endObjectId = hit?.objectId;
		this.ctx.store.notifyMoved([this.draft.id]);
		this.ctx.onDirty();
	}

	pointerUp(_e: ToolPointerEvent): void {
		if (!this.draft) return;
		this.ctx.setLiveObject?.(null);
		if (!this.moved) {
			// click without drag — discard the draft and its history entry
			this.ctx.discardAdded(this.draft.id);
		} else {
			this.ctx.store.notifyMoved([this.draft.id]);
			this.ctx.onGestureEnd?.();
		}
		this.ctx.onDirty();
		this.draft = null;
		this.start = null;
		this.moved = false;
	}

	reset(): void {
		this.ctx.setLiveObject?.(null);
		this.draft = null;
		this.start = null;
		this.moved = false;
	}

	private world(e: ToolPointerEvent): Vec2 {
		const c = this.ctx.camera();
		return { x: (e.screenX - c.x) / c.zoom, y: (e.screenY - c.y) / c.zoom };
	}
}

import { describe, expect, it } from 'vitest';
import { ObjectStore } from '$lib/canvas/ObjectStore';
import { createConnector, createShape } from '$lib/objects/factory';
import { anchorPoint, connectedConnectors, nearestAnchor, nearestSide, syncConnectors } from './connectors';

const BOUNDS = { x: 100, y: 200, width: 60, height: 40 };

describe('connectors — anchors', () => {
	it('computes the four side midpoints', () => {
		expect(anchorPoint(BOUNDS, 'n')).toEqual({ x: 130, y: 200 });
		expect(anchorPoint(BOUNDS, 's')).toEqual({ x: 130, y: 240 });
		expect(anchorPoint(BOUNDS, 'w')).toEqual({ x: 100, y: 220 });
		expect(anchorPoint(BOUNDS, 'e')).toEqual({ x: 160, y: 220 });
	});

	it('finds the nearest side to a point', () => {
		expect(nearestSide(BOUNDS, { x: 200, y: 220 })).toBe('e');
		expect(nearestSide(BOUNDS, { x: 130, y: 100 })).toBe('n');
		expect(nearestSide(BOUNDS, { x: 0, y: 220 })).toBe('w');
	});

	it('finds anchors within the tolerance', () => {
		const store = new ObjectStore();
		const rect = createShape(100, 200, 60, 40, 'rect');
		store.add(rect);

		const hit = nearestAnchor(store, { x: 162, y: 221 }, 18);
		expect(hit).toEqual({ objectId: rect.id, side: 'e', point: { x: 160, y: 220 } });
		expect(nearestAnchor(store, { x: 300, y: 300 }, 18)).toBeNull();
	});
});

describe('connectors — resync', () => {
	it('follows the attached object when it moves', () => {
		const store = new ObjectStore();
		const a = createShape(100, 200, 60, 40, 'rect');
		const b = createShape(300, 200, 60, 40, 'rect');
		store.addMany([a, b]);
		const connector = createConnector({ x: 160, y: 220 }, { x: 300, y: 220 });
		connector.startObjectId = a.id;
		connector.endObjectId = b.id;
		store.add(connector);

		a.transform.y += 100;
		store.notifyMoved([a.id]);
		const changed = syncConnectors(store);

		expect(changed).toContain(connector.id);
		// the old end (160,220) is now nearest to the north side (130,300)
		expect(connector.startPoint).toEqual({ x: 130, y: 300 });
		expect(connector.endPoint).toEqual({ x: 300, y: 220 });
	});

	it('keeps free endpoints and detaches deleted targets', () => {
		const store = new ObjectStore();
		const a = createShape(0, 0, 40, 40, 'rect');
		store.add(a);
		const connector = createConnector({ x: 40, y: 20 }, { x: 500, y: 500 });
		connector.startObjectId = a.id;
		store.add(connector);

		a.transform.x += 100;
		store.notifyMoved([a.id]);
		syncConnectors(store);
		expect(connector.startPoint).toEqual({ x: 100, y: 20 });
		expect(connector.endPoint).toEqual({ x: 500, y: 500 }); // free end untouched

		store.remove(a.id);
		syncConnectors(store);
		expect(connector.startObjectId).toBeUndefined();
		expect(connector.startPoint).toEqual({ x: 100, y: 20 }); // keeps the last point
	});

	it('lists connectors attached to the given objects', () => {
		const store = new ObjectStore();
		const a = createShape(0, 0, 10, 10, 'rect');
		const b = createShape(100, 0, 10, 10, 'rect');
		store.addMany([a, b]);
		const c1 = createConnector({ x: 10, y: 5 }, { x: 100, y: 5 });
		c1.startObjectId = a.id;
		const c2 = createConnector({ x: 0, y: 0 }, { x: 200, y: 200 });
		store.addMany([c1, c2]);

		expect(connectedConnectors(store, [a.id]).map((c) => c.id)).toEqual([c1.id]);
		expect(connectedConnectors(store, [b.id])).toEqual([]);
	});
});

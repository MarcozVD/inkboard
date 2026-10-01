// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CanvasEngine, type ToolId } from './CanvasEngine';
import { DEFAULT_CAMERA } from './Camera';

function makeEngine() {
	return new CanvasEngine({ camera: () => DEFAULT_CAMERA, onDirty: () => {} });
}

describe('CanvasEngine — setTool (B10)', () => {
	it('rejects unknown tools and keeps the active tool', () => {
		const engine = makeEngine();
		expect(engine.setTool('nope' as ToolId)).toBe(false);
		expect(engine.activeTool).toBe('select');
		expect(engine.tool).toBe(engine.selectTool);
	});

	it('accepts implemented tools and reports the new active tool', () => {
		const engine = makeEngine();
		expect(engine.setTool('pen')).toBe(true);
		expect(engine.activeTool).toBe('pen');
		expect(engine.setTool('connector')).toBe(true);
		expect(engine.activeTool).toBe('connector');
		expect(engine.tool).toBe(engine.connectorTool);
		expect(engine.setTool('select')).toBe(true);
		expect(engine.activeTool).toBe('select');
	});
});

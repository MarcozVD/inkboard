// styleControls — descriptors for the ContextToolbar and tool popovers (§M1-03).
import type { CanvasEngine } from '$lib/canvas/CanvasEngine';
import type {
	CanvasObject,
	ConnectorObject,
	ShapeObject,
	ShapeStyle,
	StickyNoteObject,
	StrokeObject,
	TextObject,
	TextStyle
} from '$lib/objects/types';
import { stickyNoteColors } from '$lib/objects/renderers';
import {
	CONNECTOR_WIDTHS,
	DASH_PATTERN,
	FILL_COLORS,
	FONT_SIZES,
	INK_COLORS,
	PEN_WIDTHS,
	SHAPE_WIDTHS,
	STICKY_TEXT_COLOR
} from '$lib/objects/stylePalette';

export type StyleControl =
	| { kind: 'swatch'; id: string; testid: string; color: string; label: string; active: boolean; onPick: () => void }
	| { kind: 'choice'; id: string; testid: string; label: string; text: string; active: boolean; onClick: () => void }
	| {
			kind: 'range';
			id: string;
			testid: string;
			label: string;
			value: number;
			min: number;
			max: number;
			step: number;
			onInput: (value: number) => void;
	  };

function swatch(id: string, index: number, color: string, active: boolean, onPick: () => void): StyleControl {
	return { kind: 'swatch', id, testid: `${id}-${index}`, color, label: color === 'none' ? 'No fill' : `Color ${index + 1}`, active, onPick };
}

function choice(id: string, index: number, label: string, text: string, active: boolean, onClick: () => void): StyleControl {
	return { kind: 'choice', id, testid: `${id}-${index}`, label, text, active, onClick };
}

function opacityControl(value: number, onInput: (value: number) => void): StyleControl {
	return {
		kind: 'range',
		id: 'selection-opacity',
		testid: 'selection-opacity',
		label: 'Opacity',
		value,
		min: 0.1,
		max: 1,
		step: 0.1,
		onInput
	};
}

function shapeControls(
	style: ShapeStyle,
	isRect: boolean,
	prefix: string,
	apply: (patch: Record<string, unknown>) => void
): StyleControl[] {
	const controls: StyleControl[] = [];
	controls.push(...FILL_COLORS.map((color, i) => swatch(`${prefix}-fill`, i, color, style.fill === color, () => apply({ fill: color }))));
	controls.push(...INK_COLORS.map((color, i) => swatch(`${prefix}-stroke`, i, color, style.stroke === color, () => apply({ stroke: color }))));
	controls.push(...SHAPE_WIDTHS.map((w, i) => choice(`${prefix}-width`, i, `${w}px`, String(w), style.strokeWidth === w, () => apply({ strokeWidth: w }))));
	controls.push(choice(`${prefix}-dash`, 0, 'Solid', '—', !style.strokeDash?.length, () => apply({ strokeDash: undefined })));
	controls.push(choice(`${prefix}-dash`, 1, 'Dashed', '–', !!style.strokeDash?.length, () => apply({ strokeDash: DASH_PATTERN })));
	if (isRect) {
		controls.push(...[0, 4, 12].map((r, i) =>
			choice(`${prefix}-radius`, i, `Radius ${r}`, `${r}`, (style.cornerRadius ?? 0) === r, () => apply({ cornerRadius: r }))
		));
	}
	return controls;
}

function textControls(first: TextObject, apply: (patch: Record<string, unknown>) => void): StyleControl[] {
	const controls: StyleControl[] = [];
	controls.push(...FONT_SIZES.map((size, i) => choice('text-size', i, `${size}px`, String(size), first.style.fontSize === size, () => apply({ fontSize: size }))));
	controls.push(choice('text-bold', 0, 'Bold', 'B', first.style.fontWeight === 'bold', () => apply({ fontWeight: first.style.fontWeight === 'bold' ? 'normal' : 'bold' })));
	controls.push(choice('text-italic', 0, 'Italic', 'I', first.style.fontStyle === 'italic', () => apply({ fontStyle: first.style.fontStyle === 'italic' ? 'normal' : 'italic' })));
	const aligns: TextStyle['textAlign'][] = ['left', 'center', 'right'];
	controls.push(...aligns.map((align, i) =>
		choice('text-align', i, `Align ${align}`, align[0].toUpperCase(), first.style.textAlign === align, () => apply({ textAlign: align }))
	));
	controls.push(...INK_COLORS.map((color, i) => swatch('text-color', i, color, first.style.color === color, () => apply({ color }))));
	return controls;
}

function connectorControls(
	style: Pick<ConnectorObject['style'], 'stroke' | 'strokeWidth' | 'startArrow' | 'endArrow'>,
	prefix: string,
	apply: (patch: Record<string, unknown>) => void
): StyleControl[] {
	const controls: StyleControl[] = [];
	controls.push(...INK_COLORS.map((color, i) => swatch(`${prefix}-color`, i, color, style.stroke === color, () => apply({ stroke: color }))));
	controls.push(...CONNECTOR_WIDTHS.map((w, i) => choice(`${prefix}-width`, i, `${w}px`, String(w), style.strokeWidth === w, () => apply({ strokeWidth: w }))));
	controls.push(choice(`${prefix}-start`, 0, 'Start: none', '⊢', style.startArrow === 'none', () => apply({ startArrow: 'none' })));
	controls.push(choice(`${prefix}-start`, 1, 'Start: arrow', '◀', style.startArrow === 'arrow', () => apply({ startArrow: 'arrow' })));
	controls.push(choice(`${prefix}-start`, 2, 'Start: dot', '●', style.startArrow === 'dot', () => apply({ startArrow: 'dot' })));
	controls.push(choice(`${prefix}-end`, 0, 'End: none', '⊣', style.endArrow === 'none', () => apply({ endArrow: 'none' })));
	controls.push(choice(`${prefix}-end`, 1, 'End: arrow', '▶', style.endArrow === 'arrow', () => apply({ endArrow: 'arrow' })));
	controls.push(choice(`${prefix}-end`, 2, 'End: dot', '●', style.endArrow === 'dot', () => apply({ endArrow: 'dot' })));
	return controls;
}

/** Controls for the current selection, adapting to the selected object types. */
export function buildSelectionStyleControls(
	engine: CanvasEngine,
	apply: (patch: Record<string, unknown>) => void
): StyleControl[] {
	const objects = engine.selectionManager.selected
		.map((id) => engine.store.get(id))
		.filter(Boolean) as CanvasObject[];
	if (objects.length === 0) return [];

	const types = new Set(objects.map((o) => o.type));
	const controls: StyleControl[] = [];

	if (types.size === 1 && types.has('stroke')) {
		const first = objects[0] as StrokeObject;
		controls.push(...INK_COLORS.map((color, i) => swatch('stroke-color', i, color, first.style.color === color, () => apply({ color }))));
		controls.push(...PEN_WIDTHS.map((w, i) => choice('stroke-width', i, `${w}px`, String(w), first.style.width === w, () => apply({ width: w }))));
	} else if (types.size === 1 && types.has('shape')) {
		const first = objects[0] as ShapeObject;
		controls.push(...shapeControls(first.style, first.shape === 'rect', 'shape', apply));
	} else if (types.size === 1 && types.has('text')) {
		controls.push(...textControls(objects[0] as TextObject, apply));
	} else if (types.size === 1 && types.has('connector')) {
		controls.push(...connectorControls((objects[0] as ConnectorObject).style, 'connector', apply));
	} else if (types.size === 1 && types.has('sticky_note')) {
		const first = objects[0] as StickyNoteObject;
		controls.push(...stickyNoteColors().map((color, i) =>
			swatch('sticky-bg', i, color, first.style.backgroundColor === color, () => apply({ backgroundColor: color, textColor: STICKY_TEXT_COLOR }))
		));
	}

	controls.push(opacityControl(objects[0].style.opacity ?? 1, (value) => apply({ opacity: value })));
	return controls;
}

/** Controls for the active tool's last-used style (tool popover, no selection). */
export function buildToolStyleControls(engine: CanvasEngine, refresh: () => void): StyleControl[] {
	const tool = engine.activeTool;

	if (tool === 'pen') {
		const cfg = engine.penConfig;
		return [
			...INK_COLORS.map((color, i) => swatch('pen-color', i, color, cfg.color === color, () => { cfg.color = color; refresh(); })),
			...PEN_WIDTHS.map((w, i) => choice('pen-width', i, `${w}px`, String(w), cfg.width === w, () => { cfg.width = w; refresh(); }))
		];
	}

	if (tool === 'highlighter') {
		const cfg = engine.highlighterConfig;
		return [
			...INK_COLORS.map((color, i) => swatch('highlighter-color', i, color, cfg.color === color, () => { cfg.color = color; refresh(); })),
			...PEN_WIDTHS.map((w, i) => choice('highlighter-width', i, `${w * 3}px`, String(w * 3), cfg.width === w * 3, () => { cfg.width = w * 3; refresh(); }))
		];
	}

	if (tool === 'connector') {
		return connectorControls(engine.connectorTool.config, 'connector', (patch) => {
			Object.assign(engine.connectorTool.config, patch);
			refresh();
		});
	}

	if (tool === 'shape') {
		const cfg = engine.shapeTool.config.style;
		return shapeControls(
			{
				fill: cfg.fill ?? 'none',
				stroke: cfg.stroke ?? '#e8e9ec',
				strokeWidth: cfg.strokeWidth ?? 2,
				strokeDash: cfg.strokeDash,
				cornerRadius: cfg.cornerRadius,
				opacity: cfg.opacity ?? 1
			},
			true,
			'tool-shape',
			(patch) => {
				Object.assign(engine.shapeTool.config.style, patch);
				refresh();
			}
		);
	}

	return [];
}

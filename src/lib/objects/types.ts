// Canvas object type definitions (§10, §11)

import type { CameraState } from '$lib/canvas/Camera';

// ── Re-export CameraState for convenience ──
export type { CameraState };

// ── Workspace ──
export interface Workspace {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	boards: BoardMeta[];
	settings: WorkspaceSettings;
}

export interface WorkspaceSettings {
	theme: 'light' | 'dark' | 'system';
	defaultGridEnabled: boolean;
	defaultSnapEnabled: boolean;
	autosaveIntervalMs: number;
}

// ── Board ──
export interface Board {
	id: string;
	workspaceId: string;
	name: string;
	version: number;
	schemaVersion: string;
	createdAt: number;
	updatedAt: number;
	camera: CameraState;
	objects: CanvasObject[];
	background: BoardBackground;
	grid: GridConfig;
	metadata: BoardMetadata;
}

export interface BoardMeta {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	thumbnailDataUrl?: string;
	objectCount: number;
}

export interface BoardBackground {
	type: 'solid' | 'grid' | 'dots' | 'lines';
	color: string;
	gridSize?: number;
	gridColor?: string;
}

export interface GridConfig {
	enabled: boolean;
	size: number; // px in world coords
	color: string;
	opacity: number;
}

export interface BoardMetadata {
	lastOpenedAt?: number;
	description?: string;
	tags?: string[];
}

// ── Canvas Objects ──
export type ObjectType = 'stroke' | 'text' | 'shape' | 'image' | 'sticky_note' | 'connector' | 'group';

export interface BaseObject {
	id: string;
	type: ObjectType;
	transform: Transform;
	style: BaseStyle;
	/** Paint order; assigned by ObjectStore on add (optional at construction) */
	zIndex?: number;
	locked: boolean;
	visible: boolean;
	groupId?: string;
	connectorIds?: string[];
	createdAt: number;
	updatedAt: number;
}

export interface Transform {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
}

export interface BaseStyle {
	opacity: number;
}

export type CanvasObject = StrokeObject | TextObject | ShapeObject | ImageObject | StickyNoteObject | ConnectorObject | GroupObject;

// ── Stroke ──
export interface StrokeObject extends BaseObject {
	type: 'stroke';
	points: number[]; // flattened [x0,y0,p0, x1,y1,p1, ...]
	smoothedPoints?: number[];
	style: StrokeStyle;
}

export interface StrokeStyle extends BaseStyle {
	color: string;
	width: number;
	lineCap: 'round' | 'square' | 'butt';
	lineJoin: 'round' | 'miter' | 'bevel';
	isHighlighter: boolean;
	compositeOperation?: GlobalCompositeOperation;
}

// ── Text ──
export interface TextObject extends BaseObject {
	type: 'text';
	content: string;
	style: TextStyle;
}

export interface TextStyle extends BaseStyle {
	fontFamily: string;
	fontSize: number;
	fontWeight: 'normal' | 'bold';
	fontStyle: 'normal' | 'italic';
	textDecoration: 'none' | 'underline' | 'line-through';
	textAlign: 'left' | 'center' | 'right';
	color: string;
	backgroundColor?: string;
	lineHeight: number;
	padding: number;
}

// ── Shape ──
export interface ShapeObject extends BaseObject {
	type: 'shape';
	shape: ShapeType;
	style: ShapeStyle;
	sides?: number;
	innerRadius?: number;
}

export type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow' | 'triangle' | 'diamond' | 'star' | 'polygon';

export interface ShapeStyle extends BaseStyle {
	fill: string | 'none';
	stroke: string | 'none';
	strokeWidth: number;
	strokeDash?: number[];
	cornerRadius?: number;
}

// ── Image ──
export interface ImageObject extends BaseObject {
	type: 'image';
	src: string;
	originalWidth: number;
	originalHeight: number;
	cropRect?: { x: number; y: number; w: number; h: number };
}

// ── Sticky Note ──
export interface StickyNoteObject extends BaseObject {
	type: 'sticky_note';
	content: string;
	style: StickyNoteStyle;
}

export interface StickyNoteStyle extends BaseStyle {
	backgroundColor: string;
	textColor: string;
	fontSize: number;
	fontFamily: string;
	padding: number;
}

// ── Connector ──
export interface ConnectorObject extends BaseObject {
	type: 'connector';
	startObjectId?: string;
	startPoint: { x: number; y: number };
	endObjectId?: string;
	endPoint: { x: number; y: number };
	waypoints?: { x: number; y: number }[];
	style: ConnectorStyle;
}

export interface ConnectorStyle extends BaseStyle {
	stroke: string;
	strokeWidth: number;
	strokeDash?: number[];
	startArrow: 'none' | 'arrow' | 'dot';
	endArrow: 'none' | 'arrow' | 'dot';
	routing: 'straight' | 'orthogonal' | 'curved';
}

// ── Group ──
export interface GroupObject extends BaseObject {
	type: 'group';
	childIds: string[];
}

// ── Editable (text / sticky note — shared shape for the in-canvas editor) ──
export interface EditableObj {
	id: string;
	content: string;
	updatedAt: number;
	transform: { x: number; y: number; width: number; height: number };
	style: {
		fontFamily: string;
		fontSize: number;
		fontWeight?: string;
		fontStyle?: string;
		textAlign?: string;
		lineHeight?: number;
		color: string;
		backgroundColor?: string;
		padding?: number;
	};
}
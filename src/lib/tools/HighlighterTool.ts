// HighlighterTool — PenTool configured as a translucent marker (§5)
import { PenTool, type PenConfig } from './PenTool';
import type { ToolContext } from './BaseTool';

export const DEFAULT_HIGHLIGHTER_CONFIG: PenConfig = {
	color: '#ffd666',
	width: 18,
	isHighlighter: true,
	opacity: 0.5
};

export class HighlighterTool extends PenTool {
	config: PenConfig = { ...DEFAULT_HIGHLIGHTER_CONFIG };

	constructor(ctx: ToolContext) {
		super(ctx);
	}
}
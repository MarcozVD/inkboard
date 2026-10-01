<script lang="ts">
	// BoardChrome — toolbar, create panel, export menu and settings (§M1-01).
	import ToolBar from '$lib/components/toolbar/ToolBar.svelte';
	import ToolPalette from '$lib/components/toolbar/ToolPalette.svelte';
	import CreatePanel from '$lib/components/panels/CreatePanel.svelte';
	import ExportMenu from '$lib/components/menus/ExportMenu.svelte';
	import SettingsPanel from '$lib/components/panels/SettingsPanel.svelte';
	import { CREATE_ITEMS, TOOLBAR_TOOLS } from '$lib/board/boardInteractions';
	import type { GridConfig, ShapeType } from '$lib/objects/types';
	import type { ExportFormat } from '$lib/io/transfer';

	let {
		activeTool,
		currentShape,
		stickyColor,
		showCreatePanel,
		showExportMenu,
		showSettings,
		grid,
		theme,
		onSelectTool,
		onToggleCreate,
		onToggleExport,
		onShape,
		onStickyColor,
		onCreate,
		onExport,
		onImport,
		onCloseSettings,
		onGridChange,
		onThemeChange
	}: {
		activeTool: string;
		currentShape: ShapeType;
		stickyColor: string | undefined;
		showCreatePanel: boolean;
		showExportMenu: boolean;
		showSettings: boolean;
		grid: GridConfig;
		theme: 'dark' | 'light' | 'system';
		onSelectTool: (id: string) => void;
		onToggleCreate: () => void;
		onToggleExport: () => void;
		onShape: (shape: ShapeType) => void;
		onStickyColor: (index: number) => void;
		onCreate: (id: string) => void;
		onExport: (format: ExportFormat) => void;
		onImport: () => void;
		onCloseSettings: () => void;
		onGridChange: (grid: GridConfig) => void;
		onThemeChange: (theme: 'dark' | 'light' | 'system') => void;
	} = $props();
</script>

<ToolBar
	tools={TOOLBAR_TOOLS}
	{activeTool}
	{onSelectTool}
	onCreate={onToggleCreate}
	onExport={onToggleExport}
	exportActive={showExportMenu}
>
	<ToolPalette {activeTool} {currentShape} {stickyColor} {onShape} {onStickyColor} />
</ToolBar>

<CreatePanel open={showCreatePanel} items={CREATE_ITEMS} onSelect={onCreate} onClose={onToggleCreate} />

<ExportMenu open={showExportMenu} {onExport} {onImport} />

<SettingsPanel
	open={showSettings}
	onClose={onCloseSettings}
	{grid}
	{onGridChange}
	background={'#0f1013'}
	onBgChange={() => {}}
	{theme}
	{onThemeChange}
	onExport={onToggleExport}
	{onImport}
/>

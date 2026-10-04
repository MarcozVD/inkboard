<script lang="ts">
	// BoardChrome — toolbar, create panel, export menu and settings (§M1-01).
	import ToolBar from '$lib/components/toolbar/ToolBar.svelte';
	import ToolPalette from '$lib/components/toolbar/ToolPalette.svelte';
	import CreatePanel from '$lib/components/panels/CreatePanel.svelte';
	import ExportMenu from '$lib/components/menus/ExportMenu.svelte';
	import SettingsPanel from '$lib/components/panels/SettingsPanel.svelte';
	import { CREATE_ITEMS, TOOLBAR_TOOLS } from '$lib/board/boardInteractions';
	import type { StyleControl } from '$lib/board/styleControls';
	import type { BoardVersionMeta, GridConfig, ShapeType } from '$lib/objects/types';
	import type { ExportFormat, ExportImageOptions, ImportMode } from '$lib/io/transfer';

	let {
		state,
		actions
	}: {
		state: {
			activeTool: string;
			currentShape: ShapeType;
			stickyColor: string | undefined;
			styleControls?: StyleControl[];
			showCreatePanel: boolean;
			showExportMenu: boolean;
			showSettings: boolean;
			grid: GridConfig;
			theme: 'dark' | 'light' | 'system';
			versions: BoardVersionMeta[];
		};
		actions: {
			onSelectTool: (id: string) => void;
			onToggleCreate: () => void;
			onToggleExport: () => void;
			onShape: (shape: ShapeType) => void;
			onStickyColor: (index: number) => void;
			onCreate: (id: string) => void;
			onExport: (format: ExportFormat) => void;
			onExportImage: (options: ExportImageOptions) => void;
			onImport: (mode?: ImportMode) => void;
			onCloseSettings: () => void;
			onGridChange: (grid: GridConfig) => void;
			onThemeChange: (theme: 'dark' | 'light' | 'system') => void;
			onLoadVersions: () => void;
			onSaveVersion: () => void;
			onRestoreVersion: (versionId: string) => void;
			onOpenLogs?: () => void;
		};
	} = $props();

	const {
		activeTool,
		currentShape,
		stickyColor,
		styleControls = [],
		showCreatePanel,
		showExportMenu,
		showSettings,
		grid,
		theme,
		versions
	} = $derived(state);
	const {
		onSelectTool,
		onToggleCreate,
		onToggleExport,
		onShape,
		onStickyColor,
		onCreate,
		onExport,
		onExportImage,
		onImport,
		onCloseSettings,
		onGridChange,
		onThemeChange,
		onLoadVersions,
		onSaveVersion,
		onRestoreVersion,
		onOpenLogs
	} = $derived(actions);
</script>

<ToolBar
	tools={TOOLBAR_TOOLS}
	{activeTool}
	{onSelectTool}
	onCreate={onToggleCreate}
	onExport={onToggleExport}
	exportActive={showExportMenu}
>
	<ToolPalette {activeTool} {currentShape} {stickyColor} {styleControls} {onShape} {onStickyColor} />
</ToolBar>

<CreatePanel open={showCreatePanel} items={CREATE_ITEMS} onSelect={onCreate} onClose={onToggleCreate} />

<ExportMenu open={showExportMenu} {onExport} {onExportImage} {onImport} />

<SettingsPanel
	open={showSettings}
	onClose={onCloseSettings}
	{grid}
	{onGridChange}
	background="#0f1013"
	onBgChange={() => {}}
	{theme}
	{onThemeChange}
	onExport={onToggleExport}
	{onImport}
	{versions}
	{onLoadVersions}
	{onSaveVersion}
	{onRestoreVersion}
	{onOpenLogs}
/>

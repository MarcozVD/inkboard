---
name: Inkboard
description: Infinite whiteboard — monochrome, professional, canvas-first.
colors:
  bg-app: "#0f1013"
  bg-panel: "#16181d"
  bg-hover: "#23262c"
  bg-active: "#30343b"
  border: "#2a2d34"
  text-primary: "#ffffff"
  text-secondary: "#9a9ca8"
  accent: "#ffffff"
  danger: "#e5534b"
  selection: "rgba(255,255,255,0.9)"
  selection-fill: "rgba(255,255,255,0.12)"
typography:
  ui:
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif"
    fontWeight: 500
    fontSize: "12px"
    letterSpacing: "0.02em"
  mono:
    fontFamily: "'Cascadia Code', 'JetBrains Mono', consolas, monospace"
    fontWeight: 400
    fontSize: "11px"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  tool-button:
    backgroundColor: transparent
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    size: "32px"
  tool-button-active:
    backgroundColor: "{colors.bg-active}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    size: "32px"
  tool-button-hover:
    backgroundColor: "{colors.bg-hover}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    size: "32px"
  topbar:
    backgroundColor: "{colors.bg-panel}"
    height: "48px"
    borderBottom: "1px solid {colors.border}"
  context-toolbar:
    backgroundColor: "{colors.bg-panel}"
    rounded: "{rounded.lg}"
    border: "1px solid {colors.border}"
    padding: "{spacing.xs}"
---

# Design System: Inkboard

## Overview

**Creative North Star: "The Monochrome Workshop."**

Inkboard is a workspace where the user's content is the only color. The UI is a framework of precision tools in white and near-black — the icon's pause glyph (`#ffffff` on `#0f1013`) sets the entire palette. The canvas is the product; the interface recedes into the task.

**Personality:** Professional, calm, precise, fast, creative, technical.

**Key Characteristics:**
- Monochrome palette anchored to the brand icon's white (#ffffff)
- Canvas-first hierarchy: the interface disappears when the user works
- Dark-first by scene (desk, variable light), not by category convention
- 1px borders, subtle layering (bg → panel → hover → active), no shadows
- Compact, precise controls — no oversized buttons, no glassmorphism, no cards
- Motion only for state transitions (150–200ms), never decorative
- System UI font for readability; monospace for zoom/coordinate data

## Colors

The palette is restrained — two neutrals (one warm, one cool) and a single accent that is the icon's white. The accent is used for primary actions, selection state, and active indicators only.

### Primary
- **Accent White** (`#ffffff`): Primary actions, selection borders, active tool indicator, interactive text. Used sparingly — its rarity is the point.

### Neutral
- **App Background** (`#0f1013`): The canvas background. Near-black, deep enough to make white feel luminous.
- **Panel Background** (`#16181d`): TopBar, toolbars, floating panels. One step above app bg.
- **Hover** (`#23262c`): Button/control hover state, list item hover.
- **Active** (`#30343b`): Active tool, pressed state, selected item.
- **Border** (`#2a2d34`): 1px borders on panels, dividers, grid lines.
- **Text Primary** (`#ffffff`): Primary text, labels, active tooltips.
- **Text Secondary** (`#9a9ca8`): Secondary text, disabled states, hints.

### Semantic
- **Danger** (`#e5534b`): Close button hover, destructive actions.

### The One Color Rule
The accent white appears on ≤10% of any given screen. Its rarity is the point. The user's content (strokes, shapes, sticky notes, images) provides the only color on the canvas.

## Typography

**UI Font:** `'Segoe UI', system-ui, -apple-system, sans-serif` — single family for all UI. System-native on Windows, familiar, readable at small sizes.
**Monospace Font:** `'Cascadia Code', 'JetBrains Mono', consolas, monospace` — zoom percentage, coordinates, data.

### Hierarchy
- **UI Body** (400, 14px, 1.4): All UI text, tool labels, panel content.
- **Label** (500, 12px, 1.3, 0.02em tracking): Tool names, button labels, section headers.
- **Caption** (400, 11px, 1.3): Zoom percentage, save state, secondary info.
- **Mono** (400, 11px, 1.3): Zoom display, coordinates, version info.
- **Board Title** (500, 16px, 1.2): Editable board name in TopBar.

### The One Family Rule
One sans family throughout UI. No display/body pairing. The mono face is reserved for data, never for "technical" costume.

## Layout

### Spatial Model
- **Canvas:** Full-bleed. The entire window area is the canvas; UI elements float over it.
- **TopBar:** Fixed 48px at the top. Logo | board name (editable) | autosave status | center (empty) | undo/redo | share | settings.
- **ToolBar:** Vertical floating strip on the left edge, 48px wide, detached from the edge by 8px. Tools stacked with 4px gap. Contextual popover opens to the right of the active tool.
- **Zoom Controls:** Floating in bottom-right, 36px tall, compact. [-] [100%] [+] [Fit view]. Optional mini-map beside it.
- **Context Toolbar:** Floating above/below selection, adapts to object type.
- **Create Panel:** Floating panel, opened from a toolbar button, closed on click-outside.

### Density
- Tight groups, generous separation. More space above a heading than below it.
- Tool buttons: 32×32px. TopBar: 48px including 1px bottom border.

## Elevation & Depth

**Flat-By-Default Rule.** Surfaces are flat at rest. No shadows. Depth is conveyed by tonal layering:
- `bg-app` → `bg-panel` → `bg-hover` → `bg-active` (each step is a clear tonal jump)
- Floating panels (context toolbar, create panel) use `bg-panel` with a 1px border and a subtle `box-shadow: 0 4px 12px rgba(0,0,0,0.4)` — only for floaters that need to be visually above the canvas.
- No dark mode switch needed — the app is dark-first by scene.

## Shapes

- **Tool buttons:** 6px radius (`rounded.md`), 32×32px square.
- **TopBar:** No radius (edge-to-edge).
- **Floating panels:** 8px radius (`rounded.lg`), 1px border.
- **Canvas handles:** 8×8px squares with 1.5px stroke, 4px padding from object edge.
- **Selection bounding box:** 1.5px dashed stroke, 4px padding.
- **Input fields:** 6px radius, 1px border, no shadow.

## Components

### ToolButton
- **Shape:** 32×32px, 6px radius.
- **Default:** transparent bg, `--text-secondary` icon.
- **Hover:** `--bg-hover` bg, `--text-primary` icon (150ms transition).
- **Active (tool selected):** `--bg-active` bg, `--text-primary` (white) icon.
- **Icon:** 18×18px centered, consistent stroke width.
- **Tooltip:** on hover, 200ms delay, compact.

### TopBar
- **Shape:** 48px height, edge-to-edge, 1px bottom border.
- **Left:** logo icon (24×24px) + board name (editable, 16px, 500 weight) + autosave status (✓ / ●).
- **Center:** empty — visual breathing room for the canvas.
- **Right:** undo (disabled/enabled) | redo | share (future) | settings (gear icon) | window controls (min/max/close).
- **Hover states:** 6px radius on buttons, `--bg-hover` on hover.
- **Drag region:** `data-tauri-drag-region` on the left area (logo + title).

### ContextToolbar
- **Shape:** Floating panel, 8px radius, 1px border, padding 4px.
- **Position:** Appears above the selection bounding box when an object is selected.
- **Content:** Adapts to object type (fill color, stroke, text options, duplicate, delete, lock).
- **Animation:** Fade + slide down 12px, 150ms, ease-out.

### ZoomControls
- **Shape:** Compact row, 36px height, `--bg-panel` bg, 8px radius, 1px border.
- **Content:** [-] [100%] [+] [Fit view icon].
- **Position:** Bottom-right, 16px from edges.
- **Interaction:** Click to zoom in/out, click percentage to reset to 100%, click fit to fit view.

### CreatePanel
- **Shape:** Floating panel, `--bg-panel` bg, 8px radius, 1px border, min-width 220px.
- **Content:** Sections: Sticky Note, Text, Shapes, Reactions, Images, Templates.
- **Interaction:** Opens from toolbar button (⊕), closes on click-outside, animated 150ms.

### SettingsPanel
- **Shape:** Slide-in panel from right, 300px wide, full height below TopBar.
- **Sections:** Canvas (background, grid, snap), Interaction, Appearance, Accessibility, Data (export/import), About.
- **Animation:** Slide in 200ms ease-out, overlay backdrop.

### CommandPalette
- **Shape:** Centered modal, max-width 480px, 8px radius, 1px border.
- **Content:** Search input + results list (tools, actions, boards, templates, settings).
- **Shortcut:** `Ctrl+K`.
- **Animation:** Fade + scale 150ms.

### ContextMenu
- **Shape:** Floating panel, min-width 160px, 6px radius, 1px border, padding 4px.
- **Items:** 32px height, 6px radius on hover, compact label.
- **Position:** At cursor, within viewport bounds.
- **Sections:** Separator via 1px border line.

## Do's and Don'ts

### Do:
- **Do** use `--text-primary` (white) for active tools, selection, and primary actions only. Its rarity makes it meaningful.
- **Do** use `--bg-hover` (30ms) and `--bg-active` for button states — the tonal layering is the depth system.
- **Do** keep the canvas 100% of available space. The canvas is the product.
- **Do** use the TopBar's center for nothing — let the canvas breathe.
- **Do** use `--bg-panel` for floating panels (context toolbar, create panel, zoom controls).
- **Do** animate state transitions at 150–200ms with ease-out.

### Don't:
- **Don't** add a second accent color. The icon's white is the only accent.
- **Don't** use shadows on static surfaces. Floaters get one shadow level (0 4px 12px rgba(0,0,0,0.4)).
- **Don't** use glassmorphism, blur, or gradient text.
- **Don't** fill the TopBar center with buttons. Leave it empty.
- **Don't** use oversized tool buttons. 32×32px is the standard.
- **Don't** animate page loads. The app loads into the task.
- **Don't** use cards for content — the canvas is not a dashboard.
- **Don't** use multiple font families in UI. The system sans is the single voice.
- **Don't** use monospace for decoration — only for zoom/coordinates.
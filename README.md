# Inkboard

Monochrome infinite whiteboard — desktop-first app for visual thinking.

**Stack:** SvelteKit 5 + Tauri 2 + Rust. Design system: "Monochrome Workshop" (`DESIGN.md`).

**Status (v0.1.1 → M1 in progress):** Selection, canvas DPR sizing, text/sticky editing, shortcuts, autosave flush, eraser and import undo, z-order, object transform, shell reset and the Rust `object_count` fixed (M0 closed: M0-01…M0-17). Window controls verified by hand in `tauri dev` (M0-09, B08). `BoardCanvas.svelte` split into modules (M1-01). Native-dialog import (M0-15) still needs its manual check, and CI (M0-16) runs on its first push — see [Current status](#current-status) and `implementation_plan.md` §0.2.

## Features

- **Infinite canvas** — pan, zoom, optional grid, empty-state hint
- **Drawing** — pen (pressure via Pointer Events + perfect-freehand), highlighter, eraser
- **Shapes** — rect, ellipse, line, arrow, triangle, diamond, star, polygon, with editable fill, stroke, width, dash and corner radius
- **Grid snap** — toggle in Settings persisted with the board (`grid.snap`), Shift constrains movement to one axis, Shift rotates in 15° steps, and the arrow keys nudge the selection by 1 px (10 px with Shift) as one undo step per press (M1-07; smart guides come in M5)
- **Text layout** — measuring through a cached `ctx.measureText` instead of a `0.6 × fontSize` guess, shared by the renderer, the in-canvas editor and the box fitting, so the editor matches what the canvas draws; text wraps on resize and sticky notes wrap too (M1-08)
- **Styles** — pen/highlighter color and width, shape fill/stroke/width/dash/radius, text size, bold, italic, alignment and color, sticky color, opacity: all editable from the ContextToolbar and the ToolBar popover, each change undoable, and the last style is remembered per tool (M1-03)
- **Sticky notes / text** — in-canvas editing with undoable `UpdateContentCommand` (M0-04)
- **Images** — file picker, clipboard paste, drag & drop (PNG/JPG/WEBP/SVG); insert is a single undo step (M0-12)
- **Selection** — select, marquee, move, resize, rotate (B01 fixed in M0-02; strokes and connectors transform too since M0-10)
- **Undo/redo** — Command Pattern, 200 steps (eraser undo in M0-07, image insert and import in M0-12)
- **Clipboard** — copy, cut and paste of objects with `Ctrl+C/X/V` and the context menu; system clipboard with a versioned `inkboard/clipboard@1` payload plus an internal fallback, paste at the cursor with cumulative offset, works across boards, plain text pastes as a text object, and cut/paste are undoable (M1-04)
- **Groups** — group and ungroup with `Ctrl+G` / `Ctrl+Shift+G`; one click selects the group, double click enters it, transforms apply to the children, one nesting level, all undoable (M1-05)
- **Connectors** — straight connectors with arrowheads from any of the four side anchors of an object, or between free points, via the `C` tool; they follow the objects when moved, scaled or rotated, and survive the deletion of an endpoint as a free point (M1-09; orthogonal connectors come in M5)
- **Lock** — lock and unlock with `Ctrl+Shift+L` or the context menu; locked objects stay out of marquee selections and the eraser, and show a padlock on the selection overlay (M1-06)
- **Persistence** — SQLite + zstd via Rust when running in Tauri; `localStorage` fallback in browser (flushed on unmount, on `pagehide`/hidden, before returning Home and on window close — M0-06)
- **Export** — PNG, SVG, JSON (client-side)
- **Import** — images (native dialog reads raw bytes, M0-15; manual check pending); MS Whiteboard ZIP (text extraction only)
- **UI** — floating ToolBar, ContextToolbar, ContextMenu, Command palette (`Ctrl+K`), Create panel, Settings
- **Multi-board** — home picker with search, favorites, grid view
- **Desktop** — custom titlebar, window controls (capabilities granted in M0-09 and verified by hand — B08)

## Current status

| Area | State |
|------|--------|
| Selection / transform | **Works** after M0-02 and M0-10 (B01, B11, B12 fixed) — strokes and connectors move, scale and rotate around the box center |
| Canvas sizing / pointer coords | **Works** after M0-03 (B02 fixed) |
| Text / sticky editing | **Works** after M0-04 (B03 fixed) |
| Leave board &lt;2s | **Works** after M0-06 — flush on unmount, on `pagehide`/hidden, before returning Home and on window close (B05) |
| Shortcuts while typing in inputs | **Works** after M0-05 (B04, B09 fixed) — one table in `src/lib/input/shortcuts.ts` feeds the keydown, tooltips and palette |
| Eraser undo | **Works** after M0-07 (B06 fixed); locked objects are skipped |
| Z-order (bring/send to front/back) | **Works** after M0-08 (B07 fixed) — painted by `zIndex`, undoable via `ReorderCommand`; `]`/`[` one step, `Ctrl+]`/`Ctrl+[` all the way |
| Window controls (titlebar) | **Works** — M0-09 (B08) granted the capabilities and minimize/maximize/close were verified by hand in `tauri dev` |
| Native-dialog image import | **Likely fixed** in M0-15 (B16) — raw bytes instead of a JSON array; still to be confirmed in `tauri dev` |
| Board list in Home | No leftover board chrome after leaving a board (M0-13, B14) |
| `object_count` in SQLite | **Works** after M0-14 (B15 fixed) |
| Connectors / groups | Stub only — the Connector button stays hidden until M1-09 (M0-11) |
| PDF / JPG / `.inkboard` | Not implemented |
| Collaboration | UI stub |

Full bug table: `implementation_plan.md` §0.2. Active plan: §24 (M0 closed: M0-01…M0-17 done, with M0-15 and M0-16 pending their manual/GitHub checks; M1-01 done).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit 5 (SPA, `adapter-static`), TypeScript, Canvas 2D |
| Desktop | Tauri 2 |
| Backend | Rust — rusqlite, zstd, sha2, zip |
| Package manager | **pnpm** (`packageManager` in `package.json`) |
| Testing | Vitest (`src/**/*.test.ts`), Playwright (`e2e/`) |

## Getting Started

Prerequisites: **Node.js ≥ 22.22.2 recommended** (jsdom peers ask for it; `engine-strict=false` in `.npmrc` allows 22.19 for now), Rust toolchain (for Tauri), **pnpm**.

```bash
pnpm install
pnpm dev              # Browser (http://localhost:1420)
pnpm tauri dev        # Full desktop (Tauri + Vite)
```

### Build

```bash
pnpm build            # Frontend → `build/`
pnpm tauri build      # Desktop distributable
```

## Testing

```bash
pnpm test                           # Unit (Vitest) — 105/105
pnpm test:e2e                       # E2E (Playwright, boots `pnpm dev` on :1420) — 36/36
pnpm check                          # Svelte / TS check
cargo test --manifest-path src-tauri/Cargo.toml   # Rust — 11/11
```

**CI** (M0-16): `.github/workflows/ci.yml` runs `check`, unit, E2E and `cargo test` on `windows-latest` and `ubuntu-latest` (installing the Tauri system libs there), on every push and pull request. Not yet executed on GitHub — the first run happens with the first push.

## Design System

Visual identity: `DESIGN.md`, product constraints: `PRODUCT.md`.

- Accent: icon white (`#ffffff`) on near-black (`#0f1013`); user content is the only color on canvas
- Flat surfaces; floaters get one shadow level
- Theme: dark-first, with light / system options in Settings
- Motion: 150–200ms state transitions only

## Project Structure

Flat app (not a monorepo):

```
src/
  lib/
    canvas/       Camera, CanvasEngine, ObjectStore, SpatialIndex,
                  SelectionManager, HistoryManager, RenderLoop, Renderer,
                  commands
    tools/        Select, Pen, Highlighter, Eraser, Text, Sticky, Shape, Image
    objects/      types, factory, renderers, bounds, geometry
    io/           persistence, InternalFormat, PngExporter, SvgExporter,
                  transfer (import/export/downloads)
    input/        shortcuts (single shortcut table), InputController
                  (pointer, wheel, pinch)
    board/        BoardRuntime (wiring), BoardSession (load/autosave/flush),
                  boardInteractions (palette, menus, context actions)
    components/   BoardCanvas, TextEditor, app/TopBar, toolbar/ (ToolBar,
                  ToolPalette, ContextToolbar), menus/ (CommandPalette,
                  ContextMenu, ExportMenu), panels/, board/ (ZoomControls,
                  BoardChrome, CanvasHint), ui/
    stores/       ui.svelte.ts
  routes/         / (board picker), /board/[id]
  app.css         Design tokens + themes
src-tauri/
  src/
    commands/     health, persistence, import
    db/           SQLite schema + migrations
    formats/      ms_whiteboard
    geometry/     placeholder
  capabilities/   Tauri permission grants
e2e/              Playwright (smoke + M0 editing suite)
```

`BoardCanvas.svelte` is composition only (396 lines after M1-01): it mounts a
`BoardRuntime`, which owns the engine, renderer, input controller and save
session, and renders the chrome components.

## License

MIT

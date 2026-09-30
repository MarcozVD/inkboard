# Inkboard

Monochrome infinite whiteboard — desktop-first app for visual thinking.

**Stack:** SvelteKit 5 + Tauri 2 + Rust. Design system: "Monochrome Workshop" (`DESIGN.md`).

**Status (v0.1.0 → M0 in progress):** Selection works again (M0-02). Text/sticky editing, canvas pointer offset, flush-on-exit, and shortcut-vs-input bugs remain — see [Current status](#current-status) and `implementation_plan.md` §0.2.

## Features

- **Infinite canvas** — pan, zoom, optional grid, empty-state hint
- **Drawing** — pen (pressure via Pointer Events + perfect-freehand), highlighter, eraser
- **Shapes** — rect, ellipse, line, arrow, triangle, diamond, star, polygon
- **Sticky notes / text** — tools create objects; **in-canvas editing still broken** (B03)
- **Images** — file picker, clipboard paste, drag & drop (PNG/JPG/WEBP/SVG)
- **Selection** — select, marquee, move, resize, rotate (fixed in M0-02; stroke transform still latent B11)
- **Undo/redo** — Command Pattern, 200 steps (eraser undo still broken — B06)
- **Persistence** — SQLite + zstd via Rust when running in Tauri; `localStorage` fallback in browser (lost if leave board &lt;2s — B05)
- **Export** — PNG, SVG, JSON (client-side)
- **Import** — images; MS Whiteboard ZIP (text extraction only)
- **UI** — floating ToolBar, ContextToolbar, ContextMenu, Command palette (`Ctrl+K`), Create panel, Settings
- **Multi-board** — home picker with search, favorites, grid view
- **Desktop** — custom titlebar, window controls (minimize/maximize/close need capabilities — B08)

## Current status

| Area | State |
|------|--------|
| Selection / transform | **Works** after M0-02 (B01 fixed) |
| Text / sticky editing | **Broken** — editor closes empty / content not saved (B03) |
| Pointer vs canvas offset | **Broken** — stroke ~32px below cursor; DPR issues (B02) |
| Leave board &lt;2s | **Broken** — changes lost; no flush on unmount (B05) |
| Shortcuts while typing in inputs | **Broken** — keys still switch tools / delete (B04); sticky shortcut `S` wrong (B09) |
| Connectors / groups | Stub only |
| PDF / JPG / `.inkboard` | Not implemented |
| Collaboration | UI stub |

Full bug table: `implementation_plan.md` §0.2. Active plan: §24 (M0-01 / M0-02 done; M0-03… pending).

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
pnpm test                           # Unit (Vitest) — 65/65
pnpm exec playwright test           # E2E on :1420 — some fails expected until M0-03…M0-07
pnpm check                          # Svelte / TS check
```

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
                  SelectionManager, HistoryManager, RenderLoop, commands
    tools/        Select, Pen, Highlighter, Eraser, Text, Sticky, Shape, Image
    objects/      types, factory, renderers, bounds
    io/           persistence, InternalFormat, PngExporter, SvgExporter
    components/   BoardCanvas, TextEditor, app/TopBar, toolbar/, menus/,
                  panels/, board/ZoomControls, ui/
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

## License

MIT

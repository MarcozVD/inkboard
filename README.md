# Inkboard

Monochrome infinite whiteboard — a professional desktop app for visual thinking.

Built with **SvelteKit 5 + Tauri 2 + Rust**, following the "Monochrome Workshop" design system: a minimalist workspace where the user's content is the only color.

## Features

- **Infinite canvas** with pan, zoom, and optional grid
- **Drawing tools**: pen (with pressure sensitivity), highlighter, eraser
- **Shapes**: rectangle, ellipse, line, arrow, triangle, diamond, star, polygon
- **Sticky notes** with 8 colors
- **Text** with in-canvas editing
- **Images** (drag & drop, paste, file picker)
- **Undo/redo** (history manager, 200 steps)
- **Persistence**: SQLite via Rust backend, autosave with debounce
- **Export**: PNG, SVG, JSON
- **Import**: MS Whiteboard ZIP, images
- **Command palette** (Ctrl+K)
- **Dark/light theme** — designed, not inverted
- **Multi-board** with search, favorites, and grid view
- **Desktop-first**: custom titlebar, window controls, Tauri shell

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit 5, TypeScript, Canvas 2D |
| Desktop | Tauri 2 |
| Backend | Rust (rusqlite, zstd, serde) |
| Design | CSS custom properties, "Monochrome Workshop" system |
| Testing | Vitest (unit), Playwright (E2E) |

## Getting Started

```bash
npm install
npm run dev           # Browser dev server (http://localhost:1420)
npm run tauri dev     # Full desktop app (Tauri + Vite)
```

### Build

```bash
npm run build         # Frontend only
npm run tauri build   # Desktop distributable
```

## Testing

```bash
npm run test          # Unit tests (Vitest)
npx playwright test   # E2E tests (Playwright)
npm run check         # Svelte type-check
```

## Design System

The visual identity is documented in `DESIGN.md` and `PRODUCT.md`. The system is built around a single accent color — the icon's white (`#ffffff`) — on a near-black background (`#0f1013`). No second accent. The user's content is the only color on the canvas.

Key principles:
- **Canvas is the product** — the interface recedes when working
- **Monochrome palette** — white on black, tonal layering for depth
- **No shadows** on static surfaces (flat-by-default)
- **Single font family** — Segoe UI / system-ui
- **Motion only for state transitions** — 150–200ms, never decorative

## Project Structure

```
src/
  lib/
    canvas/       Canvas engine, render loop, camera, object store, history
    tools/        Drawing tools (pen, shape, text, sticky, image, eraser, select)
    objects/      Object types, renderers, bounds, factory
    io/           Persistence, export (SVG/PNG), import, serialization
    components/   UI components (app, toolbar, ui, panels, menus, board)
    stores/       Shared UI state
  routes/         SvelteKit pages (home, board/[id])
  app.css         Global styles + design tokens
src-tauri/
  src/            Rust backend (db, commands, formats)
  capabilities/   Tauri permission grants
```

## License

MIT
# Inkboard

Monochrome infinite whiteboard — desktop-first app for visual thinking.

**Stack:** SvelteKit 5 + Tauri 2 + Rust. Design system: "Monochrome Workshop" (`DESIGN.md`).

**Status (v0.2.0 shipped; M0, M1, M2 and M3 closed, M4 in progress):** Every bug from the audit is fixed and the editor is feature-complete for v0.2.0. M0 closed (M0-01…M0-17) with the window controls verified by hand and CI green on Windows and Ubuntu; M1 closed (M1-01…M1-13) with its gate met: `BoardCanvas.svelte` split into modules (377 lines), `engine.execute` as the only mutation path, editable styles, clipboard, groups, connectors, grid snap, keyboard nudge, precise resize, the shortcuts overlay and full context menu, ESLint + Prettier in CI, and light/dark/system themes on the canvas. **M2 closed (v0.3.0) with its gate met**: heavy Tauri commands off the main thread (`spawn_blocking`, SQLite in WAL, `user_version` migrations, a v0.1 database migrated without data loss), board management in Home, real 320×200 thumbnails, version history with retention, images in a content-addressed asset store outside the board JSON, the `.inkboard` archive, internal JSON import, a hardened import path where the webview never passes filesystem paths (bounded ZIP parsing, images re-encoded in Rust, CSP verified by hand), export as an options panel saved through a Rust command, a **faithful SVG exporter with vector PDF generated from it in Rust** (M2-10), and MS Whiteboard texts as a centered grid of sticky notes in one undo step. Still open: the M0-15 native-dialog import check (a PNG of 10 MB through the native dialog) and the manual check of the native save dialog for image and PDF exports. See [Current status](#current-status) and `implementation_plan.md` §0.2.

## Features

- **Infinite canvas** — pan, zoom, optional grid, empty-state hint
- **Drawing** — pen (pressure via Pointer Events + perfect-freehand), highlighter, eraser
- **Shapes** — rect, ellipse, line, arrow, triangle, diamond, star, polygon, with editable fill, stroke, width, dash and corner radius
- **Grid snap** — toggle in Settings persisted with the board (`grid.snap`), Shift constrains movement to one axis, Shift rotates in 15° steps, and the arrow keys nudge the selection by 1 px (10 px with Shift) as one undo step per press (M1-07; smart guides come in M5)
- **Text layout** — measuring through a cached `ctx.measureText` instead of a `0.6 × fontSize` guess, shared by the renderer, the in-canvas editor and the box fitting, so the editor matches what the canvas draws; text wraps on resize and sticky notes wrap too (M1-08)
- **Styles** — pen/highlighter color and width, shape fill/stroke/width/dash/radius, text size, bold, italic, alignment and color, sticky color, opacity: all editable from the ContextToolbar and the ToolBar popover, each change undoable, and the last style is remembered per tool (M1-03)
- **Sticky notes / text** — in-canvas editing with undoable `UpdateContentCommand` (M0-04)
- **Images** — file picker, clipboard paste, drag & drop (PNG/JPG/WEBP/SVG); insert is a single undo step (M0-12)
- **Image assets** — images are stored once by the SHA-256 of their bytes and the board JSON only carries `asset:<sha256>`, so autosaving a board no longer resends the image bytes and identical images deduplicate (M2-05). The store is the `assets` table in Tauri and IndexedDB in the browser (D3), the renderer resolves the reference into an object URL and repaints when it arrives, boards that still hold inline data URLs migrate on load behind a `board_versions` snapshot, and exports plus the clipboard inline the image again so the file stays portable
- **Selection** — select, marquee, move, resize, rotate (B01 fixed in M0-02; strokes and connectors transform too since M0-10; handles align to a rotated object and resize works in its local axis since M1-13)
- **Undo/redo** — Command Pattern, 200 steps (eraser undo in M0-07, image insert and import in M0-12)
- **Clipboard** — copy, cut and paste of objects with `Ctrl+C/X/V` and the context menu; system clipboard with a versioned `inkboard/clipboard@1` payload plus an internal fallback, paste at the cursor with cumulative offset, works across boards, plain text pastes as a text object, and cut/paste are undoable (M1-04)
- **Theme** — dark, light and `system` (which follows `prefers-color-scheme` live); the canvas background, grid, selection overlay and default colors come from the CSS tokens, the choice is persisted and applied at startup, and the default ink is the semantic value `ink` resolved per theme, while colors you pick stay absolute (M1-10)
- **Groups** — group and ungroup with `Ctrl+G` / `Ctrl+Shift+G`; one click selects the group, double click enters it, transforms apply to the children, one nesting level, all undoable (M1-05)
- **Connectors** — straight connectors with arrowheads from any of the four side anchors of an object, or between free points, via the `C` tool; they follow the objects when moved, scaled or rotated, and survive the deletion of an endpoint as a free point (M1-09; orthogonal connectors come in M5)
- **Lock** — lock and unlock with `Ctrl+Shift+L` or the context menu; locked objects stay out of marquee selections and the eraser, and show a padlock on the selection overlay (M1-06)
- **Persistence** — SQLite + zstd via Rust when running in Tauri; `localStorage` fallback in browser (flushed on unmount, on `pagehide`/hidden, before returning Home and on window close — M0-06)
- **Export** — an export panel with the options instead of a flat format list: format (PNG, JPG, SVG, PDF in the desktop app), area (whole board, selection or visible area), scale 1×–4×, JPEG quality (low/high/max) and a transparent background for PNG and SVG (JPEG has no alpha). In the desktop app the bytes go to a Rust command that opens the native save dialog and writes the file (no `fs` permission in the webview); in the browser it is a plain `<a download>`. Plus JSON and `.inkboard`, the ZIP with `board.json`, `metadata.json` and the referenced assets built in Rust (M2-06/M2-09; **`.inkboard` is desktop only**, the menu hides it in the browser)
- **Vector PDF** — the SVG is generated faithfully (center-based rotation, stars and polygons, arrowheads, filled perfect-freehand outlines, wrapped text, sticky notes, dash arrays, `ink` and theme colors, `asset:` images inlined as data URLs) and then converted in Rust with `usvg` + `svg2pdf`, so the PDF keeps text and strokes vectorial instead of embedding a raster (M2-10, D2). Desktop only, with its own native save dialog and no SVG fallback. An E2E test rasterizes the exported SVG and asserts it stays within 1% of pixels of the canvas PNG, which is what keeps the exporter honest against the renderer
- **Import** — `.inkboard` archives (parsed in Rust with entry, size and object limits, unsafe paths rejected and every asset re-hashed against its name), the board's own JSON either as a new board or inserted into the current one as a single undo step, both validated before anything is written (M2-07); images (native dialog, raw bytes; manual check pending); MS Whiteboard ZIP, whose extracted texts land as sticky notes in a grid centered on the viewport in one undo step, with an honest banner saying the export only carries text (M2-11). In the desktop app the whole pick happens in Rust and the webview never sends a filesystem path (M2-08) — see [Security](#security)
- **Safe import** — imported files are size-checked from metadata (≤ 100 MB) before being read, ZIP entries are bounded by declared size and by entry count so a zip bomb is rejected without being inflated, and images are decoded and re-encoded in Rust (`image`) to strip EXIF/XMP/ICC and bound decompression (M2-08)
- **UI** — floating ToolBar, ContextToolbar, ContextMenu, Command palette (`Ctrl+K`), Create panel, Settings
- **Multi-board** — home picker with search, favorites, grid view, rename and duplicate, sort by date or name, and a trash you can restore from or purge (M2-02)
- **Board thumbnails** — each board card shows a real 320×200 render of its content, captured 10 s after the last edit and flushed when you leave the board; boards without one yet keep the color tint as fallback (M2-03)
- **Version history** — automatic snapshot every 5 min of active editing, one before importing or restoring, and a manual "Save version"; Settings → Datos lists them with label and date and restores any of them, keeping 50 versions or 30 days, and a restore never destroys what was on the board (M2-04)
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
| Board thumbnails in Home | **Works** since M2-03 — real 320×200 PNGs in `boards.thumbnail`, debounced 10 s and flushed on exit; the per-board tint is the fallback |
| Version history | **Works** since M2-04 — automatic, pre-import/pre-restore and manual snapshots, listed and restorable from Settings → Datos, retention 50 versions / 30 days |
| Board JSON size with images | **Fixed** in M2-05 — the bytes live in `assets` (SQLite, or IndexedDB in the browser) and the JSON keeps only `asset:<sha256>` |
| `object_count` in SQLite | **Works** after M0-14 (B15 fixed) |
| Connectors / groups | **Works** since M1-09 and M1-05 — straight connectors with arrowheads (`C`) and groups (`Ctrl+G`); orthogonal connectors come in M5 |
| `.inkboard` archive | **Works** since M2-06 — Rust builds and parses the ZIP with limits and hash verification; desktop app only |
| Internal JSON import | **Works** since M2-07 — validated on import, as a new board or inserted into the current one in one undo step |
| Secure import | **Works** since M2-08 — no paths from the webview, 100 MB checked from metadata, bounded ZIP parsing, images re-encoded in Rust, CSP defined and verified by hand in the desktop app |
| PNG / JPG / SVG export | **Works** since M2-09 — export panel with format, area (board / selection / visible), scale 1×–4×, JPEG quality and transparent PNG/SVG; native save dialog in the desktop app, `<a download>` in the browser |
| MS Whiteboard import | **Partial** since M2-11 (was done in the plan) — the extracted texts become stickies in a centered grid in one undo step; ink and shapes are not imported, by design (§17) |
| PDF | **Works** since M2-10 — **vectorial**, generated in Rust from the same faithful SVG the canvas draws (`usvg` parses it against the system fonts, `svg2pdf` writes the bytes), so text and strokes stay vector; native save dialog in the desktop app only, no SVG fallback |
| SVG export fidelity | **Works** since M2-10 — the exporter mirrors the renderer (center-based rotation, stars and polygons, arrowheads, filled perfect-freehand outlines, wrapped text, sticky folds, dash arrays, `ink` and theme colors, `asset:` images inlined); an E2E test rasterizes the SVG and keeps it within 1% of the canvas PNG |
| Window geometry / single instance | **Works** since M4-01 — size, position and maximized state are restored; a second launch focuses the running window and forwards its `argv` |
| Open `.inkboard` by double-click | **Works** since M4-03 — extension registered in the bundle, the file received on `argv` is imported by Rust and the frontend only gets board ids |
| Logs in release | **Works** since M4-04 — rotating file in the OS log dir (5 MB × 5), info level, panic hook, Settings → Open logs folder |
| Release binary size | **Works** after M4-08 — 13.3 MB against the 15 MB budget (up from 10.5 MB with the `usvg`/`svg2pdf` PDF path of M2-10), enforced by `build.yml` on every tagged or manual build |
| In-app updates | **Works** since M4-05 — `tauri-plugin-updater` + `process`: silent check a few seconds after startup with a discreet notice, Settings → About → Check for updates, then install and relaunch behind a confirmation; downloaded in Rust, `process:allow-restart` added and `fs` still absent. **Not usable until a real release exists**: the signing secrets are not in the repo yet and `plugins.updater.pubkey` is still the Tauri template placeholder |
| Release workflow | **Works** since M4-06 — `release.yml` builds NSIS + MSI, a universal macOS `.dmg` and AppImage + `.deb` on a `v*` tag or a manual run, into one draft release with `latest.json`; unsigned (D4), fails early with a clear error when the signing secrets are missing, and `scripts/check-versions.mjs` keeps the three version files in sync — see [Releases](#releases) |
| macOS native chrome | **Works** since M4-02 — overlay title bar with the system traffic lights instead of our own buttons, plus a native app menu whose Edit items keep `Cmd+C/V` working in WKWebView. Verified by `cargo build` and unit tests only; there is no Mac on the dev machine, so the real check happens on the release artifacts (`implementation_plan.md` §24.8.1) |
| Onboarding & accessibility | **Works** since M4-07 — the empty board shows three keyboard hints, focus is always visible, the context menu and command palette are fully keyboard navigable with ARIA roles, Settings is a modal that keeps Tab inside and closes on Escape, and `prefers-reduced-motion` is respected |
| Theme on canvas | **Works** since M1-10 (D1 option b) — dark / light / `system`, `ink` resolves per theme, exports resolve it too |
| Collaboration | UI stub |

Full bug table: `implementation_plan.md` §0.2. Active plan: §24 (M0 closed: M0-01…M0-17 done, with M0-15 and M0-16 pending their manual/GitHub checks; M1 closed: M1-01…M1-13 done; **M2 closed with its gate met**: M2-01…M2-11 all done, with M2-09 still pending its manual Tauri check; M3 closed with its CI gate verified on GitHub Actions; M4 in progress with all eight tasks done, the first release still pending the signing secrets, the real updater key and a tag; see [Releases](#releases)).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit 5 (SPA, `adapter-static`), TypeScript, Canvas 2D |
| Desktop | Tauri 2 |
| Backend | Rust — rusqlite, zstd, sha2, zip, image |
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
pnpm tauri build      # Desktop distributable (installers under src-tauri/target/release/bundle/)
```

**Windows build:** `pnpm tauri build` produces a signed-less installer, so SmartScreen will warn on first run — that is the current decision (D4 in `implementation_plan.md` §28), and signing comes before any public distribution. The release binary is 13.3 MB against the 15 MB budget (RNF-06), kept there by `opt-level = "s"`, fat LTO, one codegen unit and `strip` in `[profile.release]`. `.github/workflows/build.yml` builds it on `windows-latest` for `workflow_dispatch` and `v*` tags only and fails if the exe goes over 15 MB.

**Opening `.inkboard` files:** the installers register the extension (M4-03), so double-clicking a `.inkboard` file in Explorer or the file manager opens it in Inkboard. If the app is already running, the existing window comes to the front and the board is imported there instead of opening a second instance (M4-01). The import path is the same validated one as the dialog: Rust reads the file, checks its size, imports assets and opens the board with a new id.

**Logs:** the desktop app writes rotating logs to its OS log directory (`%LOCALAPPDATA%\com.inkboard.app\logs` on Windows) — 5 MB per file, the last 5 kept, info level in release and debug in dev, including panics. Settings → **Open logs folder** opens that folder in the file manager. In the browser build there are no file logs; use the devtools console.

## Releases

`.github/workflows/release.yml` publishes the desktop app with `tauri-action` on a `v*` tag or a manual run — never on a plain push — and builds the three platforms in parallel:

| Platform | Artifacts |
|----------|-----------|
| `windows-latest` | NSIS installer + MSI |
| `macos-latest` | Universal binary (`universal-apple-darwin`, aarch64 + x86_64) in a `.dmg` |
| `ubuntu-22.04` | AppImage + `.deb` (needs `libwebkit2gtk-4.1-dev`) |

All three jobs land in the **same GitHub Release, left as a draft**, and `includeUpdaterJson` uploads the `latest.json` that the in-app updater reads from `releases/latest/download`. Nothing is code-signed and nothing is notarized: that is D4, and it is why Windows shows the SmartScreen warning and Gatekeeper blocks the `.dmg` until the user opens it anyway. Signing is a prerequisite for any public distribution.

### Publishing a release

1. **Set the version in all three files** — `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` must agree. `node scripts/check-versions.mjs` fails the workflow if they don't, and `src/lib/workflows.test.ts` asserts the same thing. The version must also match the tag you push: `tauri-action` runs with `tagName: v__VERSION__`, so the version in those files is what decides the tag the draft release is attached to.
2. **Before the first release**, add the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (Settings → Secrets and variables → Actions). The private key itself stays out of the repo; only the public half belongs in `src-tauri/tauri.conf.json`. Without both secrets the workflow stops early with an explicit error instead of failing halfway inside the action — the secrets are **not loaded in this repository yet**, so a tag pushed today fails on purpose.
3. **Replace the placeholder updater public key.** `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` currently holds the example key from the Tauri template; put the real public key there, or every downloaded update is rejected by the signature check.
4. **Tag and push**: `git tag vX.Y.Z && git push origin vX.Y.Z`. The three builds run and the draft release is created.
5. **Publish the draft** from the Releases page once the artifacts look right. The updater only sees a release once it is public.

### In-app updates

The desktop app checks `releases/latest/download/latest.json` a few seconds after startup and, if a newer version exists, shows a discreet notice pointing at Settings → About (**Check for updates**), which reports up to date, downloading with a percentage, installing or the error, and offers **Install and restart** behind a confirmation. The download happens in Rust and the webview never receives a filesystem path, the same rule as the rest of the desktop IO.

## Testing

```bash
pnpm test                           # Unit (Vitest) — 203/203
pnpm test:e2e                       # E2E (Playwright, boots `pnpm dev` on :1420) — 75/75
pnpm bench                          # Benchmarks (M3-01) — synthetic 2k/5k/10k boards
pnpm check                          # Svelte / TS check
pnpm lint                           # ESLint (0 problems; rule banning `store.*` outside canvas/ and tools/)
pnpm lint:fix                       # ESLint autofix
pnpm format                         # Prettier write
pnpm format:check                   # Prettier check
cargo test --manifest-path src-tauri/Cargo.toml   # Rust — 53/53
```

**Line endings:** the repo is **LF everywhere** — `.gitattributes` sets `* text=auto eol=lf` (and marks binaries `binary`), and Prettier is pinned to `endOfLine: "lf"`. Without both halves, `format:check` fails on `windows-latest` with CRLF checkouts while passing on Linux.

**CI** (M0-16, ampliada en M1-12): `.github/workflows/ci.yml` runs `lint`, `format:check`, `check`, unit, E2E and `cargo test` on `windows-latest` and `ubuntu-latest` (installing the Tauri system libs there), on every push and pull request. Last run on GitHub Actions: green on both OSes.

**Benchmarks** (M3-01): `pnpm bench` runs `bench/harness.bench.ts` with its own Playwright config — outside the E2E suite, one worker, uncapped frame rate. It measures pan/zoom FPS, pen latency, a 1k-object load, the autosave long tasks and the JS heap over synthetic 2k/5k/10k boards from `bench/generator.ts`, and writes a JSON with machine and browser metadata to `bench/results/` (gitignored). It talks to the app through `window.__inkboard`, which `benchBridge.ts` only installs in dev builds, and can switch on `window.__renderProfile` (`canvas/renderProfile.ts`, dev-only) for the per-phase breakdown behind the M3-05 numbers. The 2026-10-04 baseline and how it compares to each target are in `implementation_plan.md` §19; headless Chromium rasterizes in software, so treat those absolute numbers as pessimistic and comparable between runs.

## Performance

Everything below happens on the main thread; the only worker in the app serializes the autosave.

- **Stroke outlines are cached** per stroke as a `Path2D` and invalidated by an O(1) fingerprint, so `perfect-freehand` never runs per frame (M3-02). While pen/highlighter/shape/connector are drawing, the scene without the live object is painted once into an offscreen layer and each frame blits it and repaints only the active object — pen latency went from 87 ms to 0.5 ms at p50.
- **Text layout is cached** by font, width and content, and each image source is decoded once into an `ImageBitmap` behind a byte-budgeted LRU (M3-03).
- **LOD below zoom 0.25** (`canvas/lod.ts`): strokes become polylines, text under 3 screen px becomes bars, images use a 256 px bitmap (M3-04).
- **Dragging never reindexes the RBush tree** — the moved objects are tracked as deferred and drawn past the stale culling, then the index is synced once on release; the marquee computes its selection on `pointerup` (M3-05).
- **Autosave is incremental**: a content revision acts as the dirty flag, so a clean board is never serialized or written, and boards of 500+ objects serialize in a Web Worker with sync fallbacks (M3-06). Autosaving 5k objects went from a 62 ms long task to zero.

Result on the reference machine, measured headless: **65.8 FPS** panning 2k objects (RNF-01), **0.5 ms** pen latency (RNF-02), **zero** autosave long tasks at 5k (RNF-05), 433 ms to load 1k objects. That is why OffscreenCanvas/RenderWorker was rejected (M3-07, `implementation_plan.md` §28): the main thread is fast enough, and the design stays documented as an upgrade path.

`pnpm bench` runs on `workflow_dispatch` and weekly on Mondays (`.github/workflows/bench.yml`), never on push. With `BENCH_ASSERT=1` the harness fails the run if pan 2k drops below 30 FPS, pen p50 reaches 16 ms, an autosave long task exceeds 100 ms or a 1k load takes over 1.5 s — loose thresholds, because shared runners are slower than the reference machine.

## Design System

Visual identity: `DESIGN.md`, product constraints: `PRODUCT.md`.

- Accent: icon white (`#ffffff`) on near-black (`#0f1013`); user content is the only color on canvas
- Flat surfaces; floaters get one shadow level
- Theme: dark-first, with light / system options in Settings
- Motion: 150–200ms state transitions only

## Security

- **The webview never handles filesystem paths** (M2-08). Import and export open the native dialog in Rust (`import_pick`, `export_inkboard`) and read/write with `std::fs`, so the `fs` and `dialog` permissions were dropped from `capabilities/default.json`; the webview cannot ask for an arbitrary path.
- **Bounded imports.** A file is rejected above 100 MB from its metadata, before any read. ZIP archives are read with a declared-size check plus a hard `take()` cap per entry (25 MB) and an entry-count cap (256), so a zip bomb is refused instead of inflated. Image decoding is bounded too (20 000 px per edge, 512 MB allocated).
- **Imported images are re-encoded** in Rust with the `image` crate: JPEG stays JPEG, everything else becomes PNG, which strips EXIF/XMP/ICC metadata and container tricks. SVG is passed through as text.
- **CSP** is set in `tauri.conf.json` (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, no remote origins) and verified by hand in the desktop app: the board loads and paints, export and import work and nothing remote is requested.

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
                  exportRegion (export frame per mode), msWhiteboard
                  (sticky grid import), thumbnail (320×200 board render),
                  assets (content-addressed image store), importBoard
                  (validated JSON import), transfer (import/export/downloads)
    input/        shortcuts (single shortcut table), InputController
                  (pointer, wheel, pinch)
    board/        BoardRuntime (wiring), BoardSession (load/autosave/flush),
                  boardInteractions (palette, menus, context actions),
                  boardCommands, thumbnails, versionBridge
    components/   BoardCanvas, TextEditor, app/TopBar, toolbar/ (ToolBar,
                  ToolPalette, ContextToolbar), menus/ (CommandPalette,
                  ContextMenu, ExportMenu), panels/, board/ (ZoomControls,
                  BoardChrome, BoardNotice, CanvasHint), ui/
    stores/       ui.svelte.ts
  routes/         / (board picker), /board/[id]
  app.css         Design tokens + themes
src-tauri/
  src/
    commands/     health, persistence, import
    db/           SQLite schema + migrations
    formats/      ms_whiteboard, inkboard (.inkboard archive), images
                  (re-encode on import)
    geometry/     placeholder
  capabilities/   Tauri permission grants
e2e/              Playwright (smoke, M0 editing suite, export)
bench/             M3 benchmarks (generator, harness.bench.ts, own Playwright config)
```

`BoardCanvas.svelte` is composition only (377 lines after M1-01 and the M2-09 refactor): it mounts a
`BoardRuntime`, which owns the engine, renderer, input controller and save
session, and renders the chrome components.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Everything
so far is under `[Unreleased]`, grouped by milestone from M0 to M4, because no tag has been
published yet.

## License

MIT

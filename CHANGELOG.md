# Changelog

All notable changes to Inkboard are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.5.0] - 2026-10-04

First versioned build of the desktop app. The three version files read `0.5.0`, but **no
tag has been pushed yet**: the release still waits on the updater signing secrets and the
real public key, so nothing is published from GitHub yet. Grouped by milestone from
`implementation_plan.md` §24, keeping the task IDs so any line traces back to the plan.
Milestones M0 to M3 are complete with their gates met; M4 has all its tasks implemented and
tested but cannot be exercised end to end until that first release exists.

### Milestone M0 — v0.1.1, núcleo usable

A verified audit of the existing app (17 bugs, B01–B17), the fixes, and the test net that
keeps them fixed.

#### Added

- Playwright E2E suite reproducing the core editing bugs before fixing them (M0-01).
- GitHub Actions CI running tests, lint and format on Windows and Ubuntu (M0-16).
- ESLint and Prettier with gates in CI, and the codebase formatted to match (M0-16).
- `implementation_plan.md`: audited state (§0) and development plan (§24–§26).

#### Fixed

- Canvas sized to its box with the device pixel ratio, fixing the blurry render and the
  wrong offset on zoom (B02, M0-03).
- Text and sticky note content persisted through a command instead of being lost on exit
  (B03, M0-04).
- A single shortcut table with an input/modal guard, so shortcuts stopped firing while
  typing and conflicting across panels (B04/B09, M0-05).
- Autosave flushed on every exit path (unmount, `pagehide`, hidden, window close), keeping
  `createdAt` (B05, M0-06).
- Undo restored erased objects (B06, M0-07), painting respected `zIndex` and reordering
  became undoable (B07, M0-08), and the titlebar got the capabilities it needed (B08,
  M0-09).
- Strokes and connectors transformed, rotating around the box center instead of the origin
  (B11/B12, M0-10).
- Tool acceptance after switching tools, undoable image insertion and a clean unmount
  (B10/B13/B14, M0-11…M0-13), object counts taken from the board instead of the spatial
  index (B14, M0-14), and imported images read as raw bytes instead of through the
  filesystem (B15/B16, M0-15).
- `/board/[id]` no longer 404s, and the unused TopBar component was removed (M0-02, M0-17).

### Milestone M1 — v0.2.0, editor completo

#### Added

- Editable styles (color, width, fill, dash, corner radius) from the ContextToolbar and
  ToolBar (M1-03).
- Object clipboard with `Ctrl+C/X/V` and the system clipboard (M1-04).
- Groups with `Ctrl+G` / `Ctrl+Shift+G` and object locking with `Ctrl+Shift+L` (M1-05,
  M1-06).
- Grid snap, arrow-key nudge and measured text layout (M1-07, M1-08).
- Connector tool with straight connectors, four anchors and arrowheads (M1-09).
- Full context menu, shortcuts overlay (`?`) and lint gates (M1-11, M1-12).
- Resize and transform handles working in the object's local frame (M1-13).

#### Changed

- `BoardCanvas.svelte` split into canvas/input/board modules, composition only (M1-01).
- `engine.execute` became the single mutation API, which is what makes undo complete and
  autosave reliable (M1-02).
- Canvas theme driven by CSS tokens with dark / light / system, and `ink` as a semantic
  default color resolved per theme (M1-10).

### Milestone M2 — v0.3.0, datos seguros e IO

#### Added

- Board management in Home: rename, duplicate, soft delete with a restorable trash,
  sorting and favorites, persisted in SQLite (M2-02).
- Real board thumbnails: offscreen render at 320×200 written to `boards.thumbnail`
  (M2-03).
- Version history: automatic snapshot every 5 minutes of active editing, one before
  importing or restoring, manual snapshots, and a restore that never destroys (M2-04).
- Content-addressed asset store, so images live in SQLite instead of inside the board
  JSON, deduplicated by sha256 (M2-05).
- `.inkboard` archive format: ZIP with `board.json`, `metadata.json` and the referenced
  assets, built and parsed in Rust with limits and hash verification (M2-06).
- Import of the app's own JSON either as a new board or inserted into the current one in a
  single undo step (M2-07).
- Export options panel: format, area (whole board, selection or visible area), scale
  1×–4×, JPEG quality and transparent background (M2-09).
- Faithful SVG export mirroring the renderer, verified pixel by pixel against the canvas
  (M2-10).
- **Vector PDF export** generated in Rust from that same SVG with `usvg` and `svg2pdf`, so
  text and strokes stay vectorial (M2-10).
- MS Whiteboard ZIP import: extracted texts become sticky notes in a grid centered on the
  viewport, in one undo step (M2-11).

#### Changed

- Heavy Tauri commands moved off the main thread, SQLite in WAL with `foreign_keys` and
  `busy_timeout`, and migrations driven by `PRAGMA user_version`. A v0.1 database is
  detected and marked instead of being migrated destructively (M2-01).
- Import path hardened: the webview no longer sends filesystem paths, size is checked from
  metadata before reading, ZIP entries are bounded per entry and by count against zip
  bombs, imported images are re-encoded to strip metadata, and a CSP was defined (M2-08).
- Native save dialogs in Rust for `.inkboard`, image and PDF exports.

### Milestone M3 — v0.4.0, rendimiento medido

#### Added

- Benchmark harness with a measured baseline, run in CI with thresholds, first run passing
  (M3-01).
- Stroke outline cache and a static layer reused while drawing (M3-02).
- Text layout cache, decoded image cache, level of detail, and no reindexing on every drag
  move (M3-03…M3-05).
- Incremental autosave serialized off the main thread, with fallbacks so no environment
  loses autosave (M3-06).

#### Measured

On the reference machine: 65.8 FPS panning 2k objects (RNF-01), 0.5 ms pen latency
(RNF-02), zero autosave long tasks at 5k objects (RNF-05), 433 ms to load a 1k board.

#### Decisions

- OffscreenCanvas and a render worker were **not** adopted (M3-07): the main-thread work
  above already meets RNF-01/02/05, so that design stays as an upgrade path.

### Milestone M4 — v0.5.0 beta, release de escritorio

All tasks implemented and tested. Not usable end to end until a first release exists.

#### Added

- Window geometry persistence and a single instance that focuses the running window and
  forwards files to it (M4-01).
- `.inkboard` registered in the installer, with the file received on `argv` parsed in Rust
  (M4-03).
- Rotating log files in release, including panics, and **Open logs folder** in Settings
  (M4-04).
- In-app updates: silent check after startup, **Check for updates** in Settings → About,
  then install and relaunch behind a confirmation (M4-05).
- Release workflow publishing NSIS + MSI, a universal macOS `.dmg` and AppImage + `.deb`
  into one draft release, including the `latest.json` the updater reads (M4-06).
- Native macOS chrome: overlay title bar with the system traffic lights, and a native app
  menu whose Edit items keep `Cmd+C/V` working inside WKWebView (M4-02).
- Light onboarding on the empty board, visible keyboard focus, keyboard navigation and ARIA
  roles in the context menu, command palette and Settings, and `prefers-reduced-motion`
  support (M4-07).
- `CHANGELOG.md` (this file).

#### Changed

- Binary size measured in CI, failing the build over 15 MB (RNF-06). The release binary is
  13.3 MB.
- The E2E suite no longer loses its first click on a cold runner: Vite prebundles the app's
  dependencies up front, a Playwright `globalSetup` warms the dev server once, and the app
  sets a `data-ready` hydration signal that the helpers wait for. The first two tests had
  been failing only on `windows-latest` because dependency discovery reloaded the page
  mid-click.

#### Fixed

- Tauri plugin versions aligned between the Rust crates and the npm packages, so
  `pnpm tauri build` stops rejecting the release: `@tauri-apps/plugin-process` (`2.3`) and
  `@tauri-apps/plugin-updater` (`2.12`) now match the major.minor of their `tauri-plugin-*`
  crates. `scripts/check-versions.mjs` reads both `Cargo.lock` and `pnpm-lock.yaml`, maps each
  crate to its npm counterpart and fails CI when any pair differs in major.minor (B19).
- The updater public key was replaced by the value taken verbatim from the minisign `.pub`
  file; the one in `tauri.conf.json` had been corrupted by a manual transcription.
  `src/lib/updaterKey.test.ts` decodes the key, checks the canonical 42-byte minisign format
  (`Ed` algorithm, key id matching the comment) and rejects the corrupted string (B20).
- The release workflow now validates the updater signing secrets in seconds and fails with a
  clear `::error::` when either value is empty, carries a UTF-8 BOM, contains CRLF or trailing
  whitespace/newlines, or is not base64 that decodes to a minisign secret key. The first
  `v0.5.0` run had died about 14 minutes in because the key had been loaded with a BOM from
  PowerShell; after reloading the secrets without one the rerun passed on all three OS (B21).
  `src/lib/workflows.test.ts` covers the guard and asserts no secret value is printed.
- The release binary dropped from 15.49 MB to 10.15 MB, back under the RNF-06 budget: the
  release profile sets `panic = "abort"` and the panic hook writes a synchronous `panic.log`
  to the system log directory before aborting, so a crash still leaves a trace.

#### Known gaps before the first release

- The release is **drafted, not published**: the GitHub Release `v0.5.0` exists as a draft
  with the installers, their `.sig` files and `latest.json`, but the updater only sees a
  release once the user publishes it from the Releases page.
- Nothing is code-signed or notarized (decision D4): Windows shows the SmartScreen warning
  and macOS Gatekeeper blocks the `.dmg` until the user opens it manually. Signing is a
  prerequisite for public distribution.
- Manual checks still open: the native dialogs on Tauri (M0-15, M2-09) and the per-OS
  checklist run over the release artifacts (`implementation_plan.md` §24.8.1), including
  pointer events and input focus on WebKitGTK.
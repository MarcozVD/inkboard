# Inkboard — Plan de Implementación y Especificación Técnica

> **Doc v2.0** · **Repo:** v0.1.0 (`main` @ `3948189`) · **Spec original:** 2026-08-30 · **Auditoría verificada y plan:** 2026-09-30
> **Stack real:** Tauri 2 · SvelteKit 2 / Svelte 5 · Rust · TypeScript · Vite 8

## Cómo leer este documento

| Parte | Secciones | Uso |
|-------|-----------|-----|
| **Estado real** | §0 | Qué funciona hoy, verificado ejecutando la app (no deducido de los commits). |
| **Plan activo** | §24 – §26, §30 | Qué hacer ahora, en qué orden y cómo se acepta cada tarea. |
| Especificación de referencia | §1 – §23, §27 – §29 | Diseño objetivo. Los números de sección no cambian porque el código los cita (`// §15`, `// §19`…). |
| Historial | Apéndice A | Fases 0–18 de v0.1. Los comentarios `Fase N` del código apuntan ahí. |

---

## 0. Estado real verificado (2026-09-30)

**Método:** `pnpm test` (65/65 ✓), `pnpm check` (0 errores), `pnpm exec playwright test` (7/7 ✓), sondas Playwright contra `pnpm dev` (Chromium, el mismo motor que WebView2) y lectura de código.

**Conclusión:** todo lo automatizado está en verde, pero ningún test cubre la selección, la edición de texto, las coordenadas del puntero ni el guardado al salir. En uso real, el núcleo de edición está roto (§0.2). Por eso el plan empieza por M0 (§24.4).

### 0.1 Funciona

- Canvas infinito: pan (rueda, Space+arrastre, botón medio), zoom (Ctrl+rueda, `+`/`-`, controles) y grid.
- Pen y highlighter (perfect-freehand, presión), 8 formas por arrastre, creación de sticky y texto (aunque no se puede escribir en ellos, ver B03), imágenes por picker, paste y drag & drop.
- Undo/redo al crear trazos, formas, sticky y texto, y al borrar y duplicar.
- Autosave con debounce de 2 s → SQLite + zstd (Tauri) o localStorage (browser). Multi-board: crear, listar, buscar y marcar favoritos.
- Export PNG / SVG / JSON (descarga vía `<a download>`; sin verificar en Tauri). Import de imagen y de ZIP de MS Whiteboard (solo texto).
- Shell: TopBar, ToolBar, ZoomControls, CreatePanel, SettingsPanel, ContextMenu, ContextToolbar, CommandPalette y tema dark/light (solo la interfaz, no el canvas).
- `pnpm tauri dev` compila y lanza la app.

### 0.2 Bugs verificados

| ID | Síntoma | Causa raíz | Evidencia |
|----|---------|------------|-----------|
| B01 | ~~Select no selecciona, ni mueve, ni escala, ni rota. Cada arrastre lanza `TypeError: Cannot read properties of undefined (reading 'shift')`.~~ **Corregido (M0-02).** | `CanvasEngine` llamaba `tool.pointerDown({ screenX, … })` con un objeto, pero `SelectTool.pointerDown(sx, sy, modifiers)` esperaba tres argumentos. El cast `as unknown as BaseTool` ocultaba el error a TypeScript. Fix: `SelectTool extends BaseTool` + `ToolPointerEvent`. | Sonda → fix |
| B02 | ~~El trazo aparece ~32 px por debajo del cursor (a y≈300) y el lienzo se ve achatado en vertical. En pantallas con escala del 125–200 %, además, se ve borroso.~~ **Corregido (M0-03).** | El backing store usaba `window.innerWidth × innerHeight`, mientras la caja CSS quedaba bajo el TopBar; coords sin `getBoundingClientRect()`; sin `devicePixelRatio`. Fix: `ResizeObserver` + DPR + `toCanvasPoint`; TextEditor/ContextToolbar suman offset. | Sonda → fix |
| B03 | ~~Texto y sticky: el editor se cierra con el mismo clic que lo abre y el objeto queda vacío. Incluso si el editor sigue abierto, lo escrito no se guarda.~~ **Corregido (M0-04).** | (a) `mousedown` por defecto quitaba foco al textarea → commit vacío. (b) `onCommit` mutaba proxy `$state` sin escribir en el store. (c) doble commit Enter+blur. Fix: `preventDefault`, commit idempotente vía `UpdateContentCommand`, vacío elimina objeto. | Sonda → fix |
| B04 | ~~Escribir en inputs (renombrar board, CommandPalette, editor de texto) cambia de herramienta. Backspace borra la selección y `+`/`-` hacen zoom.~~ **Corregido (M0-05).** | El `onKeyDown` global en `window` no ignoraba los targets editables (`BoardCanvas.svelte:458`). Fix: guard `shouldIgnoreShortcut` (target `input`/`textarea`/`contenteditable` o modal abierto) antes de interpretar la tecla. | Sonda → fix |
| B05 | ~~Se pierden los cambios si se sale del board o se cierra la ventana antes de 2 s desde la última edición.~~ **Corregido (M0-06).** | El cleanup hacía `clearTimeout(autosaveTimer)` sin guardar (`BoardCanvas.svelte:932`), y no había `onCloseRequested`. Fix: `flushSave()` en el unmount, antes de `goto('/')`, en `pagehide` y en `visibilitychange` → hidden, y en `getCurrentWindow().onCloseRequested`; además, guardado forzado cada 30 s de edición continua. | Sonda → fix |
| B06 | ~~Deshacer un borrado del eraser no restaura nada.~~ **Corregido (M0-07).** | El comando leía `this.removed` en el momento de deshacer, y para entonces `pointerUp` ya lo había reasignado a `[]` (`src/lib/tools/EraserTool.ts:41`). Fix: `pointerUp` captura `const removed = this.removed` y el closure usa esa copia; el eraser además ignora los objetos `locked`. | Sonda → fix |
| B07 | ~~Bring to front / send to back no cambian lo que se ve: queda encima lo último que se movió.~~ **Corregido (M0-08).** | `render()` pintaba en el orden que devuelve RBush (`queryViewport`), no por `zIndex`, y reordenar tampoco se podía deshacer (`ReorderCommand` existía pero no se usaba). Fix: `queryViewport` devuelve el paint order por `zIndex`; las acciones de la ContextToolbar pasan por `reorderSelection()`, que empuja `ReorderCommand`; `]`/`[` mueven un paso y `Ctrl+]`/`Ctrl+[` van al frente/al fondo, con sus atajos en la tabla de M0-05. | Sonda → fix |
| B08 | ~~Los botones de minimizar, maximizar y cerrar del titlebar no hacen nada en la app de escritorio.~~ **Corregido (M0-09), verificado a mano.** | `capabilities/default.json` solo concede `core:window:default`, que no incluye `allow-minimize`, `allow-maximize`, `allow-unmaximize`, `allow-close` ni `allow-destroy` (este último lo usa el flush de M0-06). Fix: los cinco permisos añadidos; minimizar, maximizar/restaurar y cerrar comprobados en `pnpm tauri dev`. | `src-tauri/gen/schemas/acl-manifests.json` + `tauri dev` |
| B09 | ~~`S`, el atajo que muestran toolbar y palette, no activa sticky. `R/O/L/A` activan formas, pero no la forma indicada.~~ **Corregido (M0-05).** | El mapa `toolKey` usaba `n` para sticky y mapeaba `r/o/l/a` al mismo tool sin fijar la forma (`BoardCanvas.svelte:489`). Fix: tabla única en `lib/input/shortcuts.ts` con `S`/`N` ⇒ sticky y `R`/`O`/`L`/`A` ⇒ la forma concreta; toolbar y palette leen la misma tabla. | Sonda → fix |
| B10 | ~~El botón Connector se marca como activo, pero el engine sigue con la tool anterior.~~ **Corregido (M0-11).** | `engine.setTool('connector')` retornaba sin hacer nada porque no hay ConnectorTool, y la UI no se enteraba (`CanvasEngine.ts:71`). Fix: `setTool` devuelve `boolean` y la UI solo cambia si el engine aceptó; el botón Connector se oculta hasta M1-09. | Sonda → fix |
| B11 | ~~*(Latente, tapado por B01.)* Mover o escalar un trazo o un conector no cambia lo que se ve.~~ **Corregido (M0-10).** | Se actualizaba `transform`, pero el renderer y los bounds usan `points` / `startPoint` / `endPoint` en coordenadas de mundo. Fix: `objects/geometry.ts` con `translateObject`, `scaleObject` y `rotateObject` que mueven los puntos de trazos y conectores; `UpdateTransformCommand` guarda `GeometrySnapshot` (transform + puntos) en vez de solo el transform. | Sonda → fix |
| B12 | ~~La rotación es inconsistente entre módulos.~~ **Corregido (M0-10).** | El renderer rotaba alrededor de la esquina superior izquierda (`src/lib/objects/renderers.ts:42`) y `SelectTool` alrededor del centro; el AABB y el export SVG ignoraban la rotación. Fix: convención única de **rotación alrededor del centro de la caja**, en el renderer, `worldToLocal`, `getObjectBounds` (AABB de la caja rotada) y el SVG (`rotate(deg cx cy)`). | Sonda → fix |
| B13 | ~~Hay operaciones que no se pueden deshacer.~~ **Corregido (M0-12).** | Insertar imagen (`ImageTool` no registraba comando), editar texto, reordenar e importar ZIP de MS Whiteboard. Fix: `ImageTool` empuja un `AddObjectCommand` por imagen (picker, paste y drop) y la importación de MS Whiteboard entra como un único paso; el texto ya era deshacible desde M0-04 y el reordenar desde M0-08. | Sonda → fix |
| B14 | ~~En Home, la TopBar sigue mostrando los controles del board (undo/redo del engine ya destruido, avatares).~~ **Corregido (M0-13).** | `ui`/`uiActions` no se reseteaban al desmontar y `isBoard` se deducía de `boardName !== 'Inkboard'` (`src/lib/components/app/TopBar.svelte:12`). Fix: `resetUi()` en el unmount del board, `syncShell()` deja de escribir tras el desmontaje y la TopBar decide el modo por `page.route.id`. | Sonda → fix |
| B15 | ~~`object_count` vale siempre 0 en SQLite.~~ **Corregido (M0-14).** | `count_objects` buscaba `objects` en la raíz, pero el JSON los guarda en `board.objects` (`src-tauri/src/db/mod.rs:170`). Fix: lee `board.objects`; 3 tests de Rust lo cubren, uno de ellos guardando en una base en memoria. | Sonda → fix |
| B16 | ~~Importar por el diálogo nativo una imagen de más de ~100 KB probablemente falla.~~ **Corregido (M0-15); falta la verificación manual.** | `read_file_bytes` devolvía `Vec<u8>` serializado como array JSON, y el front hacía `String.fromCharCode(...bytes)` → `RangeError` (`BoardCanvas.svelte:804`). Fix: el comando devuelve `tauri::ipc::Response` (bytes crudos → `ArrayBuffer`) y el front construye un `Blob` que lee con `FileReader`; queda importar un PNG de 10 MB por el diálogo nativo. | `src-tauri/src/commands/import.rs` |
| B17 | ~~El `createdAt` del board se reescribe en cada autosave.~~ **Corregido (M0-06).** | `scheduleAutosave` construía el board con `createdAt: Date.now()`. Como el JSON cambia siempre, el hash SHA-256 de Rust nunca llega a evitar una escritura. Fix: `boardCreatedAt` se toma del board cargado y `buildBoard()` lo reutiliza en cada guardado, incluido el import. | Sonda → fix |

### 0.3 Deuda técnica que condiciona el plan

- **`BoardCanvas.svelte` era un monolito de 1235 líneas** (render, input, atajos, autosave, import/export, menús y paleta). M1-01 lo partió en `canvas/Renderer.ts`, `input/InputController.ts`, `board/BoardRuntime.ts`, `board/BoardSession.ts`, `board/boardInteractions.ts` e `io/transfer.ts`, más los componentes `BoardChrome`, `CanvasHint`, `ExportMenu` y `ToolPalette`: ahora son 396 líneas de composición. Ahí siguen viviendo B07, B14 y B17, y parte de B12.
- **Sin `store.*` fuera de los comandos:** desde M1-02 todo pasa por `engine.execute(cmd)` → store → historial → autosave → render, y `HistoryManager` agrupa (batch/transacción) o revierte (rollback) los pasos múltiples.
- **Rendimiento:** `perfect-freehand` se recalcula para cada trazo visible en cada frame (`smoothedPoints` nunca se rellena). El autosave serializa el board entero, imágenes incluidas como data URL. Los comandos Tauri son síncronos, así que corren en el hilo principal.
- **Seguridad:** `csp: null`. `inspect_import` y `read_file_bytes` leen cualquier ruta que mande el webview. El ZIP se descomprime entero antes de comprobar su tamaño (zip bomb).
- **Tema:** el canvas usa colores oscuros fijos (`#0f1013`, grid, selección blanca). `system` no sigue al sistema operativo y el tema no se guarda.
- ~~**Sin UI de estilo:**~~ resuelta en M1-03: ContextToolbar y popover del ToolBar editan color, grosor, fill, stroke, dash, radio, opacidad y tipografía, cada cambio pasa por `UpdateStyle` y el último estilo se recuerda por tool.
- **Código muerto:** `src-tauri/src/geometry/` (vacío). `src/lib/components/TopBar.svelte` se borró en M0-17 (nadie lo importaba).
- **Calidad:** con CI desde M0-16 y E2E de las funciones básicas de edición; sin ESLint ni `prettier --check` (M1-12).
- **Documentación:** `README.md` refleja el estado real tras M0 (`PRODUCT.md` L27 todavía cita B04/B05/B09 como pendientes y su título sigue diciendo "M0 en curso").

### 0.4 Parcial o no implementado

Conectores (tipo + renderer, sin tool) · grupos (solo el tipo) · clipboard de objetos (stub) · lock (campo sin UI) · snap y smart guides · minimap · PDF / JPG / `.inkboard` · versiones y backup (tabla sin uso) · thumbnails reales · borrar, renombrar o duplicar boards desde Home · workers / OffscreenCanvas · colaboración.

### 0.5 Layout del repo y comandos

Raíz plana, sin monorepo: `src/`, `src-tauri/`, `e2e/` y docs (detalle en §23).

```bash
pnpm dev                                       # Vite en :1420 (browser, persistencia en localStorage)
pnpm tauri dev                                 # app de escritorio
pnpm test                                      # Vitest (unit)
pnpm exec playwright test                               # E2E contra :1420
pnpm check                                     # svelte-check + TypeScript
cargo test --manifest-path src-tauri/Cargo.toml   # tests Rust
pnpm tauri build                               # instaladores
```

Comandos Tauri expuestos: `health`, `save_board`, `load_board`, `list_boards`, `inspect_import`, `read_file_bytes`.

---

## 1. Resumen Ejecutivo

Se plantea el desarrollo de **Inkboard**, una aplicación de pizarras digitales infinitas de nivel profesional, multiplataforma (Windows/macOS/Linux), con capacidad futura de colaboración en tiempo real. El stack es **Tauri 2 + SvelteKit + Rust**, con renderizado basado en **Canvas 2D** (hoy en hilo principal; **OffscreenCanvas** queda como upgrade path), evolucionable hacia WebGL en caso de necesidad demostrada.

La prioridad explícita es: **PERFORMANCE > ESTABILIDAD > MANTENIBILIDAD > FUNCIONES EXÓTICAS**.

No se incluye Rust donde TypeScript sea suficiente. No se introduce complejidad arquitectural sin un beneficio medible.

---

## 2. Requisitos Funcionales

### RF-01 — Canvas Infinito
Lienzo sin límites aparentes, con pan, zoom (rueda, trackpad, atajos), grid opcional, snap opcional, sistema de cámara con coordenadas mundo independientes de la resolución de pantalla.

### RF-02 — Selección y Transformación
Selección individual, múltiple (rect drag, Shift+click, Ctrl+click), bounding boxes, handles de escala y rotación, bloqueo/desbloqueo, visibilidad, agrupación.

### RF-03 — Herramientas de Dibujo
Lápiz libre (con suavizado), marcador/resaltador, borrador (por objeto y parcial).

### RF-04 — Texto
Objetos de texto editables in-canvas, tipografía completa, redimensión, rotación.

### RF-05 — Sticky Notes
Notas adhesivas con color, texto editable, resize/rotate/move/duplicate.

### RF-06 — Formas
Rectángulo, cuadrado, círculo, elipse, línea, flecha, triángulo, rombo, estrella, polígono. Con fill, stroke, opacidad, resize, rotate.

### RF-07 — Conectores
Líneas y flechas con puntos de conexión a objetos, actualización automática al mover.

### RF-08 — Imágenes
Drag & drop, paste desde clipboard, upload. Formatos PNG/JPG/WEBP/SVG. Resize, rotate, crop, move, duplicate.

### RF-09 — Clipboard
Copy/Cut/Paste/Duplicate. Clipboard interno y del sistema. Portabilidad entre tableros.

### RF-10 — Undo / Redo
Historial de comandos (Command Pattern), transaccional, agrupación de operaciones, sin snapshots completos.

### RF-11 — Capas / Z-Order
Bring to front/back, forward/backward. Z-index explícito en el modelo de datos.

### RF-12 — Agrupación
Group/Ungroup. Grupos anidados (nivel 1 de anidamiento en MVP, ilimitado después).

### RF-13 — Snap y Alineación
Grid snap, object snap, smart guides, distribución uniforme (horizontal/vertical).

### RF-14 — Múltiples Tableros
Workspace con N tableros independientes. Cada tablero tiene su propia cámara, objetos, historial y metadatos.

### RF-15 — Persistencia
Autosave, versionado local, backup, export/import. Formato interno propio.

### RF-16 — Exportación
PNG, JPG, SVG, PDF, JSON (propio), archivo de proyecto completo (.inkboard).

### RF-17 — Importación Microsoft Whiteboard
Importación de ZIP/HTML/JSON de MS Whiteboard, importación vía imagen (PNG/JPG), importación vía SVG. Sin dependencia del formato externo.

### RF-18 — Atajos de Teclado
Sistema configurable. Set mínimo documentado en §21.

### RF-19 — Soporte de Input
Mouse, teclado, touch (multi-touch), pen/stylus (Pointer Events API). Presión cuando esté disponible.

---

## 3. Requisitos No Funcionales

| ID | Requisito | Objetivo medible |
|----|-----------|-----------------|
| RNF-01 | Framerate | ≥ 60 FPS en operaciones normales con ≤ 2.000 objetos |
| RNF-02 | Latencia de dibujo | < 16 ms desde evento pointer hasta trazo visible |
| RNF-03 | Carga inicial | < 2 s para tablero con 500 objetos |
| RNF-04 | Memoria | < 300 MB RSS en tablero con 5.000 objetos |
| RNF-05 | Autosave | Sin bloqueo perceptible del hilo principal |
| RNF-06 | Tamaño de binario | < 15 MB (Tauri, sin bundled Chromium) |
| RNF-07 | Compatibilidad SO | Windows 10+, macOS 12+, Linux (WebKitGTK 6) |
| RNF-08 | Escalabilidad | Sin degradación crítica hasta 10.000 objetos |

---

## 4. Arquitectura General

```
┌─────────────────────────────────────────────────────────┐
│                    INKBOARD APP                         │
│                                                         │
│  ┌─────────────────┐      ┌──────────────────────────┐  │
│  │  SvelteKit UI   │      │   Rust Core (Tauri)      │  │
│  │                 │◄────►│                          │  │
│  │  • Toolbar      │ IPC  │  • Persistence (SQLite)  │  │
│  │  • Panels       │      │  • Geometry Engine       │  │
│  │  • Dialogs      │      │  • Import/Export         │  │
│  │  • Board List   │      │  • Compression           │  │
│  │                 │      │  • File System           │  │
│  └────────┬────────┘      └──────────────────────────┘  │
│           │                                             │
│  ┌────────▼────────────────────────────────────────┐    │
│  │           Canvas Engine (TypeScript)            │    │
│  │                                                 │    │
│  │  Camera │ ObjectStore │ Renderer │ EventSystem  │    │
│  │  SelectionManager │ HistoryManager │ ToolEngine │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │          Web Workers / OffscreenCanvas           │   │
│  │                                                  │   │
│  │  RenderWorker │ SpatialIndexWorker │ AutoSaveWorker│  │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Principio fundamental (spec):** el hilo principal solo maneja eventos de input y actualiza el estado. El renderizado ocurre en un Worker con OffscreenCanvas…

**Realidad v0.1:** renderizado y serialización viven en el hilo principal (`RenderLoop` + debounce de autosave). Workers / OffscreenCanvas **no** están activos; el diagrama de arriba es el diseño objetivo.

---

## 5. Diagrama de Componentes

> **Diagrama objetivo.** Varios archivos todavía no existen (`Scene.ts`, `ClipboardManager.ts`, `SnapEngine.ts`, `ConnectorTool.ts`, `PropertyPanel.svelte`, `MiniMap.svelte`…). El layout real está en §23 y el plan que los crea, en §24.

```
SvelteKit App
├── routes/
│   ├── +layout.svelte         (shell principal)
│   ├── +page.svelte           (workspace home)
│   └── board/[id]/+page.svelte (board view)
│
├── Canvas Engine (lib/canvas/)
│   ├── Camera.ts              (viewport, transform, zoom)
│   ├── Scene.ts               (árbol de objetos)
│   ├── Renderer.ts            (orchestrator)
│   ├── RenderWorker.ts        (OffscreenCanvas worker)
│   ├── ObjectStore.ts         (CRUD de objetos)
│   ├── SpatialIndex.ts        (RBush wrapper)
│   ├── SelectionManager.ts    (selección, handles)
│   ├── HistoryManager.ts      (undo/redo)
│   ├── ClipboardManager.ts    (copy/paste)
│   └── SnapEngine.ts          (grid, object snap)
│
├── Tools (lib/tools/)
│   ├── SelectTool.ts
│   ├── PenTool.ts
│   ├── HighlighterTool.ts
│   ├── EraserTool.ts
│   ├── TextTool.ts
│   ├── StickyNoteTool.ts
│   ├── ShapeTool.ts
│   ├── ConnectorTool.ts
│   └── ImageTool.ts
│
├── Objects (lib/objects/)
│   ├── BaseObject.ts
│   ├── StrokeObject.ts
│   ├── TextObject.ts
│   ├── ShapeObject.ts
│   ├── ImageObject.ts
│   ├── StickyNoteObject.ts
│   ├── ConnectorObject.ts
│   └── GroupObject.ts
│
├── Stores (lib/stores/)
│   ├── workspaceStore.ts
│   ├── boardStore.ts
│   ├── selectionStore.ts
│   ├── toolStore.ts
│   └── settingsStore.ts
│
├── Import/Export (lib/io/)
│   ├── InternalFormat.ts      (serializer/deserializer propio)
│   ├── MsWhiteboardImporter.ts
│   ├── SvgExporter.ts
│   ├── PngExporter.ts
│   └── PdfExporter.ts
│
└── UI Components (lib/components/)
    ├── Toolbar.svelte
    ├── TopBar.svelte
    ├── BoardList.svelte
    ├── ContextMenu.svelte
    ├── PropertyPanel.svelte
    ├── MiniMap.svelte
    └── ShortcutHelper.svelte

Rust (src-tauri/src/)
├── commands/
│   ├── persistence.rs         (save/load SQLite)
│   ├── geometry.rs            (hit-testing, bounds)
│   ├── import.rs              (MS Whiteboard, etc.)
│   └── export.rs              (PNG, PDF, SVG rast.)
├── db/
│   ├── schema.sql
│   └── migrations/
├── geometry/
│   ├── rtree.rs
│   ├── transform.rs
│   └── bounds.rs
└── formats/
    ├── internal.rs            (serde_json / MessagePack)
    └── ms_whiteboard.rs
```

---

## 6. Arquitectura Svelte

### Decisión: SvelteKit en modo SPA (adapter-static)

**¿Por qué SvelteKit y no Svelte puro?**
- Routing integrado (board/[id])
- Mejor organización de código a escala
- Fácil evolución hacia versión web con SSR
- Tauri 2 requiere modo estático → `adapter-static` con `ssr = false`

**Gestión de estado:**
- Svelte Stores nativos para estado global (workspace, board activo, selección, tool activa)
- Estado del canvas (objetos, cámara, historial) **NO pasa por Svelte stores** — vive directamente en el Canvas Engine por razones de performance
- La UI Svelte reacciona a eventos emitidos por el Canvas Engine vía un EventBus ligero

```typescript
// Patrón de comunicación Canvas Engine ↔ Svelte
// El canvas engine emite eventos DOM custom
canvas.on('selectionChange', (objects) => {
  selectionStore.set(objects);
});
canvas.on('historyChange', (canUndo, canRedo) => {
  historyStore.set({ canUndo, canRedo });
});
```

**¿Por qué evitar que Svelte stores manejen los objetos del canvas?**
Un store de Svelte con 5.000 objetos triggeriaría re-renders masivos ante cualquier cambio. El canvas engine es el source of truth; Svelte solo necesita datos derivados (selección actual, metadata del board, estado de las herramientas).

---

## 7. Arquitectura Rust

### Principio: Rust solo donde justifica la complejidad

| Operación | TypeScript/JS | Rust | Decisión |
|-----------|--------------|------|----------|
| UI / toolbar / paneles | ✅ Suficiente | Innecesario | **TS** |
| Event handling canvas | ✅ Suficiente | Innecesario | **TS** |
| Renderizado Canvas 2D | ✅ Nativo | No aplica | **TS** |
| Cálculo de bounding boxes simples | ✅ Suficiente | Innecesario | **TS** |
| Spatial indexing (RBush TS port) | ✅ Suficiente | Rust si escala | **TS primero** |
| Serialización JSON < 1 MB | ✅ Suficiente | Innecesario | **TS** |
| Serialización JSON > 5 MB | Lento | ✅ 5-10× más rápido | **Rust** |
| Parsing import MS Whiteboard | Riesgo seguridad | ✅ Sandboxed | **Rust** |
| Exportación PNG/PDF | Complejo en TS | ✅ Crates maduras | **Rust** |
| Compresión zstd/lz4 | No nativo | ✅ Nativo | **Rust** |
| Persistencia SQLite | Posible | ✅ rusqlite | **Rust** |
| Hit-testing masivo (>10k obj.) | Lento | ✅ | **Rust** |
| Procesamiento de strokes offline | Posible | ✅ si necesario | **TS primero** |

### Crates principales
```toml
[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rmp-serde = "1"          # MessagePack
rusqlite = { version = "0.31", features = ["bundled"] }
image = "0.25"           # procesamiento de imágenes
printpdf = "0.7"         # exportación PDF
resvg = "0.43"           # rasterización SVG
usvg = "0.43"
zstd = "0.13"            # compresión
anyhow = "1"
uuid = { version = "1", features = ["v4"] }
tokio = { version = "1", features = ["full"] }
```

### Tauri Commands expuestos al frontend

> **Hoy existen:** `health`, `save_board`, `load_board`, `list_boards`, `inspect_import`, `read_file_bytes`. Los de abajo son el diseño objetivo: la gestión de boards y los assets llegan en M2 (§24.6); PNG y JPG se exportan desde TypeScript y PDF desde Rust (M2-10).

```rust
#[tauri::command]
async fn save_board(board: BoardData) -> Result<(), String>

#[tauri::command]
async fn load_board(id: String) -> Result<BoardData, String>

#[tauri::command]
async fn list_boards() -> Result<Vec<BoardMeta>, String>

#[tauri::command]
async fn import_ms_whiteboard(path: String) -> Result<BoardData, String>

#[tauri::command]
async fn export_png(board_id: String, options: ExportOptions) -> Result<Vec<u8>, String>

#[tauri::command]
async fn export_pdf(board_id: String) -> Result<Vec<u8>, String>

#[tauri::command]
async fn compress_board(data: Vec<u8>) -> Result<Vec<u8>, String>
```

---

## 8. Arquitectura Tauri

### Tauri 2 vs alternativas

| Criterio | Tauri 2 | Electron | PWA |
|---------|---------|----------|-----|
| Tamaño binario | ~5-10 MB | ~150-200 MB | N/A |
| RAM idle | ~50-80 MB | ~200-400 MB | Variable |
| Startup | < 500 ms | 2-5 s | Variable |
| Acceso filesystem | Nativo (Rust) | Node.js | Limitado |
| Consistencia cross-platform | ⚠️ WebView OS | ✅ Chromium | ✅ navegador |
| Seguridad | ✅ Rust, capabilities | ⚠️ Node.js | Sandboxed |
| Complejidad inicial | Media (Rust) | Baja (JS) | Baja |

**Decisión: Tauri 2**
El objetivo es una app de escritorio rápida y ligera. Tauri 2 gana en todos los métricas relevantes. La inconsistencia de WebView entre plataformas se mitiga mediante una capa de CSS/JS que no depende de características avanzadas del navegador.

**Riesgo WebView Linux:** WebKitGTK en Linux puede tener comportamientos diferentes. Mitigación: testear en Ubuntu 22.04+ y Fedora con GNOME como targets primarios.

### Configuración clave
```json
// tauri.conf.json
{
  "app": {
    "windows": [{
      "title": "Inkboard",
      "width": 1400,
      "height": 900,
      "minWidth": 800,
      "minHeight": 600
    }]
  },
  "capabilities": {
    "default": {
      "permissions": [
        "core:path:default",
        "core:event:default",
        "core:window:default",
        "core:app:default",
        "core:resources:default",
        "core:menu:default",
        "core:tray:default",
        "fs:default",
        "dialog:default",
        "clipboard-manager:default"
      ]
    }
  }
}
```

---

## 9. Sistema de Renderizado Recomendado

### Comparativa técnica

| Tecnología | Pros | Contras | Adecuación whiteboard |
|-----------|------|---------|----------------------|
| **Canvas 2D** | Simple, compatible, suficiente para ≤10k obj. | CPU-bound, sin compute shaders | ✅ Alta |
| **SVG** | Escalable, accesible, DOM-editable | Lento con >500 nodos, no para strokes | ❌ Baja |
| **WebGL** | GPU, miles de objetos fluidos | Shaders GLSL, sin texto nativo, complejo | ⚠️ Media-Alta |
| **WebGPU** | Máximo rendimiento, compute shaders | Soporte parcial en 2026, muy complejo | ⚠️ Media (futuro) |
| **Híbrido Canvas + DOM** | Texto/inputs en DOM, dibujado en Canvas | Sincronización difícil | ⚠️ Media |

### Decisión: Canvas 2D con OffscreenCanvas + Worker

> **Estado:** hoy se renderiza en el hilo principal. OffscreenCanvas + Worker solo se adopta si los benchmarks de M3 no alcanzan RNF-01/02 con las optimizaciones en hilo principal (decisión M3-07).

**Justificación:**
1. Canvas 2D es suficiente para 2.000-10.000 objetos a 60 FPS con culling correcto
2. OffscreenCanvas permite renderizar en un Worker separado, liberando el hilo principal
3. No requiere shaders GLSL ni conocimiento de GPU programming
4. El texto sigue siendo renderizable nativamente (ctx.fillText)
5. La complejidad de WebGL no está justificada hasta que los benchmarks demuestren que Canvas 2D es insuficiente
6. WebGPU queda como upgrade path documentado

**Arquitectura del renderizador:**

```
Main Thread
├── Eventos de input (Pointer Events)
├── Actualización de estado (ObjectStore, Camera)
├── Comunicación con Svelte (stores)
└── Envío de RenderCommand al Worker

RenderWorker (OffscreenCanvas)
├── Recibe RenderCommand con snapshot del estado
├── Ejecuta viewport culling
├── Dibuja objetos visibles en orden de z-index
├── Cachea objetos estáticos en ImageBitmap offscreen
└── Transfiere frame al canvas principal
```

**Rendering pipeline por frame:**
```
1. requestAnimationFrame (main thread)
2. Camera.getViewTransform()
3. SpatialIndex.queryViewport(viewport)       → objetos visibles
4. SortByZIndex(visibleObjects)
5. Para cada objeto:
   a. Si en caché válida → blit ImageBitmap
   b. Si no → render + cache
6. Overlay (selection handles, guides, cursors)
7. Transferir frame
```

**Optimizaciones de renderizado:**
- **Viewport culling:** solo objetos cuyo AABB intersecta el viewport
- **Object caching:** objetos estáticos se renderizan a ImageBitmap, solo re-renderizados cuando cambian (dirty flag)
- **Dirty regions:** en strokes activos, solo se redibuja la región del trazo nuevo
- **Level of Detail:** objetos muy pequeños en zoom out se renderizan simplificados o como puntos
- **Batching:** strokes del mismo color/grosor se dibujan en un solo path
- **Layer caching:** grupos de objetos que no cambian se cachean como una imagen completa

---

## 10. Modelo de Datos

### Workspace
```typescript
interface Workspace {
  id: string;              // UUID v4
  name: string;
  createdAt: number;       // Unix timestamp ms
  updatedAt: number;
  boards: BoardMeta[];     // solo metadata, no objetos completos
  settings: WorkspaceSettings;
}

interface WorkspaceSettings {
  theme: 'light' | 'dark' | 'system';
  defaultGridEnabled: boolean;
  defaultSnapEnabled: boolean;
  autosaveIntervalMs: number;
}
```

### Board
```typescript
interface Board {
  id: string;
  workspaceId: string;
  name: string;
  version: number;         // versión del formato interno
  schemaVersion: string;   // e.g. "1.0.0"
  createdAt: number;
  updatedAt: number;
  camera: CameraState;
  objects: CanvasObject[];
  background: BoardBackground;
  grid: GridConfig;
  metadata: BoardMetadata;
}

interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnailDataUrl?: string; // PNG base64, generado async
  objectCount: number;
}

interface CameraState {
  x: number;               // offset pan X en píxeles de pantalla
  y: number;               // offset pan Y en píxeles de pantalla
  zoom: number;            // factor de escala, 1.0 = 100%
  minZoom: number;         // ej. 0.05
  maxZoom: number;         // ej. 32.0
}

interface BoardBackground {
  type: 'solid' | 'grid' | 'dots' | 'lines';
  color: string;           // hex
  gridSize?: number;       // px en world coords
  gridColor?: string;
}
```

---

## 11. Modelo de Objetos del Canvas

### BaseObject (discriminated union por type)

```typescript
interface BaseObject {
  id: string;              // UUID v4
  type: ObjectType;        // discriminante
  transform: Transform;
  style: BaseStyle;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  groupId?: string;        // ID del grupo padre si pertenece a uno
  connectorIds?: string[]; // IDs de conectores anclados a este objeto
  createdAt: number;
  updatedAt: number;
}

type ObjectType =
  | 'stroke'
  | 'text'
  | 'shape'
  | 'image'
  | 'sticky_note'
  | 'connector'
  | 'group';

interface Transform {
  x: number;               // world coords
  y: number;               // world coords
  width: number;
  height: number;
  rotation: number;        // radianes
  scaleX: number;          // por defecto 1.0
  scaleY: number;          // por defecto 1.0
}

interface BaseStyle {
  opacity: number;         // 0.0 - 1.0
}
```

### Tipos específicos

```typescript
interface StrokeObject extends BaseObject {
  type: 'stroke';
  points: Float32Array;    // [x0,y0,p0, x1,y1,p1, ...] pressure opcional
  smoothedPoints?: Float32Array; // puntos post-suavizado (caché)
  style: StrokeStyle;
}

interface StrokeStyle extends BaseStyle {
  color: string;
  width: number;
  lineCap: 'round' | 'square' | 'butt';
  lineJoin: 'round' | 'miter' | 'bevel';
  isHighlighter: boolean;
  compositeOperation?: GlobalCompositeOperation;
}

interface TextObject extends BaseObject {
  type: 'text';
  content: string;         // plain text o markdown simple
  style: TextStyle;
}

interface TextStyle extends BaseStyle {
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

interface ShapeObject extends BaseObject {
  type: 'shape';
  shape: ShapeType;
  style: ShapeStyle;
  // para polígono/estrella:
  sides?: number;
  innerRadius?: number;
}

type ShapeType =
  | 'rect' | 'ellipse' | 'line' | 'arrow'
  | 'triangle' | 'diamond' | 'star' | 'polygon';

interface ShapeStyle extends BaseStyle {
  fill: string | 'none';
  stroke: string | 'none';
  strokeWidth: number;
  strokeDash?: number[];
  cornerRadius?: number;
}

interface ImageObject extends BaseObject {
  type: 'image';
  src: string;             // data URL o path local
  originalWidth: number;
  originalHeight: number;
  cropRect?: { x: number; y: number; w: number; h: number };
  filter?: ImageFilter;
}

interface StickyNoteObject extends BaseObject {
  type: 'sticky_note';
  content: string;
  style: StickyNoteStyle;
}

interface StickyNoteStyle extends BaseStyle {
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  padding: number;
}

interface ConnectorObject extends BaseObject {
  type: 'connector';
  startObjectId?: string;
  startPoint: { x: number; y: number };
  endObjectId?: string;
  endPoint: { x: number; y: number };
  waypoints?: { x: number; y: number }[];
  style: ConnectorStyle;
}

interface ConnectorStyle extends BaseStyle {
  stroke: string;
  strokeWidth: number;
  strokeDash?: number[];
  startArrow: 'none' | 'arrow' | 'dot';
  endArrow: 'none' | 'arrow' | 'dot';
  routing: 'straight' | 'orthogonal' | 'curved';
}

interface GroupObject extends BaseObject {
  type: 'group';
  childIds: string[];
  // transform aplica sobre el grupo completo
  // los hijos tienen transforms relativos al mundo, no al grupo
}
```

---

## 12. Sistema de Coordenadas

```
World Space (coordenadas infinitas)
         │
         │ Camera Transform
         │ (translate + scale)
         ▼
Screen Space (píxeles del canvas)
```

### Transformación World → Screen
```typescript
function worldToScreen(wx: number, wy: number, camera: CameraState): [number, number] {
  return [
    wx * camera.zoom + camera.x,
    wy * camera.zoom + camera.y
  ];
}

function screenToWorld(sx: number, sy: number, camera: CameraState): [number, number] {
  return [
    (sx - camera.x) / camera.zoom,
    (sy - camera.y) / camera.zoom
  ];
}
```

### Principio importante
**Todos los objetos se almacenan en World Space.** El Canvas Engine aplica la transformación de cámara una sola vez mediante `ctx.setTransform()` antes de dibujar, evitando transformar coordenadas de cada objeto individualmente. Esto es el patrón más eficiente para Canvas 2D.

```typescript
// En el renderizador
ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.x, camera.y);
// Ahora todos los ctx.draw* usan automáticamente world coords
```

---

## 13. Sistema de Transformaciones

### Transform Matrix 2D (affine)
```
[scaleX * cos(r), -scaleY * sin(r), tx]
[scaleX * sin(r),  scaleY * cos(r), ty]
[0,                0,               1 ]
```

### Handles de transformación
Cada objeto seleccionado expone 8 handles en screen space:
- 4 corner handles (resize proporcional con Shift)
- 4 edge handles (resize no proporcional)
- 1 rotation handle (circle sobre el borde superior, a distancia fija)

```typescript
interface SelectionHandle {
  id: HandleId;
  position: { x: number; y: number }; // screen coords
  cursor: string; // CSS cursor
}

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';
```

### Rotación
La rotación se aplica alrededor del centro del bounding box del objeto. Cuando múltiples objetos están seleccionados, la rotación se aplica alrededor del centro del bounding box colectivo.

---

## 14. Sistema de Selección

### SelectionManager

```typescript
class SelectionManager {
  private selectedIds: Set<string>;
  private spatialIndex: SpatialIndex;

  // Hit-testing: encontrar objeto bajo el cursor
  hitTest(worldPoint: Vec2): CanvasObject | null

  // Rectangle selection: todos los objetos dentro del rect
  selectInRect(worldRect: Rect): CanvasObject[]

  // Selección por click con modificadores
  handleClick(object: CanvasObject, modifiers: Modifiers): void

  // Bounding box unificado de la selección actual
  getSelectionBounds(): Rect

  // Handles de transformación
  getHandles(): SelectionHandle[]
}
```

### Algoritmo de hit-testing por tipo

| Tipo | Test primario | Test refinado |
|------|--------------|---------------|
| Rect/Sticky | AABB | Rotated rect |
| Ellipse | AABB | Point-in-ellipse |
| Stroke | AABB | Distancia punto-a-polilínea < threshold |
| Text | AABB | Rotated rect |
| Image | AABB | Pixel alpha (si crop) |
| Connector | AABB | Distancia punto-a-segmento < threshold |
| Group | AABB colectivo | Test en hijos |

El **SpatialIndex (R-tree via RBush)** proporciona candidatos iniciales por AABB. El test refinado confirma el hit exacto.

---

## 15. Sistema de Undo / Redo

### Command Pattern

```typescript
interface Command {
  id: string;
  description: string;
  execute(): void;
  undo(): void;
}

class HistoryManager {
  private undoStack: Command[];
  private redoStack: Command[];
  private maxSize: number; // ej. 200

  execute(command: Command): void     // ejecuta + push undoStack
  undo(): void                        // pop undoStack, push redoStack
  redo(): void                        // pop redoStack, push undoStack

  // Agrupa múltiples commands en uno compuesto
  batch(commands: Command[]): CompositeCommand

  // Transacción: todas las operaciones entre begin/commit son un único command
  beginTransaction(description: string): void
  commitTransaction(): void
  rollbackTransaction(): void
}
```

### Comandos implementados

```typescript
class AddObjectCommand implements Command
class RemoveObjectCommand implements Command
class MoveObjectCommand implements Command         // solo delta, no snapshot
class ResizeObjectCommand implements Command       // solo nueva transform
class RotateObjectCommand implements Command
class ModifyStyleCommand implements Command
class GroupCommand implements Command
class UngroupCommand implements Command
class ReorderCommand implements Command            // z-index change
class AddStrokePointsCommand implements Command    // para lápiz en tiempo real
```

### Optimización de memoria
- Los comandos almacenan **deltas**, no snapshots del estado completo
- `AddStrokePointsCommand` almacena todos los puntos del trazo completo (no por punto)
- Snapshots completos solo para operaciones donde el delta es mayor que el snapshot (raro)
- El historial se limita a N comandos (configurable, por defecto 200)

### ¿Por qué no Event Sourcing?
Event sourcing sería adecuado si necesitáramos replay de toda la sesión o colaboración offline. Para la v1 local, el Command Pattern es más simple, más predecible y con mejor rendimiento. La arquitectura se puede evolucionar hacia ES cuando se implemente colaboración.

---

## 16. Sistema de Persistencia

### Comparativa de formatos

| Formato | Pros | Contras |
|---------|------|---------|
| **JSON** | Legible, debuggable, universal | Lento para >5MB, mayor tamaño |
| **JSON + zstd** | Compacto, portable | Requiere descompresión |
| **MessagePack** | 40-60% más compacto que JSON, rápido | Binario, no legible |
| **SQLite** | Consultas, transacciones, robusto | Overhead para leer objetos completos |
| **Custom binary** | Máximo rendimiento | Mantenimiento complejo |

### Decisión: SQLite (Rust/rusqlite) + JSON comprimido

**Estructura:**
- **SQLite** para metadata, índices, búsquedas, relaciones entre boards
- **Datos de objetos** serializados como JSON comprimido con zstd, almacenados como BLOB en SQLite
- Esto da lo mejor de ambos: consultas SQL para navegación + compresión eficiente para el payload

### Schema SQLite

```sql
-- workspaces
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  settings_json TEXT
);

-- boards metadata
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  object_count INTEGER NOT NULL DEFAULT 0,
  thumbnail BLOB,  -- PNG comprimido
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

-- board data (objetos serializados)
CREATE TABLE board_data (
  board_id TEXT PRIMARY KEY REFERENCES boards(id),
  data BLOB NOT NULL,          -- JSON comprimido con zstd
  data_hash TEXT NOT NULL,     -- SHA-256 para detección de cambios
  updated_at INTEGER NOT NULL
);

-- versiones para recuperación
CREATE TABLE board_versions (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  created_at INTEGER NOT NULL,
  data BLOB NOT NULL,
  label TEXT                   -- 'autosave', 'manual', 'before_import'
);

-- índice para limpieza de versiones antiguas
CREATE INDEX idx_board_versions_board_id ON board_versions(board_id, created_at);
```

### Estrategia de Autosave

```
Cambio en el board
       │
       ▼ (debounce 2000ms)
AutoSaveWorker (Web Worker)
       │
       ▼
serialize() → JSON
       │
       ▼ (Tauri IPC)
Rust: compress(zstd) → SQLite write
       │
       ▼
Evento 'autosave_complete' → UI feedback
```

El autosave ocurre en un Web Worker (serialización JSON) y luego en Rust (compresión + escritura SQLite), sin bloquear nunca el hilo principal.

### Formato de archivo exportable (.inkboard)
ZIP que contiene:
```
board.json          (datos completos en JSON sin comprimir)
metadata.json       (id, name, version, schema_version)
assets/             (imágenes embebidas como archivos separados)
  img_<uuid>.png
  img_<uuid>.jpg
```

---

## 17. Sistema de Importación Microsoft Whiteboard

### Estado Real de la Compatibilidad (2026)

> [!IMPORTANT]
> Esta sección refleja el estado documentado y verificado. No se inventa compatibilidad.

| Formato | Disponibilidad | Qué contiene | Importable |
|---------|---------------|-------------|-----------|
| **Export ZIP (HTML+JSON)** | Sí, desde UI | JSON limitado (metadata, thread IDs), HTML de presentación | ⚠️ Parcial (solo texto/metadata) |
| **Export PNG** | Sí | Imagen rasterizada | ✅ Como imagen |
| **Export SVG** | No disponible oficialmente | — | ❌ |
| **Export PDF** | No disponible oficialmente | — | ❌ |
| **Graph API** | Sí, solo management | Metadata del board, no contenido de ink | ❌ Para objetos |
| **Formato interno nativo** | Propietario, no documentado | Todo | ❌ Sin ingeniería inversa |

### Conclusión honesta
**No existe ningún formato oficial de Microsoft Whiteboard que permita importar el contenido completo (trazos, formas, notas) de forma fidedigna.** La única importación real posible es:
1. ZIP export → extracción de texto de notas/comentarios si el JSON lo contiene
2. PNG/imagen → inserción como objeto imagen en el tablero
3. Futuro: si Microsoft expande la Graph API para exponer contenido de ink

### Pipeline de Importación

```
Input File
    │
    ▼
FormatDetector (Rust)
    │
    ├── .inkboard → InternalImporter
    ├── .zip (MS Whiteboard) → MsWhiteboardImporter
    ├── .png/.jpg/.webp → ImageImporter
    ├── .svg → SvgImporter
    └── .json → GenericJsonImporter (Excalidraw, etc.)
    │
    ▼
Parser (Rust, sandboxed)
    │
    ▼
Validator (Rust)       ← rechaza archivos malformados
    │
    ▼
Normalizer (Rust)      ← convierte al modelo interno
    │
    ▼
BoardData (serde_json)
    │
    ▼ (Tauri IPC)
TypeScript ObjectStore.importBoard()
```

### Extensibilidad del sistema
La arquitectura de importación permite añadir nuevos formatos sin modificar el pipeline central:

```rust
trait BoardImporter {
  fn detect(bytes: &[u8]) -> bool;
  fn parse(bytes: &[u8]) -> Result<BoardData, ImportError>;
}

// Implementaciones futuras:
struct ExcalidrawImporter;   // .excalidraw JSON
struct MiroImporter;         // .miro export
struct FigJamImporter;       // .fig subset
struct MsWhiteboardImporter; // .zip export
```

### Seguridad del parser
- **Size limit:** máximo 100 MB por archivo de importación
- **Schema validation:** validación estricta con serde + validators custom
- **Sandboxed:** el parsing ocurre en Rust, no en el hilo de UI
- **Image sanitization:** imágenes re-decodificadas via `image` crate (elimina metadata potencialmente maliciosa)
- **No eval:** jamás se ejecuta código del archivo importado

---

## 18. Sistema de Exportación

### Exportadores

| Formato | Implementación | Notas |
|---------|---------------|-------|
| **PNG** | Rust (`image` crate, renderizado via `tiny-skia`) | Alta calidad, configurable DPI |
| **JPG** | Rust | Calidad configurable |
| **SVG** | TypeScript (serialización directa del modelo) | Objetos → SVG nativo |
| **PDF** | Rust (`printpdf` crate) | Página configurada al tamaño del contenido |
| **JSON** | Rust (serde_json) | Formato interno completo |
| **.inkboard** | Rust (ZIP builder) | Incluye assets como archivos separados |

### Modos de exportación
- **Board completo:** todo el contenido, bounding box de todos los objetos
- **Área visible:** solo lo que está en el viewport actual
- **Selección:** solo los objetos seleccionados

### Exportación asíncrona
El proceso de exportación no bloquea la UI:
```
UI solicita export
       │
       ▼ (Tauri IPC, async)
Rust genera el archivo
       │
       ▼ (Tauri evento)
UI muestra diálogo de guardado
```

---

## 19. Estrategia de Rendimiento

### Motor espacial: RBush (R-tree)

**Decisión: RBush (TypeScript) en el MVP, con upgrade path a Rust si se muestran cuellos de botella.**

RBush es la implementación R-tree más usada en aplicaciones de mapping y canvas de alta performance (usada por Mapbox, Leaflet). Para el rango de 2.000-10.000 objetos, TypeScript es suficiente.

```typescript
import RBush from 'rbush';

interface SpatialItem {
  minX: number; minY: number;
  maxX: number; maxY: number;
  objectId: string;
}

class SpatialIndex {
  private tree = new RBush<SpatialItem>();

  insert(obj: CanvasObject): void
  remove(obj: CanvasObject): void
  update(obj: CanvasObject): void  // remove + insert
  queryViewport(viewport: Rect): string[]  // objectIds
  queryPoint(point: Vec2): string[]
  queryRect(rect: Rect): string[]
}
```

### Viewport Culling
Solo los objetos cuyo AABB intersecta el viewport se envían al renderer. Con 10.000 objetos y viewport mostrando 100, solo se procesan ~100.

### Object Caching (ImageBitmap)
```typescript
class ObjectCache {
  private cache = new Map<string, { bitmap: ImageBitmap; hash: string }>();

  get(object: CanvasObject): ImageBitmap | null
  set(object: CanvasObject, bitmap: ImageBitmap): void
  invalidate(objectId: string): void  // llamado en cada cambio
  invalidateAll(): void               // en zoom change
}
```

Los objetos se cachean como `ImageBitmap` (transferible entre workers). En cada cambio de zoom, el caché se invalida porque los bitmaps son resolución-dependientes.

### Bucle de renderizado

```typescript
class RenderLoop {
  private animFrameId: number;
  private isDirty = false;

  markDirty(): void { this.isDirty = true; }

  start(): void {
    const frame = () => {
      if (this.isDirty) {
        this.renderer.render();
        this.isDirty = false;
      }
      this.animFrameId = requestAnimationFrame(frame);
    };
    this.animFrameId = requestAnimationFrame(frame);
  }
}
```

El renderizador solo ejecuta cuando hay cambios (`isDirty = true`). Esto elimina el gasto de CPU cuando el canvas está estático.

### Performance Targets y Benchmarks

| Escenario | Target | Benchmark |
|-----------|--------|-----------|
| 60 FPS pan/zoom con 2k objetos | ≥ 60 FPS | `perf:pan-2k` |
| Dibujo a lápiz (latencia) | < 16 ms | `perf:pen-latency` |
| Carga de board con 1k objetos | < 1 s | `perf:load-1k` |
| Selección rect con 5k objetos | < 50 ms | `perf:select-5k` |
| Autosave board 5k objetos | < 500 ms (background) | `perf:autosave-5k` |
| Import archivo 50 MB | < 10 s | `perf:import-50mb` |

---

## 20. Estrategia de Multithreading

### Distribución de responsabilidades

```
Main Thread
├── Pointer Events processing
├── State management (ObjectStore updates)
├── Svelte reactivity
├── Tauri IPC calls
└── postMessage a Workers

RenderWorker (OffscreenCanvas)
├── Canvas 2D rendering
├── Viewport culling
├── Object cache management
└── Frame output

AutoSaveWorker
├── JSON serialization
└── Debounced save trigger

SpatialIndexWorker (opcional, si escala)
└── R-tree rebuilds para cambios masivos
```

### Comunicación Main ↔ RenderWorker

```typescript
// Main thread envía snapshot del estado al worker
interface RenderCommand {
  type: 'render';
  camera: CameraState;
  objects: CanvasObject[];      // snapshot serializable
  selection: string[];          // IDs seleccionados
  activeStroke?: StrokeObject;  // trazo en progreso
  guides?: Guide[];             // smart guides activas
}

// Worker responde cuando el frame está listo
interface RenderResponse {
  type: 'frame_complete';
  timestamp: number;
}
```

**Nota:** transferir todos los objetos en cada frame sería costoso. Optimización: el worker mantiene su propia copia del estado y el main thread envía solo los diffs.

```typescript
interface StateUpdate {
  type: 'update';
  added?: CanvasObject[];
  modified?: CanvasObject[];
  removed?: string[];
  camera?: CameraState;
}
```

### OffscreenCanvas setup
```typescript
const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;
const offscreen = canvas.transferControlToOffscreen();
const worker = new Worker('./renderWorker.js');
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);
```

---

## 21. Estrategia de Testing

### Niveles de testing

#### Unit Tests (Vitest)
```
lib/canvas/Camera.test.ts          (worldToScreen, screenToWorld, zoom limits)
lib/canvas/SpatialIndex.test.ts    (insert, query, update, edge cases)
lib/canvas/HistoryManager.test.ts  (undo/redo, batch, max size)
lib/objects/StrokeObject.test.ts   (smoothing, bounds calculation)
lib/tools/SelectTool.test.ts       (hit-testing, handle positions)
```

#### Integration Tests (Vitest + jsdom)
```
scenarios/pen-and-undo.test.ts     (dibujar + deshacer)
scenarios/group-move.test.ts       (agrupar + mover + undo)
scenarios/import-export.test.ts    (guardar + cargar = mismo estado)
scenarios/clipboard.test.ts        (copy/paste entre boards)
```

#### Rust Tests (cargo test)
```
src/formats/ms_whiteboard_test.rs  (parsing ZIP válido e inválido)
src/geometry/bounds_test.rs        (cálculos de bounding boxes)
src/db/persistence_test.rs         (save/load/version)
```

#### Fuzz Testing (cargo-fuzz)
```
fuzz/fuzz_targets/parse_import.rs  (archivos de importación malformados)
fuzz/fuzz_targets/parse_json.rs    (JSON malformados)
```

#### Performance Tests
```
bench/render-10k-objects.ts        (FPS con 10k objetos)
bench/selection-stress.ts          (selección de 5k objetos)
bench/spatial-index.ts             (query performance)
```

#### E2E Tests (Playwright con Tauri)
```
e2e/board-creation.spec.ts
e2e/pen-tool.spec.ts
e2e/undo-redo.spec.ts
e2e/import-export.spec.ts
```

### Casos de prueba críticos
- Mover 1.000 objetos simultáneamente
- Undo/redo de 200 operaciones
- Importar archivo ZIP de MS Whiteboard corrupto
- Imagen de 50 MP en el canvas
- Board con texto en múltiples idiomas (RTL, CJK)
- Archivo .inkboard con referencia a imagen faltante

---

## 22. Seguridad

### Modelo de amenazas

| Amenaza | Vector | Mitigación |
|---------|--------|-----------|
| Archivo de importación malicioso | ZIP bomb, JSON masivo | Size limit 100MB, streaming parse |
| Imagen maliciosa | Metadatos EXIF, exploits de decodificación | Re-encode con `image` crate, strip metadata |
| Script injection vía texto | XSS si el texto se renderiza como HTML | Siempre renderizar como texto plano en canvas, escapar en DOM |
| Path traversal en assets | Rutas absolutas en archivos | Resolver paths solo dentro del directorio de datos de la app |
| Data exfiltration | Tauri networking | capabilities restrictivas, no `http` permission por defecto |

### Tauri Capabilities (mínimo necesario)
```
✅ fs:read (directorio de datos de la app)
✅ fs:write (directorio de datos de la app)
✅ dialog:open (para seleccionar archivos)
✅ dialog:save (para exportar)
✅ clipboard-manager:read
✅ clipboard-manager:write
❌ http (no necesario en v1)
❌ shell (no necesario)
❌ fs:read (rutas arbitrarias del sistema)
```

### Sanitización de imports
```rust
fn validate_board_data(data: &BoardData) -> Result<(), ValidationError> {
  if data.objects.len() > MAX_OBJECTS { return Err(...); }
  for obj in &data.objects {
    validate_object(obj)?;
    if let Some(img) = as_image(obj) {
      if img.data_url.len() > MAX_IMAGE_SIZE { return Err(...); }
    }
  }
  Ok(())
}
```

---

## 23. Estructura Completa de Carpetas

> **Actualizado 2026-09-30:** el repo es una app plana (no Turborepo). Estructura real. `canvas/Renderer.ts`, `input/InputController.ts`, `board/`, `io/transfer.ts` y los componentes `BoardChrome` / `CanvasHint` / `ExportMenu` / `ToolPalette` llegaron con M1-01, que partió `BoardCanvas.svelte` (1235 → 396 líneas).

```
board/   (package name: inkboard)
├── package.json
├── vite.config.ts              # port 1420
├── svelte.config.js            # adapter-static
├── vitest.config.ts
├── playwright.config.ts
├── README.md, DESIGN.md, PRODUCT.md, IDEA.md, implementation_plan.md
│
├── src/                        # SvelteKit frontend
│   ├── app.html, app.css, app.d.ts
│   ├── routes/
│   │   ├── +layout.svelte / +layout.ts
│   │   ├── +page.svelte        # Board picker (search, favorites)
│   │   └── board/[id]/+page.svelte
│   └── lib/
│       ├── canvas/             # Camera, CanvasEngine, ObjectStore, SpatialIndex,
│       │                       # SelectionManager, HistoryManager, RenderLoop,
│       │                       # EventBus, Renderer, commands (+ *.test.ts)
│       ├── tools/              # Select, Pen, Highlighter, Eraser, Text,
│       │                       # StickyNote, Shape, Image (+ tests)
│       ├── objects/            # types, factory, renderers, bounds, geometry
│       ├── io/                 # persistence, InternalFormat, PngExporter,
│       │                       # SvgExporter, transfer
│       ├── input/              # shortcuts (tabla de atajos), InputController
│       ├── board/              # BoardRuntime, BoardSession, boardInteractions
│       ├── components/
│       │   ├── BoardCanvas.svelte, TextEditor.svelte
│       │   ├── app/TopBar.svelte
│       │   ├── toolbar/ToolBar.svelte, ToolPalette.svelte, ContextToolbar.svelte
│       │   ├── menus/CommandPalette.svelte, ContextMenu.svelte, ExportMenu.svelte
│       │   ├── panels/CreatePanel.svelte, SettingsPanel.svelte
│       │   ├── board/ZoomControls.svelte, BoardChrome.svelte, CanvasHint.svelte
│       │   └── ui/Icon.svelte, ToolButton.svelte
│       ├── stores/ui.svelte.ts
│       └── utils/math.ts
│
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json         # decorations: false, devUrl :1420
│   ├── capabilities/default.json
│   └── src/
│       ├── main.rs, lib.rs
│       ├── commands/           # health, persistence, import
│       ├── db/ + migrations/001_initial.sql
│       ├── formats/ms_whiteboard.rs (+ test)
│       └── geometry/           # placeholder
│
├── e2e/                        # Playwright (smoke)
└── static/
```

> La estructura monorepo (`apps/desktop`, `packages/`, `turbo.json`, `docs/`) de la versión original de esta spec **no se adoptó**.
---

## 24. Plan de desarrollo (v0.1.1 → v1.0)

### 24.1 Principios de ejecución

1. **Primero que funcione, después que sea rápido.** La prioridad del producto sigue siendo PERFORMANCE > ESTABILIDAD > MANTENIBILIDAD > FUNCIONES (§1), pero hoy la selección y el texto no funcionan, y medir el rendimiento de un editor roto no aporta nada. Orden: M0 estabilidad → M1 editor completo → M2 datos e IO → M3 rendimiento medido → M4 release.
2. **Cada bug corregido deja un test que lo habría detectado.** Los 65 tests unitarios y los 7 E2E pasaban con B01–B06 presentes.
3. **Un solo camino para mutar el board:** `engine.execute(command)` → store → historial → autosave → render. Los componentes nunca llaman a `store.*` directamente.
4. **Tareas pequeñas y delegables.** Cada una tiene ID, archivos, criterio de aceptación y tamaño: **S** ≤ ½ día · **M** 1–2 días · **L** 3–5 días.
5. **Rust solo donde se justifica** (§7): IO, SQLite, compresión, parsing de archivos no confiables y PDF.
6. **Cada milestone termina en una puerta (gate), no en una fecha.** La siguiente no empieza mientras la puerta esté en rojo.
7. **No mezclar refactor y fixes en el mismo cambio.** M0 corrige en el sitio; la reestructuración llega en M1-01, cuando ya exista la red de tests de M0.

### 24.2 Definition of Done (toda tarea)

- [ ] Código más un test (unit o E2E) que falla sin el cambio.
- [ ] `pnpm test`, `pnpm check`, `pnpm exec playwright test` y `cargo test` en verde.
- [ ] Probado a mano en `pnpm tauri dev` si toca canvas, ventana o IO (el browser no reproduce los permisos ni el IPC de Tauri).
- [ ] `README.md` (Current status) y §0 actualizados si cambia lo que el usuario puede hacer.
- [ ] El commit cita el ID: `fix(M0-02): SelectTool implementa BaseTool`.

### 24.3 Mapa de milestones

| Milestone | Versión | Objetivo | Estimación | Gate |
|-----------|---------|----------|------------|------|
| **M0** | v0.1.1 | Núcleo usable: B01–B17 corregidos, red de tests y CI | 1–1,5 sem | E2E de edición básica en verde + checklist manual en Tauri |
| **M1** | v0.2.0 | Editor completo: refactor de `BoardCanvas`, comandos, estilos, clipboard, grupos, conectores y tema en el canvas | 3–4 sem | Invariante undo/redo de todos los comandos; `BoardCanvas.svelte` < 400 líneas |
| **M2** | v0.3.0 | Datos seguros e IO: gestión de boards, versiones, assets fuera del JSON, `.inkboard`, JPG/PDF e import seguro | 3 sem (en paralelo con M1) | Migración desde DB v0.1; roundtrip `.inkboard` sin pérdida; parsers fuzzeados |
| **M3** | v0.4.0 | Rendimiento medido contra RNF-01…05 | 2 sem | `pnpm bench` dentro de umbrales |
| **M4** | v0.5.0 beta | Release de escritorio: instaladores, updater, macOS/Linux y pulido | 2 sem | Instaladores de 3 SO desde CI + smoke manual por SO |
| **M5** | v1.0.0 | Funciones 1.0 priorizadas con el feedback de la beta | 4–6 sem | §25 |
| **M6** | — | Colaboración en tiempo real (I+D con go/no-go) | Spike de 2 sem | §24.10 |

Estimación para una persona con agentes: **≈ 10–12 semanas hasta la beta v0.5**. M1 (frontend) y M2 (Rust e IO) tocan archivos distintos y pueden avanzar en paralelo; la excepción es M2-05, que conviene hacer después de M1-01.

```
M0 ──► M1-01 refactor ──► M1-02 comandos ──┬──► M1-03 … M1-13
  │                                        └──► (base de M6)
  └──► M2-01 Rust async + migraciones ──► M2-02 … M2-11
M1-02 + M2-05 ──► M3 (medir con el modelo final) ──► M4 ──► M5
```

### 24.4 M0 — Núcleo usable (v0.1.1)

Orden: primero M0-01 (tests en rojo), después M0-02…M0-06 (los bugs que impiden usar la app) y luego el resto.

| ID | Tarea | Archivos | Aceptación | Tam. |
|----|-------|----------|------------|------|
| M0-01 ✅ | Red E2E **antes** de los fixes: `select.spec.ts`, `text.spec.ts`, `shortcuts.spec.ts` y `persistence.spec.ts`, más un helper que lee el board de localStorage. Deben fallar reproduciendo B01–B06 y B09. | `e2e/` | Cada bug de §0.2 verificable en runtime tiene un test en rojo | M |
| M0-02 ✅ | **B01** · `SelectTool extends BaseTool` y recibe `ToolPointerEvent`. Quitar todos los casts `as unknown as BaseTool` de `CanvasEngine`. | `tools/SelectTool.ts`, `canvas/CanvasEngine.ts` | Seleccionar, marquee, mover, escalar y rotar funcionan; una firma incorrecta vuelve a ser error de `pnpm check` | S |
| M0-03 ✅ | **B02** · Tamaño del canvas con `ResizeObserver` sobre su contenedor; backing store = tamaño CSS × `devicePixelRatio`, con `ctx.setTransform(dpr·zoom, …)`. Toda coordenada de puntero pasa por un único `toCanvasPoint(e)` (`clientX − rect.left`, `clientY − rect.top`). `TextEditor` y `ContextToolbar` suman el offset del canvas. | `BoardCanvas.svelte`, `TextEditor.svelte`, `ContextToolbar.svelte` | E2E: el objeto aparece bajo el cursor (±1 px) con DPR 1 y 2; una elipse dibujada con Shift sale circular | M |
| M0-04 ✅ | **B03** · `preventDefault()` en el `pointerdown` del canvas. Commit idempotente. El commit escribe en el objeto real vía `store.update` (guardar solo el `id` en `editingText`, o usar `$state.raw`). Confirmar un texto vacío elimina el objeto y su entrada del historial. Editar es un comando que se puede deshacer (`UpdateContentCommand`). | `BoardCanvas.svelte`, `TextEditor.svelte`, `canvas/commands.ts` | E2E: crear texto, escribir y pulsar Enter ⇒ se guarda; doble clic edita; Esc cancela; undo revierte la edición. Lo mismo con sticky | M |
| M0-05 ✅ | **B04, B09** · Tabla única de atajos en `lib/input/shortcuts.ts`, usada por el keydown, las pistas del ToolBar y la CommandPalette. Guard: ignorar la tecla si el target es input, textarea o contenteditable, o si hay un modal abierto. `S` y `N` ⇒ sticky; `R`/`O`/`L`/`A` ⇒ la forma concreta. | `BoardCanvas.svelte`, `input/shortcuts.ts` (nuevo), `ToolBar.svelte`, `CommandPalette.svelte` | E2E: escribir en rename, palette o editor no cambia la tool ni borra objetos | S |
| M0-06 ✅ | **B05, B17** · `flushSave()` al desmontar, antes de `goto('/')`, en `pagehide`/`visibilitychange` y en `getCurrentWindow().onCloseRequested` (el handler async hace `await flushSave()`; la API espera al handler y luego llama a `destroy()`, que necesita el permiso de M0-09). Guardado forzado cada 30 s de edición continua. Conservar el `createdAt` del board cargado. | `BoardCanvas.svelte` | E2E: dibujar y salir en < 200 ms ⇒ persistido. Manual: cerrar con ✕ a los 500 ms conserva el cambio | S |
| M0-07 ✅ | **B06** · Capturar `const removed = this.removed` dentro del comando. El eraser ignora los objetos `locked`. | `tools/EraserTool.ts` | Unit: borrar 3 objetos en un gesto → undo los restaura → redo los vuelve a quitar | S |
| M0-08 ✅ | **B07** · Renderizar en orden de `zIndex`. Bring/send con `ReorderCommand` (se puede deshacer). `]`/`[` = un paso adelante/atrás; `Ctrl+]`/`Ctrl+[` = al frente/al fondo (ver Atajos). | `BoardCanvas.svelte`, `canvas/ObjectStore.ts`, `canvas/commands.ts` | E2E con captura: dos stickies superpuestos cambian de orden y undo lo revierte | S |
| M0-09 ✅ | **B08** · Añadir `core:window:allow-minimize`, `allow-maximize`, `allow-unmaximize`, `allow-close` y `allow-destroy` (este último lo usa M0-06). | `src-tauri/capabilities/default.json` | Manual en `tauri dev`: minimizar, maximizar/restaurar y cerrar funcionan | S |
| M0-10 ✅ | **B11, B12** · Helpers `translateObject`, `scaleObject(origin, sx, sy)` y `rotateObject(center, θ)` que mueven `points`/`startPoint`/`endPoint` en trazos y conectores, y `transform` en el resto. Convención única: **rotación alrededor del centro de la caja**, aplicada en el renderer, `worldToLocal`, `getObjectBounds` (AABB de la caja rotada) y el SVG (`rotate(deg cx cy)`). | `objects/geometry.ts` (nuevo), `tools/SelectTool.ts`, `objects/renderers.ts`, `objects/bounds.ts`, `utils/math.ts`, `io/SvgExporter.ts` | Unit por tipo (mover, escalar y rotar dan los bounds esperados). E2E: se puede mover un trazo; un clic en la esquina de un rect rotado 45° lo selecciona | M |
| M0-11 ✅ | **B10** · Ocultar el botón Connector hasta M1-09. `setTool` devuelve `boolean` y la UI solo cambia si el engine aceptó. | `CanvasEngine.ts`, `BoardCanvas.svelte` | La tool activa en la UI siempre coincide con la del engine | S |
| M0-12 ✅ | **B13** · Undo al insertar imagen (picker, paste y drop), al importar (un solo paso) y al reordenar. | `tools/ImageTool.ts`, `BoardCanvas.svelte` | Unit/E2E: cada operación se deshace y se rehace | S |
| M0-13 ✅ | **B14** · Resetear `ui` y `uiActions` al desmontar el board. La TopBar decide el modo board/home por la ruta (`page.route.id`). | `stores/ui.svelte.ts`, `app/TopBar.svelte`, `BoardCanvas.svelte` | E2E: en Home no aparecen undo/redo ni avatares | S |
| M0-14 ✅ | **B15** · `count_objects` lee `board.objects`, con test Rust. | `src-tauri/src/db/mod.rs` | `cargo test` cubre el conteo | S |
| M0-15 ✅\* | **B16** · `read_file_bytes` devuelve `tauri::ipc::Response` (bytes crudos → `ArrayBuffer`) y el front construye un `Blob` que lee con `FileReader`. | `commands/import.rs`, `BoardCanvas.svelte` | Manual: importar un PNG de 10 MB por el diálogo nativo | S |
| M0-16 ✅* | CI mínima en GitHub Actions (Windows + Ubuntu): `pnpm install --frozen-lockfile`, `check`, `test`, Playwright (`pnpm exec playwright install --with-deps`) y `cargo test` (en Ubuntu, instalar `libwebkit2gtk-4.1-dev` y el resto de dependencias de sistema de Tauri). Script `test:e2e` en `package.json`. | `.github/workflows/ci.yml`, `package.json` | Un push con cualquier suite en rojo falla | S |
| M0-17 ✅ | Limpieza: borrar `components/TopBar.svelte` y corregir README y PRODUCT.md con el estado real. | varios | — | S |

\* M0-15 y M0-16 están implementadas (`read_file_bytes` ya devuelve bytes crudos y el workflow existe en `.github/workflows/ci.yml`), pero su aceptación no está verificada: M0-15 necesita importar un PNG de 10 MB por el diálogo nativo en `pnpm tauri dev`, y M0-16 necesita su primera ejecución en GitHub, que ocurrirá con el primer push. Trátalas como abiertas hasta cerrar esas comprobaciones.

**Gate M0 — cerrado (2026-09-30)**
- [ ] E2E de M0-01 en verde en CI. *(36/36 en local; el workflow de M0-16 aún no se ha ejecutado en GitHub, así que esto se cerrará con el primer push.)*
- [x] Checklist manual en Windows (`pnpm tauri dev`): dibujar exactamente bajo el cursor · seleccionar, mover, escalar y rotar formas y trazos · escribir en texto y sticky · deshacer todo lo anterior · cerrar con ✕ justo después de editar sin perder nada · minimizar y maximizar.

### 24.5 M1 — Editor completo (v0.2.0)

| ID | Tarea | Aceptación | Tam. | Dep. |
|----|-------|------------|------|------|
| M1-01 ✅ | Partir `BoardCanvas.svelte` en módulos sin cambiar comportamiento: `canvas/Renderer.ts` (fondo, grid, objetos, overlay), `input/InputController.ts` (Pointer Events, rueda y pinch, sin touch events duplicados), `input/shortcuts.ts` (de M0-05), `board/BoardSession.ts` (carga, autosave, flush, estado de guardado) e `io/transfer.ts` (import, export y descargas). | `BoardCanvas.svelte` < 400 líneas; los E2E de M0 siguen en verde | L | M0 |
| M1-02 ✅ | API única de mutación: `engine.execute(cmd)`. Comandos `AddObjects`, `RemoveObjects`, `UpdateTransform`, `UpdateStyle`, `UpdateContent`, `Reorder`, `Group`/`Ungroup` y `Batch`, con transacciones (`begin`/`commit`/`rollback`, §15). `tools`, `board` e `io` migrados: ya no llaman a `store.*`. | Test de propiedades (`fast-check`) sobre el JSON del store: para todo comando, `undo(redo(s)) ≡ s` y `redo(undo(redo(s))) ≡ redo(s)` | M | M1-01 |
| M1-03 ✅ | Estilos en el ContextToolbar (DESIGN § ContextToolbar; sin panel lateral fijo): color y grosor del pen/highlighter; fill, stroke, grosor, dash y radio de las formas; tamaño, negrita, cursiva, alineación y color del texto; color del sticky; opacidad. Swatches solo para contenido (One Color Rule). Se recuerda el último estilo de cada tool. Todo el cambio de estilo es undoable vía `UpdateStyle` (`objects/stylePalette.ts`, `board/styleControls.ts`, `board/styleBridge.svelte.ts`, `toolbar/StyleControls.svelte`). | E2E: cambiar el color de un trazo seleccionado y deshacerlo (`e2e/styles.spec.ts`, 38 E2E en verde) | L | M1-02 |
| M1-04 | Clipboard de objetos (RF-09): Ctrl+C/X/V/D. Portapapeles del sistema con JSON versionado (`inkboard/clipboard@1`) y fallback interno; pegar en el cursor o en el centro del viewport con offset acumulativo; pegar entre boards; el texto plano se pega como objeto texto; el pegado de imágenes sigue funcionando. | E2E: copiar en el board A y pegar en el B | M | M1-02 |
| M1-05 | Grupos (RF-12): Ctrl+G / Ctrl+Shift+G. Un clic selecciona el grupo y el doble clic entra en él; los bounds salen de los hijos; un nivel de anidamiento. | Unit + E2E: agrupar → mover → undo | M | M1-02, M0-10 |
| M1-06 | Lock/unlock (RF-02) desde el menú contextual y con Ctrl+Shift+L. Un objeto bloqueado no entra en el marquee ni lo borra el eraser. | E2E | S | M1-02 |
| M1-07 | Snap básico (RF-13 parcial): snap a grid (toggle en Settings), Shift restringe el movimiento a un eje, rotación en pasos de 15° con Shift, nudge con flechas (1 px, 10 px con Shift). | Unit del snapping | M | M0-10 |
| M1-08 | Texto: medir con `ctx.measureText` (cacheado) en lugar de `0,6 × fontSize`; wrap al redimensionar en horizontal; el editor usa la misma fuente e interlineado que el renderer; wrap también en sticky. | Captura E2E: el texto en edición y el renderizado coinciden | M | M0-04 |
| M1-09 | Conectores v1 (RF-07): `ConnectorTool` entre 4 anclas por objeto (o hacia un punto libre), rectos y con flecha. Se recalculan al mover, escalar o borrar el objeto (listener del store); estilo desde M1-03. | E2E: conectar dos stickies, mover uno y comprobar que el conector lo sigue | L | M1-02, M0-10 |
| M1-10 | Tema en el canvas: fondo, grid, overlay y colores por defecto desde los tokens CSS. `system` sigue a `prefers-color-scheme` en vivo. El tema se guarda en los settings del workspace. Color de tinta por defecto según D1 (§28). | Capturas E2E en light y dark | M | M1-01 |
| M1-11 | Menú contextual completo: copiar, pegar, duplicar, borrar, orden, bloquear, agrupar y exportar selección, con los atajos tomados de la tabla de M0-05. | E2E | S | M1-04, M1-05 |
| M1-12 | Overlay de atajos (`?`) y CommandPalette alimentados por la misma tabla. ESLint (`typescript-eslint`, `eslint-plugin-svelte`) y `prettier --check` en CI, con una regla de lint (o un test de arquitectura) que prohíba `store.*` fuera de `canvas/` y `tools/`. | La CI falla si se viola la regla | S | M0-05 |
| M1-13 | Transformación precisa: handles alineados al objeto cuando hay uno solo seleccionado y está rotado; resize respetando su eje; tamaño mínimo; flip con escala negativa. | Unit + E2E de resize de un objeto rotado | M | M0-10 |

**Gate M1:** test de invariantes en verde · `BoardCanvas.svelte` < 400 líneas · un E2E por tarea · tema claro usable de punta a punta.

### 24.6 M2 — Datos seguros e IO (v0.3.0)

| ID | Tarea | Aceptación | Tam. |
|----|-------|------------|------|
| M2-01 | Rust: comandos pesados `async` o con `spawn_blocking` (hoy son síncronos y corren en el hilo principal). SQLite con `journal_mode=WAL`, `foreign_keys=ON` y `busy_timeout`. Runner de migraciones con `PRAGMA user_version` (hoy se reejecuta `001_initial.sql` en cada arranque). | Abrir una DB de v0.1 la migra; test Rust | M |
| M2-02 | Gestión de boards en Home: renombrar, duplicar, borrar (papelera restaurable) y ordenar por fecha o nombre; favoritos en SQLite (hoy en localStorage). Comandos `rename_board`, `duplicate_board`, `delete_board` y `restore_board`. | E2E | M |
| M2-03 | Thumbnails reales: render offscreen de 320×200 → PNG → `boards.thumbnail`, con debounce largo (≥ 10 s). Home los muestra y usa el tinte actual como fallback. | E2E: el thumbnail aparece tras editar | M |
| M2-04 | Historial de versiones (la tabla `board_versions` existe sin uso): snapshot cada N minutos de edición activa, antes de importar o restaurar, y manual ("Guardar versión"). Retención de 50 versiones o 30 días; UI en Settings → Datos. Restaurar crea una versión nueva y nunca destruye. | Test Rust de retención; E2E de restaurar | M |
| M2-05 | Almacén de assets: las imágenes salen del JSON del board a una tabla `assets(hash sha256, mime, bytes, w, h)`; `ImageObject.src = "asset:<hash>"`; carga como Blob/object URL; deduplicación. Migración de los boards con data URLs (schema 1.1.0) con snapshot previo. En el browser, IndexedDB (D3). Hacerlo después de M1-01 (toca `renderers.ts` e `ImageTool`). | El autosave de un board con 20 MB de imágenes envía < 100 KB por guardado | L |
| M2-06 | Formato `.inkboard` (ZIP con `board.json`, `metadata.json` y `assets/`, §16), con export e import en Rust mediante el crate `zip`. | Roundtrip board → `.inkboard` → import idéntico (JSON + hashes de assets) | M |
| M2-07 | Import del JSON propio (hoy "not wired yet"): validación de esquema, límites de tamaño y de número de objetos, e importación como board nuevo o dentro del actual en un solo paso de undo. | E2E | S |
| M2-08 | Import seguro (§22): el comando Rust abre el diálogo y lee el archivo, sin aceptar rutas del webview. Comprobar el tamaño con la metadata antes de leer (≤ 100 MB); en ZIP, límite por entrada (`file.size()` + `take()`) y límite de entradas. Re-encode de imágenes con el crate `image`. Definir la CSP en `tauri.conf.json`. | `cargo-fuzz` 10 min sin panics; test de zip bomb | M |
| M2-09 | Export: JPG con calidad; modos board completo, selección o área visible; escala 1×–4×; fondo transparente opcional. En Tauri, diálogo nativo de guardado (`plugin-dialog` + `plugin-fs`); `<a download>` solo en el browser. | E2E en browser; manual en Tauri | M |
| M2-10 | Fidelidad del SVG (rotación, star/polygon, puntas de flecha, contorno perfect-freehand, wrap de texto) y PDF vectorial generado desde ese SVG en Rust (`usvg` + `svg2pdf`, D2). | Diff visual PNG vs SVG rasterizado < 1 % | L |
| M2-11 | MS Whiteboard: los textos extraídos entran como stickies en rejilla en el centro del viewport, en un solo paso de undo, con un mensaje honesto sobre el alcance (§17). | E2E con un ZIP de fixture | S |

**Gate M2:** migración desde una DB v0.1 probada · roundtrip `.inkboard` sin pérdida · parsers fuzzeados sin panics · el webview no puede leer rutas arbitrarias.

### 24.7 M3 — Rendimiento medido (v0.4.0)

Primero medir, después optimizar. OffscreenCanvas solo si los números lo exigen.

| ID | Tarea | Aceptación | Tam. |
|----|-------|------------|------|
| M3-01 | Harness de benchmarks: generador de boards sintéticos (2k/5k/10k objetos mixtos) y escenarios Playwright que miden el frame time de pan/zoom, la latencia del pen, la carga, las long tasks del autosave y la memoria. `pnpm bench` guarda los resultados en JSON versionado. | Baseline registrado para cada fila de la tabla de §19 | M |
| M3-02 | Caché de contornos: un `Path2D` por trazo, invalidado por versión (hoy `getStroke` corre para cada trazo visible en cada frame). | Pan con 2k trazos ≥ 60 FPS | S |
| M3-03 | Cachés de layout de texto y de imágenes decodificadas (`createImageBitmap`, LRU por memoria, versiones reducidas para zoom bajo). | Memoria dentro de RNF-04 | M |
| M3-04 | LOD: con zoom < 0,25, trazos como polilínea simplificada, texto de menos de 3 px como barras e imágenes en baja resolución. | Zoom-out con 5k objetos ≥ 60 FPS | S |
| M3-05 | Arrastre de muchos objetos: no reindexar RBush en cada `pointermove`; reindexar al soltar y usar los bounds de la selección para el culling durante el gesto. | Mover 1.000 objetos ≥ 50 FPS | S |
| M3-06 | Autosave incremental: dirty flag en el engine (hoy siempre se serializa y se envía, y el hash de Rust nunca coincide, ver B17). Medir `JSON.stringify` y moverlo a un Worker solo si supera 16 ms. | Autosave de 5k objetos sin long tasks > 50 ms | M |
| M3-07 | Decisión OffscreenCanvas/Worker (§9, §20): spike de 2 días solo si M3-02…06 no alcanzan RNF-01/02. Resultado documentado en §28. | Decisión escrita | S |

**Gate M3:** `pnpm bench` en CI con umbrales basados en RNF-01…05, medidos en una máquina de referencia documentada (CPU, GPU, DPR).

### 24.8 M4 — Release de escritorio (v0.5.0 beta)

| ID | Tarea | Tam. |
|----|-------|------|
| M4-01 | Guardar tamaño, posición y estado maximizado de la ventana (`tauri-plugin-window-state`); instancia única que enfoca la ventana existente (`tauri-plugin-single-instance`). | S |
| M4-02 | macOS: controles nativos (`titleBarStyle: "Overlay"` en `tauri.macos.conf.json`) en lugar de los botones propios; verificar el menú Edit (sin él, Cmd+C/V pueden no funcionar en WKWebView). Linux: checklist manual en WebKitGTK (Ubuntu 22.04+, Fedora). | M |
| M4-03 | Asociar `.inkboard` en el instalador y abrir los archivos recibidos como argumento. | S |
| M4-04 | Logs también en release (hoy `tauri-plugin-log` solo se activa en debug), en archivo rotativo; "Abrir carpeta de logs" en Settings; panic hook en Rust. | S |
| M4-05 | Updater (`tauri-plugin-updater`) con claves de firma y canal beta. | M |
| M4-06 | Pipeline de release con `tauri-action` al crear un tag: MSI/NSIS, dmg universal y AppImage/deb; firma de código en Windows y notarización en macOS (D4). | M |
| M4-07 | Pulido: onboarding en el empty state, accesibilidad de los paneles (foco visible, navegación por teclado, `prefers-reduced-motion`) y revisión de textos. | M |
| M4-08 | Presupuesto de tamaño: binario < 15 MB (RNF-06), medido en CI. | S |

**Gate M4:** instaladores de los 3 SO generados por CI · checklist manual pasado en cada SO · changelog · tag `v0.5.0`.

### 24.9 M5 — Producto 1.0

Candidatos, a priorizar con el uso real de la beta:
- Smart guides, alinear y distribuir (RF-13 completo).
- Minimap.
- Búsqueda de objetos por texto (Ctrl+F) con salto de cámara.
- Frames/secciones: agrupan contenido, permiten exportar por frame y sirven de base para un modo presentación.
- Conectores ortogonales y curvos con waypoints editables.
- Borrador parcial que parte los trazos (RF-03).
- Recorte de imágenes (RF-08).
- Plantillas básicas en CreatePanel.
- Touch y stylus: palm rejection y gestos de dos dedos (RF-19).

### 24.10 M6 — Colaboración en tiempo real (I+D)

- **Preparación que ya incluye el plan:** IDs estables (uuid), toda mutación como comando (M1-02) y assets direccionados por contenido (M2-05).
- **Spike de 2 semanas:** modelo en Yjs (`Y.Map` por objeto), `Y.UndoManager` en lugar de `HistoryManager`, updates persistidos en SQLite y transporte `y-websocket` con un relay mínimo.
- **Go/no-go:** overhead < 10 % en `pnpm bench` · dos clientes editando a la vez sin pérdidas en un test automatizado · coste de servidor asumible (D5).

---

## 25. Definición de versiones

| Versión | Nombre | El usuario puede… |
|---------|--------|-------------------|
| v0.1.1 | Usable | Dibujar bajo el cursor; seleccionar, mover, escalar y rotar cualquier objeto; escribir texto y notas; deshacer todo eso; cerrar la app sin perder trabajo. |
| v0.2.0 | Editor | Además: cambiar estilos, copiar y pegar entre boards, agrupar, bloquear, usar snap a grid y conectores rectos, y trabajar en tema claro. |
| v0.3.0 | Datos | Además: renombrar, duplicar y borrar boards; recuperar versiones; exportar a `.inkboard`, JPG y PDF; importar sin riesgo. |
| v0.4.0 | Rápido | Además: trabajar con 2k–10k objetos dentro de RNF-01…05. |
| v0.5.0 | Beta | Además: instalar y actualizar la app en Windows, macOS y Linux. |
| v1.0.0 | 1.0 | M5 priorizado, cero bugs P0/P1 abiertos y documentación de usuario. |

---

## 26. Backlog de funciones

| Función | Prioridad | Estado (2026-09-30) | Planificado en |
|---------|-----------|---------------------|----------------|
| Estilos editables (color, grosor, fill) | Alta | **Hecho (M1-03)** — ContextToolbar + popover del ToolBar, sin panel lateral; cada cambio es undoable | M1-03 |
| Clipboard de objetos | Alta | Stub | M1-04 |
| Conectores entre objetos | Alta | Tipo + renderer, sin tool | M1-09 (rectos), M5 (ortogonales) |
| PDF / JPG / `.inkboard` | Alta | No | M2-06, M2-09, M2-10 |
| Colaboración en tiempo real | Alta (largo plazo) | Solo stub de UI | M6 |
| Agrupación | Media | Solo el tipo | M1-05 |
| Gestión de boards (renombrar, duplicar, borrar) | Media | Solo crear, listar, buscar y favoritos | M2-02 |
| Versiones / backup | Media | Tabla sin uso | M2-04 |
| Snap a grid / smart guides | Media | No | M1-07 (grid), M5 (guías) |
| Minimap | Media | No | M5 |
| Búsqueda de objetos | Media | No (sí de boards) | M5 |
| Importación MS Whiteboard | Media | Parcial (texto) | M2-11; no se amplía por el límite del formato (§17) |
| Plantillas / Reactions en CreatePanel | Baja | No | M5 / post-1.0 |
| Estrella, polígono, rombo | Baja | Hecho | — |
| Comentarios, presentación, web SSR, plugins | Baja | No | Post-1.0 |

---

## 27. Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| OffscreenCanvas no funciona en WebKitGTK (Linux) | Media | Alto | Fallback: rendering en main thread sin OffscreenCanvas |
| Performance Canvas 2D insuficiente con >10k objetos | Media | Alto | Upgrade a WebGL con PixiJS (API Canvas 2D compatible) |
| Inconsistencias de WebView entre SO | Alta | Medio | Testing en los 3 SO desde Fase 1. CSS sin features experimentales |
| Formato interno de MS Whiteboard cambia | Alta | Bajo | El importer es una capa opcional, no dependencia central |
| rusqlite bundled no compila en alguna plataforma | Baja | Alto | Alternativa: `sqlx` o `libsqlite3-sys` |
| Sincronización Main Thread ↔ RenderWorker introduce jank | Media | Alto | Medición temprana en Fase 0. Fallback: single thread |
| Yjs overhead en Fase 18 rompe performance existente | Media | Medio | Benchmark antes y después de introducir Yjs |
| El refactor de `BoardCanvas` (M1-01) introduce regresiones | Media | Alto | Hacerlo después de la red E2E de M0 y sin cambios de comportamiento en el mismo PR |
| WebView2, WebKitGTK y WKWebView difieren en foco y eventos de puntero (B03 es un caso así) | Alta | Medio | E2E en Chromium + checklist manual en Tauri en cada gate; pasada completa por SO en M4 |
| Migrar las imágenes a assets corrompe boards existentes (M2-05) | Baja | Alto | Snapshot en `board_versions` antes de migrar; migración idempotente; test con una DB real de v0.1 |
| El coste o el plazo de la firma de código retrasa la beta | Media | Medio | Beta interna sin firmar; firmar antes de distribuir en público (D4) |
| Las tareas delegadas a agentes se salen de alcance o rompen invariantes | Media | Medio | Tareas con archivos y criterio explícitos, el test como contrato y revisión del diff antes del merge |

---

## 28. Decisiones Técnicas y Alternativas Descartadas

### Canvas 2D vs WebGL
**Elegido: Canvas 2D** (hoy: main thread `RenderLoop`; OffscreenCanvas documentado como upgrade path, no activo en v0.1).
WebGL descartado por ahora: complejidad de shaders no justificada. Upgrade path si Canvas 2D falla en benchmarks.

### Tauri 2 vs Electron
**Elegido: Tauri 2**
Electron descartado: bundle 15-20× mayor, startup 5-10× más lento, mayor consumo de RAM. La inconsistencia de WebView de Tauri se mitiga con testing.

### Svelte vs React vs Vue
**Elegido: Svelte + SvelteKit**
React descartado: overhead de virtual DOM innecesario para este caso. Vue descartado: ecosistema más pequeño que React, sin ventajas claras. Svelte compila a DOM puro, sin runtime overhead.

### SQLite vs JSON plano vs IndexedDB
**Elegido: SQLite (Rust) + JSON comprimido**
IndexedDB descartado: solo disponible en web, no en Tauri de forma nativa. JSON plano descartado: lento para tableros grandes, sin índices para metadata.

### CRDT vs OT para colaboración
**Elegido: Yjs (CRDT), para Fase 18+**
OT descartado: requiere servidor central y complejidad alta de implementación. Automerge considerado, pero Yjs tiene mejor performance y ecosistema para whiteboard.

### Command Pattern vs Event Sourcing para historial
**Elegido: Command Pattern**
Event Sourcing descartado para v1: sobre-ingeniería sin colaboración activa. Se puede evolucionar a ES cuando se necesite.

### WASM para geometría vs Rust via IPC vs TypeScript
**Elegido: TypeScript primero (RBush), Rust via IPC para operaciones pesadas de IO**
WASM compilado descartado para el MVP: complejidad de compilación y bindgen sin beneficio demostrado para las operaciones actuales. Si el spatial indexing TypeScript resulta insuficiente, se puede compilar RBush a WASM con AssemblyScript, o implementar R-tree en Rust y exponer via WASM.

### Decisiones tomadas en la auditoría (2026-09-30)

- **Rotación alrededor del centro de la caja** en todos los módulos (M0-10).
- **Toda mutación del board pasa por un comando** (`engine.execute`). Es la condición para tener undo completo, un autosave fiable y, más adelante, colaboración (M1-02).
- **Render en el hilo principal** hasta que los benchmarks de M3 demuestren lo contrario (M3-07).
- **PNG y JPG se exportan desde TypeScript**, porque el canvas ya existe. Rust queda para PDF, `.inkboard` y el parsing de imports.

### Decisiones pendientes

| ID | Pregunta | Opciones | Recomendación | Decidir antes de |
|----|----------|----------|---------------|------------------|
| D1 | Color de tinta por defecto al cambiar de tema | a) color absoluto (el blanco desaparece en tema claro) · b) valor semántico `ink` resuelto según el tema · c) invertir el canvas en modo oscuro con un filtro | b): solo el color por defecto es semántico; los que elige el usuario son absolutos | M1-10 |
| D2 | Motor de PDF | a) raster PNG con `printpdf` · b) vectorial con `svg2pdf` a partir del SVG | b): reutiliza el SVG y deja el texto seleccionable | M2-10 |
| D3 | Assets en modo browser | IndexedDB · seguir con data URLs en localStorage (límite ≈ 5 MB) | IndexedDB (el browser solo se usa en desarrollo) | M2-05 |
| D4 | Firma de código | Certificado de Windows (OV/EV) · Apple Developer Program (99 USD/año) | Presupuestarlo antes de M4-06 | M4 |
| D5 | Transporte de colaboración | Relay propio (`y-websocket`) · servicio gestionado · P2P (`y-webrtc`) | Decidir con los datos del spike | M6 |
| D6 | Idioma de la UI | Inglés (actual) · español · i18n | Inglés, extrayendo los strings en M4-07 | M4 |

---

## 29. Dependencias

Versiones reales de `package.json` y `src-tauri/Cargo.toml` (2026-09-30):

- **Frontend:** svelte 5.57 · @sveltejs/kit 2.70 · vite 8.2 · vitest 4.1 · typescript 6.0 · @playwright/test 1.62 · rbush 4.0 · perfect-freehand 1.2 · uuid 14 · fast-check 4.10 (dev) · @tauri-apps/api 2.11 con los plugins fs, dialog y clipboard-manager.
- **Rust:** tauri 2.11 · rusqlite 0.31 (bundled) · zstd 0.13 · sha2 0.10 · zip 2.1 · serde / serde_json · uuid · anyhow · tauri-plugin-fs, dialog, clipboard-manager y log.

**Nota sobre `perfect-freehand`:** esta librería (de Steve Ruiz, creador de tldraw) genera strokes de alta calidad con simulación de presión. Es la elección pragmática para el lápiz frente a implementar Catmull-Rom desde cero.

Dependencias que añade el plan:

| Milestone | Dependencia | Para qué |
|-----------|-------------|----------|
| M1 | `fast-check` (dev) — **añadida en M1-02** | Tests de propiedades de los comandos (M1-02) |
| M1 | `eslint`, `typescript-eslint`, `eslint-plugin-svelte` (dev) | Lint en CI (M1-12) |
| M2 | `image` | Re-encode de imágenes importadas (M2-08) |
| M2 | `usvg`, `svg2pdf` | PDF vectorial (M2-10) |
| M2 | `cargo-fuzz` (herramienta) | Fuzzing de parsers (M2-08) |
| M4 | `tauri-plugin-window-state`, `tauri-plugin-single-instance`, `tauri-plugin-updater` | Estado de ventana, instancia única y updater |

Quedan descartadas mientras no se demuestre que hacen falta: `tokio` explícito (Tauri ya trae su runtime async), `rmp-serde` (MessagePack), `printpdf` y `resvg` (solo si hay que rasterizar en Rust).

---

## 30. Flujo de trabajo

**Por tarea**
1. Rama por ID, p. ej. `m0-02-select-tool`.
2. Escribir o ajustar el test que reproduce el problema y verlo fallar.
3. Implementar solo lo que pide la tarea.
4. Cumplir la Definition of Done (§24.2).
5. Commit `tipo(ID): descripción` y merge a `main` con la CI en verde.

**Con agentes (Herdr).** `dev` (opencode) implementa una tarea por prompt; `docs` (Cursor) actualiza README y §0 al cerrar cada milestone; una persona revisa el diff antes del merge. M1 (frontend) y M2 (Rust) pueden repartirse entre agentes distintos porque casi no comparten archivos (ver la nota de M2-05). Plantilla de prompt:

```text
Tarea <ID> de implementation_plan.md §24 (léela completa antes de empezar).
Archivos: <lista>. Aceptación: <criterio de la tabla>.
Reglas: no toques archivos fuera de la lista; añade un test que falle sin el cambio;
ejecuta pnpm test, pnpm check y pnpm exec playwright test (y cargo test si tocas Rust).
Responde con un resumen, los archivos cambiados y la salida de los tests.
```

**Comandos:** ver §0.5.

---

## Atajos de Teclado (Referencia)

Estado: ✅ funciona · ⚠️ funciona con fallos · ❌ no existe. La columna "Plan" indica la tarea que lo corrige o lo implementa. Desde M0-05 las pistas de la UI se generan desde `lib/input/shortcuts.ts`, la misma tabla que consume el keydown del canvas.

| Atajo | Acción | Estado | Plan |
|-------|--------|--------|------|
| `V` | Select tool | ✅ (la tool está rota, B01) | M0-02 |
| `P` | Pen tool | ✅ | — |
| `H` | Highlighter tool | ✅ | — |
| `E` | Eraser tool | ✅ | — |
| `T` | Text tool | ✅ (el editor no guarda, B03) | M0-04 |
| `S` / `N` | Sticky Note tool | ✅ | — |
| `R` / `O` / `L` / `A` | Rectángulo / elipse / línea / flecha | ✅ (eligen la forma) | — |
| `I` | Image tool | ✅ | — |
| `Delete` / `Backspace` | Eliminar selección | ✅ (ya no se dispara al escribir en inputs, B04) | — |
| `Ctrl+Z` | Undo | ✅ | — |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo | ✅ | — |
| `Ctrl+C` / `Ctrl+X` | Copy / Cut | ❌ | M1-04 |
| `Ctrl+V` | Paste | ⚠️ solo imágenes | M1-04 |
| `Ctrl+D` | Duplicate | ✅ | — |
| `Ctrl+A` | Select all | ✅ | — |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / Ungroup | ❌ | M1-05 |
| `Ctrl+Shift+L` | Lock / Unlock | ❌ | M1-06 |
| `Flechas` / `Shift+Flechas` | Nudge 1 px / 10 px | ❌ | M1-07 |
| `Space + drag` | Pan | ✅ | — |
| `Ctrl + wheel` | Zoom | ✅ | — |
| `+` / `-` | Zoom in / out | ✅ (ya no se dispara al escribir en inputs, B04) | — |
| `Ctrl+0` | Reset zoom (100 %) | ✅ | — |
| `Ctrl+Shift+H` | Fit to screen | ❌ (solo desde la UI y la palette) | M1-12 |
| `[` / `]` | Un paso atrás / adelante | ✅ | — |
| `Ctrl+[` / `Ctrl+]` | Al fondo / al frente | ✅ | — |
| `Ctrl+K` | Command palette | ✅ | — |
| `?` | Overlay de atajos | ❌ | M1-12 |
| `Ctrl+F` | Buscar objetos | ❌ | M5 |
| `Escape` | Deseleccionar / cancelar | ✅ | — |

---

> [!NOTE]
> Estado real: §0. Plan activo: §24–§26 y §30. Las secciones de arquitectura (workers, PDF en Rust, colaboración…) describen el diseño objetivo, salvo que §0 o §24 digan lo contrario.

---

## Apéndice A — Historial de fases v0.1

Es la numeración de los commits `Fase N` y de los comentarios del código. Los commits `FASE 2–11`, en mayúsculas, siguen otra numeración: la del rediseño del shell de UI.

| Fase | Tema | Estado real (2026-09-30) | Continúa en |
|------|------|--------------------------|-------------|
| 0 | Investigación técnica | Stack validado; OffscreenCanvas no adoptado; sin benchmark formal | M3-01, M3-07 |
| 1 | Scaffold | ✓ (layout plano, sin Turborepo); sin ESLint ni CI | M0-16, M1-12 |
| 2 | Canvas y cámara | ✓, con bug de tamaño, offset y DPR (B02) | M0-03 |
| 3 | Objetos base | ✓; el render ignora `zIndex` (B07) | M0-08 |
| 4 | Selección y transformación | Código presente, roto en runtime (B01, B11, B12) | M0-02, M0-10 |
| 5 | Lápiz | ✓; sin UI de color ni grosor | M1-03 |
| 6 | Texto | Roto: el editor no guarda (B03) | M0-04, M1-08 |
| 7 | Formas | ✓ 8 formas; estilo editable desde M1-03 (fill, stroke, grosor, dash, radio) | — |
| 8 | Imágenes | ✓; insertar no se puede deshacer (B13); import grande por diálogo (B16) | M0-12, M0-15 |
| 9 | Sticky notes | Se crean, pero el texto no se guarda (B03) | M0-04 |
| 10 | Undo / Redo | ✓ con huecos (B06, B13) | M0-07, M0-12, M1-02 |
| 11 | Persistencia | ✓ SQLite + zstd; pérdida al salir (B05); versiones sin uso | M0-06, M2-01, M2-04 |
| 12 | Múltiples tableros | ✓ crear, listar, buscar y favoritos; thumbnails de relleno | M2-02, M2-03 |
| 13 | Importación | ✓ imagen + ZIP (texto); JSON sin cablear; lee rutas arbitrarias | M2-07, M2-08, M2-11 |
| 14 | Exportación | ✓ PNG / SVG / JSON; el SVG no aplica rotación ni exporta star/polygon | M2-09, M2-10 |
| 15 | Optimización | No iniciada | M3 |
| 16 | Desktop Tauri | Titlebar propio; botones de ventana sin permiso (B08) | M0-09, M4 |
| 17 | Testing | 65 unit + 7 E2E que no cubren selección ni texto | M0-01, M0-16 |
| 18 | Colaboración | Solo stub de UI | M6 |


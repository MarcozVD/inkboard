# Inkboard — Plan de Implementación y Especificación Técnica

> **Doc v2.0** · **Repo:** v0.5.0 (sin tag todavía; M0–M3 cerrados, M4 implementado y pendiente de release) · **Spec original:** 2026-08-30 · **Auditoría verificada y plan:** 2026-09-30
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
| B10 | ~~El botón Connector se marca como activo, pero el engine sigue con la tool anterior.~~ **Corregido (M0-11).** | `engine.setTool('connector')` retornaba sin hacer nada porque no hay ConnectorTool, y la UI no se enteraba (`CanvasEngine.ts:71`). Fix: `setTool` devuelve `boolean` y la UI solo cambia si el engine aceptó; el botón se ocultó hasta M1-09, donde **vuelve a estar visible** (atajo `C`) y ya activa la tool de verdad. | Sonda → fix |
| B11 | ~~*(Latente, tapado por B01.)* Mover o escalar un trazo o un conector no cambia lo que se ve.~~ **Corregido (M0-10).** | Se actualizaba `transform`, pero el renderer y los bounds usan `points` / `startPoint` / `endPoint` en coordenadas de mundo. Fix: `objects/geometry.ts` con `translateObject`, `scaleObject` y `rotateObject` que mueven los puntos de trazos y conectores; `UpdateTransformCommand` guarda `GeometrySnapshot` (transform + puntos) en vez de solo el transform. | Sonda → fix |
| B12 | ~~La rotación es inconsistente entre módulos.~~ **Corregido (M0-10).** | El renderer rotaba alrededor de la esquina superior izquierda (`src/lib/objects/renderers.ts:42`) y `SelectTool` alrededor del centro; el AABB y el export SVG ignoraban la rotación. Fix: convención única de **rotación alrededor del centro de la caja**, en el renderer, `worldToLocal`, `getObjectBounds` (AABB de la caja rotada) y el SVG (`rotate(deg cx cy)`). | Sonda → fix |
| B13 | ~~Hay operaciones que no se pueden deshacer.~~ **Corregido (M0-12).** | Insertar imagen (`ImageTool` no registraba comando), editar texto, reordenar e importar ZIP de MS Whiteboard. Fix: `ImageTool` empuja un `AddObjectCommand` por imagen (picker, paste y drop) y la importación de MS Whiteboard entra como un único paso; el texto ya era deshacible desde M0-04 y el reordenar desde M0-08. | Sonda → fix |
| B14 | ~~En Home, la TopBar sigue mostrando los controles del board (undo/redo del engine ya destruido, avatares).~~ **Corregido (M0-13).** | `ui`/`uiActions` no se reseteaban al desmontar y `isBoard` se deducía de `boardName !== 'Inkboard'` (`src/lib/components/app/TopBar.svelte:12`). Fix: `resetUi()` en el unmount del board, `syncShell()` deja de escribir tras el desmontaje y la TopBar decide el modo por `page.route.id`. | Sonda → fix |
| B15 | ~~`object_count` vale siempre 0 en SQLite.~~ **Corregido (M0-14).** | `count_objects` buscaba `objects` en la raíz, pero el JSON los guarda en `board.objects` (`src-tauri/src/db/mod.rs:170`). Fix: lee `board.objects`; 3 tests de Rust lo cubren, uno de ellos guardando en una base en memoria. | Sonda → fix |
| B16 | ~~Importar por el diálogo nativo una imagen de más de ~100 KB probablemente falla.~~ **Corregido (M0-15); falta la verificación manual.** | `read_file_bytes` devolvía `Vec<u8>` serializado como array JSON, y el front hacía `String.fromCharCode(...bytes)` → `RangeError` (`BoardCanvas.svelte:804`). Fix: el comando devuelve `tauri::ipc::Response` (bytes crudos → `ArrayBuffer`) y el front construye un `Blob` que lee con `FileReader`; queda importar un PNG de 10 MB por el diálogo nativo. | `src-tauri/src/commands/import.rs` |
| B17 | ~~El `createdAt` del board se reescribe en cada autosave.~~ **Corregido (M0-06).** | `scheduleAutosave` construía el board con `createdAt: Date.now()`. Como el JSON cambia siempre, el hash SHA-256 de Rust nunca llega a evitar una escritura. Fix: `boardCreatedAt` se toma del board cargado y `buildBoard()` lo reutiliza en cada guardado, incluido el import. | Sonda → fix |
| B18 | ~~El ContextToolbar tapa el handle de rotación de la selección.~~ **Corregido; detectado en la prueba manual de v0.2 (fix sobre M1-13).** | El toolbar se colocaba en `y - alto - 8`, es decir justo encima de la caja, que es donde vive el handle de rotación (40 px por encima del centro vertical del lado superior): el handle quedaba debajo del propio toolbar y no se podía agarrar. Fix: `ContextToolbar` reserva `ROTATE_CLEARANCE = 56` sobre la selección y, si no cabe dentro del viewport, se coloca debajo de la caja (`buildSelectionToolbar` devuelve también el `bottom`), siempre dentro de los límites de la ventana. | `e2e/rotate-handle.spec.ts` |

### 0.3 Deuda técnica que condiciona el plan

- **`BoardCanvas.svelte` era un monolito de 1235 líneas** (render, input, atajos, autosave, import/export, menús y paleta). M1-01 lo partió en `canvas/Renderer.ts`, `input/InputController.ts`, `board/BoardRuntime.ts`, `board/BoardSession.ts`, `board/boardInteractions.ts` e `io/transfer.ts`, más los componentes `BoardChrome`, `CanvasHint`, `ExportMenu` y `ToolPalette`: ahora son 396 líneas de composición. Ahí siguen viviendo B07, B14 y B17, y parte de B12.
- **Sin `store.*` fuera de los comandos:** desde M1-02 todo pasa por `engine.execute(cmd)` → store → historial → autosave → render, y `HistoryManager` agrupa (batch/transacción) o revierte (rollback) los pasos múltiples.
- **Rendimiento:** `perfect-freehand` ya no corre por frame: hay un `Path2D` por trazo cacheado e invalidado por versión (M3-02), y durante un gesto de dibujo la escena estática se pinta una vez en un canvas offscreen y solo se repinta el objeto activo. Desde M3-03…05 el layout de texto está cacheado, las imágenes se decodifican una sola vez en `ImageBitmap` con LRU por memoria, hay LOD por debajo de zoom 0,25 y el arrastre ya no reindexa el RBush en cada `pointermove`; con eso el render interno de un pan con 2k baja de 12,9 a 8,8 ms por frame. **El autosave dejó de ser deuda en M3-06:** un dirty flag por revisión de contenido evita serializar y enviar cuando el board no cambió, y la serialización de boards de 500+ objetos va a un Web Worker, así que un autosave de 5k **ya no genera ninguna long task** (antes la mayor era de 62 ms). El JSON sigue sin llevar los bytes de las imágenes: van al almacén de assets y el board solo carga con `asset:<hash>` (M2-05). Con RNF-01, RNF-02 y RNF-05 cumplidos en el hilo principal, **OffscreenCanvas/RenderWorker queda como upgrade path, no como trabajo pendiente** (decisión M3-07 en §28). Lo que queda abierto está en la tabla *Baseline 2026-10-04* de §19: el 5k todavía está lejos de 60 FPS, el RSS no lo mide el harness y el arrastre de 1.000 objetos no tiene escenario. Los comandos Tauri pesados ya no bloquean el hilo principal: son `async` y el trabajo de SQLite va por `spawn_blocking` (M2-01).
- **Seguridad:** el import ya no acepta rutas del webview (M2-08): Rust abre el diálogo nativo (`import_pick`) y lee el archivo él mismo, comprueba los ≤ 100 MB por metadata antes de leer un byte, acota los ZIP por entrada con `size()` + `take()` y por número de entradas, y re-encodea cada imagen importada con el crate `image` (JPEG sigue JPEG, el resto a PNG; SVG pasa sin tocar). La CSP de `tauri.conf.json` ya no es `null` y los permisos `fs:default` y `dialog:default` se quitaron de las capabilities; **la CSP se verificó a mano en la app de escritorio y funciona** (el board carga y pinta, exportar e importar funcionan y no se pide nada remoto).
- ~~**Tema:**~~ resuelto en M1-10 (D1 opción b): fondo, grid, overlay y colores por defecto salen de los tokens CSS, `system` sigue a `prefers-color-scheme` en vivo, el tema se persiste y se aplica al arrancar, y la tinta por defecto es el valor semántico `ink` que se resuelve por tema.
- ~~**Sin UI de estilo:**~~ resuelta en M1-03: ContextToolbar y popover del ToolBar editan color, grosor, fill, stroke, dash, radio, opacidad y tipografía, cada cambio pasa por `UpdateStyle` y el último estilo se recuerda por tool.
- **Código muerto:** `src-tauri/src/geometry/` (vacío). `src/lib/components/TopBar.svelte` se borró en M0-17 (nadie lo importaba).
- **Calidad:** CI desde M0-16, E2E de las funciones básicas de edición, y desde M1-12 `pnpm lint` (ESLint con regla anti-`store.*`) y `pnpm format:check` también en el pipeline. Sigue sin haber un linter de CSS ni reglas de accesibilidad automática.
- **Documentación:** `README.md` refleja el estado real tras M0 (`PRODUCT.md` L27 todavía cita B04/B05/B09 como pendientes y su título sigue diciendo "M0 en curso").

### 0.4 Parcial o no implementado

Conectores (tipo + renderer, sin tool) · smart guides, alinear y distribuir · minimap · workers / OffscreenCanvas · colaboración.

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

Comandos Tauri expuestos: `health`, `save_board`, `load_board`, `list_boards`, `rename_board`, `duplicate_board`, `delete_board`, `restore_board`, `purge_board`, `set_favorite`, `save_thumbnail`, `get_thumbnail`, `save_version`, `list_versions`, `restore_version`, `put_asset`, `get_asset`, `import_pick`, `export_inkboard`, `save_export`, `take_pending_opens`, `open_logs_dir`.

Los dos últimos son de M4 y no tocan rutas desde el webview: `take_pending_opens` devuelve los ids de board que Rust ya importó desde `argv` (asociación de archivos o segunda instancia, M4-03) y `open_logs_dir` abre la carpeta de logs rotativos en el explorador del sistema (M4-04). La lista de `argv` se procesa entera en Rust y el frontend solo recibe ids, igual que en el import por diálogo de M2-08.

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
| RNF-01 | Framerate | ≥ 60 FPS en operaciones normales con ≤ 2.000 objetos — **cumplido tras M3-06**: 65,8 FPS medidos con 2k en el headless por software; confirmado en la app de escritorio con GPU sigue pendiente (ver §19) |
| RNF-02 | Latencia de dibujo | < 16 ms desde evento pointer hasta trazo visible — **cumplido desde M3-02**: p50 0,4–0,5 ms medidos (ver §19) |
| RNF-03 | Carga inicial | < 2 s para tablero con 500 objetos |
| RNF-04 | Memoria | < 300 MB RSS en tablero con 5.000 objetos |
| RNF-05 | Autosave | Sin bloqueo perceptible del hilo principal — **cumplido tras M3-06**: 0 long tasks al autosavear 5k objetos (antes la mayor era de 62 ms) (ver §19) |
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

> **Hoy existen:** `health`, `save_board`, `load_board`, `list_boards`, `rename_board`, `duplicate_board`, `delete_board`, `restore_board`, `purge_board`, `set_favorite`, `save_thumbnail`, `get_thumbnail`, `save_version`, `list_versions`, `restore_version`, `put_asset`, `get_asset`, `import_pick`, `export_inkboard`, `save_export`. De los de abajo solo faltan `export_png`, `export_pdf` y `compress_board`: el store de assets ya es SQLite (M2-05), y PNG, JPG y SVG se exportan desde TypeScript (el guardado nativo lo hace `save_export` desde M2-09) mientras que PDF se genera en Rust (M2-10).

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

> **Estado (decidido en M3-07, 2026-10-04): NO se adopta.** El render sigue en el hilo principal porque con las optimizaciones de M3-02…06 (caché de `Path2D`, capa estática offscreen, cachés de layout e imágenes, LOD, arrastre sin reindexar y autosave incremental en worker) **RNF-01, RNF-02 y RNF-05 se cumplen en el hilo principal**: 65,8 FPS con 2k objetos, 0,5 ms de latencia de lápiz y 0 long tasks al autosavear 5k (ver §19). OffscreenCanvas + Worker queda como **upgrade path documentado**: se reevalúa solo si el bench de la CI se degrada por debajo de sus umbrales o si aparece un requisito que no cabe en el hilo principal. El spike de 2 días que contemplaba la tarea M3-07 no se gasta.

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
| Arrastre de 1.000 objetos | ≥ 50 FPS | `perf:drag-1k` (escenario pendiente, ver M3-05) |
| Autosave board 5k objetos | < 500 ms (background) | `perf:autosave-5k` |
| Autosave board 5k objetos | sin long tasks > 50 ms (RNF-05) | `perf:autosave-5k` |
| Memoria (heap JS) con 5k objetos | < 300 MB (RNF-04) | `perf:mem-5k` |
| Import archivo 50 MB | < 10 s | `perf:import-50mb` |

#### Baseline 2026-10-04 (M3-01)

Medido con `pnpm bench` (`bench/harness.bench.ts`); el JSON con todos los percentiles queda en `bench/results/<timestamp>.json`, fuera de git. Máquina de referencia: Windows 11 (10.0.26200), **Chromium headless 151.0.7922.34**, DPR 1, i5-12450HX (12 núcleos), 24 GB, Node 22.19.

| Métrica | Objetivo | Baseline 2026-10-04 (M3-01) | Tras M3-02 | Tras M3-05 | Tras M3-06 | Estado |
|---------|----------|------------------------------|-----------|-----------|-----------|--------|
| Pan (FPS) | ≥ 60 con 2k | 2k 21,1 · 5k 9,1 · 10k 4,9 | 2k **27,2** · 5k **13,1** · 10k **7,4** | 2k **57,6** (57,6–66,2 según corrida) · 5k **22,2** · 10k **11,8** | 2k **65,8** | ✅ (RNF-01) |
| Zoom (FPS) | ≥ 60 con 2k | 2k 15,8 · 5k 7,3 · 10k 4,0 | 2k **21,7** · 5k **10,7** · 10k **6,2** | 2k **40,1** · 5k **16,8** · 10k **8,9** | 2k **39** | ❌ |
| Latencia del lápiz (pointer → frame pintado) | < 16 ms | p50 87,5 ms · p95 92,4 ms | p50 **0,5 ms** · p95 **1 ms** | p50 **0,4 ms** | p50 **0,5 ms** | ✅ (RNF-02) |
| Carga de 1k objetos | < 1 s | 479 ms | ~500 ms | ~550 ms | **433 ms** | ✅ |
| Marquee con 5k objetos | < 50 ms | 234 ms | **131 ms** | **105 ms** de pared; el cómputo de selección ya baja de 50 ms | ~101 ms de pared; cómputo de selección < 50 ms | 🟡 el resto es un repintado completo |
| Autosave de 5k objetos | sin long tasks > 50 ms | 118 ms en 2 long tasks (la mayor de 60 ms) | long task mayor de **56 ms** | long task mayor de **62 ms** | **0 long tasks** | ✅ (RNF-05) |
| Heap JS con 5k objetos | < 300 MB | 79 MB | sin medir | **89 MB** | sin medir (89 MB en la corrida de M3-05) | ✅ |
| RSS del proceso | (sin objetivo) | no medido por el harness | sin medir | sin medir | sin medir | — |

> **Advertencia:** el Chromium headless rasteriza **por software** (sin GPU), así que los valores absolutos son pesimistas respecto a la app real de escritorio. Sirven como línea base para comparar ejecuciones entre sí (mismo hardware, misma configuración) y para ver qué mueve la aguja, no como cifras de producción.
>
> **RNF-01, RNF-02 y RNF-05 se cumplen** en el hilo principal: el pan con 2k llega a 65,8 FPS (el render interno gasta 8,8 ms de los ~16,7 ms de un frame a 60 Hz), la latencia de lápiz está en 0,5 ms de p50 y el autosave de 5k ya no genera long tasks. Los tres nacieron de optimizaciones en el hilo principal —caché de `Path2D`, capa estática, cachés de layout e imágenes, LOD, arrastre sin reindexar y autosave incremental en worker—, así que **OffscreenCanvas/RenderWorker queda descartado por ahora** (M3-07, decisión en §28) y solo vuelve si el bench se degrada.
>
> Cada columna sale del mismo harness en la misma máquina, pero las cifras absolutas se mueven entre corridas: el mismo pan 2k dio 57,6 FPS en la columna de M3-05 y 65,8 en esta, así que **los 2 FPS de diferencia entre esas dos columnas son ruido, no una mejora atribuible a M3-06**. El cambio real de M3-06 es el autosave (0 long tasks); lo mismo con la carga de 1k (550 → 433 ms). El LOD sí explica el salto grande de la columna M3-05 (21 → 58 FPS).
>
> Lo que sigue abierto: el **zoom con 5k** (16,8 → 39 FPS solo en 2k) está limitado por cuántos objetos hay que pintar, no por un comando concreto; el **RSS** no lo mide el harness, así que el RNF-04 sigue sin verificar aunque el heap de 89 MB cumpla; y el **arrastre de 1.000 objetos** no tiene escenario en el harness (`perf:drag-1k` está en la tabla de targets pero sin implementar), que es lo que impide cerrar del todo la aceptación de M3-05.
>
> El **marquee** mejoró con M3-05 (la selección se calcula una sola vez al soltar, no en cada `pointermove`) y el harness deja drenar los frames del arrastre antes de cronometrar, así que los ~101 ms son solo el camino de soltura: el perfil separa el cómputo de la selección del repintado completo que dispara, y el cómputo por sí solo cumple el objetivo de 50 ms. Lo que no tiene dueño es el repintado.
>
> El **heap** de 89 MB con 5k cumple el objetivo de heap, pero el RNF-04 está escrito sobre RSS y el harness no lo mide: esa parte sigue sin verificar.

#### Perfil por fase (M3-05)

El bench activa `canvas/renderProfile.ts`, un perfilador por fases **solo en DEV** (`window.__renderProfile`, se expone únicamente si `import.meta.env.DEV`), para saber qué fase mueve la aguja en vez de suponerlo. Mide `bg+grid`, `query+sort`, `render:<tipo>` por objeto, `render:total` y `overlay` en el `Renderer`, más `select:rect` en el marquee, `ui:ctxbar` en la reactividad de Svelte y, desde M3-06, `save:build` / `save:serialize` / `save:persist` en el autosave. Con `enabled = false` `profileNow()` devuelve 0 y el sobrecoste es despreciable.

| Fase del pan con 2k objetos | ms/frame tras M3-05 |
|-----------------------------|----------------------|
| **Render interno (total)** | **8,8** (era 12,9 antes de optimizar) |
| — trazos | 3,6 |
| — formas | 1,4 |
| — stickies | 1,4 |
| — imágenes | 0,9 |
| — query + sort | 0,75 |
| — texto | 0,7 |
| — fondo + grid | ~0 |

> El desglose por fase es de la corrida ya optimizada: antes solo se tenía el total (12,9 ms/frame), que es justo el dato que justifica haber profileado en vez de suponer. Los trazos siguen siendo la fase más cara (3,6 ms de 8,8), pero ya no crecen con el zoom-out porque el LOD los degrada a polilínea. El perfil se puede pedir a mano en cualquier build DEV desde la consola del webview.

---

## 20. Estrategia de Multithreading

> **Estado: no adoptada (M3-07).** Esta sección describe el diseño que se descartó. El render va en el hilo principal y la única pieza que sí usa un worker es la serialización del autosave (M3-06, boards de 500+ objetos). Si algún día el bench de la CI se degrada, este diseño es el plan de recuperación; mientras tanto, es documentación, no un pendiente. La justificación está en §28 y los números que la sostienen en §19.

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
bench/generator.ts               (tableros sintéticos deterministas 2k/5k/10k)
bench/harness.bench.ts           (pan, zoom, pen, carga, autosave, heap)
bench/playwright.bench.config.ts (config propia de `pnpm bench`)
bench/results/<timestamp>.json   (resultados, fuera de git)
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
❌ fs:read (el import lo hace Rust con std::fs, el webview no pide rutas)
❌ fs:write (idem al exportar)
❌ dialog:open / dialog:save (el diálogo se abre desde Rust, no desde el webview)
✅ clipboard-manager:read
✅ clipboard-manager:write
❌ http (no necesario en v1)
❌ shell (no necesario)
❌ fs:read (rutas arbitrarias del sistema)
```
M2-08 cerró los tres primeros `✅`: `import_pick` y `export_inkboard` abren el diálogo nativo con la API de Rust y leen/escriben con `std::fs`, así que el webview no necesita permiso alguno de `fs` ni de `dialog`.

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
| **M1** ✅ **completo (2026-09-30)** | v0.2.0 | Editor completo: refactor de `BoardCanvas`, comandos, estilos, clipboard, grupos, conectores y tema en el canvas | 3–4 sem | Invariante undo/redo de todos los comandos (`fast-check`); `BoardCanvas.svelte` < 400 líneas (396) |
| **M2** ✅ **completo (2026-10-04)** | v0.3.0 | Datos seguros e IO: gestión de boards, versiones, assets fuera del JSON, `.inkboard`, JPG/PDF e import seguro | 3 sem (en paralelo con M1) | **Gate cumplida**: migración desde DB v0.1 probada · roundtrip `.inkboard` sin pérdida · parsers sin panics con entradas malformadas y zip bomb (`cargo-fuzz` no usado en Windows) · el webview no puede leer rutas arbitrarias |
| **M3** ✅ **completo (2026-10-04)** | v0.4.0 | Rendimiento medido contra RNF-01…05 | 2 sem | `pnpm bench` dentro de umbrales — **gate verificada**: primera ejecución del workflow de bench superada en GitHub Actions |
| **M4** en curso | v0.5.0 beta | Release de escritorio: instaladores, updater, macOS/Linux y pulido | 2 sem | Instaladores de 3 SO desde CI + smoke manual por SO — **las 8 tareas cerradas** (M4-01…M4-08); falta el primer release real: secrets de firma, `pubkey`, versión y tag, y la checklist de §24.8.1 sobre sus artefactos |
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
| M0-16 ✅ | CI mínima en GitHub Actions (Windows + Ubuntu): `pnpm install --frozen-lockfile`, `check`, `test`, Playwright (`pnpm exec playwright install --with-deps`) y `cargo test` (en Ubuntu, instalar `libwebkit2gtk-4.1-dev` y el resto de dependencias de sistema de Tauri). Script `test:e2e` en `package.json`. **Ejecutada en GitHub con éxito** (ya incluye `lint` y `format:check` desde M1-12). Estuvo en rojo una vez: `format:check` fallaba solo en `windows-latest` por finales de línea CRLF. Fix en M2-01 (`.gitattributes` con `eol=lf` + `endOfLine: "lf"` en `.prettierrc`); desde entonces verde en Windows y Linux. | `.github/workflows/ci.yml`, `.gitattributes`, `.prettierrc`, `package.json` | Un push con cualquier suite en rojo falla | S |
| M0-17 ✅ | Limpieza: borrar `components/TopBar.svelte` y corregir README y PRODUCT.md con el estado real. | varios | — | S |

\* M0-15 está implementada (el import ya devuelve los bytes de la imagen, ahora sanitizados en Rust) pero su aceptación sigue sin verificar: necesita importar un PNG de 10 MB por el diálogo nativo en `pnpm tauri dev`. Trátala como abierta hasta cerrar esa comprobación.

**Gate M0 — cerrado (2026-09-30)**
- [x] E2E de M0-01 en verde en CI. *(52 E2E en verde; el workflow de M0-16 corrió en GitHub Actions, Windows y Ubuntu, y pasó con `lint`, `format:check`, `check`, unit, E2E y `cargo test`.)*
- [x] Checklist manual en Windows (`pnpm tauri dev`): dibujar exactamente bajo el cursor · seleccionar, mover, escalar y rotar formas y trazos · escribir en texto y sticky · deshacer todo lo anterior · cerrar con ✕ justo después de editar sin perder nada · minimizar y maximizar.

### 24.5 M1 — Editor completo (v0.2.0)

| ID | Tarea | Aceptación | Tam. | Dep. |
|----|-------|------------|------|------|
| M1-01 ✅ | Partir `BoardCanvas.svelte` en módulos sin cambiar comportamiento: `canvas/Renderer.ts` (fondo, grid, objetos, overlay), `input/InputController.ts` (Pointer Events, rueda y pinch, sin touch events duplicados), `input/shortcuts.ts` (de M0-05), `board/BoardSession.ts` (carga, autosave, flush, estado de guardado) e `io/transfer.ts` (import, export y descargas). | `BoardCanvas.svelte` < 400 líneas; los E2E de M0 siguen en verde | L | M0 |
| M1-02 ✅ | API única de mutación: `engine.execute(cmd)`. Comandos `AddObjects`, `RemoveObjects`, `UpdateTransform`, `UpdateStyle`, `UpdateContent`, `Reorder`, `Group`/`Ungroup` y `Batch`, con transacciones (`begin`/`commit`/`rollback`, §15). `tools`, `board` e `io` migrados: ya no llaman a `store.*`. | Test de propiedades (`fast-check`) sobre el JSON del store: para todo comando, `undo(redo(s)) ≡ s` y `redo(undo(redo(s))) ≡ redo(s)` | M | M1-01 |
| M1-03 ✅ | Estilos en el ContextToolbar (DESIGN § ContextToolbar; sin panel lateral fijo): color y grosor del pen/highlighter; fill, stroke, grosor, dash y radio de las formas; tamaño, negrita, cursiva, alineación y color del texto; color del sticky; opacidad. Swatches solo para contenido (One Color Rule). Se recuerda el último estilo de cada tool. Todo el cambio de estilo es undoable vía `UpdateStyle` (`objects/stylePalette.ts`, `board/styleControls.ts`, `board/styleBridge.svelte.ts`, `toolbar/StyleControls.svelte`). | E2E: cambiar el color de un trazo seleccionado y deshacerlo (`e2e/styles.spec.ts`, 38 E2E en verde) | L | M1-02 |
| M1-04 ✅ | Clipboard de objetos (RF-09): Ctrl+C/X/V/D. Portapapeles del sistema con JSON versionado (`inkboard/clipboard@1`) y fallback interno; pegar en el cursor o en el centro del viewport con offset acumulativo; pegar entre boards; el texto plano se pega como objeto texto; el pegado de imágenes sigue funcionando. Todo pasa por `AddObjects`/`RemoveObjects`, así que copy es neutro y cut/paste son undoable (`board/clipboard.ts`, `board/zoomActions.ts`, `e2e/clipboard.spec.ts`). | E2E: copiar en el board A y pegar en el B (41 E2E en verde con `--workers=1`) | M | M1-02 |
| M1-05 ✅ | Grupos (RF-12): Ctrl+G / Ctrl+Shift+G. Un clic selecciona el grupo y el doble clic entra en él; los bounds salen de los hijos; un nivel de anidamiento. Los grupos son shell estructural: no se seleccionan por sí mismos (`SelectionManager` los resuelve por sus hijos) y las transformaciones bajan a los hijos, todo undoable vía `BatchCommand` (`board/groups.ts`, `e2e/groups.spec.ts`). | Unit + E2E: agrupar → mover → undo (`groups.test.ts`, 118 unit) | M | M1-02, M0-10 |
| M1-06 ✅ | Lock/unlock (RF-02) desde el menú contextual y con Ctrl+Shift+L. Un objeto bloqueado no entra en el marquee ni lo borra el eraser, y el ContextToolbar lo muestra con un candado (badge en el overlay) (`board/lock.ts`, `e2e/lock.spec.ts`). | E2E: el marquee y el eraser saltan los bloqueados | S | M1-02 |
| M1-07 ✅ | Snap básico (RF-13 parcial): snap a grid (toggle en Settings), Shift restringe el movimiento a un eje, rotación en pasos de 15° con Shift, nudge con flechas (1 px, 10 px con Shift). `grid.snap` se persiste con el board y el nudge es un `UpdateTransformCommand` por tecla, así que deshace (`board/snapping.ts`, `board/nudge.ts`, `e2e/snapping.spec.ts`). Las smart guides siguen en M5. | Unit del snapping (`snapping.test.ts`, 128 unit) | M | M0-10 |
| M1-08 ✅ | Texto: medir con `ctx.measureText` (cacheado) en lugar de `0,6 × fontSize`; wrap al redimensionar en horizontal; el editor usa la misma fuente e interlineado que el renderer; wrap también en sticky. Todo pasa por `objects/textLayout.ts`, que comparte la medición cacheada entre renderer, editor y `fitContentBox` (con fallback a la heurística cuando no hay contexto de canvas). | Unit de layout (`textLayout.test.ts`) + E2E del texto en edición | M | M0-04 |
| M1-09 ✅ | Conectores v1 (RF-07): `ConnectorTool` entre 4 anclas por objeto (o hacia un punto libre), rectos y con flecha. Se recalculan al mover, escalar o borrar el objeto (listener del store); estilo desde M1-03. Atajo `C` y botón de nuevo visible (B10). La geometría se deriva de los objetos adjuntos vía `board/connectors.ts` y todo el ciclo es undoable (`e2e/connectors.spec.ts`). **Al borrar un objeto, ese extremo del conector pasa a punto libre y conserva su posición** en vez de dejar el conector colgando o borrarlo (ver §28). | E2E: conectar dos stickies, mover uno y comprobar que el conector lo sigue | L | M1-02, M0-10 |
| M1-10 ✅ | Tema en el canvas: fondo, grid, overlay y colores por defecto desde tokens CSS. `system` sigue a `prefers-color-scheme` en vivo. El tema se guarda en los settings del workspace. Color de tinta por defecto según D1 (§28, opción b): valor semántico `ink` resuelto por tema, y los colores que elige el usuario son absolutos. Implementado en `objects/colors.ts` (resolución + migración) y `board/theme.svelte.ts` (elección, persistencia y preferencia en vivo); PNG y SVG resuelven `ink` al exportar (`e2e/theme.spec.ts`). | Capturas E2E en light y dark (54 E2E, unit 144) | M | M1-01 |
| M1-11 ✅ | Menú contextual completo: copiar, pegar, duplicar, borrar, orden, bloquear, agrupar y exportar selección, con los atajos tomados de la tabla de M0-05. Las etiquetas de cada acción salen de `COMMAND_SHORTCUTS`, el overlay y el menú comparten tabla (`e2e/context-menu.spec.ts`). | E2E: abrir el menú con selección y ejecutar cada acción | S | M1-04, M1-05 |
| M1-12 ✅ | Overlay de atajos (`?`) y CommandPalette alimentados por la misma tabla (`shortcutGroups()` en `input/shortcuts.ts`, `ShortcutsOverlay.svelte`). ESLint (`typescript-eslint`, `eslint-plugin-svelte`) y `prettier --check` en CI, con una regla de lint que prohíbe `store.*` fuera de `canvas/` y `tools/`. Añadidos `pnpm lint`, `pnpm lint:fix`, `pnpm format` y `pnpm format:check`; el job de CI corre lint y format antes de los tests. | La CI falla si se viola la regla (`pnpm lint` y `pnpm format:check` en verde) | S | M0-05 |
| M1-13 ✅ | Transformación precisa: handles alineados al objeto cuando hay uno solo seleccionado y está rotado; resize respetando su eje; tamaño mínimo; flip con escala negativa. `geometry.ts` resuelve el resize en el frame local del objeto (opuesto fijo, `worldToLocalVector`/`localVectorToWorld`) y `SelectionManager` calcula los handles rotados; todo pasa por `UpdateTransformCommand`, así que deshace (`e2e/resize.spec.ts`). | Unit + E2E de resize de un objeto rotado (unit 139, E2E 52 en verde dos corridas) | M | M0-10 |

**Gate M1 — cumplida (2026-09-30):** ~~test de invariantes en verde · `BoardCanvas.svelte` < 400 líneas · un E2E por tarea · tema claro usable de punta a punta~~. Los cuatro puntos están: property tests de `fast-check` sobre undo/redo (M1-02), `BoardCanvas.svelte` en 396 líneas (M1-01), E2E por tarea donde aporta (M1-04, M1-05, M1-06, M1-07, M1-09, M1-10, M1-11, M1-13) y tema claro de punta a punta (M1-10). M1-08 se sostiene con unit de layout en vez de E2E, por decisión registrada en su fila.

### 24.6 M2 — Datos seguros e IO (v0.3.0)

| ID | Tarea | Aceptación | Tam. |
|----|-------|------------|------|
| M2-01 ✅ | Rust: comandos pesados `async` o con `spawn_blocking`. SQLite con `journal_mode=WAL`, `foreign_keys=ON` y `busy_timeout` en cada conexión. Runner de migraciones con `PRAGMA user_version`: `MIGRATIONS` es una lista ordenada y el índice es la versión, así que añadir una migración es añadir una entrada; la migración inicial se extrajo a `db/migrations/001_initial.sql` y se incluye con `include_str!`. Una DB de v0.1 (esquema presente pero `user_version = 0`) se detecta como versión 1 y solo se marca, sin volver a ejecutar el SQL y sin tocar datos. | Abrir una DB de v0.1 la migra sin pérdida; test Rust | M |
| M2-02 ✅ | Gestión de boards en Home: renombrar, duplicar, borrar (papelera restaurable, con restaurar y purgar) y ordenar por fecha o nombre; favoritos en SQLite, migrados desde localStorage. Comandos `rename_board`, `duplicate_board`, `delete_board`, `restore_board`, `purge_board` y `set_favorite`, con `list_boards(trash, sort)`. Borrado blando con `deleted_at` + índice, migración `002_board_management.sql`. Fallback completo en localStorage (`inkboard:trash`, `inkboard:favorites`) para el modo browser. | E2E (`e2e/home-boards.spec.ts`); `cargo test` 21/21 | M |
| M2-03 ✅ | Thumbnails reales: render offscreen del contenido del board a 320×200 → PNG (data URL) → `boards.thumbnail`. Debounce de 10 s desde la última edición (`THUMBNAIL_DEBOUNCE_MS`) y `flush()` en los caminos de salida (desmontaje, `pagehide`/`visibilitychange`, `onCloseRequested`), así que editar y salir deja el thumbnail puesto. Home los carga con `loadThumbnail` y conserva el tinte derivado del `id` como fallback cuando el board aún no tiene imagen; en browser se guardan en localStorage (`inkboard:thumbs`). Comandos `save_thumbnail` y `get_thumbnail`. | E2E (`e2e/thumbnail.spec.ts`): el thumbnail aparece en Home tras editar y salir · `cargo test` 25/25 | M |
| M2-04 ✅ | Historial de versiones: la tabla `board_versions` pasa a usarse. Snapshot automático cada 5 min **de edición activa** (un flag que solo se rearma al editar), snapshot antes de importar (`transfer.ts`) y antes de restaurar, y manual ("Save version") en Settings → Datos, que lista etiqueta, fecha y un "Restore" por versión. Retención de 50 versiones o 30 días, aplicada al crear y al restaurar (`trim_versions` en Rust, `trimVersions` en el fallback de localStorage `inkboard:versions`). Restaurar nunca destruye: escribe una versión `Before restore` del board vivo antes de poner el snapshot, en los dos caminos, y refresca el board. Comandos `save_version`, `list_versions` y `restore_version`, más `board/versionBridge.svelte.ts` como estado para la UI. | Test Rust de retención (50 más recientes, nada de más de 30 días) y de restore no destructivo · E2E (`e2e/versions.spec.ts`) · `cargo test` 25/25 | M |
| M2-05 ✅ | Almacén de assets: las imágenes salen del JSON del board a la tabla `assets(hash sha256, mime, bytes, width, height, created_at)`, migración `003_assets.sql`, y `ImageObject.src` pasa a ser `asset:<hash>`. `put_asset` recibe los bytes crudos en el body del invoke (mime, width y height por headers `x-*`) y devuelve el sha256; `get_asset` devuelve los bytes como `ArrayBuffer` y el front reconstruye el Blob (con el mime deducido de la cabecera, porque el comando no lo devuelve). Deduplicación por hash con `ON CONFLICT`. Todo el ciclo está en `io/assets.ts`: Blob/object URL con caché, cargas en segundo plano deduplicadas y `onAssetResolved` para repintar; `Renderer` y el thumbnail resuelven `asset:` antes de pintar. En browser, IndexedDB `inkboard-assets` (D3, ya tomada). Migración a schema `1.1.0` idempotente al cargar el board: solo toca los que aún tienen data URLs, escribe un snapshot `Before asset migration` en `board_versions` y solo entonces reescribe los `src`; insertar una imagen y pegarla ya la guardan como asset. Export JSON/SVG/PNG y el portapapeles incrustan la data URL para que los archivos y el payload sigan siendo portables. | El autosave de un board con una imagen grande baja de > 100 KB al tamaño del board sin las imágenes (unit con una data URL de 1,4 MB) · E2E (`e2e/assets.spec.ts`): la imagen insertada queda como `asset:<hash>`, los bytes están en el almacén y se decodifican tras recargar · `pnpm test` 150/150, `cargo test` 27/27 | L |
| M2-06 ✅ | Formato `.inkboard` (§16): ZIP con `board.json` sin comprimir, `metadata.json` (format, formatVersion, id, name, version, schemaVersion) y un `assets/<sha256>.<ext>` por cada `asset:` referenciado. Export e import en Rust (`formats/inkboard.rs`, crate `zip`): el export lee el board persistido y sus assets del almacén, así que ningún payload grande cruza el IPC, y el import parsea con límites (100 MB de archivo, 256 entradas, 25 MB por entrada, 100 MB totales, 50 MB de JSON, 10 000 objetos), rechaza paths inseguros (`/`, `..`, `\`), rehashea cada asset y falla si el hash no cuadra o si el board referencia un asset que no viene, y guarda los assets con deduplicación por hash. **Decisión: `.inkboard` solo existe en la app Tauri** (diálogo nativo de guardado y crate `zip`); en browser el botón no se muestra, y el import de JSON de M2-07 es el camino allí. Se detecta por extensión y por contenido (`looks_like_inkboard`), así que un `.inkboard` sin extensión también entra. | Roundtrip board → `.inkboard` → import idéntico, con los hashes de assets verificados (`cargo test` 35/35) | M |
| M2-07 ✅ | Import del JSON propio: `io/importBoard.ts` valida el payload antes de tocar nada (JSON parseable, objeto `board`, `board.objects` como array, `id` y `type` en cada objeto, con los mismos límites que Rust: 50 MB y 10 000 objetos) y devuelve el board normalizado con `deserializeBoard`, que rellena los campos que falten. El menú Export separa las dos intenciones: "Import as new board…" crea un board con id nuevo, lo persiste y navega a él, e "Insert into board…" mete los objetos en el board vivo como un único `AddObjectsCommand`, o sea un paso de undo. Las imágenes que vengan incrustadas como data URL en un JSON ajeno vuelven al almacén de assets (M2-05), los ids se remapean para no chocar con lo que ya hay en el board, y sigue pasando el snapshot previo de M2-04. Funciona en browser y en Tauri, a diferencia de `.inkboard` (allí el `schemaVersion` solo lo valida Rust, dentro del parser del `.inkboard`). | E2E (`e2e/import-json.spec.ts`): insertar deshace y rehace en un solo paso, importar como board nuevo abre el board, y `.inkboard` no aparece en el menú fuera de Tauri · unit de los límites y del esquema | S |
| M2-08 ✅ | Import seguro (§22): el webview ya no manda rutas. `inspect_import`, `read_file_bytes` e `import_inkboard` se sustituyen por un único `import_pick`, que abre el diálogo nativo con filtros por tipo y hace el pick, la lectura y el parseo en Rust; `export_inkboard` abre también el diálogo de guardado nativo. El tamaño se comprueba con `fs::metadata` (≤ 100 MB) **antes** de leer. Los dos parsers de ZIP acotan por entrada con `file.size()` + `take()` (25 MB) y por número de entradas (256), con tope total (100 MB en `.inkboard`, 50 MB de JSON en MS Whiteboard), tope de `metadata.json` (1 MB) y de textos extraídos (10 000), de modo que un zip bomb con cabeceras mentirosas no se descomprime entero. Las imágenes importadas se decodifican y re-encodan con el crate `image` (`formats/images.rs`):JPEG sigue JPEG, el resto a PNG, lo que strip de EXIF/XMP/ICC y descarta trucos de contenedor; la decodificación tiene límites de dimensión (20 000 px) y de memoria (512 MB), y SVG pasa sin re-encodear porque es texto vectorial. La detección de formato añade GIF/BMP/TIFF/ICO y magic bytes para imágenes sin extensión. CSP definida en `tauri.conf.json` (antes `null`) y `fs:default` + `dialog:default` fuera de las capabilities. | Tests de zip bomb, entradas de más, input truncado o mutado y EXIF: sin panics, rechazan con mensaje · **CSP verificada a mano en la app de escritorio: funciona** (el board carga y pinta, exportar e importar funcionan y no se pide nada remoto) | M |
| M2-09 ✅* | Export: JPG con calidad; modos board completo, selección o área visible; escala 1×–4×; fondo transparente opcional. En Tauri, diálogo nativo de guardado desde Rust (`plugin-dialog` + `std::fs`, sin `plugin-fs` en el webview desde M2-08); `<a download>` solo en el browser. Hecho: `io/exportRegion.ts` calcula el marco de cada modo (unión de AABB con 20 px de aire para board y selección, rectángulo visible exacto sin padding para el viewport) y el tamaño final en píxeles a la escala elegida; `PngExporter` pasa a `boardToImageDataUrl` con formato, escala, calidad y fondo (JPG → `toDataURL('image/jpeg', q)` con Low/High/Maximum = 0.7/0.9/0.98; la transparencia solo aplica a PNG y SVG porque JPEG no tiene alfa) y `SvgExporter` acepta la región como `viewBox`. El menú de export se rediseña como un panel de opciones (formato, área, escala, calidad o fondo transparente y un botón Export) en lugar de una lista de formatos. En Tauri los bytes viajan al comando Rust `save_export`, que abre el diálogo nativo de guardado con el nombre sugerido en la cabecera `x-name` (sanitizado) y escribe el archivo — el webview sigue sin permiso de `fs` y nunca ve una ruta; en browser es `<a download>`. `boardToPngDataUrl` queda como helper compatible. | E2E en browser (`e2e/export.spec.ts`): las dimensiones del PNG/JPG son área × escala y el PNG transparente trae alfa mientras el default es opaco · **Manual en Tauri pendiente**: abrir el diálogo nativo y confirmar el archivo escrito | M |
| M2-10 ✅ | Fidelidad del SVG (rotación, star/polygon, puntas de flecha, contorno perfect-freehand, wrap de texto) y PDF vectorial generado desde ese SVG en Rust (`usvg` + `svg2pdf`, D2). Hecho: `SvgExporter` deja de ser una aproximación y **replica al renderer** — un único `translate(centro) → rotate → scale → translate(-caja/2)` por objeto (la misma convención de centro que el canvas, no rotar sobre `x,y`), `star` y `polygon` como polígonos con 2×lados y lados variables, puntas de flecha en formas `arrow` y en los dos extremos de los conectores (flecha o punto, según estilo), `strokeDash`, esquinas redondeadas acotadas a media caja, y los trazos como **contorno relleno de perfect-freehand** en vez de una línea sin relleno. Para no calcularlo dos veces, `strokeCache` expone el contorno plano (`strokeOutlineFlat`) que comparten canvas y exportador, y construye el `Path2D` solo si el renderer lo pide. El texto usa `wrapText` (el mismo word-wrap que la pantalla, y su caché de M3-03), con alineación y color de fondo; las stickies conservan su pliegue; `ink` y los colores de tema se resuelven, y las imágenes `asset:` llegan ya resueltas a data URL (`resolveAssetSources`). El PDF se genera en Rust (`formats/pdf.rs`): `usvg` parsea el SVG contra la base de fuentes del sistema y `svg2pdf` escribe los bytes, así el texto y los trazos salen vectoriales (D2). El comando `export_pdf` recibe el SVG como body crudo, **abre el diálogo nativo de guardado en Rust** y devuelve `null` si se cancela, sin que ninguna ruta cruce al webview; la opción PDF solo aparece en Tauri y no tiene fallback a SVG. | Diff visual PNG vs SVG rasterizado < 1 % → **cumplido**: E2E nuevo (`e2e/svg-fidelity.spec.ts`) que rasteriza el SVG exportado y lo compara píxel a píxel con el PNG del canvas, con menos del 1 % de píxeles distintos; más tests unitarios de fidelidad (star con 2×lados puntos, puntas de flecha, contorno cerrado con `fill`, escapado de markup, transform centrado) y de Rust del PDF (bytes válidos con texto, formas e imagen incrustada; SVG inválido rechazado) | L |
| M2-11 ✅ | MS Whiteboard: los textos extraídos entran como stickies en rejilla en el centro del viewport, en un solo paso de undo, con un mensaje honesto sobre el alcance (§17). Hecho: `io/msWhiteboard.ts` coloca título + textos en sticky notes de 220×200 con 16 px de separación, en rejilla de hasta 4 columnas centrada en el centro del viewport (coordenadas de mundo, no de pantalla) y los inserta con un único `AddObjectsCommand`, o sea un solo `Ctrl+Z`; los vacíos se descartan. El aviso de alcance es un banner transitorio (`BoardNotice.svelte` + `showNotice()` en el store de UI) que dice cuántos textos entraron y que un export de MS Whiteboard solo trae texto, no tinta ni formas. `insertImportedTexts` (textos sueltos) se retira del camino de import. | E2E con un ZIP de fixture → cubierto con tests unitarios de la rejilla y del undo único (`msWhiteboard.test.ts`) más un test de Rust que parchea un ZIP con la forma del export y comprueba el orden de los textos | S |

\* M2-09 está implementada y verificada en browser por E2E, pero su aceptación incluye una comprobación manual en la app Tauri que aún no se ha hecho: abrir el diálogo nativo de guardado y confirmar el archivo escrito. Trátala como abierta solo hasta cerrar eso.

**Nota de M2-08:** de sus dos criterios de aceptación, `cargo-fuzz` no se ejecutó (la crate sigue fuera de `Cargo.toml` en §29) y se cubrió con los tests de zip bomb, entradas de más, input truncado o mutado y EXIF, que comprueban que no hay panics y que el error es mensaje. La CSP sí se verificó a mano en la app de escritorio, así que la tarea queda cerrada.

**Gate M2: cumplida.** Los cuatro puntos verificados: la migración desde una DB v0.1 está probada en `cargo test` (detecta `user_version = 0` con el esquema ya presente y solo la marca, sin reejecutar el SQL ni tocar datos) · el roundtrip `.inkboard` sale idéntico al board, con los hashes de assets rehasheados y verificados en el import · los parsers están cubiertos sin panics con entradas malformadas, truncadas o mutadas y con zip bombs de cabeceras mentirosas (256 entradas, tope por entrada y total) · el webview no puede leer rutas arbitrarias: todos los diálogos nativos de import y export (M2-06, M2-08, M2-09 y M2-10) abren y escriben en Rust, y `fs` sigue fuera de sus capabilities. Como en M2-08, `cargo-fuzz` **no se usó** (la crate sigue fuera de `Cargo.toml`, §29) porque no es viable en Windows; la cobertura equivalente la dan esos tests de límites.

### 24.7 M3 — Rendimiento medido (v0.4.0)

Primero medir, después optimizar. OffscreenCanvas solo si los números lo exigen.

| ID | Tarea | Aceptación | Tam. |
|----|-------|------------|------|
| M3-01 ✅ | Harness de benchmarks: generador de boards sintéticos (2k/5k/10k objetos mixtos) y escenarios Playwright que miden el frame time de pan/zoom, la latencia del pen, la carga, las long tasks del autosave y la memoria. `pnpm bench` guarda los resultados en un JSON con timestamp (fuera de git). Hecho: `bench/generator.ts` genera tableros deterministas (PRNG mulberry32 con semilla fija, mezcla de 40 % trazos, 22 % formas, 15 % texto, 15 % stickies y 8 % imágenes) y `bench/harness.bench.ts` mide pan y zoom por deltas de rAF, latencia pointer → frame pintado, carga de 1k objetos desde `localStorage`, long tasks del autosave con `PerformanceObserver` y heap con `performance.memory`; cada resultado incluye la metadata de la máquina y del navegador. `pnpm bench` usa `bench/playwright.bench.config.ts` (propio `testDir`, un worker, sin retries, timeout de 20 min, `--disable-frame-rate-limit` y `--disable-gpu-vsync` para que el frame time mida coste real de render, y `--enable-precise-memory-info`), o sea queda **fuera de la suite E2E y de la CI**. Los JSON caen en `bench/results/` y `.gitignore` los excluye. El puente `board/benchBridge.ts` expone `window.__inkboard` (cargar objetos, mover la cámara, marcar dirty, forzar autosave, leer heap) y **solo se instala en builds DEV**, así que no existe en los bundles de producción. | Baseline registrado para cada fila de la tabla de §19 (ver *Baseline 2026-10-04*) | M |
| M3-02 ✅ | Caché de contornos: un `Path2D` por trazo, invalidado por versión (hoy `getStroke` corre para cada trazo visible en cada frame). Hecho: `objects/strokeCache.ts` guarda un `Path2D` por trazo indexado por id, con huella O(1) (`updatedAt`, número de puntos y tres muestras: primera, mediana y última) para invalidar sin recalcular, LRU FIFO a 5 000 entradas y respeto por el `smoothedPoints` precomputado cuando existe; `renderStroke` solo rellena el path. Además, durante un gesto de dibujo (pen, highlighter, shape y connector, que marcan su objeto vivo con `setLiveObject`) el `Renderer` pinta la escena sin ese objeto en un canvas offscreen una sola vez, cacheada por clave de cámara/tema/DPR y marcada sucia por cualquier cambio del store ajeno al objeto vivo, y en cada frame solo `drawImage` de esa capa más el objeto activo: por eso la latencia del lápiz pasa de 87 ms a 0,5 ms. | Pan con 2k trazos ≥ 60 FPS → **no se cumple**: 27,2 FPS con 2k tras el cambio (antes 21,1); el objetivo de framerate sigue abierto | S |
| M3-03 ✅ | Cachés de layout de texto y de imágenes decodificadas (`createImageBitmap`, LRU por memoria, versiones reducidas para zoom bajo). Hecho: `objects/textLayout.ts` cachea el resultado de `wrapText` por (fuente, ancho a dos decimales, contenido) en un FIFO de 4 000 entradas y expone `clearTextLayoutCache()` / `textLayoutCacheSize()` para tests, así el word-wrap ya no se recalcula en cada frame de un texto sin cambios. `canvas/imageCache.ts` sustituye el `Map<string, HTMLImageElement>` del `Renderer` por un `ImageCache` que decodifica cada `src` una sola vez con `createImageBitmap`, construye la versión reducida cuando se pide (M3-04) y evictiona las entradas menos usadas al pasar de 192 MB de bytes, cerrando los `ImageBitmap` que tira; `onReady` llama a `invalidateStatic()` + `markDirty()` para que el contenido que llega tarde se pinte. `renderImage` ahora acepta `CanvasImageSource` y calcula el `cropRect` sobre `imageSourceSize`, que devuelve `null` mientras la imagen no está lista. | Memoria dentro de RNF-04 → heap 5k de **89 MB** (< 300 MB) ✅, pero el objetivo de RNF-04 está escrito sobre **RSS** y el harness no lo mide: esa parte queda sin verificar | M |
| M3-04 ✅ | LOD: con zoom < 0,25, trazos como polilínea simplificada, texto de menos de 3 px como barras e imágenes en baja resolución. Hecho: `canvas/lod.ts` fija los umbrales (`LOD_ZOOM = 0.25`, `TEXT_BAR_PX = 3`, `REDUCED_MAX_EDGE = 256`) y `renderObject` recibe el `zoom` de la cámara, así que por debajo de 0,25 los trazos se pintan como polilínea con `lineWidth` corregido por el zoom, el texto y las stickies por debajo de 3 px en pantalla se sustituyen por barras y las imágenes pasan al bitmap reducido que cachea el `ImageCache`. | Zoom-out con 5k objetos ≥ 60 FPS → **no se cumple**: 16,8 FPS con 5k (10,7 tras M3-02, 6,2 en baseline). El LOD evita que el detalle crezca con el zoom-out, pero con 5k objetos el coste sigue en cuántos hay que pintar | S |
| M3-05 ✅ | Arrastre de muchos objetos: no reindexar RBush en cada `pointermove`; reindexar al soltar y usar los bounds de la selección para el culling durante el gesto. Hecho: `ObjectStore.markChanged()` mueve la geometría y registra los ids como diferidos, emitiendo el cambio para que se repinte **sin tocar el índice espacial**; `deferredObjects()` los devuelve y el `Renderer` los pinta aunque el índice (ya obsoleto) diga que salieron del viewport, así el culling no hace desaparecer lo que se está moviendo. El reindexado real ocurre una sola vez, al soltar, con el comando de transformación (`notifyMoved`), y `SelectTool.reset()` también lo vacía si se aborta el gesto a mitad. Además el marquee pasó a calcular la selección **una sola vez en `pointerup`** (guardando el estado de shift, que el evento ya no trae) en vez de en cada `pointermove`, y `queryViewport` reutiliza un buffer en vez de encadenar `map` + `filter`. | Mover 1.000 objetos ≥ 50 FPS → **sin medir**: el harness no tiene escenario de arrastre (mide pan, zoom, pen, marquee, autosave, carga y memoria), así que la aceptación queda pendiente de un `perf:drag-1k`. Lo que sí se midió: marquee 5k de 131 a **105 ms** de pared, con el cómputo de selección ya por debajo de 50 ms | S |
| M3-06 ✅ | Autosave incremental: dirty flag en el engine (hoy siempre se serializa y se envía, y el hash de Rust nunca coincide, ver B17). Medir `JSON.stringify` y moverlo a un Worker solo si supera 16 ms. Hecho: `ObjectStore` expone un `revision` que se incrementa en cada `emit`, y `BoardSession` guarda la revisión del último guardado correcto, así que `saveNow()` vuelve antes de construir, serializar o escribir nada si el board no cambió (además `buildBoard` copia `camera` y `grid` a objetos planos porque los proxies reactivos de Svelte no son clonables). La serialización va a `io/autosaveSerializer.ts`: boards de **500 objetos o más** pasan por un worker de módulo (`io/autosave.worker.ts`) y los pequeños se serializan en línea, porque `postMessage` costaría más que el `stringify`; el serializer es inyectable en `BoardSession` para poder testearlo. Tres fallbacks: si no hay `Worker` (SSR, tests, webviews restringidos), si el worker falla a mitad de un guardado (las pendientes se rechazan y el siguiente guarda en línea) y si el payload no es clonable. `persistence.ts` gana `saveBoardJson` para escribir un board ya serializado sin volver a serializarlo. | Autosave de 5k objetos sin long tasks > 50 ms → **cumplido**: 0 long tasks (antes la mayor era de 62 ms) | M |
| M3-07 ✅ | Decisión OffscreenCanvas/Worker (§9, §20): spike de 2 días solo si M3-02…06 no alcanzan RNF-01/02. Resultado documentado en §28. **Decidido: NO adoptar.** Con RNF-01 (65,8 FPS con 2k), RNF-02 (p50 0,5 ms) y RNF-05 (0 long tasks) cumplidos en el hilo principal, el worker de render no aporta nada que justifique su coste: Canvas 2D con las optimizaciones de M3-02…06 basta para el objetivo del producto. Se deja como **upgrade path documentado**, no como trabajo pendiente: vuelve solo si el bench de la CI se degrada por debajo de los umbrales o si aparece un requisito que no cabe en el hilo principal. El spike de 2 días no se gasta. | Decisión escrita | S |

**Gate M3:** `pnpm bench` en CI con umbrales basados en RNF-01…05, medidos en una máquina de referencia documentada (CPU, GPU, DPR). → **Cumplida:** el workflow `.github/workflows/bench.yml` corre `pnpm bench` con `workflow_dispatch` y los lunes 03:00 UTC (nunca en push ni en PR) con `BENCH_ASSERT=1`, y falla la ejecución si el pan con 2k baja de 30 FPS, el p50 del lápiz llega a 16 ms, una long task de autosave pasa de 100 ms o la carga de 1k se va de 1500 ms; umbrales holgados a propósito porque los runners compartidos son más lentos que la máquina de referencia (i5-12450HX), y el JSON de cada corrida se sube como artefacto. **Primera ejecución real en GitHub Actions superada**, así que la gate está verificada y no solo escrita.

### 24.8 M4 — Release de escritorio (v0.5.0 beta)

**Versión:** la app está ya en **`0.5.0`** en `package.json`, `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml` (los tres verificados por `scripts/check-versions.mjs`), y Settings → About lo muestra. **El tag y la release siguen pendientes** y no los puede hacer el agente: dependen de que el usuario cargue los secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, sustituya la `pubkey` de ejemplo por la real y empuje `v0.5.0`. `CHANGELOG.md` ya tiene la sección `[0.5.0] - 2026-10-04`, así que publicar el borrador es el último paso (ver README § Releases).

| ID | Tarea | Tam. |
|----|-------|------|
| M4-01 ✅ | Guardar tamaño, posición y estado maximizado de la ventana (`tauri-plugin-window-state`); instancia única que enfoca la ventana existente (`tauri-plugin-single-instance`). Hecho: `window-state` restaura la geometría, y `single-instance` se registra **antes que cualquier otro plugin** (requisito del plugin) para que un segundo arranque haga `unminimize` + `show` + `set_focus` sobre la ventana viva en lugar de abrir una instancia rival; su callback también reenvía el `argv` para que un archivo abierto con la app ya abierta se importe en la ventana existente (ver M4-03). | S |
| M4-02 ✅* | macOS: controles nativos (`titleBarStyle: "Overlay"` en `tauri.macos.conf.json`) en lugar de los botones propios; verificar el menú Edit (sin él, Cmd+C/V pueden no funcionar en WKWebView). Linux: checklist manual en WebKitGTK (Ubuntu 22.04+, Fedora). Hecho: `src-tauri/tauri.macos.conf.json` pone `titleBarStyle: "Overlay"` con `hiddenTitle: true` y `decorations: true`, de modo que macOS dibuja sus semáforos **encima** de la TopBar; `TopBar` oculta entonces los botones propios (si no, quedarían superpuestos) y deja 72 px de hueco a la izquierda con `.topbar.macos .left { padding-left: 72px }`. La detección está en `utils/platform.ts` (`detectPlatform` como función pura sobre userAgent/platform + test unitario, `currentPlatform`/`isMacos`), y se resuelve **en `onMount`**, nunca durante el SSR, para no hydration-mismatch. La otra mitad es el menú nativo: `build_app_menu` en `lib.rs` construye un menú de app (about, services, hide, show all, quit) y un submenú **Edit con los items predefinidos** (`undo`, `redo`, `cut`, `copy`, `paste`, `select_all`), que son los que llevan los selectores correctos para que Cmd+C/V funcionen dentro de WKWebView; se compila en todos los targets (para que `cargo check` lo cubra) y solo se instala en macOS. Windows y Linux conservan sus botones y la config por defecto. La **checklist manual de Linux/WebKitGTK** está en el anexo §24.8.1. | `cargo build` en verde (no hay Mac ni Linux en esta máquina) · test unitario de `detectPlatform` · **Pendiente de verificación real en el CI de release**: no se ha probado en un Mac ni en un Linux, así que el Overlay, el menú Edit y los seis puntos de la checklist están sin comprobar en el SO | M |
| M4-03 ✅ | Asociar `.inkboard` en el instalador y abrir los archivos recibidos como argumento. Hecho: `bundle.fileAssociations` declara la extensión `.inkboard` (nombre, descripción, rol `Editor`, MIME `application/x-inkboard`) y `commands/desktop.rs` procesa el `argv` del SO **entero en Rust**: filtra los argumentos que terminan en `.inkboard` (sin distinguir mayúsculas, saltando `argv[0]`), comprueba que sea un archivo y que no supere `MAX_ARCHIVE_BYTES`, y lo importa por el mismo camino que el diálogo de M2-08 (assets a SQLite + board con id nuevo). El frontend nunca ve una ruta: recibe ids, con `take_pending_opens` para lo que se importó antes de que la UI existiera y el evento `inkboard:open-board` para lo que llega en caliente; `io/desktopOpen.ts` los traduce a navegación. Aplica tanto al arranque en frío como a la segunda instancia. | S |
| M4-04 ✅ | Logs también en release (hoy `tauri-plugin-log` solo se activa en debug), en archivo rotativo; "Abrir carpeta de logs" en Settings; panic hook en Rust. Hecho: `tauri-plugin-log` se activa siempre, a nivel `info` en release y `debug` en dev, escribiendo en el log dir del sistema con nombre `inkboard`, rotación a 5 MB y las 5 últimas conservadas (además de stdout). `std::panic::set_hook` registra el panic antes de que el proceso se desencole, así que una caída deja rastro. Settings tiene el botón **Open logs folder**, que solo aparece en Tauri y llama a `open_logs_dir` (abre el log dir con `explorer`/`open`/`xdg-open`). | S |
| M4-05 ✅* | Updater (`tauri-plugin-updater`) con claves de firma y canal beta. **Clave de firma generada**: la **pública** irá en `tauri.conf.json` (esta tarea) y la **privada con su contraseña están fuera del repo**, en el `~/.tauri/` del usuario; para CI quedan pendientes cargar los secrets `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Este repo no contiene ninguna clave. Hecho: `tauri-plugin-updater` + `tauri-plugin-process` arrancan en Rust, `bundle.createUpdaterArtifacts` hace que el bundle emita los artefactos firmados que el updater necesita, y el endpoint y la `pubkey` se declaran en `tauri.conf.json` (`https://github.com/MarcozVD/inkboard/releases/latest/download/latest.json`, la que publica `latest.json` en cada release). Capabilities: `updater:default` y `process:allow-restart`, y **`fs` sigue ausente**, así que la descarga la hace Rust y el webview nunca ve una ruta. `board/updateBridge.svelte.ts` lleva el flujo (check, descarga con progreso, confirmación, install, relanzado) y resuelve los plugins con import perezoso, devolviendo `null` fuera de Tauri para no tocar la build de browser. `BoardCanvas` dispara **un** check silencioso a los 3 s de arrancar y, si hay versión, avisa con `BoardNotice` ("Inkboard X.Y.Z está disponible — abre Settings → About"); Settings → About añade **Check for updates**, que informa up-to-date / downloading / installing o el error, y **Install and restart** con `window.confirm` antes de instalar y relanzar. El check silencioso nunca pone estado de error, así que estar sin red no molesta. | E2E (`e2e/updater.spec.ts`) con el plugin inyectado por `window.__updaterMock`: aviso al arrancar, ciclo check+install+relaunch aceptando la confirmación, y up-to-date sin botón de instalar. **Pendiente para el primer release**: sustituir la `pubkey` de ejemplo que hay ahora en `tauri.conf.json` por la pública real, o la verificación de firma rechazará toda actualización | M |
| M4-06 ✅* | Pipeline de release con `tauri-action` al crear un tag: MSI/NSIS, dmg universal y AppImage/deb; firma de código en Windows y notarización en macOS (D4). Hecho: `.github/workflows/release.yml` dispara con `tauri-action` en tags `v*` y `workflow_dispatch` (nunca en push ni PR), sobre `windows-latest` (NSIS + MSI), `macos-latest` (`--target universal-apple-darwin`) y `ubuntu-22.04` (AppImage + deb, con `libwebkit2gtk-4.1-dev`), y los tres jobs caen en **la misma GitHub Release en borrador** con `includeUpdaterJson`, que deja el `latest.json` que el updater lee en `releases/latest/download`. Sin firma de código ni notarización (**D4**). Orden deliberado: primero `scripts/check-versions.mjs`, que falla si `package.json`, `tauri.conf.json` y `Cargo.toml` no comparten versión (los tres en `0.5.0` desde el bump), y después un paso que **falla con un `::error::` nombrando los secrets que faltan** (`TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) en vez de morir dentro de la acción. Se añade `yaml` (dev) para testear los workflows. | Test de los cuatro YAML de `.github/workflows` + el de las tres versiones (`src/lib/workflows.test.ts`): dispara solo con `v*` y manual, las tres plataformas con sus argumentos, `releaseDraft` e `includeUpdaterJson` a true, y que el paso de secrets mencione las dos variables y `check-versions.mjs`. **Primer release pendiente**: los secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` **aún no están cargados en el repo**, así que un tag hoy falla en ese paso a propósito; hay que cargarlos y crear el tag `vX.Y.Z` | M |
| M4-07 ✅ | Pulido: onboarding en el empty state, accesibilidad de los paneles (foco visible, navegación por teclado, `prefers-reduced-motion`) y revisión de textos. Hecho: el empty state pasa de una línea atenuada a un **onboarding ligero** con título y tres pistas (`CanvasHint`, ya con `data-testid` y **sin `aria-hidden`**, porque ahora aporta información real): lápiz con `kbd` P, overlay de atajos con `?`, y panel Create con `+`. Foco visible global con `:focus-visible { outline: 2px solid var(--color-accent) }`. **ContextMenu** toma el foco al abrir y navega con ↑/↓/Home/End entre items habilitados (saltando separadores y deshabilitados) y cierra con Escape. **CommandPalette**: el input es `role="combobox"` con `aria-expanded`, `aria-controls` y `aria-activedescendant`, la lista es `role="listbox"`, cada opción `role="option"` + `aria-selected` + `tabindex="-1"`, y la activa se hace `scrollIntoView` al navegar. **Settings**: `aria-modal="true"` con `aria-labelledby`, cierra con Escape y **atrapa el Tab** (foco cíclico sobre los focusables visibles, `shift+Tab` incluido), en vez del `stopPropagation` que antes no hacía nada útil. `prefers-reduced-motion` respetado en las animaciones de UI, con test que mide duración ~0. | E2E (`e2e/a11y.spec.ts`): menú de contexto (foco entra, flechas mueven, Escape cierra), paleta (flechas cambian la activa, Escape cierra), Settings (toma foco, Tab dentro, Escape cierra), las tres pistas del onboarding y `prefers-reduced-motion` sin animaciones | M |
| M4-08 ✅ | Presupuesto de tamaño: binario < 15 MB (RNF-06), medido en CI. Hecho: `.github/workflows/build.yml` corre `pnpm tauri build --no-bundle` en `windows-latest` con `workflow_dispatch` y tags `v*` (nunca en push ni PR) y **falla la ejecución si `inkboard.exe` pasa de 15 MB**. El binario release local mide **13,3 MB** (subió de 10,5 MB al enlazar `usvg`, `svg2pdf` y `fontdb` para el PDF de M2-10, y sigue con margen), con margen: el `[profile.release]` de `Cargo.toml` usa `opt-level = "s"`, `lto = true`, `codegen-units = 1` y `strip = true`. RNF-06 cumplido. | S |

**Gate M4:** → **Cumplido todo lo que no depende de una máquina ajena:** las ocho tareas de §24.8 están cerradas, la versión de la app ya está en `0.5.0` en los tres archivos y `CHANGELOG.md` tiene su sección `[0.5.0] - 2026-10-04`. **Pendiente (no es código):** instaladores de los 3 SO desde CI · checklist manual por SO · changelog publicado · tag. Los tres últimos requieren que el usuario **cargue los secrets** `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, **sustituya la `pubkey` de ejemplo** por la real y **elija la versión** (`vX.Y.Z`) — con eso el tag dispara `release.yml`, los tres SO se compilan y el borrador se publica. La verificación en macOS y Linux (§24.8.1) solo puede ocurrir sobre los artefactos que produce ese primer release.

\* M4-02, M4-05 y M4-06 están implementadas y verificadas por test, pero **no pueden usarse del todo hasta un release real**. Antes del primer tag hay que hacer dos cosas, ambas deliberadamente fuera del repo: (1) cargar los secrets `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` en Settings → Secrets and variables → Actions, y (2) sustituir la `plugins.updater.pubkey` de `tauri.conf.json`, que hoy es la **clave de ejemplo del template de Tauri**, por la clave pública real. Sin (2) las actualizaciones se descargan pero la verificación de firma las rechaza. En M4-02 lo pendiente es el hardware: **no hay Mac ni Linux en la máquina de desarrollo**, así que el Overlay, el menú Edit y la checklist WebKitGTK están validados solo por `cargo build` y por test, y su comprobación real cae en el primer release de CI.

### 24.8.1 Anexo — checklist manual por SO (M4)

Todo esto **no se puede automatizar aquí** y es lo que cierra la gate de M4. Se ejecuta una vez sobre los instaladores que produce el primer `release.yml`.

**macOS (dmg universal)**
1. Abrir el `.dmg` y montar: Gatekeeper avisa de que la app no está notarizada (esperado, D4); se abre con clic derecho → Open.
2. Los **semáforos nativos** están arriba a la izquierda y la TopBar deja hueco para ellos: no hay botones propios superpuestos (M4-02).
3. **Cmd+C / Cmd+V** copian y pegan dentro de inputs y dentro del board. Si fallan, el submenú **Edit** no está instalado: es el bug que M4-02 arregla (WKWebView sin menú Edit se come los atajos).
4. Cmd+Z / Cmd+Shift+Z deshacen y rehacen; Cmd+A selecciona todo.
5. Arrastrar la barra superior mueve la ventana; el doble clic en la barra hace zoom o fullscreen según el SO.
6. Log de sistema (Console.app) con el nombre `inkboard`: hay entrada tras arrancar.

**Linux (AppImage y deb) — WebKitGTK**
1. En Ubuntu 22.04+ y Fedora: `webkit2gtk-4.1` instalado (el deb declara la dependencia; el AppImage **no**, hay que instalarlo a mano).
2. **Eventos de puntero y foco de inputs**: dibujar con el lápiz, mover objetos con arrastre y escribir en un input de texto. Es el riesgo tipo **B03** (WebKitGTK se comporta distinto con `pointer` events y con el foco), y en local no se puede comprobar.
3. **Instancia única** (M4-01): lanzar dos veces el AppImage enfoca la ventana existente y no abre una segunda; con un `.inkboard` como argumento, lo abre en esa ventana (M4-03).
4. **AppImage vs deb en el updater** (M4-05): instalar desde el `.deb` y comprobar que el artefacto que `latest.json` sirve es el que corresponde a este SO. Si se mezclan, el updater descarga un binario que no instala — es el fallo más probable de esta lista.
5. Atajos del teclado: `Ctrl+Z`, `Ctrl+C/V`, `?` (overlay), `Escape`.
6. Logs en `~/.local/share/com.inkboard.app/logs` (o el dir de logs del SO).

**Windows (NSIS y MSI)** — además de lo ya verificado a mano (M0, M2-08): SmartScreen avisa al instalar, esperado por D4; desinstalar deja la DB intacta; doble clic en `.inkboard` abre la app.

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
| v0.2.0 ✅ | Editor | Además: cambiar estilos, copiar y pegar entre boards, agrupar, bloquear, usar snap a grid y conectores rectos, y trabajar en tema claro. |
| v0.3.0 ✅ | Datos | Además: renombrar, duplicar y borrar boards; recuperar versiones; exportar a `.inkboard`, JPG y PDF; importar sin riesgo. **Completo** (2026-10-04, gate §24.6): gestión de boards con papelera y favoritos, historial con retención, assets fuera del JSON, `.inkboard` con verificación de hash, JPG y **PDF vectorial** desde el SVG, e import seguro con el parseo en Rust. |
| v0.4.0 | Rápido | Además: trabajar con 2k–10k objetos dentro de RNF-01…05. |
| v0.5.0 | Beta | Además: instalar y actualizar la app en Windows, macOS y Linux. |
| v1.0.0 | 1.0 | M5 priorizado, cero bugs P0/P1 abiertos y documentación de usuario. |

---

## 26. Backlog de funciones

| Función | Prioridad | Estado (2026-09-30) | Planificado en |
|---------|-----------|---------------------|----------------|
| Estilos editables (color, grosor, fill) | Alta | **Hecho (M1-03)** — ContextToolbar + popover del ToolBar, sin panel lateral; cada cambio es undoable | M1-03 |
| Clipboard de objetos | Alta | **Hecho (M1-04)** — `Ctrl+C/X/V` y menú contextual, portapapeles del sistema con `inkboard/clipboard@1` + fallback interno, cut/paste undoable | M1-04 |
| Conectores entre objetos | Alta | **Rectos hechos (M1-09)** — 4 anclas, flecha, se recalculan al mover/escalar; ortogonales en M5 | M1-09 (rectos), M5 (ortogonales) |
| PDF / JPG / `.inkboard` ✅ M2-06, M2-09, M2-10 | Alta | **Los tres hechos.** `.inkboard` (M2-06): ZIP con `board.json`, `metadata.json` y `assets/`, export e import en Rust con límites y verificación de hash, solo en la app Tauri. JPG (M2-09): panel de export con formato, área (board, selección o visible), escala 1×–4×, calidad y fondo transparente en PNG/SVG; en Tauri lo guarda el comando Rust `save_export` tras su diálogo nativo y en browser baja con `<a download>`. PDF (M2-10): **vectorial**, generado en Rust con `usvg` + `svg2pdf` a partir del mismo SVG que sale del exportador fiel al canvas (texto y trazos vectoriales, D2); el diálogo de guardado también es nativo, solo aparece en Tauri y no hay fallback a SVG | — |
| Import del JSON propio ✅ M2-07 | Media | **Hecho** — "Import as new board…" o "Insert into board…" en un paso de undo, con validación de esquema y límites; funciona en browser y en Tauri | — |
| Colaboración en tiempo real | Alta (largo plazo) | Solo stub de UI | M6 |
| Agrupación | Media | **Hecho (M1-05)** — `Ctrl+G`/`Ctrl+Shift+G`, clic selecciona el grupo, doble clic entra, un nivel de anidamiento | M1-05 |
| Gestión de boards (renombrar, duplicar, borrar) ✅ M2-02 | Media | Solo crear, listar, buscar y favoritos | M2-02 — **hecho**: Home con renombrar, duplicar, papelera (restaurar/purgar), ordenar por fecha o nombre y favoritos en SQLite |
| Versiones / backup ✅ M2-04 | Media | **Hecho** — snapshot automático cada 5 min de edición activa, snapshot antes de importar o restaurar y "Save version" manual; lista con etiqueta y fecha y "Restore" en Settings → Datos; retención de 50 versiones o 30 días, y restaurar nunca destruye | M2-04 |
| Snap a grid / smart guides | Media | **Grid snap hecho (M1-07)** (toggle en Settings, `grid.snap` persistido, Shift a un eje, rotación de 15°); smart guides, alinear y distribuir siguen en M5 | M1-07 (grid), M5 (guías) |
| Minimap | Media | No | M5 |
| Búsqueda de objetos | Media | No (sí de boards) | M5 |
| Importación MS Whiteboard ✅ M2-11 | Media | **Parcial (texto), hecho (M2-11)** — los textos extraídos entran como stickies en rejilla centrada en el viewport, en un solo paso de undo, con un aviso de que el export solo trae texto; no se amplía por el límite del formato (§17) | — |
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
| ~~`e2e/clipboard.spec.ts` (copiar en el board A y pegar en el B) era flaky con workers en paralelo~~ **Corregido (M1-13)**: el spec va en `mode: 'serial'`, y con eso la suite completa pasa dos corridas seguidas y también en CI | — | El portapapeles del SO es un recurso compartido entre contextos; si vuelve a fallar, la siguiente palanca es no tocar el portapapeles del sistema en el test (el fallback interno de `board/clipboard.ts` ya cubre el pegado entre boards) y no `mode: 'serial'`, que solo ordena los tests dentro del archivo |

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
IndexedDB descartado como almacén principal: solo disponible en web, no en Tauri de forma nativa. Sigue presente como fallback del modo browser, en los sitios donde localStorage no da (los assets, D3). JSON plano descartado: lento para tableros grandes, sin índices para metadata.

### CRDT vs OT para colaboración
**Elegido: Yjs (CRDT), para Fase 18+**
OT descartado: requiere servidor central y complejidad alta de implementación. Automerge considerado, pero Yjs tiene mejor performance y ecosistema para whiteboard.

### Command Pattern vs Event Sourcing para historial
**Elegido: Command Pattern**
Event Sourcing descartado para v1: sobre-ingeniería sin colaboración activa. Se puede evolucionar a ES cuando se necesite.

### WASM para geometría vs Rust via IPC vs TypeScript
**Elegido: TypeScript primero (RBush), Rust via IPC para operaciones pesadas de IO**
WASM compilado descartado para el MVP: complejidad de compilación y bindgen sin beneficio demostrado para las operaciones actuales. Si el spatial indexing TypeScript resulta insuficiente, se puede compilar RBush a WASM con AssemblyScript, o implementar R-tree en Rust y exponer via WASM.

### Decisiones tomadas en la auditoría (2026-09-30) y en la implementación (2026-10-02)

- **Rotación alrededor del centro de la caja** en todos los módulos (M0-10).
- **Toda mutación del board pasa por un comando** (`engine.execute`). Es la condición para tener undo completo, un autosave fiable y, más adelante, colaboración (M1-02).
- **D2 — el PDF es vectorial y se genera desde el SVG** en Rust con `usvg` + `svg2pdf` (decidido por el usuario, 2026-10-04; se aplica en M2-10). Se descartó la opción a) (raster PNG con `printpdf`) porque convertiría el board en una imagen sin nitidez al ampliar y sin texto seleccionable, justo lo que se pierde al exportar a PDF. Como el SVG ya es la fuente de verdad del board (y sus paths de trazo ya salen cacheados de M3-02), reusarlo es la opción más simple de mantener: un solo pipeline de representación para pantalla y PDF.
- **D4 — la beta va sin firma de código** (decidido por el usuario, 2026-10-04). No se contrata certificado de Windows ni se entra en el Apple Developer Program para la beta: en Windows el usuario verá el aviso de SmartScreen al abrir un instalador sin firmar, y es el precio de no bloquear el calendario. **Firmar antes de cualquier distribución pública**: el riesgo asumido queda acotado a la beta interna y a testers conocidos, no a usuarios finales. También explica por qué M4-06 puede avanzar en paralelo: el pipeline de `tauri-action` genera los instaladores desde el principio y la firma se añade después como un paso, no como un rediseño. `release.yml` (M4-06) sale así sin firmar, y firma y notarización se añaden como pasos después; la beta **sí** va firmada en el sentido de minisign para el updater, que es otra cosa: la clave de firma de actualizaciones es obligatoria desde el primer tag porque sin ella `createUpdaterArtifacts` no genera los artefactos que el updater descarga.
- **Render en el hilo principal: decisión cerrada en M3-07 (2026-10-04), no condicionada a benchmarks futuros.** OffscreenCanvas + `RenderWorker` **no se adoptan**: con las optimizaciones en hilo principal de M3-02…06, RNF-01, RNF-02 y RNF-05 se cumplen (65,8 FPS con 2k objetos, 0,5 ms de latencia de lápiz, 0 long tasks al autosavear 5k; ver §19). La condición que había para adoptarlo —que los benchmarks de M3 no alcanzaran RNF-01/02— no se dio, así que el spike de 2 días no se gasta y el diseño de §20 queda como upgrade path: se reevalúa solo si el bench de la CI se degrada por debajo de sus umbrales. El único worker que hay en producción es el de serialización del autosave (M3-06), y con tres fallbacks (sin `Worker`, worker que falla, payload no clonable) para que ningún entorno quede sin autosave.
- **PNG y JPG se exportan desde TypeScript**, porque el canvas ya existe. Rust queda para PDF, `.inkboard` y el parsing de imports.
- **D1 — tinta semántica (opción b)**, decidida por el usuario e implementada en M1-10. Solo el color por defecto es semántico: los objetos llevan el valor `ink` y `objects/colors.ts` lo resuelve al tema activo (claro en dark, oscuro en light); los colores que elige el usuario son absolutos y no cambian con el tema. La opción a) descartada porque el blanco por defecto desaparece en tema claro, y la c) descartada porque invertir el canvas en dark rompe los PNG exportados.
  - **Regla de migración:** al cargar un board, solo el antiguo blanco por defecto exacto `#e8e9ec` se reescribe a `ink`. Es un match exacto y solo sobre los campos de color por defecto (tinta de trazos y texto, stroke/fill de formas, sticky), nunca sobre colores elegidos por el usuario: cualquier otro valor se respeta tal cual, aunque se parezca al blanco. Se hizo así para que cambiar de tema nunca repinte trabajo ajeno.
- **D3 — los assets en modo browser van a IndexedDB**, decidida e implementada en M2-05. En Tauri viven en la tabla `assets` de SQLite y en browser en el object store `assets` de la base `inkboard-assets` (`io/assets.ts`), con la misma clave `asset:<sha256>` en los dos caminos. Se descartó seguir con data URLs en localStorage porque su límite de ≈ 5 MB no da para un board con imágenes, que es justo el caso que motivaba el almacén. El hash lo calcula Rust sobre los bytes en Tauri (`put_asset` lo devuelve) y el front con `crypto.subtle` en browser: el contenido se direcciona, no la ruta.
- **Al borrar un objeto, sus conectores sobreviven**: el extremo que estaba anclado se convierte en punto libre y conserva su última posición (M1-09, `syncEndpoint` en `board/connectors.ts`). Se descartó borrarlos en cascada porque perder trabajo en silencio es peor que dejar una línea colgando, y descartarlo re-enganchándolos al objeto más cercano porque exigiría un algoritmo de reasignación que nadie pidió. El conector queda como un objeto normal: se puede seleccionar, mover y borrar a mano. Lo que **no** hay es volver a anclar un conector existente a otro objeto (solo se crea uno nuevo arrastrando desde una ancla); si eso se echa de menos, es una tarea nueva.

### Decisiones pendientes

| ID | Pregunta | Opciones | Recomendación | Decidir antes de |
|----|----------|----------|---------------|------------------|
| D5 | Transporte de colaboración | Relay propio (`y-websocket`) · servicio gestionado · P2P (`y-webrtc`) | Decidir con los datos del spike | M6 |
| D6 | Idioma de la UI | Inglés (actual) · español · i18n | Inglés, extrayendo los strings en M4-07 | M4 |

**D2** (motor de PDF: vectorial desde el SVG con `usvg` + `svg2pdf`) y **D4** (beta sin firma de código, firmar antes de distribuir en público) ya están decididas y documentadas arriba, en *Decisiones tomadas*.

---

## 29. Dependencias

Versiones reales de `package.json` y `src-tauri/Cargo.toml` (2026-09-30):

- **Frontend:** svelte 5.57 · @sveltejs/kit 2.70 · vite 8.2 · vitest 4.1 · typescript 6.0 · @playwright/test 1.62 · rbush 4.0 · perfect-freehand 1.2 · uuid 14 · yaml 2.9 (dev, M4-06) · fast-check 4.10 (dev) · @tauri-apps/api 2.11 con los plugins fs, dialog, clipboard-manager, updater y process.
- **Rust:** tauri 2.11 · rusqlite 0.31 (bundled) · zstd 0.13 · sha2 0.10 · zip 2.1 · image 0.25 (M2-08) · usvg 0.43, svg2pdf 0.12 y fontdb 0.21 (M2-10) · serde / serde_json · uuid · anyhow · tauri-plugin-dialog, clipboard-manager, log, window-state, single-instance, updater y process. Con M2-08 el plugin `fs` deja de usarse en el import: el diálogo y la lectura se hacen dentro de Rust, así que las capabilities ya no piden `fs:default` ni `dialog:default`.

**Nota sobre `perfect-freehand`:** esta librería (de Steve Ruiz, creador de tldraw) genera strokes de alta calidad con simulación de presión. Es la elección pragmática para el lápiz frente a implementar Catmull-Rom desde cero.

Dependencias que añade el plan:

| Milestone | Dependencia | Para qué |
|-----------|-------------|----------|
| M1 | `fast-check` (dev) — **añadida en M1-02** | Tests de propiedades de los comandos (M1-02) |
| M1 | `eslint`, `typescript-eslint`, `eslint-plugin-svelte`, `globals`, `@eslint/js` (dev) — **añadidos en M1-12** | Lint en CI (M1-12) |
| M2 | `image` 0.25 (**añadida en M2-08**, sin features por defecto: png, jpeg, webp, gif, bmp, tiff, ico) | Re-encode de imágenes importadas (M2-08) |
| M2 | `usvg` 0.43, `svg2pdf` 0.12 y `fontdb` 0.21 — **añadidas en M2-10** (`usvg` sin features por defecto salvo `text` y `system-fonts`, y `fontdb` con `fs` para leer las fuentes del sistema) | PDF vectorial desde el SVG (M2-10) |
| M2 | `cargo-fuzz` (herramienta) — **no añadida** | Fuzzing de parsers (M2-08): no es viable en Windows, así que la cobertura la dan los tests de límites, entradas malformadas y zip bomb |
| M4 | `tauri-plugin-window-state`, `tauri-plugin-single-instance` — **añadidas en M4-01** · `tauri-plugin-updater`, `tauri-plugin-process` — **añadidas en M4-05** (y `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process` en el front) | Estado de ventana, instancia única, updater y relanzado tras instalar |

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
| `C` | Connector tool | ✅ (botón de nuevo visible desde M1-09; arrastra desde una ancla o desde un punto libre) | M1-09 |
| `Delete` / `Backspace` | Eliminar selección | ✅ (ya no se dispara al escribir en inputs, B04) | — |
| `Ctrl+Z` | Undo | ✅ | — |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo | ✅ | — |
| `Ctrl+C` / `Ctrl+X` | Copy / Cut | ✅ (objetos, también desde el menú contextual) | M1-04 |
| `Ctrl+V` | Paste | ✅ objetos en el cursor con offset acumulativo, entre boards, y texto plano como objeto texto; el pegado de imágenes sigue funcionando | M1-04 |
| `Ctrl+D` | Duplicate | ✅ | — |
| `Ctrl+A` | Select all | ✅ | — |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / Ungroup | ✅ (un clic selecciona el grupo, doble clic entra; un nivel de anidamiento) | M1-05 |
| `Ctrl+Shift+L` | Lock / Unlock | ✅ (también en el menú contextual; los bloqueados quedan fuera del marquee y del eraser) | M1-06 |
| `Flechas` / `Shift+Flechas` | Nudge 1 px / 10 px | ✅ (un paso de undo por tecla) | M1-07 |
| `Space + drag` | Pan | ✅ | — |
| `Ctrl + wheel` | Zoom | ✅ | — |
| `+` / `-` | Zoom in / out | ✅ (ya no se dispara al escribir en inputs, B04) | — |
| `Ctrl+0` | Reset zoom (100 %) | ✅ | — |
| `Ctrl+Shift+H` | Fit to screen | ❌ (solo desde la UI y la palette) | M1-12 |
| `[` / `]` | Un paso atrás / adelante | ✅ | — |
| `Ctrl+[` / `Ctrl+]` | Al fondo / al frente | ✅ | — |
| `Ctrl+K` | Command palette | ✅ | — |
| `?` | Overlay de atajos | ✅ (misma tabla que el keydown y la paleta) | M1-12 |
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
| 1 | Scaffold | ✓ (layout plano, sin Turborepo); CI y lint desde M0-16 y M1-12 | — |
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


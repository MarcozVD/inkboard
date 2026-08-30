# Especificación Técnica Completa — Whiteboard App

> **Versión:** 1.0 | **Fecha:** 2026-08-30 | **Stack:** Tauri 2 · SvelteKit · Rust · TypeScript

---

## 1. Resumen Ejecutivo

Se plantea el desarrollo de **Inkboard** (nombre provisional), una aplicación de pizarras digitales infinitas de nivel profesional, multiplataforma (Windows/macOS/Linux), con capacidad futura de colaboración en tiempo real. El stack es **Tauri 2 + SvelteKit + Rust**, con renderizado basado en **Canvas 2D acelerado con OffscreenCanvas**, evolucionable hacia WebGL en caso de necesidad demostrada.

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

**Principio fundamental:** el hilo principal solo maneja eventos de input y actualiza el estado. El renderizado ocurre en un Worker con OffscreenCanvas. Las operaciones pesadas (serialización, indexación espacial, import/export) ocurren en Rust (via Tauri IPC) o en Web Workers.

---

## 5. Diagrama de Componentes

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

```
inkboard/
│
├── package.json                    # workspace root
├── turbo.json                      # Turborepo (monorepo build tool)
│
├── apps/
│   └── desktop/                    # App Tauri principal
│       ├── src/                    # SvelteKit frontend
│       │   ├── app.html
│       │   ├── app.css
│       │   ├── routes/
│       │   │   ├── +layout.svelte
│       │   │   ├── +page.svelte    # Workspace home (board list)
│       │   │   └── board/
│       │   │       └── [id]/
│       │   │           └── +page.svelte
│       │   └── lib/
│       │       ├── canvas/         # Canvas Engine
│       │       │   ├── Camera.ts
│       │       │   ├── Scene.ts
│       │       │   ├── Renderer.ts
│       │       │   ├── RenderWorker.ts
│       │       │   ├── RenderLoop.ts
│       │       │   ├── ObjectStore.ts
│       │       │   ├── SpatialIndex.ts
│       │       │   ├── SelectionManager.ts
│       │       │   ├── HistoryManager.ts
│       │       │   ├── ClipboardManager.ts
│       │       │   ├── SnapEngine.ts
│       │       │   └── EventBus.ts
│       │       ├── tools/
│       │       │   ├── BaseTool.ts
│       │       │   ├── SelectTool.ts
│       │       │   ├── PenTool.ts
│       │       │   ├── HighlighterTool.ts
│       │       │   ├── EraserTool.ts
│       │       │   ├── TextTool.ts
│       │       │   ├── StickyNoteTool.ts
│       │       │   ├── ShapeTool.ts
│       │       │   ├── ConnectorTool.ts
│       │       │   └── ImageTool.ts
│       │       ├── objects/
│       │       │   ├── types.ts    # Todas las interfaces TS
│       │       │   ├── BaseObject.ts
│       │       │   ├── StrokeObject.ts
│       │       │   ├── TextObject.ts
│       │       │   ├── ShapeObject.ts
│       │       │   ├── ImageObject.ts
│       │       │   ├── StickyNoteObject.ts
│       │       │   ├── ConnectorObject.ts
│       │       │   └── GroupObject.ts
│       │       ├── stores/
│       │       │   ├── workspace.store.ts
│       │       │   ├── board.store.ts
│       │       │   ├── selection.store.ts
│       │       │   ├── tool.store.ts
│       │       │   └── settings.store.ts
│       │       ├── io/
│       │       │   ├── InternalFormat.ts
│       │       │   ├── SvgExporter.ts
│       │       │   ├── formats/
│       │       │   │   └── excalidraw.ts (futuro)
│       │       │   └── index.ts
│       │       ├── components/
│       │       │   ├── ui/
│       │       │   │   ├── Button.svelte
│       │       │   │   ├── Tooltip.svelte
│       │       │   │   ├── Modal.svelte
│       │       │   │   ├── ContextMenu.svelte
│       │       │   │   ├── ColorPicker.svelte
│       │       │   │   └── Slider.svelte
│       │       │   ├── TopBar.svelte
│       │       │   ├── Toolbar.svelte
│       │       │   ├── BoardList.svelte
│       │       │   ├── BoardCanvas.svelte
│       │       │   ├── PropertyPanel.svelte
│       │       │   ├── MiniMap.svelte
│       │       │   ├── ShortcutOverlay.svelte
│       │       │   └── TextEditor.svelte  # in-canvas text input overlay
│       │       ├── shortcuts/
│       │       │   ├── ShortcutManager.ts
│       │       │   └── defaultShortcuts.ts
│       │       └── utils/
│       │           ├── math.ts
│       │           ├── color.ts
│       │           ├── uuid.ts
│       │           └── geometry.ts
│       │
│       ├── src-tauri/              # Rust backend
│       │   ├── Cargo.toml
│       │   ├── tauri.conf.json
│       │   ├── capabilities/
│       │   │   └── default.json
│       │   └── src/
│       │       ├── main.rs
│       │       ├── lib.rs
│       │       ├── commands/
│       │       │   ├── persistence.rs
│       │       │   ├── export.rs
│       │       │   └── import.rs
│       │       ├── db/
│       │       │   ├── mod.rs
│       │       │   ├── schema.rs
│       │       │   └── migrations/
│       │       │       └── 001_initial.sql
│       │       ├── formats/
│       │       │   ├── mod.rs
│       │       │   ├── internal.rs
│       │       │   └── ms_whiteboard.rs
│       │       └── geometry/
│       │           ├── mod.rs
│       │           └── bounds.rs
│       │
│       ├── svelte.config.js
│       ├── vite.config.ts
│       └── package.json
│
├── packages/
│   └── shared-types/               # Tipos TypeScript compartidos
│       ├── src/
│       │   ├── board.ts
│       │   ├── objects.ts
│       │   └── index.ts
│       └── package.json
│
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── shortcuts.md
│   └── import-formats.md
│
└── tests/
    ├── unit/
    ├── integration/
    ├── e2e/
    ├── bench/
    └── fuzz/
```

---

## 24. Roadmap por Fases

### Fase 0 — Investigación Técnica (1 semana)
**Objetivo:** Validar decisiones técnicas con prototipos descartables.

**Tareas:**
- [ ] Prototipo Canvas 2D + OffscreenCanvas: verificar que la transferencia es viable en WebView de Tauri
- [ ] Prototipo RBush con 10k objetos: medir query performance
- [ ] Verificar que OffscreenCanvas funciona en WebKitGTK (Linux) y WebView2 (Windows)
- [ ] Verificar stack Tauri 2 + SvelteKit compila y corre en los 3 SO

**Riesgo:** OffscreenCanvas puede tener limitaciones en WebView OS. Fallback: rendering en main thread.

**Criterio de completitud:** prototipo corriendo en Windows y macOS.

---

### Fase 1 — Scaffold del Proyecto (3-4 días)
**Objetivo:** Estructura del proyecto funcional y compilable.

**Tareas:**
- [ ] `npm create tauri-app@latest inkboard -- --template svelte-ts`
- [ ] Configurar SvelteKit adapter-static, ssr=false
- [ ] Configurar Turborepo
- [ ] Setup Vitest, Playwright, ESLint, Prettier
- [ ] Setup Rust: cargo fmt, clippy, cargo test
- [ ] CI básico (GitHub Actions: lint, test, build)
- [ ] Crear estructura de carpetas completa

**Archivos creados:** todos los archivos de configuración base, estructura de directorios.

**Criterio:** `npm run dev` funciona, `npm run tauri dev` abre la app.

---

### Fase 2 — Canvas y Cámara (1 semana)
**Objetivo:** Canvas infinito funcional con pan/zoom fluido.

**Tareas:**
- [ ] Implementar `Camera.ts` con worldToScreen/screenToWorld
- [ ] Implementar RenderLoop con requestAnimationFrame + dirty flag
- [ ] Implementar pan (space+drag, middle mouse, trackpad 2-finger)
- [ ] Implementar zoom (ctrl+wheel, trackpad pinch, atajos +/-)
- [ ] Implementar BoardCanvas.svelte con el canvas element
- [ ] Grid de fondo opcional
- [ ] Transferir canvas a OffscreenCanvas Worker
- [ ] Limitar zoom (min 5%, max 3200%)

**Archivos:** `Camera.ts`, `RenderLoop.ts`, `RenderWorker.ts`, `BoardCanvas.svelte`

**Criterio:** pan y zoom fluidos a 60 FPS en canvas vacío.

---

### Fase 3 — Sistema de Objetos Base (1 semana)
**Objetivo:** Infraestructura para crear, renderizar y persistir objetos.

**Tareas:**
- [ ] Definir todos los tipos en `types.ts`
- [ ] Implementar `ObjectStore.ts` (CRUD)
- [ ] Implementar `SpatialIndex.ts` (RBush)
- [ ] Implementar renderizado básico de cada tipo (rectangles, texto, imágenes)
- [ ] Implementar `EventBus.ts`
- [ ] Definir serialización JSON del board completo
- [ ] Tests unitarios para ObjectStore y SpatialIndex

**Criterio:** crear 1.000 objetos programáticamente, todos visibles, culling funciona.

---

### Fase 4 — Selección y Transformación (1-2 semanas)
**Objetivo:** SelectTool completamente funcional.

**Tareas:**
- [ ] Implementar `SelectionManager.ts`
- [ ] Hit-testing por tipo de objeto
- [ ] Rectangle selection (drag)
- [ ] Shift+click para selección múltiple
- [ ] Renderizar bounding box y handles de selección
- [ ] Move (drag de la selección)
- [ ] Resize (handles de esquinas/bordes)
- [ ] Rotate (handle de rotación)
- [ ] Bloqueo/desbloqueo de objetos
- [ ] Delete (Delete key)
- [ ] Duplicate (Ctrl+D)

**Archivos:** `SelectTool.ts`, `SelectionManager.ts`

**Criterio:** seleccionar, mover, redimensionar y rotar objetos correctamente.

---

### Fase 5 — Lápiz (1 semana)
**Objetivo:** Herramienta de dibujo libre con calidad profesional.

**Tareas:**
- [ ] Implementar `PenTool.ts`
- [ ] Captura de Pointer Events (mouse, touch, stylus)
- [ ] Captura de presión (pointerEvent.pressure)
- [ ] Suavizado con Catmull-Rom splines
- [ ] Corrección de trazos (simplificación post-stroke con Ramer-Douglas-Peucker)
- [ ] Renderizado en tiempo real (dirty region)
- [ ] `HighlighterTool.ts` (opacity reducida, composite mode)
- [ ] `EraserTool.ts` (borrado por objeto)
- [ ] Configuración: color, grosor, opacidad

**Archivos:** `PenTool.ts`, `HighlighterTool.ts`, `EraserTool.ts`, `StrokeObject.ts`

**Criterio:** latencia de dibujo < 16ms, trazos suaves y naturales.

---

### Fase 6 — Texto (1 semana)
**Objetivo:** Objetos de texto editables in-canvas.

**Tareas:**
- [ ] Implementar `TextTool.ts`
- [ ] Double-click para editar → overlay de textarea HTML posicionado sobre el canvas
- [ ] Sincronización textarea ↔ TextObject
- [ ] Configuración: fuente, tamaño, bold, italic, alineación, color
- [ ] Resize del text box
- [ ] Rotación del text object

**Decisión de implementación:** el texto se edita vía un `<textarea>` HTML en overlay, posicionado y transformado para coincidir con la posición del canvas. Esto evita reimplementar edición de texto en canvas y mantiene la accesibilidad del navegador.

**Criterio:** crear y editar texto con formato correctamente.

---

### Fase 7 — Formas (1 semana)
**Objetivo:** Todas las formas básicas funcionales.

**Tareas:**
- [ ] Implementar `ShapeTool.ts`
- [ ] Renderizado de: rect, ellipse, line, arrow, triangle, diamond, star, polygon
- [ ] Drag para crear (esquina a esquina)
- [ ] Shift para mantener proporción
- [ ] Panel de propiedades: fill, stroke, grosor, opacidad, corner radius

**Archivos:** `ShapeTool.ts`, `ShapeObject.ts`, shapes renderers

**Criterio:** todas las formas creables, editables y renderizadas correctamente.

---

### Fase 8 — Imágenes (3-4 días)
**Objetivo:** Insertar y manipular imágenes.

**Tareas:**
- [ ] Drag & drop de archivos al canvas
- [ ] Paste desde clipboard (Ctrl+V)
- [ ] Upload dialog
- [ ] Renderizado con transform
- [ ] Resize manteniendo aspect ratio (con Shift para libre)
- [ ] Soporte PNG, JPG, WEBP, SVG
- [ ] Imágenes se almacenan como data URL en el modelo

**Criterio:** insertar imagen vía D&D, paste y upload. Resize y rotate correctos.

---

### Fase 9 — Sticky Notes (3-4 días)
**Objetivo:** Notas adhesivas con edición in-canvas.

**Tareas:**
- [ ] Implementar `StickyNoteTool.ts`
- [ ] Crear, editar, cambiar color, resize, move, rotate, duplicate, delete
- [ ] 6-8 colores predefinidos

**Criterio:** sticky note funcional al nivel de Miro/FigJam.

---

### Fase 10 — Undo / Redo (1 semana)
**Objetivo:** Sistema de historial completo.

**Tareas:**
- [ ] Implementar `HistoryManager.ts`
- [ ] Implementar todos los Commands para operaciones existentes
- [ ] Agrupación de operaciones (ej. mover múltiples objetos = 1 command)
- [ ] Transacciones (para operaciones que involucran múltiples cambios)
- [ ] UI: botones undo/redo en TopBar, atajos Ctrl+Z/Y
- [ ] Límite de historial configurable

**Criterio:** undo/redo funciona correctamente para todas las operaciones de F2-F9.

---

### Fase 11 — Persistencia (1-2 semanas)
**Objetivo:** Guardar y cargar tableros localmente.

**Tareas:**
- [ ] Implementar schema SQLite en Rust
- [ ] Comandos Tauri: save_board, load_board, list_boards
- [ ] Serialización/deserialización completa en Rust (serde_json + zstd)
- [ ] Autosave con debounce en Web Worker
- [ ] Indicador visual de estado de guardado en UI
- [ ] Recuperación de versiones anteriores
- [ ] Export/import del archivo `.inkboard`

**Criterio:** crear board, cerrar app, reabrir, board intacto.

---

### Fase 12 — Múltiples Tableros (1 semana)
**Objetivo:** Workspace con gestión de múltiples tableros.

**Tareas:**
- [ ] Board list en la ruta principal
- [ ] Crear, renombrar, eliminar, duplicar boards
- [ ] Miniaturas de boards (generadas async)
- [ ] Navegación entre boards
- [ ] Cada board tiene su propia cámara e historial

**Criterio:** crear 5+ tableros, navegar entre ellos, todos persisten independientemente.

---

### Fase 13 — Importación (1 semana)
**Objetivo:** Pipeline de importación funcional.

**Tareas:**
- [ ] Implementar `FormatDetector.rs`
- [ ] `MsWhiteboardImporter.rs` (extrae texto de ZIP si existe, importa como imagen si solo hay PNG)
- [ ] `ImageImporter.ts` (PNG/JPG/WEBP/SVG como ImageObject)
- [ ] UI de importación con feedback de progreso

**Criterio:** importar PNG de MS Whiteboard como imagen. Importar ZIP extrayendo texto disponible.

---

### Fase 14 — Exportación (1 semana)
**Objetivo:** Exportación a múltiples formatos.

**Tareas:**
- [ ] Export PNG via Rust (tiny-skia)
- [ ] Export JPG via Rust
- [ ] Export SVG via TypeScript (serialización directa)
- [ ] Export PDF via Rust (printpdf)
- [ ] Export JSON (formato interno)
- [ ] Export .inkboard (ZIP)
- [ ] Dialog de exportación con opciones (escala, área)

**Criterio:** exportar board como PNG, JPG, SVG, PDF y .inkboard.

---

### Fase 15 — Optimización (1-2 semanas)
**Objetivo:** Alcanzar performance targets definidos en §19.

**Tareas:**
- [ ] Ejecutar benchmarks de referencia
- [ ] Implementar object caching (ImageBitmap)
- [ ] Optimizar stroke rendering (dirty regions)
- [ ] Perfil de memoria: detectar y eliminar leaks
- [ ] Level of Detail para zoom extremo
- [ ] Optimizar autosave (medir impacto en UI)

**Criterio:** todos los performance targets de §19 alcanzados.

---

### Fase 16 — Desktop Tauri Completo (1 semana)
**Objetivo:** App de escritorio pulida con features nativas.

**Tareas:**
- [ ] Menú nativo de la aplicación
- [ ] Drag & drop de archivos desde el SO
- [ ] Integración con clipboard del sistema (imágenes)
- [ ] Notificaciones nativas (autosave, export completo)
- [ ] Window management (tamaño, posición persiste)
- [ ] Atajos de teclado nativos (registrados en Tauri)

**Criterio:** se siente como una app nativa de escritorio.

---

### Fase 17 — Testing (2 semanas, paralelo a otras fases)
**Objetivo:** Cobertura de tests adecuada.

**Tareas:**
- [ ] Unit tests: ≥ 80% cobertura del Canvas Engine
- [ ] Integration tests: flujos principales cubiertos
- [ ] E2E tests: flujos críticos (crear board, dibujar, guardar, reabrir)
- [ ] Fuzz tests: parsers de importación
- [ ] Performance benchmarks automatizados

**Criterio:** CI verde, ningún bug crítico conocido.

---

### Fase 18 — Preparación para Colaboración en Tiempo Real
**Objetivo:** Refactoring para soportar colaboración sin reimplementar desde cero.

**Tareas:**
- [ ] Introducir **Yjs** como CRDT layer (sin activar networking aún)
- [ ] Adaptar `ObjectStore` para usar `Y.Map` como fuente de verdad
- [ ] Adaptar `HistoryManager` para usar Yjs undo manager
- [ ] Verificar que undo/redo sigue funcionando via Yjs
- [ ] Documentar el protocolo de sincronización futuro

**Decisión CRDT:** **Yjs** (vs Automerge)
- Yjs tiene mejor rendimiento para objetos del canvas en tiempo real
- Ecosistema más maduro para whiteboard apps
- Bindings para WebSocket/WebRTC ya existentes
- El historial puede gestionarse via `Y.UndoManager`

**Criterio:** la app funciona exactamente igual que antes, pero el estado del board está en Yjs, listo para sincronizar.

---

## 25. MVP

### Definición del MVP

El MVP es la Fase 0 → Fase 12, que incluye:

**Canvas:**
- ✅ Lienzo infinito
- ✅ Pan y zoom (mouse, trackpad, atajos)
- ✅ Grid opcional
- ✅ Snap a grid opcional

**Objetos:**
- ✅ Lápiz libre
- ✅ Marcador/resaltador
- ✅ Borrador
- ✅ Texto editable
- ✅ Sticky notes
- ✅ Formas (rect, ellipse, line, arrow, triangle, diamond)
- ✅ Imágenes (D&D, paste, upload)

**Interacción:**
- ✅ Seleccionar, mover, redimensionar, rotar
- ✅ Selección múltiple y rect selection
- ✅ Bloquear/desbloquear objetos
- ✅ Copy/Paste/Duplicate/Delete
- ✅ Bring to front/back

**Sistema:**
- ✅ Undo/Redo (200 operaciones)
- ✅ Autosave local
- ✅ Múltiples tableros
- ✅ Guardar/cargar
- ✅ Exportar PNG/JPG/SVG
- ✅ Import imagen

**UI:**
- ✅ Top bar con nombre del board, undo/redo, export
- ✅ Toolbar lateral con todas las herramientas
- ✅ Panel de propiedades contextual
- ✅ Board list en home

---

## 26. Funciones Posteriores al MVP

| Función | Prioridad | Fase |
|---------|-----------|------|
| Conectores entre objetos | Alta | Post-MVP |
| Minimap | Media | Post-MVP |
| Smart guides / snap a objetos | Media | Post-MVP |
| PDF export | Alta | 14 |
| Importación MS Whiteboard ZIP | Media | 13 |
| Colaboración tiempo real (Yjs) | Alta | 18+ |
| Estrella, polígono, rombo | Baja | Post-MVP |
| Agrupación anidada (>1 nivel) | Baja | Post-MVP |
| Detección automática de formas | Baja | Post-MVP |
| Templates de tableros | Baja | Post-MVP |
| Búsqueda de objetos | Media | Post-MVP |
| Comentarios/anotaciones | Media | Post-MVP |
| Modo presentación | Media | Post-MVP |
| Versión web (SvelteKit SSR) | Media | Post-MVP |
| Plugin system | Baja | Futuro |

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

---

## 28. Decisiones Técnicas y Alternativas Descartadas

### Canvas 2D vs WebGL
**Elegido: Canvas 2D + OffscreenCanvas**
WebGL descartado: complejidad de shaders no justificada para el rango de objetos esperado. WebGL sería el upgrade path si Canvas 2D falla en benchmarks.

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

---

## 29. Dependencias y Packages Recomendados

### Frontend (TypeScript / Svelte)
```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0",
    "@tauri-apps/plugin-fs": "^2.0",
    "@tauri-apps/plugin-dialog": "^2.0",
    "@tauri-apps/plugin-clipboard-manager": "^2.0",
    "rbush": "^3.0",              // R-tree spatial index
    "perfect-freehand": "^1.2",   // stroke rendering de calidad
    "uuid": "^9.0"                // UUID generation
  },
  "devDependencies": {
    "@sveltejs/kit": "^2.0",
    "@sveltejs/adapter-static": "^3.0",
    "svelte": "^5.0",
    "typescript": "^5.0",
    "vite": "^6.0",
    "vitest": "^2.0",
    "@playwright/test": "^1.0",
    "eslint": "^9.0",
    "prettier": "^3.0",
    "prettier-plugin-svelte": "^3.0"
  }
}
```

**Nota sobre `perfect-freehand`:** esta librería (de Steve Ruiz, creador de tldraw) genera strokes de alta calidad con simulación de presión. Es la elección pragmática para el lápiz en lugar de implementar Catmull-Rom desde cero.

### Rust (Cargo.toml)
```toml
[dependencies]
tauri = { version = "2", features = ["protocol-asset"] }
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-clipboard-manager = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
zstd = "0.13"
image = { version = "0.25", features = ["png", "jpeg", "webp"] }
resvg = "0.43"
usvg = "0.43"
printpdf = "0.7"
uuid = { version = "1", features = ["v4"] }
anyhow = "1"
tokio = { version = "1", features = ["full"] }
sha2 = "0.10"                   # hash para detección de cambios
zip = "2.1"                     # lectura de ZIP (import MS Whiteboard)

[dev-dependencies]
cargo-fuzz = "0.12"
```

---

## 30. Comandos Iniciales para Crear el Proyecto

```bash
# 1. Crear app con Tauri 2 + SvelteKit
npm create tauri-app@latest inkboard -- \
  --template svelte-ts \
  --manager npm

cd inkboard

# 2. Instalar dependencias frontend
npm install rbush perfect-freehand uuid
npm install --save-dev vitest @playwright/test prettier prettier-plugin-svelte

# 3. Configurar SvelteKit para modo SPA (adapter-static)
# svelte.config.js:
# import adapter from '@sveltejs/adapter-static';
# export default { kit: { adapter: adapter() } };
# src/routes/+layout.ts: export const ssr = false; export const prerender = true;

# 4. Agregar Rust dependencies en src-tauri/Cargo.toml
# (ver sección §29)

# 5. Agregar Tauri plugins
cd src-tauri
cargo add tauri-plugin-fs
cargo add tauri-plugin-dialog
cargo add tauri-plugin-clipboard-manager
cargo add rusqlite --features bundled
cargo add serde --features derive
cargo add serde_json
cargo add zstd
cargo add image --features png,jpeg,webp
cargo add anyhow
cargo add uuid --features v4
cargo add tokio --features full
cd ..

# 6. Inicializar testing
npx playwright install

# 7. Verificar que todo compila y corre
npm run tauri dev

# 8. Setup monorepo (opcional, para escalar)
npm install -D turbo
# Crear turbo.json con pipeline de build/test/lint

# 9. Crear estructura de directorios
mkdir -p src/lib/{canvas,tools,objects,stores,io,components/ui,shortcuts,utils}
mkdir -p src/routes/board/'[id]'
mkdir -p src-tauri/src/{commands,db/migrations,formats,geometry}
mkdir -p tests/{unit,integration,e2e,bench,fuzz}
mkdir -p docs
```

---

## Atajos de Teclado (Referencia)

| Atajo | Acción |
|-------|--------|
| `V` | Select tool |
| `P` | Pen tool |
| `H` | Highlighter tool |
| `E` | Eraser tool |
| `T` | Text tool |
| `N` | Sticky Note tool |
| `R` | Rectangle tool |
| `O` | Ellipse/Circle tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `I` | Image tool |
| `Delete` / `Backspace` | Eliminar selección |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+C` | Copy |
| `Ctrl+X` | Cut |
| `Ctrl+V` | Paste |
| `Ctrl+D` | Duplicate |
| `Ctrl+A` | Select all |
| `Ctrl+G` | Group |
| `Ctrl+Shift+G` | Ungroup |
| `Space + drag` | Pan |
| `Ctrl + wheel` | Zoom |
| `Ctrl+0` | Reset zoom (100%) |
| `Ctrl+Shift+H` | Fit to screen |
| `[` | Bring backward |
| `]` | Bring forward |
| `Ctrl+[` | Send to back |
| `Ctrl+]` | Bring to front |
| `Escape` | Deselect / Cancel |

---

> [!NOTE]
> Este documento es la especificación técnica maestra. Antes de iniciar cada fase, revisar las dependencias y criterios de completitud. Las decisiones técnicas pueden revisarse si los benchmarks de la Fase 0 y Fase 2 indican que un cambio de enfoque está justificado.


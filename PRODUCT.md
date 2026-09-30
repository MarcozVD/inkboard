# PRODUCT.md — Inkboard

## Product truth

- **Qué es:** Pizarra digital infinita de escritorio (Tauri 2 + SvelteKit + Rust).
- **Para quién:** Profesionales que piensan visualmente — diseño, estrategia, workshops, estudio.
- **Modo de uso:** Operate. El usuario abre un board y en segundos está dibujando. Frecuencia alta, sesiones largas.
- **Escena física:** Escritorio, luz ambiente variable (día/ventana, noche). Dark-first por decisión de uso escénico, no por categoría.
- **La tarea:** pensar en un espacio infinito — inking, formas, notas, texto, imágenes; organizar ideas; exportar el resultado.

## Brand commitments (durable, constraining)

1. **El icono es el mundo:** pausa blanca (`#ffffff`) sobre negro — monocromo. El frontend gira alrededor de ese blanco. Ningún otro color compite a nivel de sistema; el contenido del usuario es el único color permitido.
2. **El canvas es el producto.** La interfaz desaparece visualmente mientras se trabaja. Jerarquía: canvas > contenido > herramientas > navegación > configuración. Nunca invertirla.
3. **Velocidad de interacción sobre decoración.** Microinteracciones discretas (80–280ms), sin orquestaciones de carga, sin motion decorativo.
4. **Identidad propia.** Inspirado en los patrones UX de MS Whiteboard / Miro / FigJam / Excalidraw, pero no un clon visual de ninguno.
5. **Profesional, calmado, preciso.** "Un espacio profesional para pensar visualmente."

## Non-goals (ahora)

- Autenticación / colaboración multiusuario real (hay stub de presencia + Share deshabilitado; sin backend).
- Web pública / responsive móvil nativo (desktop-first; `pnpm dev` sirve para desarrollo en navegador).
- Export PDF / JPG / `.inkboard`, conectores usables, agrupación, minimap, OffscreenCanvas worker (especificados en `implementation_plan.md`, no en v0.1).

## Estado del producto (v0.1.0 · M0 en curso)

Usable a medias: dibujo, formas, imágenes, **selección/transform (B01 corregido)**, undo/redo parcial, multi-tablero, persistencia SQLite (Tauri) o localStorage, export PNG/SVG/JSON, import imágenes + ZIP MS Whiteboard (solo texto). **Texto y sticky se crean pero no se pueden editar/guardar bien (B03).** Salir del board &lt;2s pierde cambios (B05). Atajos siguen compitiendo con inputs (B04/B09). Offset del canvas (B02) pendiente. Ver `README.md` → Current status y `implementation_plan.md` §0.2.

## How the product should feel

Rápido, limpio, minimalista, profesional, fluido, preciso, espacial. El usuario debe poder abrir un board y empezar a dibujar en segundos.

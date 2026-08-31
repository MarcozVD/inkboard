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

- Autenticación/colaboración multiusuario real (UI preparada, backend futuro).
- Web pública / responsive móvil nativo (desktop-first).

## How the product should feel

Rápido, limpio, minimalista, profesional, fluido, preciso, espacial. El usuario debe poder abrir un board y empezar a dibujar en segundos.

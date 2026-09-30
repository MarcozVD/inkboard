# IDEA.md — visión inicial

Se plantea el desarrollo de Inkboard, una aplicación de pizarras digitales infinitas de nivel profesional, multiplataforma (Windows/macOS/Linux), con capacidad futura de colaboración en tiempo real. El stack es Tauri 2 + SvelteKit + Rust, con renderizado basado en Canvas 2D (hoy en el hilo principal; OffscreenCanvas / workers quedan como upgrade path documentado en `implementation_plan.md`), evolucionable hacia WebGL si los benchmarks lo demuestran.

La prioridad explícita es: PERFORMANCE > ESTABILIDAD > MANTENIBILIDAD > FUNCIONES EXÓTICAS.

No se incluye Rust donde TypeScript sea suficiente. No se introduce complejidad arquitectural sin un beneficio medible.

> **Nota (v0.1.0):** este archivo es la visión de producto. El estado real de la app está en `README.md`. La especificación larga y el roadmap histórico están en `implementation_plan.md` (con cabecera de estado actual).

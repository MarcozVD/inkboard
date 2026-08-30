Se plantea el desarrollo de Inkboard (nombre provisional), una aplicación de pizarras digitales infinitas de nivel profesional, multiplataforma (Windows/macOS/Linux), con capacidad futura de colaboración en tiempo real. El stack es Tauri 2 + SvelteKit + Rust, con renderizado basado en Canvas 2D acelerado con OffscreenCanvas, evolucionable hacia WebGL en caso de necesidad demostrada.

La prioridad explícita es: PERFORMANCE > ESTABILIDAD > MANTENIBILIDAD > FUNCIONES EXÓTICAS.

No se incluye Rust donde TypeScript sea suficiente. No se introduce complejidad arquitectural sin un beneficio medible.

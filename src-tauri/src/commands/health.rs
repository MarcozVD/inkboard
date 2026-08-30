//! Health check command — proves the IPC bridge works from the frontend.

/// Simple health probe: returns app name + version.
///
/// Used by the frontend on boot to verify the Tauri bridge is alive
/// (Fase 1 scaffold criterion: `npm run tauri dev` opens the app and IPC works).
#[tauri::command]
pub fn health() -> serde_json::Value {
    serde_json::json!({
        "status": "ok",
        "app": "inkboard",
        "version": env!("CARGO_PKG_VERSION"),
    })
}

//! Inkboard — Rust core (Tauri).
#![allow(linker_messages)]
//!
//! Module layout (see implementation_plan.md §5 / §23):
//! - `commands`:  Tauri IPC commands (persistence, export, import)
//! - `db`:        SQLite persistence layer (Fase 11)
//! - `formats`:   import/export formats (Fase 13/14)
//! - `geometry`:  bounds & spatial math helpers

pub mod commands;
pub mod db;
pub mod formats;
pub mod geometry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_fs::init())?;
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle()
                .plugin(tauri_plugin_clipboard_manager::init())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::health::health])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

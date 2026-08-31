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

use commands::persistence::DbState;
use std::sync::Mutex;
use tauri::Manager;

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

            // SQLite persistence — one DB per app data dir
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| format!("failed to create data dir: {e}"))?;
            let db_path = data_dir.join("inkboard.db");
            let app_db = db::AppDb::new(&db_path)?;
            app_db.ensure_default_workspace()?;
            app.manage(DbState(Mutex::new(app_db)));

            eprintln!("[inkboard] db ready at {}", db_path.display());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health::health,
            commands::persistence::save_board,
            commands::persistence::load_board,
            commands::persistence::list_boards,
            commands::import::inspect_import,
            commands::import::read_file_bytes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

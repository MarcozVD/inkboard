//! Inkboard — Rust core (Tauri).
#![allow(linker_messages)]
//!
//! Module layout (see implementation_plan.md §5 / §23):
//! - `commands`:  Tauri IPC commands (persistence, export, import, desktop)
//! - `db`:        SQLite persistence layer (Fase 11)
//! - `formats`:   import/export formats (Fase 13/14)
//! - `geometry`:  bounds & spatial math helpers
//!
//! M4: window state + single instance (M4-01), `.inkboard` file associations
//! (M4-03) and release logging with a panic hook (M4-04).

pub mod commands;
pub mod db;
pub mod formats;
pub mod geometry;

use commands::desktop::PendingOpens;
use commands::persistence::DbState;
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // M4-01: a second launch focuses the running window and forwards its argv.
    // Must be registered before any other plugin.
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        commands::desktop::focus_main_window(app);
        for path in commands::desktop::inkboard_paths_from_args(&argv) {
            if !path.is_file() {
                continue;
            }
            match commands::desktop::open_inkboard(app, &path) {
                Ok(id) => commands::desktop::queue_open(app, id),
                Err(err) => log::error!("cannot open {}: {err}", path.display()),
            }
        }
    }));

    builder
        // M4-01: remember window size/position/maximized state
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // M4-04: logs in release too (info) and debug in dev, rotating file
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(commands::desktop::log_level(cfg!(debug_assertions)))
                .max_file_size(commands::desktop::LOG_MAX_FILE_BYTES)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(
                    commands::desktop::LOG_ROTATION_KEEP,
                ))
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("inkboard".to_string()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                ])
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // M4-05: updater + process (restart after install)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // M4-04: log panics before the process unwinds
            std::panic::set_hook(Box::new(|info| {
                log::error!("panic: {info}");
            }));

            app.manage(PendingOpens::default());

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
            app.manage(DbState(Arc::new(Mutex::new(app_db))));

            // M4-03: a board passed on the command line (file association)
            let args: Vec<String> = std::env::args().collect();
            for path in commands::desktop::inkboard_paths_from_args(&args) {
                if !path.is_file() {
                    continue;
                }
                match commands::desktop::open_inkboard(app.handle(), &path) {
                    Ok(id) => commands::desktop::queue_open(app.handle(), id),
                    Err(err) => log::error!("cannot open {}: {err}", path.display()),
                }
            }

            log::info!("db ready at {}", db_path.display());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health::health,
            commands::persistence::save_board,
            commands::persistence::load_board,
            commands::persistence::list_boards,
            commands::persistence::rename_board,
            commands::persistence::duplicate_board,
            commands::persistence::delete_board,
            commands::persistence::restore_board,
            commands::persistence::purge_board,
            commands::persistence::set_favorite,
            commands::persistence::save_thumbnail,
            commands::persistence::get_thumbnail,
            commands::persistence::save_version,
            commands::persistence::list_versions,
            commands::persistence::restore_version,
            commands::persistence::put_asset,
            commands::persistence::get_asset,
            commands::import::import_pick,
            commands::import::export_inkboard,
            commands::import::save_export,
            commands::import::export_pdf,
            commands::desktop::take_pending_opens,
            commands::desktop::open_logs_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

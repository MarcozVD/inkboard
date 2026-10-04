//! Desktop lifecycle: single instance, `.inkboard` file opens from argv and
//! logs folder access (M4-01/M4-03/M4-04).
//!
//! File association opens only use argv provided by the OS to Rust; the
//! webview never supplies paths.

use crate::commands::persistence::DbState;
use crate::formats::inkboard;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub const OPEN_BOARD_EVENT: &str = "inkboard:open-board";

/// Board ids imported from argv, waiting for the frontend to pick them up.
#[derive(Default)]
pub struct PendingOpens(pub Mutex<Vec<String>>);

/// Arguments after argv[0] that look like `.inkboard` files (M4-03).
pub fn inkboard_paths_from_args(args: &[String]) -> Vec<PathBuf> {
    args.iter()
        .skip(1)
        .filter(|arg| arg.to_ascii_lowercase().ends_with(".inkboard"))
        .map(PathBuf::from)
        .collect()
}

/// Debug logs in dev builds, info in release (M4-04).
pub fn log_level(debug: bool) -> log::LevelFilter {
    if debug {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    }
}

/// Keep the last N log files (M4-04).
pub const LOG_ROTATION_KEEP: usize = 5;
/// Rotate the log file at 5 MB.
pub const LOG_MAX_FILE_BYTES: u128 = 5 * 1024 * 1024;

/// Focus (and restore) the main window — second instance / file open.
pub fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Import an `.inkboard` archive as a new board; returns the new board id.
pub fn open_inkboard(app: &AppHandle, path: &Path) -> Result<String, String> {
    let metadata = std::fs::metadata(path).map_err(|e| format!("cannot read file: {e}"))?;
    if metadata.len() > inkboard::MAX_ARCHIVE_BYTES as u64 {
        return Err("inkboard file too large".to_string());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("cannot read file: {e}"))?;
    let archive = inkboard::parse_zip(&bytes)?;

    let db = app.state::<DbState>();
    let db = db.0.lock().map_err(|e| e.to_string())?;
    let dimensions = inkboard::asset_dimensions(&archive.board_json);
    for (hash, mime, blob) in &archive.assets {
        let (width, height) = dimensions.get(hash).copied().unwrap_or((0, 0));
        db.put_asset(blob, mime, width, height)?;
    }

    // the imported board becomes a new board: fresh id, same content
    let mut value: serde_json::Value =
        serde_json::from_str(&archive.board_json).map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let name = value
        .pointer("/board/name")
        .and_then(|v| v.as_str())
        .unwrap_or("Imported")
        .to_string();
    if let Some(board) = value.get_mut("board").and_then(|b| b.as_object_mut()) {
        board.insert("id".to_string(), serde_json::Value::String(id.clone()));
    }
    let json = serde_json::to_string(&value).map_err(|e| e.to_string())?;
    db.save_board(&id, &name, &json)?;
    Ok(id)
}

/// Queue a freshly imported board and notify a live frontend.
pub fn queue_open(app: &AppHandle, board_id: String) {
    if let Some(pending) = app.try_state::<PendingOpens>() {
        if let Ok(mut ids) = pending.0.lock() {
            ids.push(board_id.clone());
        }
    }
    let _ = app.emit(OPEN_BOARD_EVENT, board_id);
}

/// Board ids opened before the frontend was ready (startup argv, M4-03).
#[tauri::command]
pub fn take_pending_opens(state: State<'_, PendingOpens>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut ids| std::mem::take(&mut *ids))
        .unwrap_or_default()
}

/// Open the app log directory in the OS file manager (M4-04).
#[tauri::command]
pub fn open_logs_dir(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open_in_file_manager(&dir)
}

fn open_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("cannot open folder: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{inkboard_paths_from_args, log_level, LOG_ROTATION_KEEP};
    use std::path::PathBuf;

    #[test]
    fn argv_parsing_skips_the_executable_and_finds_inkboard_files() {
        let args: Vec<String> = [
            "C:/app/inkboard.exe",
            "--flag",
            "C:/boards/My.BOARD",
            "notes.txt",
            "/home/u/Sprint.inkboard",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let paths = inkboard_paths_from_args(&args);
        // "My.BOARD" is not an .inkboard file and argv[0] is skipped
        assert_eq!(paths, vec![PathBuf::from("/home/u/Sprint.inkboard")]);
    }

    #[test]
    fn argv_parsing_tolerates_empty_and_odd_input() {
        assert!(inkboard_paths_from_args(&[]).is_empty());
        assert!(inkboard_paths_from_args(&["inkboard.exe".to_string()]).is_empty());
        let args = vec!["exe".to_string(), "x.INKBOARD".to_string()];
        assert_eq!(inkboard_paths_from_args(&args), vec![PathBuf::from("x.INKBOARD")]);
    }

    #[test]
    fn log_configuration_is_informative_in_release_and_rotates() {
        assert_eq!(log_level(true), log::LevelFilter::Debug);
        assert_eq!(log_level(false), log::LevelFilter::Info);
        assert!(LOG_ROTATION_KEEP >= 2);
    }
}

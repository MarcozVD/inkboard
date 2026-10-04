//! Import/export Tauri commands (implementation_plan.md §7 / Fase 13).
//! File IO, ZIP parsing and archive building run on the blocking pool (M2-01).
//! M2-06 adds the `.inkboard` archive (export_inkboard / import_inkboard).

use crate::commands::persistence::DbState;
use crate::formats::{inkboard, ms_whiteboard};
use tauri::State;

/// Detect + parse an imported file (path). Returns the detected format and,
/// for MS Whiteboard ZIPs, any text content extracted.
#[tauri::command]
pub async fn inspect_import(path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| format!("cannot read file: {e}"))?;
        let filename = std::path::Path::new(&path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());

        let format = ms_whiteboard::detect_format(&filename, &bytes);
        match format {
            ms_whiteboard::ImportFormat::Inkboard => Ok(serde_json::json!({
                "format": "inkboard",
                "name": filename,
            })),
            ms_whiteboard::ImportFormat::MsWhiteboardZip => {
                let content = ms_whiteboard::parse_ms_whiteboard_zip(&bytes)?;
                Ok(serde_json::json!({
                    "format": "ms_whiteboard_zip",
                    "title": content.title,
                    "texts": content.texts,
                }))
            }
            ms_whiteboard::ImportFormat::Image => Ok(serde_json::json!({
                "format": "image",
                "name": filename,
            })),
            ms_whiteboard::ImportFormat::Json => Ok(serde_json::json!({
                "format": "json",
                "name": filename,
            })),
            ms_whiteboard::ImportFormat::Unknown => {
                Err(format!("unsupported file format: {filename}"))
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read a file as raw bytes (for image imports picked via the OS dialog).
/// Returns a raw IPC response; the frontend receives an ArrayBuffer (B16).
#[tauri::command]
pub async fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| format!("cannot read file: {e}"))?;
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Export a board to an `.inkboard` archive (M2-06). The persisted board JSON
/// and every referenced asset come from the local store, so no big payload
/// crosses the IPC boundary. `path` comes from the native save dialog.
#[tauri::command]
pub async fn export_inkboard(
    state: State<'_, DbState>,
    board_id: String,
    path: String,
) -> Result<serde_json::Value, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let db = db.lock().map_err(|e| e.to_string())?;
        let record = db.load_board(&board_id)?;
        let hashes = inkboard::find_asset_hashes(&record.json);
        let mut assets = Vec::with_capacity(hashes.len());
        for hash in hashes {
            let asset = db
                .get_asset(&hash)?
                .ok_or_else(|| format!("missing asset: {hash}"))?;
            assets.push((hash, asset.mime, asset.bytes));
        }
        let bytes = inkboard::build_zip(&record.json, &assets)?;
        std::fs::write(&path, &bytes).map_err(|e| format!("cannot write {path}: {e}"))?;
        Ok(serde_json::json!({
            "path": path,
            "bytes": bytes.len(),
            "assets": assets.len(),
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Import an `.inkboard` archive (M2-06): parse with limits, store assets
/// (deduped by hash) and return the board JSON for the frontend pipeline.
#[tauri::command]
pub async fn import_inkboard(
    state: State<'_, DbState>,
    path: String,
) -> Result<serde_json::Value, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let metadata = std::fs::metadata(&path).map_err(|e| format!("cannot read file: {e}"))?;
        if metadata.len() as usize > inkboard::MAX_ARCHIVE_BYTES {
            return Err("inkboard file too large".to_string());
        }
        let bytes = std::fs::read(&path).map_err(|e| format!("cannot read file: {e}"))?;
        let archive = inkboard::parse_zip(&bytes)?;

        let db = db.lock().map_err(|e| e.to_string())?;
        let dimensions = inkboard::asset_dimensions(&archive.board_json);
        let mut hashes = Vec::with_capacity(archive.assets.len());
        for (hash, mime, blob) in &archive.assets {
            let (width, height) = dimensions.get(hash).copied().unwrap_or((0, 0));
            let stored = db.put_asset(blob, mime, width, height)?;
            hashes.push(stored);
        }
        Ok(serde_json::json!({
            "boardJson": archive.board_json,
            "metadata": archive.metadata,
            "assetHashes": hashes,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

//! Import/export Tauri commands (implementation_plan.md §7 / §22).
//!
//! M2-08 hardening:
//! - the webview never supplies paths: Rust opens the native dialog itself
//! - file size is checked from metadata (≤ 100 MB) before reading
//! - every imported image is decoded + re-encoded (`formats::images`)
//! - parsing runs on the blocking pool with bounded ZIP reading

use crate::commands::persistence::DbState;
use crate::formats::{images, inkboard, ms_whiteboard};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Hard cap for any imported file (plan §22).
pub const MAX_IMPORT_FILE_BYTES: u64 = 100 * 1024 * 1024;

/// Open the native picker and parse the selected file in Rust.
/// Returns `null` when the user cancels; otherwise a payload tagged with
/// `format` (`inkboard` | `json` | `ms_whiteboard_zip` | `image`).
#[tauri::command]
pub async fn import_pick(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Option<serde_json::Value>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Import board or image")
        .add_filter("Inkboard board", &["inkboard"])
        .add_filter("Board JSON", &["json"])
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"])
        .add_filter("Microsoft Whiteboard", &["zip"])
        .blocking_pick_file();
    let Some(path) = picked else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;

    // size is checked from metadata before any read
    let metadata = std::fs::metadata(&path).map_err(|e| format!("cannot read file: {e}"))?;
    if metadata.len() > MAX_IMPORT_FILE_BYTES {
        return Err(format!(
            "file too large: {} bytes (max 100 MB)",
            metadata.len()
        ));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("cannot read file: {e}"))?;
    let filename = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());

    match ms_whiteboard::detect_format(&filename, &bytes) {
        ms_whiteboard::ImportFormat::Inkboard => {
            let db = state.0.clone();
            let payload = tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
                let archive = inkboard::parse_zip(&bytes)?;
                let db = db.lock().map_err(|e| e.to_string())?;
                let dimensions = inkboard::asset_dimensions(&archive.board_json);
                for (hash, mime, blob) in &archive.assets {
                    let (width, height) = dimensions.get(hash).copied().unwrap_or((0, 0));
                    db.put_asset(blob, mime, width, height)?;
                }
                Ok(serde_json::json!({
                    "format": "inkboard",
                    "name": filename,
                    "boardJson": archive.board_json,
                }))
            })
            .await
            .map_err(|e| e.to_string())??;
            Ok(Some(payload))
        }
        ms_whiteboard::ImportFormat::MsWhiteboardZip => {
            let content = ms_whiteboard::parse_ms_whiteboard_zip(&bytes)?;
            Ok(Some(serde_json::json!({
                "format": "ms_whiteboard_zip",
                "name": filename,
                "title": content.title,
                "texts": content.texts,
            })))
        }
        ms_whiteboard::ImportFormat::Json => {
            let json =
                String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8".to_string())?;
            inkboard::validate_board_json(&json)?;
            Ok(Some(serde_json::json!({
                "format": "json",
                "name": filename,
                "boardJson": json,
            })))
        }
        ms_whiteboard::ImportFormat::Image => {
            let db = state.0.clone();
            let payload = tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
                // re-encode strips metadata and bounds decompression bombs
                let sanitized = images::sanitize(&bytes)?;
                let db = db.lock().map_err(|e| e.to_string())?;
                let hash = db.put_asset(
                    &sanitized.bytes,
                    sanitized.mime,
                    sanitized.width as i64,
                    sanitized.height as i64,
                )?;
                Ok(serde_json::json!({
                    "format": "image",
                    "name": filename,
                    "src": format!("asset:{hash}"),
                    "mime": sanitized.mime,
                    "width": sanitized.width,
                    "height": sanitized.height,
                }))
            })
            .await
            .map_err(|e| e.to_string())??;
            Ok(Some(payload))
        }
        ms_whiteboard::ImportFormat::Unknown => {
            Err(format!("unsupported file format: {filename}"))
        }
    }
}

/// Export a board to `.inkboard` (M2-06). The native save dialog runs in
/// Rust; the ZIP is built from the persisted board and the asset store, so
/// neither paths nor large payloads cross the IPC boundary. Returns `null`
/// when the user cancels.
#[tauri::command]
pub async fn export_inkboard(
    app: AppHandle,
    state: State<'_, DbState>,
    board_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let db = state.0.clone();
    let record = {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.load_board(&board_id)?
    };

    let default_name = format!("{}.inkboard", sanitize_file_name(&record.name));
    let picked = app
        .dialog()
        .file()
        .set_title("Export board")
        .set_file_name(default_name)
        .add_filter("Inkboard board", &["inkboard"])
        .blocking_save_file();
    let Some(path) = picked else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;

    let payload = tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
        let db = db.lock().map_err(|e| e.to_string())?;
        let hashes = inkboard::find_asset_hashes(&record.json);
        let mut assets = Vec::with_capacity(hashes.len());
        for hash in hashes {
            let asset = db
                .get_asset(&hash)?
                .ok_or_else(|| format!("missing asset: {hash}"))?;
            assets.push((hash, asset.mime, asset.bytes));
        }
        let bytes = inkboard::build_zip(&record.json, &assets)?;
        std::fs::write(&path, &bytes).map_err(|e| format!("cannot write file: {e}"))?;
        Ok(serde_json::json!({
            "path": path.display().to_string(),
            "bytes": bytes.len(),
            "assets": assets.len(),
        }))
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(Some(payload))
}

/// Save exported PNG/JPG/SVG bytes through the native dialog (M2-09).
/// The body carries the raw bytes, `x-name` the suggested file name. The
/// webview never supplies or receives a filesystem path.
#[tauri::command]
pub fn save_export(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
    };
    let file_name = suggested_export_name(header("x-name").as_deref());
    let extension = file_name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_string())
        .unwrap_or_else(|| "png".to_string());
    let bytes: Vec<u8> = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(value) => {
            serde_json::from_value(value.clone()).map_err(|e| e.to_string())?
        }
    };
    if bytes.is_empty() {
        return Err("export is empty".to_string());
    }

    let picked = app
        .dialog()
        .file()
        .set_title("Export")
        .set_file_name(&file_name)
        .add_filter("File", &[extension.as_str()])
        .blocking_save_file();
    let Some(path) = picked else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| format!("cannot write file: {e}"))?;
    Ok(Some(path.display().to_string()))
}

/// Sanitized suggested export name; always keeps an extension.
fn suggested_export_name(name: Option<&str>) -> String {
    let sanitized = sanitize_file_name(name.unwrap_or("inkboard.png"));
    if sanitized.contains('.') {
        sanitized
    } else {
        format!("{sanitized}.png")
    }
}

/// Strip path separators and reserved characters from a suggested file name.
fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || (c as u32) < 32 {
                '-'
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "board".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{sanitize_file_name, suggested_export_name};

    #[test]
    fn suggested_export_names_are_sanitized_and_keep_an_extension() {
        assert_eq!(
            suggested_export_name(Some("inkboard-ab12.png")),
            "inkboard-ab12.png"
        );
        assert_eq!(suggested_export_name(Some("board.jpg")), "board.jpg");
        assert_eq!(suggested_export_name(Some("no extension")), "no extension.png");
        assert_eq!(suggested_export_name(Some("")), "board.png");
        assert_eq!(suggested_export_name(None), "inkboard.png");
    }

    #[test]
    fn file_names_cannot_smuggle_paths_or_control_characters() {
        assert_eq!(sanitize_file_name("a/b:c?.png"), "a-b-c-.png");
        assert_eq!(sanitize_file_name("..\\evil.png"), "..-evil.png");
        assert_eq!(sanitize_file_name("\u{7}bell"), "-bell");
        assert_eq!(sanitize_file_name("   "), "board");
    }
}

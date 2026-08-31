//! Import Tauri commands (implementation_plan.md §7 / Fase 13).

use crate::formats::ms_whiteboard;

/// Detect + parse an imported file (path). Returns the detected format and,
/// for MS Whiteboard ZIPs, any text content extracted.
#[tauri::command]
pub fn inspect_import(path: String) -> Result<serde_json::Value, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("cannot read file: {e}"))?;
    let filename = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let format = ms_whiteboard::detect_format(&filename, &bytes);
    match format {
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
        ms_whiteboard::ImportFormat::Unknown => Err(format!("unsupported file format: {filename}")),
    }
}

/// Read a file as raw bytes (for image imports picked via the OS dialog).
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("cannot read file: {e}"))
}

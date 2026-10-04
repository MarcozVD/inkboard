//! MS Whiteboard import (Fase 13, implementation_plan.md §17).
//!
//! Honest scope (per plan): there is no official format exposing full ink
//! content. What we can do:
//!   1. ZIP export → extract text/notes from any JSON inside (partial)
//!   2. PNG/JPG/WEBP/SVG file → import as an ImageObject (done in frontend)
//!
//! This module implements the ZIP text extractor + format detection.

use std::io::Read;

/// Detected import format for a byte stream.
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum ImportFormat {
    Inkboard,
    MsWhiteboardZip,
    Json,
    Image,
    Unknown,
}

/// Detect format from extension + magic bytes.
pub fn detect_format(filename: &str, bytes: &[u8]) -> ImportFormat {
    let lower = filename.to_lowercase();
    if lower.ends_with(".inkboard") || crate::formats::inkboard::looks_like_inkboard(bytes) {
        return ImportFormat::Inkboard;
    }
    // ZIP magic: PK\x03\x04
    if bytes.len() >= 4
        && bytes[0] == 0x50
        && bytes[1] == 0x4b
        && bytes[2] == 0x03
        && bytes[3] == 0x04
    {
        return ImportFormat::MsWhiteboardZip;
    }
    if lower.ends_with(".zip") {
        return ImportFormat::MsWhiteboardZip;
    }
    if lower.ends_with(".json") || (!bytes.is_empty() && bytes[0] == b'{') {
        return ImportFormat::Json;
    }
    if lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".webp")
        || lower.ends_with(".gif")
        || lower.ends_with(".bmp")
        || lower.ends_with(".tif")
        || lower.ends_with(".tiff")
        || lower.ends_with(".ico")
        || lower.ends_with(".svg")
    {
        return ImportFormat::Image;
    }
    // magic-byte detection for extension-less raster images (M2-08)
    if matches!(
        crate::formats::images::sniff(bytes),
        "image/png" | "image/jpeg" | "image/gif" | "image/webp"
    ) {
        return ImportFormat::Image;
    }
    ImportFormat::Unknown
}

/// Extracted text content from a MS Whiteboard ZIP export.
#[derive(serde::Serialize, Debug)]
pub struct MsWhiteboardContent {
    /// Board/thread title if found.
    pub title: Option<String>,
    /// Text notes/annotations extracted from JSON payloads inside the ZIP.
    pub texts: Vec<String>,
}

// Limits (M2-08 / plan §22): entry count and bounded inflation.
pub const MAX_ZIP_ENTRIES: usize = 256;
pub const MAX_ENTRY_BYTES: u64 = 25 * 1024 * 1024;
pub const MAX_TOTAL_JSON_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_TEXTS: usize = 10_000;

/// Try to parse a MS Whiteboard ZIP export, extracting any text it contains.
/// Entry count and inflation are bounded: declared sizes are checked first and
/// every read is additionally capped with `take()`, so a zip bomb cannot
/// exhaust memory even if its headers lie.
pub fn parse_ms_whiteboard_zip(data: &[u8]) -> Result<MsWhiteboardContent, String> {
    let reader = std::io::Cursor::new(data);
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("invalid zip: {e}"))?;
    if archive.len() > MAX_ZIP_ENTRIES {
        return Err(format!(
            "too many entries: {} (max {MAX_ZIP_ENTRIES})",
            archive.len()
        ));
    }

    let mut content = MsWhiteboardContent {
        title: None,
        texts: Vec::new(),
    };
    let mut saw_whiteboard_json = false;
    let mut total: u64 = 0;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("zip entry: {e}"))?;
        let name = file.name().to_string();
        let lower = name.to_lowercase();

        // Only look at JSON files (HTML exports carry the actual content too,
        // but parsing HTML here is out of scope — plan says partial import).
        if !lower.ends_with(".json") {
            continue;
        }
        saw_whiteboard_json = true;

        // declared size first — reject oversized entries without inflating them
        let declared = file.size();
        if declared > MAX_ENTRY_BYTES {
            return Err("whiteboard json entry too large".to_string());
        }
        total = total.saturating_add(declared);
        if total > MAX_TOTAL_JSON_BYTES {
            return Err("whiteboard json too large".to_string());
        }

        // hard cap on the actual stream, whatever the central directory says
        let mut limited = (&mut file).take(MAX_ENTRY_BYTES + 1);
        let mut buf = Vec::new();
        limited
            .read_to_end(&mut buf)
            .map_err(|e| format!("read zip entry: {e}"))?;
        if buf.len() as u64 > MAX_ENTRY_BYTES {
            return Err("whiteboard json entry too large".to_string());
        }

        extract_text_from_json(&buf, &mut content);
        if content.texts.len() > MAX_TEXTS {
            content.texts.truncate(MAX_TEXTS);
        }
    }

    if !saw_whiteboard_json {
        return Err("zip does not look like a MS Whiteboard export (no JSON found)".to_string());
    }
    Ok(content)
}

/// Recursively walk a JSON value pulling out any `text` / `content` fields.
fn extract_text_from_json(bytes: &[u8], out: &mut MsWhiteboardContent) {
    // Cheap pre-filter: only parse if it contains likely keys
    if !bytes.windows(5).any(|w| w == b"text\"") && !bytes.windows(8).any(|w| w == b"content\"") {
        return;
    }
    let Ok(v) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return;
    };
    walk_json(&v, out);
}

fn walk_json(v: &serde_json::Value, out: &mut MsWhiteboardContent) {
    match v {
        serde_json::Value::Object(map) => {
            for (key, val) in map {
                if (key == "title" || key == "name") && out.title.is_none() {
                    if let serde_json::Value::String(s) = val {
                        out.title = Some(s.clone());
                    }
                }
                if (key == "text" || key == "content") && val.is_string() {
                    let s = val.as_str().unwrap().trim().to_string();
                    if !s.is_empty() {
                        out.texts.push(s);
                    }
                }
                walk_json(val, out);
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                walk_json(item, out);
            }
        }
        _ => {}
    }
}

//! `.inkboard` archive format (M2-06, implementation_plan.md §16).
//!
//! Layout (ZIP):
//!   board.json             full board JSON, uncompressed
//!   metadata.json          { format, formatVersion, id, name, version, schemaVersion }
//!   assets/<sha256>.<ext>  one entry per referenced `asset:` source
//!
//! The parser enforces size/entry/object limits and re-hashes every asset, so
//! a crafted archive can never smuggle mismatched or oversized content.

use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read, Write};

pub const BOARD_ENTRY: &str = "board.json";
pub const METADATA_ENTRY: &str = "metadata.json";
pub const ASSETS_DIR: &str = "assets/";
pub const FORMAT_VERSION: i64 = 1;

// Limits (M2-06 / plan §22).
pub const MAX_ARCHIVE_BYTES: usize = 100 * 1024 * 1024;
pub const MAX_ENTRIES: usize = 256;
pub const MAX_ENTRY_BYTES: u64 = 25 * 1024 * 1024;
pub const MAX_TOTAL_BYTES: u64 = 100 * 1024 * 1024;
pub const MAX_JSON_BYTES: usize = 50 * 1024 * 1024;
pub const MAX_OBJECTS: usize = 10_000;

/// Parsed `.inkboard` archive.
#[derive(Debug)]
pub struct InkboardArchive {
    pub board_json: String,
    pub metadata: serde_json::Value,
    /// (sha256, mime, bytes)
    pub assets: Vec<(String, String, Vec<u8>)>,
}

/// Cheap content check: a ZIP carrying `board.json` + `metadata.json`.
pub fn looks_like_inkboard(bytes: &[u8]) -> bool {
    if bytes.len() < 4 || &bytes[0..4] != b"PK\x03\x04" {
        return false;
    }
    let Ok(mut archive) = zip::ZipArchive::new(Cursor::new(bytes)) else {
        return false;
    };
    let mut board = false;
    let mut metadata = false;
    for i in 0..archive.len().min(MAX_ENTRIES) {
        let Ok(file) = archive.by_index(i) else {
            return false;
        };
        match file.name() {
            BOARD_ENTRY => board = true,
            METADATA_ENTRY => metadata = true,
            _ => {}
        }
        if board && metadata {
            return true;
        }
    }
    false
}

/// Every distinct `asset:<hash>` referenced by the board JSON.
pub fn find_asset_hashes(board_json: &str) -> Vec<String> {
    let mut hashes = Vec::new();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(board_json) {
        collect_asset_hashes(&value, &mut hashes);
    }
    hashes.sort();
    hashes.dedup();
    hashes
}

fn collect_asset_hashes(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(serde_json::Value::String(src)) = map.get("src") {
                if let Some(hash) = src.strip_prefix("asset:") {
                    if is_sha256_hex(hash) {
                        out.push(hash.to_ascii_lowercase());
                    }
                }
            }
            for child in map.values() {
                collect_asset_hashes(child, out);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_asset_hashes(item, out);
            }
        }
        _ => {}
    }
}

/// Original image dimensions declared by the board, keyed by asset hash.
pub fn asset_dimensions(board_json: &str) -> HashMap<String, (i64, i64)> {
    let mut out = HashMap::new();
    let Ok(value) = serde_json::from_str::<serde_json::Value>(board_json) else {
        return out;
    };
    let Some(objects) = value.pointer("/board/objects").and_then(|v| v.as_array()) else {
        return out;
    };
    for obj in objects {
        if obj.get("type").and_then(|t| t.as_str()) != Some("image") {
            continue;
        }
        let Some(hash) = obj.get("src").and_then(|s| s.as_str()).and_then(|s| s.strip_prefix("asset:"))
        else {
            continue;
        };
        let width = obj.get("originalWidth").and_then(|v| v.as_i64()).unwrap_or(0);
        let height = obj.get("originalHeight").and_then(|v| v.as_i64()).unwrap_or(0);
        out.insert(hash.to_ascii_lowercase(), (width, height));
    }
    out
}

/// Structural validation of the internal board JSON (M2-07 limits).
pub fn validate_board_json(json: &str) -> Result<(), String> {
    if json.len() > MAX_JSON_BYTES {
        return Err(format!("board JSON too large: {} bytes", json.len()));
    }
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("invalid board JSON: {e}"))?;
    let board = value
        .get("board")
        .ok_or("board JSON is missing the 'board' object")?;
    let objects = board
        .get("objects")
        .and_then(|v| v.as_array())
        .ok_or("board JSON is missing the 'objects' array")?;
    if objects.len() > MAX_OBJECTS {
        return Err(format!(
            "too many objects: {} (max {MAX_OBJECTS})",
            objects.len()
        ));
    }
    for obj in objects {
        if obj.get("id").and_then(|v| v.as_str()).is_none()
            || obj.get("type").and_then(|v| v.as_str()).is_none()
        {
            return Err("board object is missing id/type".to_string());
        }
    }
    if let Some(schema) = value.get("schemaVersion").and_then(|v| v.as_str()) {
        if !schema.starts_with("1.") {
            return Err(format!("unsupported schemaVersion: {schema}"));
        }
    }
    Ok(())
}

/// Build an `.inkboard` ZIP from the board JSON and its assets.
pub fn build_zip(
    board_json: &str,
    assets: &[(String, String, Vec<u8>)],
) -> Result<Vec<u8>, String> {
    validate_board_json(board_json)?;
    let value: serde_json::Value =
        serde_json::from_str(board_json).map_err(|e| e.to_string())?;
    let board = value.get("board").ok_or("board JSON is missing 'board'")?;
    let text = |v: &serde_json::Value, key: &str| {
        v.get(key)
            .and_then(|x| x.as_str())
            .unwrap_or_default()
            .to_string()
    };
    let metadata = serde_json::json!({
        "format": "inkboard",
        "formatVersion": FORMAT_VERSION,
        "id": text(board, "id"),
        "name": text(board, "name"),
        "version": board.get("version").and_then(|v| v.as_i64()).unwrap_or(1),
        "schemaVersion": text(&value, "schemaVersion"),
    });

    let mut cursor = Cursor::new(Vec::new());
    {
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        let mut zip = zip::ZipWriter::new(&mut cursor);
        zip.start_file(BOARD_ENTRY, options)
            .map_err(|e| e.to_string())?;
        zip.write_all(board_json.as_bytes())
            .map_err(|e| e.to_string())?;
        zip.start_file(METADATA_ENTRY, options)
            .map_err(|e| e.to_string())?;
        zip.write_all(metadata.to_string().as_bytes())
            .map_err(|e| e.to_string())?;
        for (hash, mime, bytes) in assets {
            let name = format!(
                "{ASSETS_DIR}{}.{}",
                hash.to_ascii_lowercase(),
                extension_for_mime(mime)
            );
            zip.start_file(name, options).map_err(|e| e.to_string())?;
            zip.write_all(bytes).map_err(|e| e.to_string())?;
        }
        zip.finish().map_err(|e| e.to_string())?;
    }
    Ok(cursor.into_inner())
}

/// Parse and validate an `.inkboard` ZIP.
pub fn parse_zip(bytes: &[u8]) -> Result<InkboardArchive, String> {
    if bytes.len() > MAX_ARCHIVE_BYTES {
        return Err(format!("inkboard file too large: {} bytes", bytes.len()));
    }
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("invalid inkboard zip: {e}"))?;
    if archive.len() > MAX_ENTRIES {
        return Err(format!(
            "too many entries: {} (max {MAX_ENTRIES})",
            archive.len()
        ));
    }

    let mut board_json: Option<String> = None;
    let mut metadata: Option<serde_json::Value> = None;
    let mut assets: Vec<(String, String, Vec<u8>)> = Vec::new();
    let mut total: u64 = 0;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("zip entry {i}: {e}"))?;
        let name = file.name().to_string();
        if name.starts_with('/') || name.contains("..") || name.contains('\\') {
            return Err(format!("unsafe zip entry: {name}"));
        }
        let declared = file.size();
        if declared > MAX_ENTRY_BYTES {
            return Err(format!("zip entry too large: {name}"));
        }
        total = total.saturating_add(declared);
        if total > MAX_TOTAL_BYTES {
            return Err("inkboard contents too large".to_string());
        }

        if name == BOARD_ENTRY {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            if buf.len() > MAX_JSON_BYTES {
                return Err("board.json is too large".to_string());
            }
            board_json = Some(
                String::from_utf8(buf).map_err(|_| "board.json is not valid UTF-8".to_string())?,
            );
        } else if name == METADATA_ENTRY {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            metadata = Some(
                serde_json::from_slice(&buf).map_err(|e| format!("invalid metadata.json: {e}"))?,
            );
        } else if let Some(rest) = name.strip_prefix(ASSETS_DIR) {
            if rest.is_empty() || rest.ends_with('/') {
                continue;
            }
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            let hash = hex(Sha256::digest(&buf));
            let stem = rest.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(rest);
            if is_sha256_hex(stem) && !stem.eq_ignore_ascii_case(&hash) {
                return Err(format!("asset hash mismatch: {name}"));
            }
            let mime = sniff_mime(&buf);
            assets.push((hash, mime.to_string(), buf));
        }
        // unknown entries are ignored
    }

    let board_json = board_json.ok_or("inkboard is missing board.json")?;
    let metadata = metadata.ok_or("inkboard is missing metadata.json")?;
    validate_board_json(&board_json)?;

    let declared: HashSet<String> = find_asset_hashes(&board_json).into_iter().collect();
    for hash in &declared {
        if !assets.iter().any(|(stored, _, _)| stored == hash) {
            return Err(format!("board references a missing asset: {hash}"));
        }
    }

    Ok(InkboardArchive {
        board_json,
        metadata,
        assets,
    })
}

pub fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/svg+xml" => "svg",
        _ => "bin",
    }
}

/// Mime sniffing on import (entry names are not trusted for typing).
pub fn sniff_mime(bytes: &[u8]) -> &'static str {
    if bytes.len() >= 8 && bytes[0..4] == [0x89, 0x50, 0x4e, 0x47] {
        return "image/png";
    }
    if bytes.len() >= 3 && bytes[0..3] == [0xff, 0xd8, 0xff] {
        return "image/jpeg";
    }
    if bytes.len() >= 4 && &bytes[0..4] == b"GIF8" {
        return "image/gif";
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return "image/webp";
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(64)]);
    let head = head.trim_start().to_ascii_lowercase();
    if head.starts_with("<svg") || head.starts_with("<?xml") {
        return "image/svg+xml";
    }
    "application/octet-stream"
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit())
}

fn hex(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

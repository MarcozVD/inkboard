//! Tests for the `.inkboard` archive (M2-06).

use crate::db::AppDb;
use crate::formats::inkboard;
use crate::formats::ms_whiteboard::{detect_format, ImportFormat};
use std::io::Write;
use std::path::Path;

fn zip_with(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for (name, data) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
    }
    buf
}

fn board_json_with_object_count(count: usize) -> String {
    let objects: Vec<serde_json::Value> = (0..count)
        .map(|i| serde_json::json!({ "id": format!("o{i}"), "type": "shape" }))
        .collect();
    serde_json::json!({
        "schemaVersion": "1.1.0",
        "version": 1,
        "board": { "id": "b1", "name": "Limits", "objects": objects }
    })
    .to_string()
}

#[test]
fn roundtrip_board_inkboard_import_is_identical() {
    let db = AppDb::new(Path::new(":memory:")).expect("db");
    db.ensure_default_workspace().expect("workspace");
    let png = vec![0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4];
    let jpg = vec![0xff, 0xd8, 0xff, 9, 9, 9];
    let h1 = db.put_asset(&png, "image/png", 320, 200).unwrap();
    let h2 = db.put_asset(&jpg, "image/jpeg", 10, 10).unwrap();
    let json = serde_json::json!({
        "schemaVersion": "1.1.0",
        "version": 1,
        "board": {
            "id": "b1",
            "name": "Round",
            "objects": [
                { "id": "a", "type": "image", "src": format!("asset:{h1}"), "originalWidth": 320, "originalHeight": 200 },
                { "id": "b", "type": "image", "src": format!("asset:{h2}"), "originalWidth": 10, "originalHeight": 10 }
            ]
        }
    })
    .to_string();
    db.save_board("b1", "Round", &json).unwrap();

    let record = db.load_board("b1").expect("load");
    let mut assets = Vec::new();
    for hash in inkboard::find_asset_hashes(&record.json) {
        let asset = db.get_asset(&hash).expect("asset query").expect("asset");
        assets.push((hash, asset.mime, asset.bytes));
    }
    let archive = inkboard::build_zip(&record.json, &assets).expect("build");

    let parsed = inkboard::parse_zip(&archive).expect("parse");
    assert_eq!(parsed.board_json, record.json);
    assert_eq!(parsed.metadata["format"], "inkboard");
    assert_eq!(parsed.metadata["formatVersion"], 1);
    assert_eq!(parsed.metadata["id"], "b1");
    assert_eq!(parsed.metadata["name"], "Round");
    assert_eq!(parsed.assets.len(), 2);

    // re-import into a fresh store: same hashes and bytes (dedup by content)
    let db2 = AppDb::new(Path::new(":memory:")).expect("db2");
    let dims = inkboard::asset_dimensions(&parsed.board_json);
    for (hash, mime, blob) in &parsed.assets {
        let (w, h) = dims.get(hash).copied().unwrap_or((0, 0));
        let stored = db2.put_asset(blob, mime, w, h).unwrap();
        assert_eq!(&stored, hash);
    }
    assert_eq!(db2.get_asset(&h1).unwrap().unwrap().bytes, png);
    assert_eq!(db2.get_asset(&h2).unwrap().unwrap().bytes, jpg);
    let imported = db2.get_asset(&h1).unwrap().unwrap();
    assert_eq!((imported.width, imported.height), (320, 200));
}

#[test]
fn parse_rejects_missing_required_entries() {
    let board = board_json_with_object_count(0);
    let err = inkboard::parse_zip(&zip_with(&[("board.json", board.as_bytes())])).unwrap_err();
    assert!(err.contains("metadata.json"), "got: {err}");
    let err = inkboard::parse_zip(&zip_with(&[("metadata.json", b"{}")])).unwrap_err();
    assert!(err.contains("board.json"), "got: {err}");
}

#[test]
fn parse_rejects_too_many_entries() {
    let names: Vec<String> = (0..inkboard::MAX_ENTRIES + 1)
        .map(|i| format!("f{i}.txt"))
        .collect();
    let entries: Vec<(&str, &[u8])> = names.iter().map(|name| (name.as_str(), b"x".as_slice())).collect();
    let err = inkboard::parse_zip(&zip_with(&entries)).unwrap_err();
    assert!(err.contains("too many entries"), "got: {err}");
}

#[test]
fn parse_rejects_unsafe_paths() {
    let board = board_json_with_object_count(0);
    let bytes = zip_with(&[
        ("board.json", board.as_bytes()),
        ("metadata.json", b"{}"),
        ("assets/../evil.png", b"x"),
    ]);
    let err = inkboard::parse_zip(&bytes).unwrap_err();
    assert!(err.contains("unsafe zip entry"), "got: {err}");
}

#[test]
fn parse_rejects_hash_mismatch_and_missing_assets() {
    let hash = "a".repeat(64);
    let json = serde_json::json!({
        "schemaVersion": "1.1.0",
        "version": 1,
        "board": { "id": "b1", "name": "X", "objects": [
            { "id": "a", "type": "image", "src": format!("asset:{hash}") }
        ]}
    })
    .to_string();

    // entry name claims a hash that does not match its bytes
    let entry = format!("assets/{hash}.png");
    let bytes = zip_with(&[
        ("board.json", json.as_bytes()),
        ("metadata.json", b"{}"),
        (entry.as_str(), b"not-a-png"),
    ]);
    let err = inkboard::parse_zip(&bytes).unwrap_err();
    assert!(err.contains("hash mismatch"), "got: {err}");

    // no asset entry at all
    let bytes = zip_with(&[("board.json", json.as_bytes()), ("metadata.json", b"{}")]);
    let err = inkboard::parse_zip(&bytes).unwrap_err();
    assert!(err.contains("missing asset"), "got: {err}");
}

#[test]
fn parse_rejects_too_many_objects() {
    let board = board_json_with_object_count(inkboard::MAX_OBJECTS + 1);
    let bytes = zip_with(&[("board.json", board.as_bytes()), ("metadata.json", b"{}")]);
    let err = inkboard::parse_zip(&bytes).unwrap_err();
    assert!(err.contains("too many objects"), "got: {err}");
}

#[test]
fn validate_board_json_checks_structure_and_limits() {
    assert!(inkboard::validate_board_json(&board_json_with_object_count(2)).is_ok());

    let err = inkboard::validate_board_json("not json").unwrap_err();
    assert!(err.contains("invalid board JSON"));

    let missing = serde_json::json!({ "board": { "objects": [] } }).to_string();
    assert!(inkboard::validate_board_json(&missing).is_ok());

    let bad_object = serde_json::json!({
        "board": { "objects": [{ "id": "x" }] }
    })
    .to_string();
    let err = inkboard::validate_board_json(&bad_object).unwrap_err();
    assert!(err.contains("id/type"), "got: {err}");

    let bad_schema = serde_json::json!({
        "schemaVersion": "2.0.0",
        "board": { "objects": [] }
    })
    .to_string();
    let err = inkboard::validate_board_json(&bad_schema).unwrap_err();
    assert!(err.contains("schemaVersion"), "got: {err}");
}

#[test]
fn detect_inkboard_by_extension_and_content() {
    assert_eq!(
        detect_format("board.inkboard", b"not a zip"),
        ImportFormat::Inkboard
    );
    let board = board_json_with_object_count(0);
    let zip = zip_with(&[("board.json", board.as_bytes()), ("metadata.json", b"{}")]);
    assert_eq!(detect_format("renamed.zip", &zip), ImportFormat::Inkboard);
    assert_eq!(
        detect_format("other.zip", b"PK\x03\x04plain"),
        ImportFormat::MsWhiteboardZip
    );
}

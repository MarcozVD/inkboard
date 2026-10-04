//! Tests for MS Whiteboard import (Fase 13).

use crate::formats::ms_whiteboard::{self, detect_format, parse_ms_whiteboard_zip, ImportFormat};
use std::io::Write;

#[test]
fn detect_zip_by_magic() {
    let bytes = [0x50, 0x4b, 0x03, 0x04, 1, 2, 3];
    assert_eq!(
        detect_format("board.whatever", &bytes),
        ImportFormat::MsWhiteboardZip
    );
}

#[test]
fn detect_zip_by_extension() {
    let bytes = b"not really a zip";
    assert_eq!(
        detect_format("board.zip", bytes),
        ImportFormat::MsWhiteboardZip
    );
}

#[test]
fn detect_json() {
    assert_eq!(detect_format("data.json", b"{\"a\":1}"), ImportFormat::Json);
    assert_eq!(detect_format("data.json", b"{}"), ImportFormat::Json);
}

#[test]
fn detect_image_by_extension() {
    assert_eq!(detect_format("photo.png", b"x"), ImportFormat::Image);
    assert_eq!(detect_format("photo.jpeg", b"x"), ImportFormat::Image);
    assert_eq!(detect_format("vector.svg", b"x"), ImportFormat::Image);
}

#[test]
fn detect_unknown() {
    assert_eq!(detect_format("notes.txt", b"hello"), ImportFormat::Unknown);
}

#[test]
fn parse_zip_extracts_text_from_json() {
    // build a small zip in memory containing a whiteboard-ish JSON
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts: zip::write::FileOptions<'_, ()> =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);
        zip.start_file("content.json", opts).unwrap();
        zip.write_all(
            br#"{
				"title": "My Board",
				"content": "hello world",
				"notes": [ { "text": "note one" }, { "text": "note two" } ]
			}"#,
        )
        .unwrap();
        zip.finish().unwrap();
    }

    let parsed = parse_ms_whiteboard_zip(&buf).expect("should parse");
    assert_eq!(parsed.title.as_deref(), Some("My Board"));
    assert_eq!(parsed.texts, vec!["hello world", "note one", "note two"]);
}

#[test]
fn parse_zip_rejects_non_whiteboard() {
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default();
        zip.start_file("image.png", opts).unwrap();
        zip.write_all(b"not json").unwrap();
        zip.finish().unwrap();
    }
    let err = parse_ms_whiteboard_zip(&buf).unwrap_err();
    assert!(err.contains("MS Whiteboard"));
}

#[test]
fn parse_invalid_zip_errors() {
    assert!(parse_ms_whiteboard_zip(b"garbage").is_err());
}

// ── M2-08: bounded parsing ──

#[test]
fn parse_zip_skips_oversized_entries_without_inflating() {
    // synthetic zip bomb: > MAX_ENTRY_BYTES of zeros, deflated to a few KB
    let size = (ms_whiteboard::MAX_ENTRY_BYTES + 1) as usize;
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("huge.json", opts).unwrap();
        zip.write_all(&vec![0u8; size]).unwrap();
        zip.finish().unwrap();
    }
    assert!(
        buf.len() < 1024 * 1024,
        "bomb should compress tiny, got {} bytes",
        buf.len()
    );
    // the declared size is over the cap → rejected without inflating it
    let err = parse_ms_whiteboard_zip(&buf).unwrap_err();
    assert!(err.contains("too large"), "got: {err}");
}

#[test]
fn parse_zip_rejects_too_many_entries() {
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for i in 0..ms_whiteboard::MAX_ZIP_ENTRIES + 1 {
            zip.start_file(format!("f{i}.json"), opts).unwrap();
            zip.write_all(b"{}").unwrap();
        }
        zip.finish().unwrap();
    }
    let err = parse_ms_whiteboard_zip(&buf).unwrap_err();
    assert!(err.contains("too many entries"), "got: {err}");
}

#[test]
fn parse_zip_survives_truncated_and_mutated_input() {
    let mut valid = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut valid));
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("content.json", opts).unwrap();
        zip.write_all(br#"{"title":"T","text":"x"}"#).unwrap();
        zip.finish().unwrap();
    }

    for cut in [0usize, 1, 3, 10, valid.len() / 2, valid.len() - 1] {
        let _ = parse_ms_whiteboard_zip(&valid[..cut]);
    }
    for i in 0..valid.len() {
        let mut mutated = valid.clone();
        mutated[i] ^= 0xFF;
        let _ = parse_ms_whiteboard_zip(&mutated);
    }
    assert!(parse_ms_whiteboard_zip(b"PK\x03\x04garbage").is_err());
}

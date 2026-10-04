//! Tests for image sanitization (M2-08).

use super::images::{sanitize, MAX_IMAGE_DIMENSION};
use image::{ImageFormat, RgbImage};
use std::io::Cursor;

fn png(width: u32, height: u32) -> Vec<u8> {
    let img = RgbImage::from_fn(width, height, |x, y| image::Rgb([(x % 256) as u8, (y % 256) as u8, 7]));
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, ImageFormat::Png).unwrap();
    out.into_inner()
}

fn jpeg_with_exif() -> Vec<u8> {
    let img = RgbImage::from_fn(4, 4, |_, _| image::Rgb([10, 20, 30]));
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, ImageFormat::Jpeg).unwrap();
    let base = out.into_inner();

    // APP1/Exif segment right after SOI: decoders ignore it, our re-encode drops it
    let mut payload = b"Exif\0\0SECRET".to_vec();
    let mut segment = vec![0xFF, 0xE1];
    segment.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
    segment.append(&mut payload);
    let mut with = base[..2].to_vec();
    with.extend_from_slice(&segment);
    with.extend_from_slice(&base[2..]);
    with
}

#[test]
fn sanitize_reencodes_png_and_keeps_dimensions() {
    let sanitized = sanitize(&png(8, 6)).unwrap();
    assert_eq!(sanitized.mime, "image/png");
    assert_eq!((sanitized.width, sanitized.height), (8, 6));
    let decoded = image::load_from_memory(&sanitized.bytes).unwrap();
    assert_eq!((decoded.width(), decoded.height()), (8, 6));
}

#[test]
fn sanitize_strips_jpeg_exif_metadata() {
    let original = jpeg_with_exif();
    assert!(String::from_utf8_lossy(&original).contains("SECRET"));

    let sanitized = sanitize(&original).unwrap();
    assert_eq!(sanitized.mime, "image/jpeg");
    assert_eq!((sanitized.width, sanitized.height), (4, 4));
    assert!(!String::from_utf8_lossy(&sanitized.bytes).contains("SECRET"));
}

#[test]
fn sanitize_rejects_oversized_dimensions() {
    let huge = png(MAX_IMAGE_DIMENSION + 1, 1);
    assert!(sanitize(&huge).is_err());
}

#[test]
fn sanitize_rejects_garbage_and_truncated_images() {
    assert!(sanitize(b"not an image").is_err());
    let original = png(16, 16);
    for cut in [8usize, 16, 24, 40, original.len() / 2] {
        assert!(sanitize(&original[..cut]).is_err(), "cut at {cut} must fail");
    }
}

#[test]
fn svg_is_passed_through() {
    let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>"#;
    let sanitized = sanitize(svg).unwrap();
    assert_eq!(sanitized.mime, "image/svg+xml");
    assert_eq!(sanitized.bytes, svg);
}

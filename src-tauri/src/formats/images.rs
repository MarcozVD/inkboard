//! Image sanitization for imports (M2-08, plan §22).
//!
//! Every raster image that enters the app is decoded and re-encoded, which
//! drops EXIF/XMP/ICC metadata and any container tricks. Decoding is bounded
//! by dimension and allocation limits so a decompression bomb cannot exhaust
//! memory. SVG is passed through untouched: it is vector text and never
//! executes scripts when rendered through `<img>`/canvas.

use image::{ImageFormat, ImageReader};
use std::io::Cursor;

/// Largest accepted image edge (px).
pub const MAX_IMAGE_DIMENSION: u32 = 20_000;
/// Largest decoded allocation (bytes).
pub const MAX_IMAGE_ALLOC_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug)]
pub struct SanitizedImage {
    pub bytes: Vec<u8>,
    pub mime: &'static str,
    pub width: u32,
    pub height: u32,
}

/// Magic-byte mime sniffing (the same rules the frontend uses).
pub fn sniff(bytes: &[u8]) -> &'static str {
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
    if bytes.len() >= 2 && &bytes[0..2] == b"BM" {
        return "image/bmp";
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(64)]);
    let head = head.trim_start().to_ascii_lowercase();
    if head.starts_with("<svg") || head.starts_with("<?xml") {
        return "image/svg+xml";
    }
    "application/octet-stream"
}

/// Decode + re-encode an imported image, stripping metadata.
/// JPEG stays JPEG; every other raster format becomes PNG (lossless).
pub fn sanitize(bytes: &[u8]) -> Result<SanitizedImage, String> {
    let format = sniff(bytes);
    if format == "image/svg+xml" {
        return Ok(SanitizedImage {
            bytes: bytes.to_vec(),
            mime: "image/svg+xml",
            width: 0,
            height: 0,
        });
    }
    if format == "application/octet-stream" {
        return Err("unsupported image format".to_string());
    }

    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_DIMENSION);
    limits.max_image_height = Some(MAX_IMAGE_DIMENSION);
    limits.max_alloc = Some(MAX_IMAGE_ALLOC_BYTES);

    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| format!("cannot read image: {e}"))?;
    reader.limits(limits);
    let decoded = reader.decode().map_err(|e| format!("invalid image: {e}"))?;
    let width = decoded.width();
    let height = decoded.height();

    let mut out = Cursor::new(Vec::new());
    if format == "image/jpeg" {
        decoded
            .write_to(&mut out, ImageFormat::Jpeg)
            .map_err(|e| format!("cannot re-encode image: {e}"))?;
        Ok(SanitizedImage {
            bytes: out.into_inner(),
            mime: "image/jpeg",
            width,
            height,
        })
    } else {
        decoded
            .write_to(&mut out, ImageFormat::Png)
            .map_err(|e| format!("cannot re-encode image: {e}"))?;
        Ok(SanitizedImage {
            bytes: out.into_inner(),
            mime: "image/png",
            width,
            height,
        })
    }
}

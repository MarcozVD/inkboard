//! Tests for SVG → PDF export (M2-10).

use crate::formats::pdf::svg_to_pdf;

/// 1×1 red PNG as data URL (valid raster for usvg).
const PNG_1X1: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

#[test]
fn pdf_export_produces_valid_bytes_for_text_shapes_and_image() {
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120">
            <rect x="10" y="10" width="80" height="60" fill="#7cc4ff" stroke="#e8e9ec" stroke-width="2"/>
            <circle cx="150" cy="40" r="20" fill="#ffb86b"/>
            <path d="M20 80 L60 70 L100 95 Z" fill="#b79cff"/>
            <text x="20" y="110" font-size="18" font-family="Segoe UI, sans-serif" fill="#e8e9ec">Hello Inkboard</text>
            <image href="{PNG_1X1}" x="170" y="90" width="16" height="16"/>
        </svg>"##
    );
    let pdf = svg_to_pdf(&svg).expect("valid PDF");
    assert!(pdf.starts_with(b"%PDF"), "must start with %PDF");
    assert!(pdf.len() > 500, "pdf too small: {} bytes", pdf.len());
    assert!(
        pdf.windows(5).any(|w| w == b"%%EOF"),
        "must contain the EOF marker"
    );
}

#[test]
fn pdf_export_rejects_invalid_svg() {
    assert!(svg_to_pdf("").is_err());
    assert!(svg_to_pdf("not an svg document").is_err());
}

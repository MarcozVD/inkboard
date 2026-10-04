//! SVG → vector PDF conversion (M2-10, decision D2).
//!
//! `usvg` parses the exported SVG (with system fonts so text stays vectorial)
//! and `svg2pdf` writes PDF bytes. The save dialog is handled by the command;
//! this module is pure so it can be unit tested.

use std::sync::Arc;

/// Convert an SVG document to PDF bytes.
pub fn svg_to_pdf(svg: &str) -> Result<Vec<u8>, String> {
    if svg.trim().is_empty() {
        return Err("empty SVG".to_string());
    }
    let mut fontdb = fontdb::Database::new();
    fontdb.load_system_fonts();
    let mut options = usvg::Options::default();
    options.fontdb = Arc::new(fontdb);

    let tree =
        usvg::Tree::from_str(svg, &options).map_err(|e| format!("invalid SVG: {e}"))?;
    let pdf = svg2pdf::to_pdf(
        &tree,
        svg2pdf::ConversionOptions::default(),
        svg2pdf::PageOptions::default(),
    )
    .map_err(|e| format!("PDF conversion failed: {e}"))?;

    if pdf.starts_with(b"%PDF") {
        Ok(pdf)
    } else {
        Err("converter produced an invalid PDF".to_string())
    }
}

//! Persistence Tauri commands (implementation_plan.md §7 / Fase 11).
//! The AppDb lives in Tauri managed state; heavy DB work runs on the blocking
//! pool so it never blocks the main thread (M2-01).

use crate::db::AppDb;
use std::sync::{Arc, Mutex};
use tauri::State;

pub struct DbState(pub Arc<Mutex<AppDb>>);

/// Save a board's full JSON payload.
#[tauri::command]
pub async fn save_board(
    state: State<'_, DbState>,
    board_id: String,
    name: String,
    json: String,
) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .save_board(&board_id, &name, &json)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Load a board by id → its full JSON payload.
#[tauri::command]
pub async fn load_board(
    state: State<'_, DbState>,
    board_id: String,
) -> Result<crate::db::BoardRecord, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .load_board(&board_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// List all boards (metadata only).
#[tauri::command]
pub async fn list_boards(state: State<'_, DbState>) -> Result<Vec<crate::db::BoardMeta>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || db.lock().map_err(|e| e.to_string())?.list_boards())
        .await
        .map_err(|e| e.to_string())?
}

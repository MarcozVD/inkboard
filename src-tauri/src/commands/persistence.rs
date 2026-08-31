//! Persistence Tauri commands (implementation_plan.md §7 / Fase 11).
//! The AppDb lives in Tauri managed state (Mutex<AppDb>).

use crate::db::AppDb;
use std::sync::Mutex;
use tauri::State;

pub struct DbState(pub Mutex<AppDb>);

/// Save a board's full JSON payload.
#[tauri::command]
pub fn save_board(state: State<'_, DbState>, board_id: String, name: String, json: String) -> Result<(), String> {
	state.0.lock().map_err(|e| e.to_string())?.save_board(&board_id, &name, &json)
}

/// Load a board by id → its full JSON payload.
#[tauri::command]
pub fn load_board(state: State<'_, DbState>, board_id: String) -> Result<crate::db::BoardRecord, String> {
	state.0.lock().map_err(|e| e.to_string())?.load_board(&board_id)
}

/// List all boards (metadata only).
#[tauri::command]
pub fn list_boards(state: State<'_, DbState>) -> Result<Vec<crate::db::BoardMeta>, String> {
	state.0.lock().map_err(|e| e.to_string())?.list_boards()
}

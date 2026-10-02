//! Persistence Tauri commands (implementation_plan.md §7 / Fase 11).
//! The AppDb lives in Tauri managed state; heavy DB work runs on the blocking
//! pool so it never blocks the main thread (M2-01).
//! M2-02 adds board management: rename, duplicate, soft delete/restore/purge
//! and favorites.

use crate::db::AppDb;
use std::sync::{Arc, Mutex};
use tauri::ipc::{InvokeBody, Request, Response};
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

/// List board metadata; `trash` selects soft-deleted boards, `sort` is
/// "date" (default) or "name".
#[tauri::command]
pub async fn list_boards(
    state: State<'_, DbState>,
    trash: Option<bool>,
    sort: Option<String>,
) -> Result<Vec<crate::db::BoardMeta>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock().map_err(|e| e.to_string())?.list_boards(
            trash.unwrap_or(false),
            sort.as_deref().unwrap_or("date"),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Rename a board.
#[tauri::command]
pub async fn rename_board(
    state: State<'_, DbState>,
    board_id: String,
    name: String,
) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .rename_board(&board_id, &name)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Duplicate a board (metadata + data) under a new id.
#[tauri::command]
pub async fn duplicate_board(
    state: State<'_, DbState>,
    board_id: String,
    new_id: String,
    name: String,
) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .duplicate_board(&board_id, &new_id, &name)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Soft delete: move the board to the trash.
#[tauri::command]
pub async fn delete_board(state: State<'_, DbState>, board_id: String) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .delete_board(&board_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Restore a board from the trash.
#[tauri::command]
pub async fn restore_board(state: State<'_, DbState>, board_id: String) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .restore_board(&board_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Permanently delete a trashed board.
#[tauri::command]
pub async fn purge_board(state: State<'_, DbState>, board_id: String) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock().map_err(|e| e.to_string())?.purge_board(&board_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Mark/unmark a board as favorite.
#[tauri::command]
pub async fn set_favorite(
    state: State<'_, DbState>,
    board_id: String,
    favorite: bool,
) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .set_favorite(&board_id, favorite)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Store the board thumbnail (PNG bytes, M2-03).
#[tauri::command]
pub async fn save_thumbnail(
    state: State<'_, DbState>,
    board_id: String,
    png: Vec<u8>,
) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .set_thumbnail(&board_id, &png)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Read the board thumbnail (PNG bytes, M2-03).
#[tauri::command]
pub async fn get_thumbnail(
    state: State<'_, DbState>,
    board_id: String,
) -> Result<Option<Vec<u8>>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock().map_err(|e| e.to_string())?.get_thumbnail(&board_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Snapshot the current board as a new version (M2-04). Returns the version id.
#[tauri::command]
pub async fn save_version(
    state: State<'_, DbState>,
    board_id: String,
    label: Option<String>,
) -> Result<String, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .create_version(&board_id, label.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// List a board's versions, newest first (M2-04).
#[tauri::command]
pub async fn list_versions(
    state: State<'_, DbState>,
    board_id: String,
) -> Result<Vec<crate::db::BoardVersionMeta>, String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .list_versions(&board_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Restore a version (snapshots the live board first, M2-04).
#[tauri::command]
pub async fn restore_version(
    state: State<'_, DbState>,
    board_id: String,
    version_id: String,
) -> Result<(), String> {
    let db = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .restore_version(&board_id, &version_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Store an image asset (M2-05). The raw bytes travel in the request body;
/// `x-mime`, `x-width` and `x-height` arrive as headers. Returns the sha256.
#[tauri::command]
pub fn put_asset(state: State<'_, DbState>, request: Request<'_>) -> Result<String, String> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
    };
    let mime = header("x-mime").unwrap_or_else(|| "application/octet-stream".to_string());
    let width = header("x-width")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    let height = header("x-height")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0);
    let bytes: Vec<u8> = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(value) => {
            serde_json::from_value(value.clone()).map_err(|e| e.to_string())?
        }
    };
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .put_asset(&bytes, &mime, width, height)
}

/// Read an image asset as raw bytes (M2-05). The frontend receives an
/// ArrayBuffer; missing assets reject.
#[tauri::command]
pub async fn get_asset(state: State<'_, DbState>, hash: String) -> Result<Response, String> {
    let db = state.0.clone();
    let missing = hash.clone();
    let asset = tauri::async_runtime::spawn_blocking(move || {
        db.lock()
            .map_err(|e| e.to_string())?
            .get_asset(&hash)
    })
    .await
    .map_err(|e| e.to_string())??;
    match asset {
        Some(record) => Ok(Response::new(record.bytes)),
        None => Err(format!("asset not found: {missing}")),
    }
}

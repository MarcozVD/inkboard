//! Persistence layer — SQLite via rusqlite (Fase 11, implementation_plan.md §16).
//! Objects are stored as zstd-compressed JSON blobs; SHA-256 detects changes.
//!
//! M2-01: WAL + foreign_keys + busy_timeout on every connection, and a
//! `PRAGMA user_version` migration runner (v0.1 databases are detected as
//! schema version 1 and stamped without re-running the initial migration).

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use std::path::Path;

/// Ordered migrations; the tuple index is the schema version.
const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("migrations/001_initial.sql")),
    (2, include_str!("migrations/002_board_management.sql")),
];

/// busy_timeout used for every connection (ms).
const BUSY_TIMEOUT_MS: i64 = 5_000;

/// Metadata row for a board version (M2-04).
#[derive(serde::Serialize, Clone)]
pub struct BoardVersionMeta {
    pub id: String,
    pub board_id: String,
    pub created_at: i64,
    pub label: Option<String>,
}

/// Version retention (M2-04): keep at most this many versions…
const MAX_VERSIONS: i64 = 50;
/// …and never keep versions older than 30 days.
const VERSION_MAX_AGE_MS: i64 = 30 * 24 * 60 * 60 * 1000;

pub struct AppDb {
    conn: Connection,
}

/// Metadata row for a board (list view).
#[derive(serde::Serialize, Clone)]
pub struct BoardMeta {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub version: i64,
    pub object_count: i64,
    pub is_favorite: bool,
    pub deleted_at: Option<i64>,
}

/// Full board record (metadata + compressed data + hash).
#[derive(serde::Serialize, Clone)]
pub struct BoardRecord {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    /// Decompressed board JSON (ready for the frontend).
    pub json: String,
}

impl AppDb {
    pub fn new(path: &Path) -> Result<Self, String> {
        let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
        Self::configure(&conn)?;
        Self::migrate(&mut conn)?;
        Ok(Self { conn })
    }

    /// Connection-level pragmas (M2-01).
    fn configure(conn: &Connection) -> Result<(), String> {
        conn.execute_batch(&format!(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = {BUSY_TIMEOUT_MS};"
        ))
        .map_err(|e| e.to_string())
    }

    /// Apply pending migrations, tracked by `PRAGMA user_version` (M2-01).
    fn migrate(conn: &mut Connection) -> Result<(), String> {
        let mut current: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        // A v0.1 database has the initial schema but was never stamped:
        // detect it as version 1 and keep its data untouched.
        if current == 0 && Self::has_legacy_schema(conn)? {
            current = 1;
            conn.pragma_update(None, "user_version", current)
                .map_err(|e| e.to_string())?;
        }

        for (version, sql) in MIGRATIONS {
            if *version <= current {
                continue;
            }
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            tx.execute_batch(sql).map_err(|e| e.to_string())?;
            tx.pragma_update(None, "user_version", version)
                .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            current = *version;
        }
        Ok(())
    }

    fn has_legacy_schema(conn: &Connection) -> Result<bool, String> {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'boards'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(count > 0)
    }

    /// Ensure a default workspace exists (id 'default').
    pub fn ensure_default_workspace(&self) -> Result<(), String> {
        let now = chrono_now_ms();
        self.conn
			.execute(
				"INSERT OR IGNORE INTO workspaces (id, name, created_at, updated_at, settings_json)
				 VALUES ('default', 'My Workspace', ?1, ?1, '{\"theme\":\"dark\",\"defaultGridEnabled\":true,\"defaultSnapEnabled\":false,\"autosaveIntervalMs\":2000}')",
				params![now],
			)
			.map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Save (or create) a board. `json` is the full serialized board.
    pub fn save_board(&self, id: &str, name: &str, json: &str) -> Result<(), String> {
        let now = chrono_now_ms();
        let compressed = zstd::encode_all(json.as_bytes(), 3).map_err(|e| e.to_string())?;
        let hash = hex(Sha256::digest(json.as_bytes()));

        // hash change detection: skip write if identical
        let existing: Option<String> = self
            .conn
            .query_row(
                "SELECT data_hash FROM board_data WHERE board_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .ok();
        if existing.as_deref() == Some(hash.as_str()) {
            return Ok(()); // nothing changed
        }

        let object_count = count_objects(json);

        self.conn
			.execute(
				"INSERT INTO boards (id, workspace_id, name, created_at, updated_at, version, schema_version, object_count)
				 VALUES (?1, 'default', ?2, ?3, ?3, 1, '1.0.0', ?4)
				 ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at, object_count=excluded.object_count",
				params![id, name, now, object_count],
			)
			.map_err(|e| e.to_string())?;

        self.conn
			.execute(
				"INSERT INTO board_data (board_id, data, data_hash, updated_at)
				 VALUES (?1, ?2, ?3, ?4)
				 ON CONFLICT(board_id) DO UPDATE SET data=excluded.data, data_hash=excluded.data_hash, updated_at=excluded.updated_at",
				params![id, compressed, hash, now],
			)
			.map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Load a board by id; returns its JSON.
    pub fn load_board(&self, id: &str) -> Result<BoardRecord, String> {
        let meta = self
            .conn
            .query_row(
                "SELECT id, name, created_at, updated_at FROM boards WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                    ))
                },
            )
            .map_err(|_| format!("board not found: {id}"))?;

        let data: Vec<u8> = self
            .conn
            .query_row(
                "SELECT data FROM board_data WHERE board_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|_| format!("board data not found: {id}"))?;

        let json =
            zstd::decode_all(data.as_slice()).map_err(|e| format!("corrupt board data: {e}"))?;
        let json = String::from_utf8(json).map_err(|e| e.to_string())?;

        Ok(BoardRecord {
            id: meta.0,
            name: meta.1,
            created_at: meta.2,
            updated_at: meta.3,
            json,
        })
    }

    /// List board metadata. `trash` selects soft-deleted boards; `sort` is
    /// "date" (default, most recent first) or "name" (A→Z).
    pub fn list_boards(&self, trash: bool, sort: &str) -> Result<Vec<BoardMeta>, String> {
        let filter = if trash {
            "deleted_at IS NOT NULL"
        } else {
            "deleted_at IS NULL"
        };
        let order = if sort == "name" {
            "name COLLATE NOCASE ASC"
        } else {
            "updated_at DESC"
        };
        let sql = format!(
            "SELECT id, name, created_at, updated_at, version, object_count, is_favorite, deleted_at
             FROM boards WHERE {filter} ORDER BY {order}"
        );
        let mut stmt = self.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(BoardMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    version: row.get(4)?,
                    object_count: row.get(5)?,
                    is_favorite: row.get::<_, i64>(6)? != 0,
                    deleted_at: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    /// Rename a board (keeps its data).
    pub fn rename_board(&self, id: &str, name: &str) -> Result<(), String> {
        let changed = self
            .conn
            .execute(
                "UPDATE boards SET name = ?2, updated_at = ?3 WHERE id = ?1 AND deleted_at IS NULL",
                params![id, name, chrono_now_ms()],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err(format!("board not found: {id}"));
        }
        Ok(())
    }

    /// Duplicate a board (metadata + compressed data) under a new id.
    pub fn duplicate_board(&self, source_id: &str, new_id: &str, name: &str) -> Result<(), String> {
        let now = chrono_now_ms();
        let changed = self
            .conn
            .execute(
                "INSERT INTO boards (id, workspace_id, name, created_at, updated_at, version, schema_version, object_count, is_favorite)
                 SELECT ?2, workspace_id, ?3, ?4, ?4, version, schema_version, object_count, 0
                 FROM boards WHERE id = ?1",
                params![source_id, new_id, name, now],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err(format!("board not found: {source_id}"));
        }
        let copied = self
            .conn
            .execute(
                "INSERT INTO board_data (board_id, data, data_hash, updated_at)
                 SELECT ?2, data, data_hash, ?3 FROM board_data WHERE board_id = ?1",
                params![source_id, new_id, now],
            )
            .map_err(|e| e.to_string())?;
        if copied == 0 {
            // roll back the metadata if the source had no data row
            let _ = self.conn.execute("DELETE FROM boards WHERE id = ?1", params![new_id]);
            return Err(format!("board data not found: {source_id}"));
        }
        Ok(())
    }

    /// Soft delete: move the board to the trash.
    pub fn delete_board(&self, id: &str) -> Result<(), String> {
        let changed = self
            .conn
            .execute(
                "UPDATE boards SET deleted_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
                params![id, chrono_now_ms()],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err(format!("board not found: {id}"));
        }
        Ok(())
    }

    /// Restore a board from the trash.
    pub fn restore_board(&self, id: &str) -> Result<(), String> {
        let changed = self
            .conn
            .execute(
                "UPDATE boards SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
                params![id, chrono_now_ms()],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err(format!("board not in trash: {id}"));
        }
        Ok(())
    }

    /// Permanently delete a trashed board (data + versions + metadata).
    pub fn purge_board(&self, id: &str) -> Result<(), String> {
        let deleted_at: Option<Option<i64>> = self
            .conn
            .query_row(
                "SELECT deleted_at FROM boards WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|_| format!("board not found: {id}"))?;
        if deleted_at.flatten().is_none() {
            return Err(format!("board is not in trash: {id}"));
        }
        self.conn
            .execute("DELETE FROM board_versions WHERE board_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM board_data WHERE board_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM boards WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Mark/unmark a board as favorite.
    pub fn set_favorite(&self, id: &str, favorite: bool) -> Result<(), String> {
        let changed = self
            .conn
            .execute(
                "UPDATE boards SET is_favorite = ?2 WHERE id = ?1",
                params![id, i64::from(favorite)],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err(format!("board not found: {id}"));
        }
        Ok(())
    }

    // ── M2-03: thumbnails ──

    /// Store the board thumbnail (PNG bytes).
    pub fn set_thumbnail(&self, id: &str, png: &[u8]) -> Result<(), String> {
        let changed = self
            .conn
            .execute(
                "UPDATE boards SET thumbnail = ?2 WHERE id = ?1",
                params![id, png],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err(format!("board not found: {id}"));
        }
        Ok(())
    }

    /// Read the board thumbnail, if any.
    pub fn get_thumbnail(&self, id: &str) -> Result<Option<Vec<u8>>, String> {
        let thumbnail: Option<Option<Vec<u8>>> = self
            .conn
            .query_row(
                "SELECT thumbnail FROM boards WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(other.to_string()),
            })?;
        Ok(thumbnail.flatten())
    }

    // ── M2-04: version history ──

    /// Snapshot the current board data as a new version.
    pub fn create_version(&self, board_id: &str, label: Option<&str>) -> Result<String, String> {
        let data: Vec<u8> = self
            .conn
            .query_row(
                "SELECT data FROM board_data WHERE board_id = ?1",
                params![board_id],
                |row| row.get(0),
            )
            .map_err(|_| format!("board data not found: {board_id}"))?;
        let id = uuid::Uuid::new_v4().to_string();
        self.conn
            .execute(
                "INSERT INTO board_versions (id, board_id, created_at, data, label) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, board_id, chrono_now_ms(), data, label],
            )
            .map_err(|e| e.to_string())?;
        self.trim_versions(board_id)?;
        Ok(id)
    }

    /// Versions of a board, newest first.
    pub fn list_versions(&self, board_id: &str) -> Result<Vec<BoardVersionMeta>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, board_id, created_at, label FROM board_versions
                 WHERE board_id = ?1 ORDER BY created_at DESC, rowid DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![board_id], |row| {
                Ok(BoardVersionMeta {
                    id: row.get(0)?,
                    board_id: row.get(1)?,
                    created_at: row.get(2)?,
                    label: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    /// Restore a version: snapshots the current data first (never destructive).
    pub fn restore_version(&self, board_id: &str, version_id: &str) -> Result<(), String> {
        let data: Vec<u8> = self
            .conn
            .query_row(
                "SELECT data FROM board_versions WHERE id = ?1 AND board_id = ?2",
                params![version_id, board_id],
                |row| row.get(0),
            )
            .map_err(|_| format!("version not found: {version_id}"))?;

        // never destroy: snapshot what is live right now
        self.create_version(board_id, Some("Before restore"))?;

        let json = zstd::decode_all(data.as_slice()).map_err(|e| e.to_string())?;
        let hash = hex(Sha256::digest(&json));
        let now = chrono_now_ms();
        self.conn
            .execute(
                "UPDATE board_data SET data = ?2, data_hash = ?3, updated_at = ?4 WHERE board_id = ?1",
                params![board_id, data, hash, now],
            )
            .map_err(|e| e.to_string())?;
        self.conn
            .execute(
                "UPDATE boards SET updated_at = ?2 WHERE id = ?1",
                params![board_id, now],
            )
            .map_err(|e| e.to_string())?;
        self.trim_versions(board_id)?;
        Ok(())
    }

    /// Retention: 50 newest versions max, none older than 30 days.
    fn trim_versions(&self, board_id: &str) -> Result<(), String> {
        let cutoff = chrono_now_ms() - VERSION_MAX_AGE_MS;
        self.conn
            .execute(
                "DELETE FROM board_versions
                 WHERE board_id = ?1
                   AND (created_at < ?2
                        OR rowid NOT IN (
                            SELECT rowid FROM board_versions
                            WHERE board_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT ?3
                        ))",
                params![board_id, cutoff, MAX_VERSIONS],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn count_objects(json: &str) -> i64 {
    // boards are serialized as { schemaVersion, version, board: { objects: [...] } }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(json) {
        if let Some(objs) = v
            .get("board")
            .and_then(|b| b.get("objects"))
            .and_then(|o| o.as_array())
        {
            return objs.len() as i64;
        }
    }
    0
}

fn hex(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

fn chrono_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_db_path(name: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "inkboard_test_{name}_{}_{}.db",
            std::process::id(),
            chrono_now_ms()
        ));
        path
    }

    fn cleanup(path: &Path) {
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
        }
    }

    fn user_version(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap()
    }

    fn latest_version() -> i64 {
        MIGRATIONS.last().map(|(v, _)| *v).unwrap_or(0)
    }

    /// AppDb with the default workspace and one saved board.
    fn seeded_db() -> AppDb {
        let db = AppDb::new(std::path::Path::new(":memory:")).expect("db");
        db.ensure_default_workspace().expect("workspace");
        db.save_board("b1", "Board", &board_json("b1", "Board"))
            .expect("save");
        db
    }

    fn board_json(id: &str, name: &str) -> String {
        format!(
            r#"{{"schemaVersion":"1.0.0","version":1,"board":{{"id":"{id}","name":"{name}","objects":[{{"id":"a"}}]}}}}"#
        )
    }

    #[test]
    fn count_objects_reads_board_objects() {
        let json = r#"{
            "schemaVersion": "1.0.0",
            "version": 1,
            "board": { "id": "b1", "objects": [{ "id": "a" }, { "id": "b" }] }
        }"#;
        assert_eq!(count_objects(json), 2);
    }

    #[test]
    fn count_objects_is_zero_for_missing_board_objects() {
        assert_eq!(count_objects("{}"), 0);
        assert_eq!(count_objects("not json"), 0);
        // top-level "objects" is not the serialized shape anymore (B15)
        assert_eq!(count_objects(r#"{"objects":[{"id":"a"}]}"#), 0);
        assert_eq!(count_objects(r#"{"board":{"objects":[]}}"#), 0);
    }

    #[test]
    fn save_board_persists_the_object_count() {
        let db = AppDb::new(std::path::Path::new(":memory:")).expect("in-memory db");
        db.ensure_default_workspace().expect("workspace");
        let json = r#"{
            "schemaVersion": "1.0.0",
            "version": 1,
            "board": {
                "id": "b1",
                "name": "Test",
                "objects": [{ "id": "a" }, { "id": "b" }, { "id": "c" }]
            }
        }"#;
        db.save_board("b1", "Test", json).expect("save");
        let list = db.list_boards(false, "date").expect("list");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].object_count, 3);
    }

    // ── M2-01: pragmas ──

    #[test]
    fn connection_pragmas_are_applied() {
        let path = temp_db_path("pragmas");
        let db = AppDb::new(&path).expect("db");
        let mode: String = db
            .conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .unwrap();
        assert_eq!(mode.to_lowercase(), "wal");
        let foreign_keys: i64 = db
            .conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);
        let busy_timeout: i64 = db
            .conn
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        assert_eq!(busy_timeout, BUSY_TIMEOUT_MS);
        drop(db);
        cleanup(&path);
    }

    // ── M2-01: migrations ──

    #[test]
    fn fresh_database_runs_migrations_and_stamps_the_version() {
        let path = temp_db_path("fresh");
        let db = AppDb::new(&path).expect("db");
        assert_eq!(user_version(&db.conn), latest_version());
        let tables: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('boards','board_data','board_versions','workspaces')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 4);
        db.ensure_default_workspace().expect("workspace");
        drop(db);
        cleanup(&path);
    }

    #[test]
    fn legacy_v01_database_is_detected_as_v1_and_keeps_its_data() {
        let path = temp_db_path("legacy");
        // build a v0.1-style DB: schema applied, user_version never stamped
        {
            let conn = Connection::open(&path).expect("raw db");
            conn.execute_batch(include_str!("migrations/001_initial.sql"))
                .expect("initial schema");
            conn.execute(
                "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ('default', 'W', 1, 1)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO boards (id, workspace_id, name, created_at, updated_at, version, schema_version, object_count)
                 VALUES ('b1', 'default', 'Legacy', 1, 2, 1, '1.0.0', 1)",
                [],
            )
            .unwrap();
            let json =
                r#"{"schemaVersion":"1.0.0","version":1,"board":{"id":"b1","name":"Legacy","objects":[{"id":"a"}]}}"#;
            let compressed = zstd::encode_all(json.as_bytes(), 3).unwrap();
            conn.execute(
                "INSERT INTO board_data (board_id, data, data_hash, updated_at) VALUES ('b1', ?1, 'hash', 2)",
                params![compressed],
            )
            .unwrap();
            assert_eq!(user_version(&conn), 0);
        }

        // opening it migrates in place without re-running the initial schema
        let db = AppDb::new(&path).expect("db");
        assert_eq!(user_version(&db.conn), latest_version());
        let boards = db.list_boards(false, "date").expect("list");
        assert_eq!(boards.len(), 1);
        assert_eq!(boards[0].name, "Legacy");
        let record = db.load_board("b1").expect("load");
        assert!(record.json.contains("\"id\":\"a\""));
        db.ensure_default_workspace().expect("workspace");
        // data survives a subsequent save/load cycle
        db.save_board("b1", "Legacy", &record.json).expect("save");
        drop(db);
        cleanup(&path);
    }

    #[test]
    fn migration_002_adds_management_columns() {
        let db = AppDb::new(std::path::Path::new(":memory:")).expect("db");
        assert_eq!(user_version(&db.conn), 2);
        db.ensure_default_workspace().expect("workspace");
        db.save_board("b1", "Board", &board_json("b1", "Board"))
            .expect("save");
        let (favorite, deleted): (i64, Option<i64>) = db
            .conn
            .query_row(
                "SELECT is_favorite, deleted_at FROM boards WHERE id = 'b1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(favorite, 0);
        assert_eq!(deleted, None);
    }

    // ── M2-02: board management ──

    #[test]
    fn rename_board_updates_the_name() {
        let db = seeded_db();
        db.rename_board("b1", "Renamed").expect("rename");
        let boards = db.list_boards(false, "date").expect("list");
        assert_eq!(boards[0].name, "Renamed");
        assert!(db.rename_board("missing", "x").is_err());
    }

    #[test]
    fn duplicate_board_copies_metadata_and_data() {
        let db = seeded_db();
        db.duplicate_board("b1", "b2", "Copy of Board")
            .expect("duplicate");
        let boards = db.list_boards(false, "date").expect("list");
        assert_eq!(boards.len(), 2);
        let copy = boards.iter().find(|b| b.id == "b2").expect("copy");
        assert_eq!(copy.name, "Copy of Board");
        assert_eq!(copy.object_count, 1);
        let record = db.load_board("b2").expect("load copy");
        assert!(record.json.contains("\"id\":\"a\""));
        assert!(db.duplicate_board("missing", "b3", "x").is_err());
    }

    #[test]
    fn delete_and_restore_move_the_board_to_and_from_the_trash() {
        let db = seeded_db();
        db.delete_board("b1").expect("delete");
        assert!(db.list_boards(false, "date").expect("active").is_empty());
        let trash = db.list_boards(true, "date").expect("trash");
        assert_eq!(trash.len(), 1);
        assert!(trash[0].deleted_at.is_some());

        db.restore_board("b1").expect("restore");
        assert_eq!(db.list_boards(false, "date").expect("active").len(), 1);
        assert!(db.list_boards(true, "date").expect("trash").is_empty());
        assert!(db.restore_board("b1").is_err()); // not in trash anymore
    }

    #[test]
    fn purge_board_removes_the_board_and_its_data() {
        let db = seeded_db();
        assert!(db.purge_board("b1").is_err()); // must be trashed first
        db.delete_board("b1").expect("delete");
        db.purge_board("b1").expect("purge");
        assert!(db.list_boards(true, "date").expect("trash").is_empty());
        assert!(db.load_board("b1").is_err());
    }

    #[test]
    fn set_favorite_is_reflected_in_the_listing() {
        let db = seeded_db();
        db.set_favorite("b1", true).expect("favorite");
        let boards = db.list_boards(false, "date").expect("list");
        assert!(boards[0].is_favorite);
        db.set_favorite("b1", false).expect("unfavorite");
        assert!(!db.list_boards(false, "date").expect("list")[0].is_favorite);
        assert!(db.set_favorite("missing", true).is_err());
    }

    #[test]
    fn list_boards_sorts_by_name() {
        let db = AppDb::new(std::path::Path::new(":memory:")).expect("db");
        db.ensure_default_workspace().expect("workspace");
        db.save_board("b1", "Zeta", &board_json("b1", "Zeta"))
            .expect("save");
        db.save_board("b2", "Alpha", &board_json("b2", "Alpha"))
            .expect("save");
        let dates = db.list_boards(false, "date").expect("date");
        let names = db.list_boards(false, "name").expect("name");
        assert_eq!(dates.len(), 2);
        assert_eq!(names[0].name, "Alpha");
        assert_eq!(names[1].name, "Zeta");
    }

    // ── M2-03: thumbnails ──

    #[test]
    fn thumbnail_roundtrip() {
        let db = seeded_db();
        assert_eq!(db.get_thumbnail("b1").unwrap(), None);

        db.set_thumbnail("b1", &[1, 2, 3, 4]).unwrap();
        assert_eq!(db.get_thumbnail("b1").unwrap(), Some(vec![1, 2, 3, 4]));
        assert!(db.set_thumbnail("missing", &[1]).is_err());
    }

    // ── M2-04: version history ──

    fn object_count(json: &str) -> i64 {
        count_objects(json)
    }

    #[test]
    fn versions_snapshot_and_list() {
        let db = seeded_db();
        let v1 = db.create_version("b1", Some("Manual")).unwrap();
        let versions = db.list_versions("b1").unwrap();
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].id, v1);
        assert_eq!(versions[0].label.as_deref(), Some("Manual"));
        assert!(db.create_version("missing", None).is_err());
    }

    #[test]
    fn version_retention_keeps_50_newest_and_drops_old() {
        let db = seeded_db();
        for i in 0..55 {
            db.create_version("b1", Some(&format!("v{i}"))).unwrap();
        }
        let versions = db.list_versions("b1").unwrap();
        assert_eq!(versions.len(), 50);
        assert!(!versions
            .iter()
            .any(|v| v.label.as_deref() == Some("v0")));

        // an ancient version is removed on the next trim
        let ancient = uuid::Uuid::new_v4().to_string();
        db.conn
            .execute(
                "INSERT INTO board_versions (id, board_id, created_at, data, label)
                 VALUES (?1, 'b1', ?2, x'00', 'ancient')",
                params![ancient, chrono_now_ms() - VERSION_MAX_AGE_MS - 1000],
            )
            .unwrap();
        db.create_version("b1", Some("trigger")).unwrap();
        assert!(!db
            .list_versions("b1")
            .unwrap()
            .iter()
            .any(|v| v.label.as_deref() == Some("ancient")));
    }

    #[test]
    fn restore_version_is_non_destructive() {
        let db = seeded_db(); // 1 object
        let v1 = db.create_version("b1", Some("One")).unwrap();

        let json2 = r#"{"schemaVersion":"1.0.0","version":1,"board":{"id":"b1","name":"Board","objects":[{"id":"a"},{"id":"b"}]}}"#;
        db.save_board("b1", "Board", json2).unwrap();
        assert_eq!(object_count(&db.load_board("b1").unwrap().json), 2);

        db.restore_version("b1", &v1).unwrap();
        assert_eq!(object_count(&db.load_board("b1").unwrap().json), 1);

        // the restored version and the "Before restore" snapshot both survive
        let versions = db.list_versions("b1").unwrap();
        assert_eq!(versions.len(), 2);
        assert!(versions.iter().any(|v| v.id == v1));
        assert!(versions
            .iter()
            .any(|v| v.label.as_deref() == Some("Before restore")));
        assert!(db.restore_version("b1", "nope").is_err());
    }
}

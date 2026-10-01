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
const MIGRATIONS: &[(i64, &str)] = &[(1, include_str!("migrations/001_initial.sql"))];

/// busy_timeout used for every connection (ms).
const BUSY_TIMEOUT_MS: i64 = 5_000;

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

    /// List board metadata ordered by most recently updated.
    pub fn list_boards(&self) -> Result<Vec<BoardMeta>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, created_at, updated_at, version, object_count
				 FROM boards ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(BoardMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    version: row.get(4)?,
                    object_count: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
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
        let list = db.list_boards().expect("list");
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
        assert_eq!(user_version(&db.conn), 1);
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
        assert_eq!(user_version(&db.conn), 1);
        let boards = db.list_boards().expect("list");
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
}

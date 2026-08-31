-- Inkboard SQLite schema (implementation_plan.md §16)
-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  settings_json TEXT
);

-- Boards metadata
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  object_count INTEGER NOT NULL DEFAULT 0,
  thumbnail BLOB,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

-- Board data (objects serialized as zstd-compressed JSON)
CREATE TABLE IF NOT EXISTS board_data (
  board_id TEXT PRIMARY KEY REFERENCES boards(id),
  data BLOB NOT NULL,
  data_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Version snapshots for recovery
CREATE TABLE IF NOT EXISTS board_versions (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  created_at INTEGER NOT NULL,
  data BLOB NOT NULL,
  label TEXT
);

CREATE INDEX IF NOT EXISTS idx_board_versions_board_id ON board_versions(board_id, created_at);
CREATE INDEX IF NOT EXISTS idx_boards_workspace ON boards(workspace_id, updated_at);

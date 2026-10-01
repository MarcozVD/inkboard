-- M2-02: board management (soft delete + favorites)
ALTER TABLE boards ADD COLUMN deleted_at INTEGER;
ALTER TABLE boards ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_boards_deleted ON boards(deleted_at);

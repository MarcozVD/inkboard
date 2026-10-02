-- M2-05: content-addressed image assets (sha256)
CREATE TABLE IF NOT EXISTS assets (
  hash TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

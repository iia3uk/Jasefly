-- Synthetic package migration (architecture probe v2)
CREATE TABLE IF NOT EXISTS zed_probe (
  id INTEGER PRIMARY KEY,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zed_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  cover_media_id INTEGER NULL,
  deleted_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stored_files (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  file_name  TEXT NOT NULL,
  mime_type  TEXT,
  size       INTEGER NOT NULL DEFAULT 0,
  data       BYTEA NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

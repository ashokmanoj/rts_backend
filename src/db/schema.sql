-- ================================================================
-- RTS Database Schema  (v2 — 3-step approval + DeptHOD role)
-- Run once:  psql -U postgres -d rts_db -f src/db/schema.sql
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  emp_id        VARCHAR(20) UNIQUE NOT NULL,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('Employee','RM','HOD','DeptHOD','Admin')),
  dept          VARCHAR(50)  NOT NULL,
  designation   VARCHAR(100),
  location      VARCHAR(100),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requests (
  id               SERIAL       PRIMARY KEY,
  emp_id           VARCHAR(20)  NOT NULL REFERENCES users(emp_id),
  purpose          VARCHAR(255) NOT NULL,
  description      TEXT,
  file_url         TEXT,
  file_name        TEXT,
  dept             VARCHAR(50)  NOT NULL,
  assigned_dept    VARCHAR(50)  NOT NULL,
  -- Step 1: RM
  rm_status        VARCHAR(20)  DEFAULT '--'  CHECK (rm_status  IN ('--','Approved','Rejected','Checking','Forwarded')),
  rm_date          TIMESTAMPTZ,
  -- Step 2: HOD
  hod_status       VARCHAR(20)  DEFAULT '--'  CHECK (hod_status IN ('--','Approved','Rejected','Checking','Forwarded')),
  hod_date         TIMESTAMPTZ,
  -- Step 3: DeptHOD (assigned department head)
  dept_hod_status  VARCHAR(20)  DEFAULT '--'  CHECK (dept_hod_status IN ('--','Approved','Rejected','Checking','Forwarded')),
  dept_hod_date    TIMESTAMPTZ,
  -- Forwarding
  forwarded        BOOLEAN      DEFAULT FALSE,
  forwarded_by     VARCHAR(100),
  forwarded_at     TIMESTAMPTZ,
  -- Closure
  assigned_status  VARCHAR(100) DEFAULT 'Open',
  is_closed        BOOLEAN      DEFAULT FALSE,
  resolved_date    DATE,
  resolved_by      VARCHAR(100) DEFAULT '-',
  seen             BOOLEAN      DEFAULT TRUE,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Chat Messages ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id            SERIAL       PRIMARY KEY,
  request_id    INTEGER      NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  author        VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL,
  type          VARCHAR(20)  NOT NULL CHECK (type IN ('message','file','voice','mixed','approval','system')),
  text          TEXT         DEFAULT '',
  file_url      TEXT,
  file_name     TEXT,
  is_image      BOOLEAN      DEFAULT FALSE,
  voice_url     TEXT,
  duration      VARCHAR(20),
  status        VARCHAR(20),
  purpose       VARCHAR(255),
  changed_dept  VARCHAR(50),
  original_dept VARCHAR(50),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_requests_emp_id       ON requests(emp_id);
CREATE INDEX IF NOT EXISTS idx_requests_assigned_dept ON requests(assigned_dept);
CREATE INDEX IF NOT EXISTS idx_chat_request_id       ON chat_messages(request_id);
CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);

-- ── Alter existing tables if columns missing (safe re-run) ────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='requests' AND column_name='dept_hod_status') THEN
    ALTER TABLE requests ADD COLUMN dept_hod_status VARCHAR(20) DEFAULT '--';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='requests' AND column_name='dept_hod_date') THEN
    ALTER TABLE requests ADD COLUMN dept_hod_date TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='requests' AND column_name='is_closed') THEN
    ALTER TABLE requests ADD COLUMN is_closed BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
    NULL;
  END IF;
END $$;

-- Allow DeptHOD in existing role check (safe if already correct)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Employee','RM','HOD','DeptHOD','Admin'));

-- Allow 'system' in chat type
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_type_check
  CHECK (type IN ('message','file','voice','mixed','approval','system'));
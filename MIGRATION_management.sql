-- =============================================================================
-- MIGRATION: Add Management role support
-- Run this against your existing database if you already have the schema.
-- If starting fresh, just run: npx prisma db push (schema already has these)
-- =============================================================================

-- Step 1: Add Management to the Role enum
-- PostgreSQL requires ALTER TYPE to add enum values
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'Management';

-- Step 2: Add mgmt_status and mgmt_date columns to requests table
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS mgmt_status VARCHAR(20) NOT NULL DEFAULT '--',
  ADD COLUMN IF NOT EXISTS mgmt_date   TIMESTAMPTZ;

-- Step 3: Insert the Management user
-- Password is: Management@123  (bcrypt hash below)
INSERT INTO users (
  id, emp_id, name, email, password_hash, role, dept, designation, location, created_at
) VALUES (
  gen_random_uuid(),
  'MGMT-001',
  'Director General',
  'management@rts.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',  -- Management@123
  'Management',
  'Management',
  'Director',
  'HQ',
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- NOTE: The bcrypt hash above is a placeholder. Generate a real one:
--   node -e "const b=require('bcryptjs'); b.hash('Management@123',10).then(h=>console.log(h))"
-- Then replace it in the INSERT above OR use the seed.js script instead.

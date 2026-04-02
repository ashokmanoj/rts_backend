-- =============================================================================
-- MIGRATION: Rename role 'Employee' → 'Requestor' in users table
-- Run this ONLY if your database already has users with role = 'Employee'
-- =============================================================================

-- Step 1: Drop the old enum constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Step 2: Update existing Employee records to Requestor
UPDATE users SET role = 'Requestor' WHERE role = 'Employee';

-- Step 3: Re-add the constraint with Requestor (Prisma will handle this via db push)
-- Just run: npx prisma db push   after applying this SQL

-- =============================================================================

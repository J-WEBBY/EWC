-- =====================================================
-- FIX: Re-seed University of Oldbury with clean state
-- =====================================================

-- Delete existing tenant and related data (CASCADE will handle related records)
DELETE FROM tenants WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;

-- Delete activation key if exists
DELETE FROM activation_keys WHERE key_code = 'JWEBLY-DEMO-2026';

-- Now re-run the full migration 004
-- Copy the ENTIRE contents of: database/migrations/004_seed_university_oldbury.sql below this line
-- (Or run this file first, then run 004_seed_university_oldbury.sql)

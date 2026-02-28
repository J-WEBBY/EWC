-- =============================================================================
-- Migration 015: Add/reset a login user
-- Run this in Supabase SQL Editor AFTER migrations 012 → 013 → 014
--
-- Creates (or resets) a user you can log in with immediately:
--   Email:    joe@edgbastonwellness.co.uk
--   Password: Clinic2026!
-- =============================================================================

-- Ensure the system_admin role exists (it should from 014, but guard anyway)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE slug = 'system_admin') THEN
    RAISE EXCEPTION 'roles table is empty — run migration 014 first';
  END IF;
END $$;

-- Upsert user — inserts fresh or resets password if email already exists
INSERT INTO users (
  email,
  first_name,
  last_name,
  display_name,
  job_title,
  password_hash,
  temp_password_hash,
  must_change_password,
  status,
  is_admin,
  staff_onboarding_completed,
  staff_onboarding_completed_at,
  role_id
) VALUES (
  'joe@edgbastonwellness.co.uk',
  'Joe',
  'Administrator',
  'Joe Admin',
  'System Administrator',
  crypt('Clinic2026!', gen_salt('bf', 10)),
  NULL,
  FALSE,
  'active',
  TRUE,
  TRUE,
  NOW(),
  (SELECT id FROM roles WHERE slug = 'system_admin')
)
ON CONFLICT (email) DO UPDATE SET
  password_hash         = crypt('Clinic2026!', gen_salt('bf', 10)),
  temp_password_hash    = NULL,
  must_change_password  = FALSE,
  status                = 'active',
  is_admin              = TRUE,
  staff_onboarding_completed = TRUE;

-- Confirm
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM users WHERE email = 'joe@edgbastonwellness.co.uk';
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'User was not created';
  END IF;
  RAISE NOTICE '✓ User ready: joe@edgbastonwellness.co.uk / Clinic2026!';
  RAISE NOTICE '  id: %', v_id;
END $$;

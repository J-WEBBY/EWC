-- =============================================================================
-- Migration 018: EWC Staff Accounts
-- Creates login accounts for Dr Joseph Enemuwe and Dr Arry Angad
-- Password: Welcome2026! (both must change on first login)
-- =============================================================================

-- Ensure roles exist (from 014 seed)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE slug = 'clinic_director') THEN
    RAISE EXCEPTION 'Run migration 014 first — roles not found';
  END IF;
END $$;

-- =============================================================================
-- DR JOSEPH ENEMUWE — Clinic Director / Lead Practitioner
-- =============================================================================

INSERT INTO users (
  email,
  first_name,
  last_name,
  display_name,
  job_title,
  password_hash,
  must_change_password,
  status,
  is_admin,
  staff_onboarding_completed,
  staff_onboarding_completed_at,
  role_id
) VALUES (
  'j.enemuwe@edgbastonwellness.co.uk',
  'Joseph',
  'Enemuwe',
  'Dr Joseph Enemuwe',
  'Medical Director',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE,   -- must change password on first login
  'active',
  TRUE,
  TRUE,
  NOW(),
  (SELECT id FROM roles WHERE slug = 'clinic_director')
)
ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- DR ARRY ANGAD — Senior Clinician
-- =============================================================================

INSERT INTO users (
  email,
  first_name,
  last_name,
  display_name,
  job_title,
  password_hash,
  must_change_password,
  status,
  is_admin,
  staff_onboarding_completed,
  staff_onboarding_completed_at,
  role_id
) VALUES (
  'a.angad@edgbastonwellness.co.uk',
  'Aria',
  'Angad',
  'Dr Arry Angad',
  'Senior Clinician',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE,   -- must change password on first login
  'active',
  FALSE,
  TRUE,
  NOW(),
  (SELECT id FROM roles WHERE slug = 'senior_clinician')
)
ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- CONFIRM
-- =============================================================================

DO $$
DECLARE
  v_joseph TEXT;
  v_arry   TEXT;
BEGIN
  SELECT email INTO v_joseph FROM users WHERE email = 'j.enemuwe@edgbastonwellness.co.uk';
  SELECT email INTO v_arry   FROM users WHERE email = 'a.angad@edgbastonwellness.co.uk';

  RAISE NOTICE '✓ Migration 018 complete';
  RAISE NOTICE '✓ Dr Joseph Enemuwe: % (Clinic Director, must change password)', COALESCE(v_joseph, 'ALREADY EXISTS');
  RAISE NOTICE '✓ Dr Arry Angad:     % (Senior Clinician, must change password)', COALESCE(v_arry, 'ALREADY EXISTS');
  RAISE NOTICE '  → Temporary password for both: Welcome2026!';
END $$;

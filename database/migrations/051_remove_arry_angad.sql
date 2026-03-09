-- =============================================================================
-- Migration 051: Remove Arry Angad from practitioner and user lists
--
-- Dr Arry Angad is no longer a practitioner at Edgbaston Wellness Clinic.
-- This migration soft-deletes him by setting is_active = false everywhere
-- so he disappears from all UI dropdowns and lists but records are preserved.
-- =============================================================================

-- 1. Deactivate from cliniko_practitioners (synced from Cliniko API)
UPDATE cliniko_practitioners
SET    is_active = FALSE
WHERE  LOWER(first_name) LIKE '%arry%'
   OR  LOWER(last_name)  LIKE '%angad%'
   OR  LOWER(email)      LIKE '%angad%';

-- 2. Deactivate from users table (login account)
UPDATE users
SET    is_active = FALSE
WHERE  LOWER(email)        LIKE '%angad%'
   OR  LOWER(display_name) LIKE '%arry angad%';

-- 3. Verify
DO $$
DECLARE
  pract_count INT;
  user_count  INT;
BEGIN
  SELECT COUNT(*) INTO pract_count
  FROM cliniko_practitioners
  WHERE is_active = FALSE
    AND (LOWER(first_name) LIKE '%arry%' OR LOWER(last_name) LIKE '%angad%');

  SELECT COUNT(*) INTO user_count
  FROM users
  WHERE is_active = FALSE
    AND LOWER(email) LIKE '%angad%';

  RAISE NOTICE '✓ Migration 051 complete — % practitioner record(s), % user record(s) deactivated for Arry Angad', pract_count, user_count;
END $$;

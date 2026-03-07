-- =============================================================================
-- Migration 049: Backfill cliniko_patient_id + appointment_type from raw_data
--
-- WHY: The original full sync stored raw Cliniko API responses in raw_data JSONB
-- but the sync code did not extract cliniko_patient_id or appointment_type into
-- their dedicated columns (confirmed by debug: 21,621 rows, all patient_id=null).
--
-- FIX (no Cliniko API calls needed):
--   1. cliniko_patient_id — extract numeric ID from patient.links.self URL stored
--      in raw_data. Uses regexp_replace on the URL string. O(n) single UPDATE.
--   2. appointment_type   — extract from raw_data->>'appointment_type_name'
--      (individual_appointments endpoint) or raw_data->'appointment_type'->>'name'
--      (appointments endpoint). Covers both possible sync origins.
--
-- SAFE TO RE-RUN: Only updates rows where the target column IS NULL.
-- =============================================================================

BEGIN;

-- ─── 1. Backfill cliniko_patient_id ──────────────────────────────────────────
-- Extracts the numeric ID from the Cliniko patient self-link URL.
-- Example: "https://api.uk1.cliniko.com/v1/patients/1234567890" → "1234567890"
-- Only updates rows where:
--   - cliniko_patient_id is currently NULL (so we don't overwrite valid data)
--   - the patient link exists in raw_data and ends with digits

UPDATE cliniko_appointments
SET cliniko_patient_id = regexp_replace(
  raw_data->'patient'->'links'->>'self',
  '^.*/(\d+)$',
  '\1'
)
WHERE cliniko_patient_id IS NULL
  AND raw_data->'patient'->'links'->>'self' IS NOT NULL
  AND raw_data->'patient'->'links'->>'self' ~ '/\d+$';

-- ─── 2. Backfill appointment_type ────────────────────────────────────────────
-- Try two paths depending on which Cliniko endpoint populated raw_data:
--   Path A: raw_data->>'appointment_type_name'   (from /individual_appointments)
--   Path B: raw_data->'appointment_type'->>'name' (from /appointments)
-- COALESCE picks the first non-empty value.

UPDATE cliniko_appointments
SET appointment_type = COALESCE(
  NULLIF(TRIM(raw_data->>'appointment_type_name'),         ''),
  NULLIF(TRIM(raw_data->'appointment_type'->>'name'),      '')
)
WHERE appointment_type IS NULL
  AND COALESCE(
        NULLIF(TRIM(raw_data->>'appointment_type_name'),         ''),
        NULLIF(TRIM(raw_data->'appointment_type'->>'name'),      '')
      ) IS NOT NULL;

-- ─── 3. Backfill cliniko_practitioner_id (same pattern, belt-and-suspenders) ─
-- In case any rows also have null practitioner_id despite having the link.

UPDATE cliniko_appointments
SET cliniko_practitioner_id = regexp_replace(
  raw_data->'practitioner'->'links'->>'self',
  '^.*/(\d+)$',
  '\1'
)
WHERE cliniko_practitioner_id IS NULL
  AND raw_data->'practitioner'->'links'->>'self' IS NOT NULL
  AND raw_data->'practitioner'->'links'->>'self' ~ '/\d+$';

-- ─── 4. Verify ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  total_appts       BIGINT;
  with_patient_id   BIGINT;
  with_appt_type    BIGINT;
  null_patient_id   BIGINT;
  null_appt_type    BIGINT;
BEGIN
  SELECT COUNT(*)                                        INTO total_appts      FROM cliniko_appointments;
  SELECT COUNT(*) FILTER (WHERE cliniko_patient_id IS NOT NULL) INTO with_patient_id FROM cliniko_appointments;
  SELECT COUNT(*) FILTER (WHERE appointment_type    IS NOT NULL) INTO with_appt_type  FROM cliniko_appointments;
  SELECT COUNT(*) FILTER (WHERE cliniko_patient_id IS NULL)     INTO null_patient_id  FROM cliniko_appointments;
  SELECT COUNT(*) FILTER (WHERE appointment_type    IS NULL)    INTO null_appt_type   FROM cliniko_appointments;

  RAISE NOTICE '✓ Migration 049 complete';
  RAISE NOTICE '  Total appointments:             %', total_appts;
  RAISE NOTICE '  With cliniko_patient_id:        % (still null: %)', with_patient_id, null_patient_id;
  RAISE NOTICE '  With appointment_type:          % (still null: %)', with_appt_type, null_appt_type;
  RAISE NOTICE '';
  RAISE NOTICE '  Remaining nulls are appointments with no patient (blocked time,';
  RAISE NOTICE '  admin appointments, group sessions without individual patient links).';
END $$;

COMMIT;

-- =============================================================================
-- Migration 048: Fix Cliniko ID column types (BIGINT → TEXT)
--
-- WHY: Cliniko IDs are large integers (up to 18 digits) returned from the API
-- as strings. All sync code stores them as TEXT. The original schema used BIGINT
-- which can cause type mismatch issues on upsert + JOIN queries.
-- Converting to TEXT ensures exact string match throughout the pipeline.
--
-- ALSO:
--   - Drops + recreates FK constraints (BIGINT refs → TEXT refs)
--   - Ensures cliniko_appointments.cliniko_practitioner_id is TEXT (migration 017
--     added it as BIGINT; migration 040 tried to add it as TEXT but was skipped)
--   - Removes the BIGINT unique constraint and adds TEXT unique constraint
--
-- SAFE TO RUN MULTIPLE TIMES (uses ALTER COLUMN TYPE ... USING ... which is
-- idempotent when the column is already TEXT).
-- =============================================================================

BEGIN;

-- ─── 1. Drop foreign key constraints that reference BIGINT cliniko_id cols ────

ALTER TABLE cliniko_appointments
  DROP CONSTRAINT IF EXISTS cliniko_appointments_cliniko_patient_id_fkey;

ALTER TABLE cliniko_invoices
  DROP CONSTRAINT IF EXISTS cliniko_invoices_cliniko_patient_id_fkey;

-- ─── 2. Drop dependent indexes ────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_cliniko_appts_patient;
DROP INDEX IF EXISTS idx_cliniko_appts_practitioner;
DROP INDEX IF EXISTS idx_cliniko_appointments_practitioner_id;
DROP INDEX IF EXISTS idx_cliniko_invoices_patient;

-- ─── 3. cliniko_patients.cliniko_id: BIGINT → TEXT ───────────────────────────

ALTER TABLE cliniko_patients
  ALTER COLUMN cliniko_id TYPE TEXT USING cliniko_id::TEXT;

-- ─── 4. cliniko_practitioners.cliniko_id: BIGINT → TEXT ─────────────────────

ALTER TABLE cliniko_practitioners
  ALTER COLUMN cliniko_id TYPE TEXT USING cliniko_id::TEXT;

-- ─── 5. cliniko_appointments columns ─────────────────────────────────────────

ALTER TABLE cliniko_appointments
  ALTER COLUMN cliniko_id TYPE TEXT USING cliniko_id::TEXT;

ALTER TABLE cliniko_appointments
  ALTER COLUMN cliniko_patient_id TYPE TEXT USING cliniko_patient_id::TEXT;

-- cliniko_practitioner_id: may already be TEXT (040) or still BIGINT (017)
ALTER TABLE cliniko_appointments
  ALTER COLUMN cliniko_practitioner_id TYPE TEXT USING cliniko_practitioner_id::TEXT;

-- ─── 6. cliniko_invoices columns ─────────────────────────────────────────────

ALTER TABLE cliniko_invoices
  ALTER COLUMN cliniko_id TYPE TEXT USING cliniko_id::TEXT;

ALTER TABLE cliniko_invoices
  ALTER COLUMN cliniko_patient_id TYPE TEXT USING cliniko_patient_id::TEXT;

ALTER TABLE cliniko_invoices
  ALTER COLUMN cliniko_practitioner_id TYPE TEXT USING cliniko_practitioner_id::TEXT;

ALTER TABLE cliniko_invoices
  ALTER COLUMN appointment_cliniko_id TYPE TEXT USING appointment_cliniko_id::TEXT;

-- ─── 7. Recreate FK constraints (now TEXT → TEXT) ─────────────────────────────

ALTER TABLE cliniko_appointments
  ADD CONSTRAINT cliniko_appointments_cliniko_patient_id_fkey
  FOREIGN KEY (cliniko_patient_id)
  REFERENCES cliniko_patients(cliniko_id)
  ON DELETE SET NULL;

ALTER TABLE cliniko_invoices
  ADD CONSTRAINT cliniko_invoices_cliniko_patient_id_fkey
  FOREIGN KEY (cliniko_patient_id)
  REFERENCES cliniko_patients(cliniko_id)
  ON DELETE SET NULL;

-- ─── 8. Recreate indexes ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cliniko_appts_patient
  ON cliniko_appointments(cliniko_patient_id);

CREATE INDEX IF NOT EXISTS idx_cliniko_appts_practitioner
  ON cliniko_appointments(cliniko_practitioner_id)
  WHERE cliniko_practitioner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_patient
  ON cliniko_invoices(cliniko_patient_id);

-- ─── 9. Verify ────────────────────────────────────────────────────────────────

DO $$
DECLARE
  appt_type TEXT;
  pat_type  TEXT;
  prac_type TEXT;
BEGIN
  SELECT data_type INTO appt_type
    FROM information_schema.columns
    WHERE table_name = 'cliniko_appointments' AND column_name = 'cliniko_id';

  SELECT data_type INTO pat_type
    FROM information_schema.columns
    WHERE table_name = 'cliniko_patients' AND column_name = 'cliniko_id';

  SELECT data_type INTO prac_type
    FROM information_schema.columns
    WHERE table_name = 'cliniko_practitioners' AND column_name = 'cliniko_id';

  RAISE NOTICE '✓ Migration 048 complete';
  RAISE NOTICE '  cliniko_appointments.cliniko_id  type: %', appt_type;
  RAISE NOTICE '  cliniko_patients.cliniko_id      type: %', pat_type;
  RAISE NOTICE '  cliniko_practitioners.cliniko_id type: %', prac_type;
END $$;

COMMIT;

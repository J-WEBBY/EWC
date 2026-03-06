-- =============================================================================
-- Migration 042 — Patient Waiting List
-- Single-tenant. No RLS. Run in Supabase SQL editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_waiting_list (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_patient_id   TEXT NOT NULL,       -- links to cliniko_patients.cliniko_id
  patient_name         TEXT NOT NULL,       -- denormalised for quick display
  treatment_type       TEXT NOT NULL,
  preferred_practitioner TEXT,              -- cliniko_id of preferred practitioner
  preferred_date_from  DATE,
  preferred_date_to    DATE,
  preferred_time       TEXT DEFAULT 'any',  -- morning | afternoon | evening | any
  priority             TEXT DEFAULT 'medium', -- high | medium | low
  notes                TEXT,
  status               TEXT DEFAULT 'waiting', -- waiting | offered | confirmed | cancelled
  offered_at           TIMESTAMPTZ,
  confirmed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pwl_patient   ON patient_waiting_list(cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_pwl_status    ON patient_waiting_list(status);
CREATE INDEX IF NOT EXISTS idx_pwl_treatment ON patient_waiting_list(treatment_type);
CREATE INDEX IF NOT EXISTS idx_pwl_created   ON patient_waiting_list(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_pwl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pwl_updated_at ON patient_waiting_list;
CREATE TRIGGER pwl_updated_at
  BEFORE UPDATE ON patient_waiting_list
  FOR EACH ROW EXECUTE FUNCTION update_pwl_updated_at();

DO $$ BEGIN
  RAISE NOTICE '✓ patient_waiting_list created with indexes and trigger.';
END $$;

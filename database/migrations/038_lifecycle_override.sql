-- =============================================================================
-- Migration 038: Patient lifecycle override — staff-settable status
-- Run in Supabase SQL editor
-- =============================================================================

ALTER TABLE cliniko_patients
  ADD COLUMN IF NOT EXISTS lifecycle_override      TEXT
    CHECK (lifecycle_override IN ('existing','lead','new','active','loyal','at_risk','lapsed')),
  ADD COLUMN IF NOT EXISTS lifecycle_manually_set  BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN cliniko_patients.lifecycle_override     IS 'Staff-set status override. NULL = use computed lifecycle.';
COMMENT ON COLUMN cliniko_patients.lifecycle_manually_set IS 'true = lifecycle_override is active and should not be auto-reset.';

CREATE INDEX IF NOT EXISTS idx_cliniko_patients_lifecycle_override
  ON cliniko_patients(lifecycle_override)
  WHERE lifecycle_override IS NOT NULL;

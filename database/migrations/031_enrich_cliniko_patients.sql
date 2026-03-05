-- =============================================================================
-- Migration 031: Enrich cliniko_patients with full Cliniko profile fields
-- Run in Supabase SQL editor
-- =============================================================================

ALTER TABLE cliniko_patients
  ADD COLUMN IF NOT EXISTS occupation          TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact   TEXT,
  ADD COLUMN IF NOT EXISTS all_phones          JSONB NOT NULL DEFAULT '[]';

-- Index on occupation for staff search (e.g. "find all patients who are nurses")
CREATE INDEX IF NOT EXISTS idx_cliniko_patients_occupation ON cliniko_patients(occupation)
  WHERE occupation IS NOT NULL;

-- Backfill from raw_data for any patients already synced
UPDATE cliniko_patients
SET
  occupation        = raw_data->>'occupation',
  emergency_contact = raw_data->>'emergency_contact',
  all_phones        = COALESCE(raw_data->'phone_numbers', '[]'::jsonb)
WHERE raw_data IS NOT NULL
  AND raw_data != '{}'::jsonb
  AND (occupation IS NULL OR emergency_contact IS NULL);

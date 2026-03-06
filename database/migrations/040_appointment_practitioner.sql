-- =============================================================================
-- Migration 040: Add cliniko_practitioner_id to cliniko_appointments
-- Enables practitioner-filtered queries and team schedule views.
-- Run in Supabase SQL editor.
-- =============================================================================

ALTER TABLE cliniko_appointments
  ADD COLUMN IF NOT EXISTS cliniko_practitioner_id TEXT;

CREATE INDEX IF NOT EXISTS idx_cliniko_appointments_practitioner_id
  ON cliniko_appointments(cliniko_practitioner_id)
  WHERE cliniko_practitioner_id IS NOT NULL;

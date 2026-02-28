-- =============================================================================
-- Migration 024 — Cliniko missing tables
-- Adds: cliniko_practitioners, cliniko_invoices
-- Adds: users.cliniko_practitioner_id/name, cliniko_config.sync_interval_minutes
-- Run in Supabase SQL editor AFTER 013_wellness_schema.sql
-- =============================================================================

-- =============================================================================
-- CLINIKO PRACTITIONERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_practitioners (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_id      BIGINT      UNIQUE NOT NULL,
  first_name      TEXT        NOT NULL,
  last_name       TEXT        NOT NULL,
  title           TEXT,
  designation     TEXT,
  email           TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  last_synced_at  TIMESTAMPTZ,
  raw_data        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliniko_practitioners_active
  ON cliniko_practitioners(is_active);

-- =============================================================================
-- CLINIKO INVOICES
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_invoices (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_id             BIGINT      UNIQUE NOT NULL,
  cliniko_patient_id     BIGINT      REFERENCES cliniko_patients(cliniko_id) ON DELETE SET NULL,
  cliniko_practitioner_id BIGINT,
  appointment_cliniko_id BIGINT,
  invoice_number         TEXT,
  issue_date             DATE,
  due_date               DATE,
  -- status values from Cliniko: draft, awaiting_payment, paid, cancelled, written_off
  status                 TEXT        NOT NULL DEFAULT 'draft',
  amount                 NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_outstanding     NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid            NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency               TEXT        NOT NULL DEFAULT 'GBP',
  notes                  TEXT,
  created_in_cliniko_at  TIMESTAMPTZ,
  updated_in_cliniko_at  TIMESTAMPTZ,
  last_synced_at         TIMESTAMPTZ,
  raw_data               JSONB       NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_patient
  ON cliniko_invoices(cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_status
  ON cliniko_invoices(status);
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_outstanding
  ON cliniko_invoices(amount_outstanding)
  WHERE amount_outstanding > 0;
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_issue_date
  ON cliniko_invoices(issue_date DESC);

-- =============================================================================
-- EXTEND cliniko_config
-- =============================================================================

ALTER TABLE cliniko_config
  ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER NOT NULL DEFAULT 5;

-- =============================================================================
-- EXTEND users — Cliniko practitioner mapping
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cliniko_practitioner_id   TEXT,
  ADD COLUMN IF NOT EXISTS cliniko_practitioner_name TEXT;

-- =============================================================================
-- AUTO-UPDATE TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_cliniko_practitioners_updated_at ON cliniko_practitioners;
CREATE TRIGGER trg_cliniko_practitioners_updated_at
  BEFORE UPDATE ON cliniko_practitioners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cliniko_invoices_updated_at ON cliniko_invoices;
CREATE TRIGGER trg_cliniko_invoices_updated_at
  BEFORE UPDATE ON cliniko_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DO $$ BEGIN
  RAISE NOTICE '✓ Migration 024 complete';
  RAISE NOTICE '✓ Tables: cliniko_practitioners, cliniko_invoices';
  RAISE NOTICE '✓ Columns: cliniko_config.sync_interval_minutes, users.cliniko_practitioner_id/name';
END $$;

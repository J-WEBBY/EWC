-- =============================================================================
-- Migration 017: Cliniko Integration — Full Schema
-- Adds: cliniko_practitioners, cliniko_invoices
-- Extends: cliniko_appointments (practitioner_id), users (cliniko_practitioner_id)
-- Two practitioners: Dr Joseph Enemuwe, Dr Arry Angad
-- =============================================================================

-- =============================================================================
-- PRACTITIONERS (cached from Cliniko API)
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_practitioners (
  id                    UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliniko_id            BIGINT  UNIQUE NOT NULL,
  first_name            TEXT,
  last_name             TEXT,
  title                 TEXT,
  designation           TEXT,
  email                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  appointment_types     JSONB   NOT NULL DEFAULT '[]',
  raw_data              JSONB   NOT NULL DEFAULT '{}',
  last_synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INVOICES (cached from Cliniko API)
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_invoices (
  id                      UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliniko_id              BIGINT  UNIQUE NOT NULL,
  cliniko_patient_id      BIGINT  REFERENCES cliniko_patients(cliniko_id) ON DELETE SET NULL,
  cliniko_practitioner_id BIGINT,
  appointment_cliniko_id  BIGINT,
  invoice_number          TEXT,
  issue_date              DATE,
  due_date                DATE,
  status                  TEXT,     -- 'draft', 'issued', 'paid', 'overdue', 'cancelled'
  amount                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_outstanding      NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid             NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency                TEXT    NOT NULL DEFAULT 'GBP',
  notes                   TEXT,
  created_in_cliniko_at   TIMESTAMPTZ,
  updated_in_cliniko_at   TIMESTAMPTZ,
  last_synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data                JSONB   NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_patient      ON cliniko_invoices(cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_status       ON cliniko_invoices(status);
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_outstanding  ON cliniko_invoices(amount_outstanding) WHERE amount_outstanding > 0;
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_issue_date   ON cliniko_invoices(issue_date DESC);

-- =============================================================================
-- EXTEND cliniko_appointments — add practitioner foreign key
-- =============================================================================

ALTER TABLE cliniko_appointments
  ADD COLUMN IF NOT EXISTS cliniko_practitioner_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_cliniko_appts_practitioner
  ON cliniko_appointments(cliniko_practitioner_id);

-- =============================================================================
-- EXTEND users — map EWC staff to Cliniko practitioners
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cliniko_practitioner_id   TEXT,
  ADD COLUMN IF NOT EXISTS cliniko_practitioner_name TEXT;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER trg_cliniko_invoices_updated_at
  BEFORE UPDATE ON cliniko_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- CONFIRM
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '✓ Migration 017 complete';
  RAISE NOTICE '✓ cliniko_practitioners table created';
  RAISE NOTICE '✓ cliniko_invoices table created (GBP, outstanding index)';
  RAISE NOTICE '✓ cliniko_appointments.cliniko_practitioner_id added';
  RAISE NOTICE '✓ users.cliniko_practitioner_id + cliniko_practitioner_name added';
  RAISE NOTICE '  → Ready for: Dr Joseph Enemuwe + Dr Arry Angad';
END $$;

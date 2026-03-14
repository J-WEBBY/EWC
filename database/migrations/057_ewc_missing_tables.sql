-- =============================================================================
-- Migration 057: EWC Missing Tables
--
-- Adds tables that exist in the multi-tenant schema (054) but are absent
-- from the single-tenant EWC schema (056). No tenant_id — single-tenant only.
--
-- Run in Supabase SQL editor AFTER migration 056.
-- =============================================================================

-- =============================================================================
-- CLINIKO: Practitioners
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_practitioners (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_id      TEXT        NOT NULL UNIQUE,
  first_name      TEXT        NOT NULL DEFAULT '',
  last_name       TEXT        NOT NULL DEFAULT '',
  title           TEXT,
  designation     TEXT,
  email           TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  raw_data        JSONB       NOT NULL DEFAULT '{}',
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliniko_practitioners_active ON cliniko_practitioners(is_active);

-- =============================================================================
-- CLINIKO: Patients
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_patients (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_id            TEXT        NOT NULL UNIQUE,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  date_of_birth         DATE,
  gender                TEXT,
  address               JSONB       NOT NULL DEFAULT '{}',
  occupation            TEXT,
  emergency_contact     TEXT,
  all_phones            JSONB       NOT NULL DEFAULT '[]',
  notes                 TEXT,
  referral_source       TEXT,
  lifecycle_stage       TEXT        DEFAULT 'existing'
                        CHECK (lifecycle_stage IN ('existing','lead','new','active','loyal','at_risk','lapsed')),
  lifecycle_override    TEXT,
  created_in_cliniko_at TIMESTAMPTZ,
  updated_in_cliniko_at TIMESTAMPTZ,
  last_synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data              JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliniko_patients_email     ON cliniko_patients(email);
CREATE INDEX IF NOT EXISTS idx_cliniko_patients_last_name ON cliniko_patients(last_name);
CREATE INDEX IF NOT EXISTS idx_cliniko_patients_phone     ON cliniko_patients(phone);
CREATE INDEX IF NOT EXISTS idx_cliniko_patients_lifecycle ON cliniko_patients(lifecycle_stage);

-- =============================================================================
-- CLINIKO: Appointments
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_appointments (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_id               TEXT        NOT NULL UNIQUE,
  cliniko_patient_id       TEXT,
  cliniko_practitioner_id  TEXT,
  appointment_type         TEXT,
  practitioner_name        TEXT,
  starts_at                TIMESTAMPTZ,
  ends_at                  TIMESTAMPTZ,
  duration_minutes         INT,
  status                   TEXT,
  cancellation_reason      TEXT,
  notes                    TEXT,
  invoice_status           TEXT,
  room_name                TEXT,
  last_synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data                 JSONB       NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliniko_appts_starts        ON cliniko_appointments(starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_cliniko_appts_status        ON cliniko_appointments(status);
CREATE INDEX IF NOT EXISTS idx_cliniko_appts_patient       ON cliniko_appointments(cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_appts_practitioner  ON cliniko_appointments(cliniko_practitioner_id);

-- =============================================================================
-- CLINIKO: Invoices
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_invoices (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_id              TEXT          NOT NULL UNIQUE,
  cliniko_patient_id      TEXT,
  cliniko_practitioner_id TEXT,
  appointment_cliniko_id  TEXT,
  invoice_number          TEXT,
  issue_date              DATE,
  due_date                DATE,
  status                  TEXT          NOT NULL DEFAULT 'draft',
  amount                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_outstanding      NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid             NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency                TEXT          NOT NULL DEFAULT 'GBP',
  notes                   TEXT,
  created_in_cliniko_at   TIMESTAMPTZ,
  updated_in_cliniko_at   TIMESTAMPTZ,
  last_synced_at          TIMESTAMPTZ,
  raw_data                JSONB         NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_patient     ON cliniko_invoices(cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_status      ON cliniko_invoices(status);
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_outstanding ON cliniko_invoices(amount_outstanding) WHERE amount_outstanding > 0;
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_issue_date  ON cliniko_invoices(issue_date DESC);

-- =============================================================================
-- CLINIKO: Sync Logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_sync_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type       TEXT        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  records_synced  INT         NOT NULL DEFAULT 0,
  records_failed  INT         NOT NULL DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cliniko_sync_logs_type    ON cliniko_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_cliniko_sync_logs_started ON cliniko_sync_logs(started_at DESC);

-- =============================================================================
-- BOOKING REQUESTS — Komal voice bookings + staff manual bookings
-- =============================================================================

CREATE TABLE IF NOT EXISTS booking_requests (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id               UUID        REFERENCES signals(id) ON DELETE SET NULL,
  caller_name             TEXT,
  caller_phone            TEXT,
  caller_email            TEXT,
  service                 TEXT,
  service_detail          TEXT,
  preferred_date          TEXT,
  preferred_date_iso      DATE,
  preferred_time          TEXT,
  preferred_time_iso      TIME,
  duration_minutes        SMALLINT    DEFAULT 30,
  preferred_practitioner  TEXT,
  practitioner_cliniko_id TEXT,
  practitioner_name       TEXT,
  referral_source         TEXT        CHECK (referral_source IN (
                            'online', 'client_referral', 'practitioner_referral',
                            'social_media', 'walk_in', 'returning', 'other'
                          )),
  referral_name           TEXT,
  vapi_call_id            TEXT,
  call_notes              TEXT,
  call_summary            TEXT,
  status                  TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending', 'confirmed', 'cancelled', 'no_show',
                            'synced_to_cliniko', 'duplicate'
                          )),
  cliniko_patient_id      TEXT,
  cliniko_appointment_id  TEXT,
  cliniko_error           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at            TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_status      ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_booking_requests_caller_phone ON booking_requests(caller_phone);
CREATE INDEX IF NOT EXISTS idx_booking_requests_created     ON booking_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_requests_vapi_call   ON booking_requests(vapi_call_id);

CREATE OR REPLACE FUNCTION update_booking_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_booking_requests_updated_at ON booking_requests;
CREATE TRIGGER trg_booking_requests_updated_at
  BEFORE UPDATE ON booking_requests
  FOR EACH ROW EXECUTE FUNCTION update_booking_requests_updated_at();

-- =============================================================================
-- CALL SESSIONS — Vapi tool-call deduplication (one write per call per tool)
-- =============================================================================

CREATE TABLE IF NOT EXISTS call_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id TEXT        NOT NULL,
  tool_name    TEXT        NOT NULL,
  call_count   INTEGER     NOT NULL DEFAULT 1,
  first_args   JSONB,
  first_result TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vapi_call_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_created ON call_sessions(created_at);

-- Auto-expire old sessions (keep DB clean — 24h retention)
CREATE OR REPLACE FUNCTION delete_old_call_sessions() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM call_sessions WHERE created_at < now() - interval '24 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_call_sessions ON call_sessions;
CREATE TRIGGER trg_clean_call_sessions
  AFTER INSERT ON call_sessions
  EXECUTE FUNCTION delete_old_call_sessions();

-- =============================================================================
-- CALL LOGS — One row per Komal voice call. Powers the Receptionist page.
-- =============================================================================

CREATE TABLE IF NOT EXISTS call_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id        TEXT        UNIQUE,
  caller_name         TEXT,
  caller_phone        TEXT,
  caller_email        TEXT,
  service_requested   TEXT,
  outcome             TEXT        CHECK (outcome IN (
                        'booked', 'lead', 'enquiry',
                        'missed', 'escalated', 'concern', 'info_only'
                      )),
  direction           TEXT        NOT NULL DEFAULT 'inbound'
                      CHECK (direction IN ('inbound', 'outbound', 'web')),
  duration_seconds    INTEGER     DEFAULT 0,
  recording_url       TEXT,
  ended_reason        TEXT,
  call_notes          TEXT,
  call_summary        TEXT,
  transcript          TEXT,
  tools_used          TEXT[],
  agent_consulted     TEXT,
  referral_source     TEXT,
  referral_name       TEXT,
  booking_request_id  UUID        REFERENCES booking_requests(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_created     ON call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_caller_phone ON call_logs(caller_phone);
CREATE INDEX IF NOT EXISTS idx_call_logs_outcome      ON call_logs(outcome);

DO $$ BEGIN RAISE NOTICE '=== Migration 057: EWC Missing Tables — COMPLETE ==='; END $$;

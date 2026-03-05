-- =============================================================================
-- Migration 032: Patient Hub — Treatment Log + Patient Plans
-- Run in Supabase SQL editor
-- =============================================================================

-- =============================================================================
-- TREATMENT LOG
-- Digital treatment record per appointment / procedure visit.
-- Created by staff (practitioner or admin) at point of treatment or shortly after.
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_treatment_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Patient reference
  cliniko_patient_id    TEXT NOT NULL,         -- cliniko_id as text (precision safe)
  cliniko_appointment_id TEXT,                 -- linked appointment if applicable

  -- Core fields
  log_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  appointment_type      TEXT,                  -- e.g. 'Botox — Anti-Wrinkle'
  practitioner_name     TEXT,
  room_name             TEXT,

  -- Clinical detail
  procedures            JSONB NOT NULL DEFAULT '[]',
  -- [{ name: string, product: string, batch: string, units_used: number, area: string, notes: string }]

  products_used         JSONB NOT NULL DEFAULT '[]',
  -- [{ product: string, quantity: string, lot_number: string, expiry: string }]

  pre_care              TEXT,                  -- Instructions given BEFORE treatment
  post_care             TEXT,                  -- Instructions given AFTER treatment
  contraindications     TEXT,                  -- Any noted contraindications
  consent_obtained      BOOLEAN NOT NULL DEFAULT false,
  consent_form_ref      TEXT,                  -- reference to consent form id/URL

  -- Outcome
  outcome               TEXT,                  -- 'excellent', 'good', 'satisfactory', 'needs_review'
  follow_up_required    BOOLEAN NOT NULL DEFAULT false,
  follow_up_notes       TEXT,
  follow_up_date        DATE,

  -- Photos
  photos                JSONB NOT NULL DEFAULT '[]',
  -- [{ url: string, label: string, type: 'before'|'after'|'during', taken_at: string }]

  -- Staff + metadata
  created_by_user_id    UUID,                  -- FK to users (optional)
  created_by_name       TEXT,
  notes                 TEXT,                  -- General free-text notes
  is_draft              BOOLEAN NOT NULL DEFAULT false,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treatment_logs_patient
  ON patient_treatment_logs(cliniko_patient_id);

CREATE INDEX IF NOT EXISTS idx_treatment_logs_date
  ON patient_treatment_logs(log_date DESC);

CREATE INDEX IF NOT EXISTS idx_treatment_logs_appointment
  ON patient_treatment_logs(cliniko_appointment_id)
  WHERE cliniko_appointment_id IS NOT NULL;

-- =============================================================================
-- PATIENT PLANS
-- Practitioner-built structured treatment plans.
-- Each plan has phases, each phase has treatments/goals.
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Patient reference
  cliniko_patient_id    TEXT NOT NULL,

  -- Plan metadata
  title                 TEXT NOT NULL DEFAULT 'Treatment Plan',
  description           TEXT,
  goals                 TEXT,                  -- What the plan aims to achieve

  -- Status
  status                TEXT NOT NULL DEFAULT 'active',
  -- 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled'

  -- Timeline
  start_date            DATE,
  target_end_date       DATE,
  completed_date        DATE,

  -- Phases — structured JSON
  phases                JSONB NOT NULL DEFAULT '[]',
  /*
    [{
      id: string,
      phase_number: number,
      title: string,
      description: string,
      duration_weeks: number,
      start_date: string | null,
      treatments: [{
        name: string,
        frequency: string,     -- e.g. 'Every 4 weeks'
        sessions_planned: number,
        sessions_completed: number,
        product: string,
        notes: string,
      }],
      goals: string,
      status: 'upcoming' | 'active' | 'completed',
    }]
  */

  -- Review / notes
  review_date           DATE,
  review_notes          TEXT,
  practitioner_notes    TEXT,

  -- Created by
  created_by_user_id    UUID,
  created_by_name       TEXT,
  last_modified_by_name TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_plans_patient
  ON patient_plans(cliniko_patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_plans_status
  ON patient_plans(status)
  WHERE status IN ('active', 'draft');

-- =============================================================================
-- UPDATED_AT trigger (reuse pattern)
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_treatment_logs_updated_at ON patient_treatment_logs;
CREATE TRIGGER update_treatment_logs_updated_at
  BEFORE UPDATE ON patient_treatment_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_patient_plans_updated_at ON patient_plans;
CREATE TRIGGER update_patient_plans_updated_at
  BEFORE UPDATE ON patient_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

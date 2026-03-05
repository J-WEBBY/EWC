-- =============================================================================
-- Migration 037: Clinical Additions — Prescriptions, Lab Results, Referrals
-- Extends migration 036 EHR system
-- Single-tenant — no RLS, no tenant_id
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PRESCRIPTIONS
-- Formal medication prescriptions issued by practitioners (differs from
-- clinical_records.medications which is the current active medication list)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_patient_id    TEXT NOT NULL,

  -- Drug details
  drug_name             TEXT NOT NULL,
  drug_generic_name     TEXT,
  drug_class            TEXT,             -- 'antibiotic' | 'analgesic' | 'weight_management' | 'hormone' | 'vitamin' | 'topical' | 'other'
  formulation           TEXT,             -- 'tablet' | 'capsule' | 'injection' | 'topical' | 'liquid'
  strength              TEXT,             -- e.g. '50mg', '1%'
  dose                  TEXT NOT NULL,    -- e.g. '50mg'
  frequency             TEXT NOT NULL,    -- e.g. 'once daily', 'twice daily'
  route                 TEXT DEFAULT 'oral', -- 'oral' | 'topical' | 'injection' | 'sublingual' | 'inhaled'
  quantity              TEXT,             -- e.g. '28 tablets'
  duration              TEXT,             -- e.g. '7 days', '3 months'

  -- Prescription details
  indication            TEXT,             -- why prescribed
  prescriber_name       TEXT NOT NULL,
  prescriber_gmc        TEXT,             -- GMC number
  prescribed_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  start_date            DATE,
  end_date              DATE,

  -- Dispensing
  dispensed_by          TEXT,
  dispensed_date        DATE,
  repeat_allowed        BOOLEAN DEFAULT false,
  repeats_remaining     INT DEFAULT 0,
  last_repeat_date      DATE,

  -- Status
  status                TEXT DEFAULT 'active' CHECK (status IN ('active','completed','stopped','on_hold','cancelled')),
  stopped_reason        TEXT,
  stopped_date          DATE,

  -- Safety
  allergies_checked     BOOLEAN DEFAULT false,
  interactions_checked  BOOLEAN DEFAULT false,
  special_instructions  TEXT,
  patient_counselled    BOOLEAN DEFAULT false,

  -- Notes
  notes                 TEXT,
  created_by            UUID,             -- users.id
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- LAB RESULTS / INVESTIGATIONS
-- Blood tests, urinalysis, imaging, biopsy results, other investigations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_patient_id    TEXT NOT NULL,

  -- Test details
  test_name             TEXT NOT NULL,
  test_category         TEXT,             -- 'blood' | 'urine' | 'imaging' | 'biopsy' | 'swab' | 'other'
  test_code             TEXT,             -- SNOMED/LOINC code (optional)
  panel_name            TEXT,             -- e.g. 'Full Blood Count', 'Liver Function Tests'

  -- Ordering
  ordered_by            TEXT NOT NULL,    -- practitioner name
  ordered_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  lab_name              TEXT,             -- external lab name
  lab_reference         TEXT,             -- lab's own reference number

  -- Results
  result_value          TEXT,             -- raw result value
  result_unit           TEXT,             -- e.g. 'mmol/L', 'g/dL'
  reference_range_low   NUMERIC(10,4),
  reference_range_high  NUMERIC(10,4),
  reference_range_text  TEXT,             -- text range e.g. '<200' or 'Negative'
  flag                  TEXT CHECK (flag IN ('normal','low','high','critical_low','critical_high','abnormal','pending')),

  -- Multiple results in a panel (JSONB)
  panel_results         JSONB DEFAULT '[]'::jsonb, -- [{name, value, unit, range, flag}]

  -- Result date + status
  sample_date           DATE,
  result_date           DATE,
  result_received_at    TIMESTAMPTZ,
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','received','reviewed','actioned','cancelled')),

  -- Review
  reviewed_by           TEXT,
  reviewed_at           TIMESTAMPTZ,
  clinical_notes        TEXT,             -- practitioner interpretation
  action_required       BOOLEAN DEFAULT false,
  action_taken          TEXT,

  -- Files
  report_url            TEXT,             -- Supabase Storage path for PDF report

  created_by            UUID,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- REFERRALS
-- Referrals out to specialists, GPs, hospitals; referrals in from GPs etc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_patient_id    TEXT NOT NULL,

  -- Direction
  direction             TEXT DEFAULT 'out' CHECK (direction IN ('out','in')),

  -- Referral details
  referral_type         TEXT NOT NULL,    -- 'specialist' | 'gp' | 'hospital' | 'physiotherapy' | 'dietitian' | 'mental_health' | 'other'
  specialty             TEXT,             -- e.g. 'Dermatology', 'Neurology'
  urgency               TEXT DEFAULT 'routine' CHECK (urgency IN ('routine','urgent','two_week_wait','emergency')),
  reason                TEXT NOT NULL,    -- clinical reason for referral

  -- Referrer (who made the referral)
  referred_by           TEXT NOT NULL,    -- practitioner name
  referred_date         DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Recipient (who being referred to)
  referred_to_name      TEXT,             -- specialist/clinic name
  referred_to_hospital  TEXT,
  referred_to_address   TEXT,
  referred_to_phone     TEXT,
  referred_to_email     TEXT,

  -- Clinical information
  clinical_summary      TEXT,             -- summary sent with referral
  investigations_included JSONB DEFAULT '[]'::jsonb, -- list of test results included
  medications_included  BOOLEAN DEFAULT true,

  -- Status tracking
  status                TEXT DEFAULT 'sent' CHECK (status IN ('draft','sent','acknowledged','appointment_booked','appointment_attended','completed','rejected','cancelled')),
  sent_date             DATE,
  acknowledged_date     DATE,
  appointment_date      DATE,
  appointment_location  TEXT,
  completed_date        DATE,
  outcome               TEXT,             -- outcome/feedback from specialist
  follow_up_required    BOOLEAN DEFAULT false,
  follow_up_notes       TEXT,

  -- Response letter
  response_received     BOOLEAN DEFAULT false,
  response_date         DATE,
  response_summary      TEXT,
  response_url          TEXT,             -- Supabase Storage path for response letter

  created_by            UUID,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient  ON prescriptions (cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status   ON prescriptions (status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_date     ON prescriptions (prescribed_date DESC);
CREATE INDEX IF NOT EXISTS idx_lab_results_patient    ON lab_results (cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_status     ON lab_results (status);
CREATE INDEX IF NOT EXISTS idx_lab_results_flag       ON lab_results (flag) WHERE flag IN ('critical_low','critical_high','abnormal');
CREATE INDEX IF NOT EXISTS idx_referrals_patient      ON referrals (cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status       ON referrals (status);
CREATE INDEX IF NOT EXISTS idx_referrals_urgency      ON referrals (urgency);

-- ---------------------------------------------------------------------------
-- COMMENTS
-- ---------------------------------------------------------------------------
COMMENT ON TABLE prescriptions IS 'Formal prescriptions issued by clinic practitioners';
COMMENT ON TABLE lab_results   IS 'Lab tests, investigations, imaging results with reference ranges and flags';
COMMENT ON TABLE referrals     IS 'Referrals in/out — tracking from request to specialist response';

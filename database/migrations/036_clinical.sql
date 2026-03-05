-- =============================================================================
-- Migration 036: Clinical EHR / PMS Tables
-- Electronic Health Records + Practice Management System
-- Single-tenant — no RLS, no tenant_id
-- Run in Supabase SQL editor
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CLINICAL RECORDS (master EMR per patient)
-- One row per patient — upserted on every update
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_patient_id    TEXT NOT NULL UNIQUE,   -- FK to cliniko_patients.cliniko_id

  -- Allergies & safety
  allergies             JSONB DEFAULT '[]'::jsonb,    -- [{name, severity, reaction, confirmed_date}]
  contraindications     JSONB DEFAULT '[]'::jsonb,    -- [{name, reason, added_date}]

  -- Active medications
  medications           JSONB DEFAULT '[]'::jsonb,    -- [{name, dose, frequency, prescriber, started}]

  -- Medical history
  medical_conditions    JSONB DEFAULT '[]'::jsonb,    -- [{name, status, diagnosed, notes}]

  -- Vitals (latest reading — full history in vitals_history)
  blood_pressure_sys    INT,
  blood_pressure_dia    INT,
  heart_rate            INT,
  weight_kg             NUMERIC(5,2),
  height_cm             NUMERIC(5,1),
  bmi                   NUMERIC(4,1) GENERATED ALWAYS AS (
                          CASE WHEN height_cm > 0 AND weight_kg > 0
                          THEN ROUND((weight_kg / ((height_cm / 100.0) ^ 2))::numeric, 1)
                          ELSE NULL END
                        ) STORED,

  -- Risk flags (auto + manual)
  risk_flags            JSONB DEFAULT '[]'::jsonb,    -- [{type, severity, message, auto, created_at}]
  overall_risk_level    TEXT DEFAULT 'low' CHECK (overall_risk_level IN ('low','medium','high','critical')),

  -- GP / referral
  gp_name               TEXT,
  gp_practice           TEXT,
  gp_phone              TEXT,
  nhs_number            TEXT,

  -- Treatment preferences
  treatment_notes       TEXT,    -- practitioner-visible general notes
  patient_goals         TEXT,    -- aesthetic/wellness goals as stated by patient

  -- AI-generated fields
  ai_clinical_summary   TEXT,    -- Aria-generated clinical synopsis
  ai_risk_assessment    TEXT,    -- Aria-generated risk narrative
  ai_last_generated_at  TIMESTAMPTZ,

  -- Metadata
  last_reviewed_by      UUID,    -- users.id
  last_reviewed_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- VITALS HISTORY (time-series readings)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vitals_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_patient_id TEXT NOT NULL,

  blood_pressure_sys INT,
  blood_pressure_dia INT,
  heart_rate         INT,
  weight_kg          NUMERIC(5,2),
  height_cm          NUMERIC(5,1),
  temperature_c      NUMERIC(4,1),
  oxygen_sat         NUMERIC(4,1),
  blood_glucose      NUMERIC(5,2),

  recorded_by        UUID,        -- users.id
  recorded_at        TIMESTAMPTZ DEFAULT now(),
  notes              TEXT,
  context            TEXT         -- 'pre_treatment' | 'post_treatment' | 'routine' | 'concern'
);

-- ---------------------------------------------------------------------------
-- SOAP NOTES (clinical consultation notes — HIPAA/CQC aligned)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS soap_notes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_patient_id    TEXT NOT NULL,

  -- Appointment link (optional)
  cliniko_appointment_id TEXT,
  appointment_date       DATE,
  appointment_type       TEXT,

  -- SOAP sections
  subjective            TEXT,    -- Patient's reported symptoms / complaint
  objective             TEXT,    -- Practitioner's clinical observations
  assessment            TEXT,    -- Clinical assessment / diagnosis
  plan                  TEXT,    -- Treatment plan / next steps

  -- Additional clinical fields
  treatment_performed   TEXT,    -- Procedures / treatments carried out
  products_used         JSONB DEFAULT '[]'::jsonb,  -- [{name, batch, expiry, units_used}]
  adverse_events        TEXT,    -- Any adverse reactions observed
  follow_up_required    BOOLEAN DEFAULT false,
  follow_up_date        DATE,
  follow_up_notes       TEXT,

  -- AI draft tracking
  ai_draft_used         BOOLEAN DEFAULT false,
  ai_draft_generated_at TIMESTAMPTZ,

  -- Workflow
  status                TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending_review','signed_off')),
  signed_off_by         UUID,    -- users.id
  signed_off_at         TIMESTAMPTZ,

  -- Metadata
  authored_by           UUID NOT NULL,   -- users.id
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- PATIENT CONSENTS (digital consent management — CQC Section 4 compliant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_consents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_patient_id    TEXT NOT NULL,

  -- Consent details
  consent_type          TEXT NOT NULL,   -- 'treatment' | 'photography' | 'data_processing' | 'marketing' | 'referral' | 'research'
  treatment_name        TEXT,            -- specific treatment this consent covers
  consent_form_version  TEXT DEFAULT '1.0',

  -- Pre-screening / checklist responses
  screening_answers     JSONB DEFAULT '{}'::jsonb,   -- { question_id: answer, ... }
  screening_flags       JSONB DEFAULT '[]'::jsonb,   -- [{question, answer, flag_level, message}]
  has_red_flags         BOOLEAN DEFAULT false,

  -- Consent decision
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','consented','refused','withdrawn','expired')),
  consented_at          TIMESTAMPTZ,
  refused_reason        TEXT,
  withdrawn_at          TIMESTAMPTZ,
  withdrawal_reason     TEXT,

  -- Validity
  valid_from            DATE,
  valid_until           DATE,            -- null = indefinite

  -- Collection method
  collected_via         TEXT DEFAULT 'digital' CHECK (collected_via IN ('digital','paper','verbal','telephone')),
  collected_by          UUID,            -- users.id
  witness_name          TEXT,

  -- Signature (base64 PNG path or storage URL)
  signature_url         TEXT,

  -- AI screening
  ai_screening_notes    TEXT,

  -- CQC metadata
  cqc_reference         TEXT,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- CLINICAL PHOTOS (before/after/progress with consent tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_photos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_patient_id    TEXT NOT NULL,

  -- Storage
  storage_path          TEXT NOT NULL,     -- Supabase Storage path (private bucket)
  thumbnail_path        TEXT,
  file_name             TEXT NOT NULL,
  file_size_bytes       INT,
  mime_type             TEXT DEFAULT 'image/jpeg',

  -- Classification
  photo_type            TEXT DEFAULT 'progress' CHECK (photo_type IN ('before','after','progress','concern','reference')),
  treatment_area        TEXT,              -- 'face' | 'neck' | 'body' | 'full_face' | 'lips' | etc.
  appointment_context   TEXT,             -- appointment type this relates to
  cliniko_appointment_id TEXT,

  -- Pairing (before/after pairs)
  pair_id               UUID,             -- links before + after photos

  -- Consent
  photo_consent_given   BOOLEAN DEFAULT false,
  consent_id            UUID,             -- references patient_consents.id

  -- Clinical annotations
  notes                 TEXT,
  tags                  JSONB DEFAULT '[]'::jsonb,  -- ['botox','forehead','3-month-review']

  -- Visibility
  is_visible_to_patient BOOLEAN DEFAULT false,

  -- Metadata
  taken_by              UUID,             -- users.id
  taken_at              TIMESTAMPTZ DEFAULT now(),
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- TREATMENT PROTOCOLS (reusable clinical checklists per procedure)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS treatment_protocols (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_name  TEXT NOT NULL UNIQUE,
  category        TEXT,   -- 'aesthetics' | 'wellness' | 'medical'

  -- Pre-treatment checklist items
  pre_checklist   JSONB DEFAULT '[]'::jsonb,   -- [{id, question, required, type: 'yesno'|'text'}]

  -- Consent form questions
  consent_questions JSONB DEFAULT '[]'::jsonb, -- [{id, question, flagging_answers: ['yes']}]

  -- Post-treatment instructions
  aftercare_notes TEXT,

  -- Follow-up defaults
  default_follow_up_days INT DEFAULT 28,

  -- Pricing
  base_price_gbp  NUMERIC(8,2),

  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clinical_records_patient  ON clinical_records (cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_history_patient    ON vitals_history (cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_history_recorded   ON vitals_history (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_soap_notes_patient        ON soap_notes (cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_soap_notes_date           ON soap_notes (appointment_date DESC);
CREATE INDEX IF NOT EXISTS idx_soap_notes_status         ON soap_notes (status);
CREATE INDEX IF NOT EXISTS idx_patient_consents_patient  ON patient_consents (cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_status   ON patient_consents (status);
CREATE INDEX IF NOT EXISTS idx_patient_consents_type     ON patient_consents (consent_type);
CREATE INDEX IF NOT EXISTS idx_clinical_photos_patient   ON clinical_photos (cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_photos_pair      ON clinical_photos (pair_id) WHERE pair_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- SEED TREATMENT PROTOCOLS (EWC-specific)
-- ---------------------------------------------------------------------------
INSERT INTO treatment_protocols (treatment_name, category, pre_checklist, consent_questions, aftercare_notes, default_follow_up_days, base_price_gbp) VALUES

('Botulinum Toxin (Botox)', 'aesthetics',
 '[
   {"id":"p1","question":"Are you pregnant or breastfeeding?","required":true,"type":"yesno"},
   {"id":"p2","question":"Any known allergy to botulinum toxin or human albumin?","required":true,"type":"yesno"},
   {"id":"p3","question":"Any neuromuscular disorders (e.g. myasthenia gravis)?","required":true,"type":"yesno"},
   {"id":"p4","question":"Taking aminoglycoside antibiotics or similar?","required":true,"type":"yesno"},
   {"id":"p5","question":"Active skin infection in treatment area?","required":true,"type":"yesno"}
 ]',
 '[
   {"id":"c1","question":"Are you pregnant or breastfeeding?","flagging_answers":["yes"]},
   {"id":"c2","question":"Have you had botulinum toxin in the last 3 months?","flagging_answers":["yes"]},
   {"id":"c3","question":"Do you have a known allergy to any neurotoxin?","flagging_answers":["yes"]},
   {"id":"c4","question":"I understand results are not permanent (3–6 months)","flagging_answers":["no"]},
   {"id":"c5","question":"I consent to photography for clinical records","flagging_answers":[]}
 ]',
 'Avoid touching treated area for 4 hours. No strenuous exercise for 24 hours. No facials or massages for 2 weeks. Contact clinic if severe headache or difficulty swallowing.',
 112, 249.00),

('Dermal Fillers', 'aesthetics',
 '[
   {"id":"p1","question":"Are you pregnant or breastfeeding?","required":true,"type":"yesno"},
   {"id":"p2","question":"Any known allergy to hyaluronic acid or lidocaine?","required":true,"type":"yesno"},
   {"id":"p3","question":"History of cold sores / herpes simplex?","required":true,"type":"yesno"},
   {"id":"p4","question":"On blood thinners (warfarin, aspirin, NSAIDs)?","required":true,"type":"yesno"},
   {"id":"p5","question":"Active infection, inflammation or skin condition in area?","required":true,"type":"yesno"}
 ]',
 '[
   {"id":"c1","question":"Are you pregnant or breastfeeding?","flagging_answers":["yes"]},
   {"id":"c2","question":"Known allergy to hyaluronic acid?","flagging_answers":["yes"]},
   {"id":"c3","question":"Are you taking blood-thinning medication?","flagging_answers":["yes"]},
   {"id":"c4","question":"I understand bruising and swelling are normal","flagging_answers":["no"]},
   {"id":"c5","question":"I consent to photography for clinical records","flagging_answers":[]}
 ]',
 'Avoid heat, sun, alcohol and strenuous exercise for 24 hours. No dental work for 2 weeks. Apply ice if swollen. Expect bruising for 5–10 days. Return immediately if blanching or severe pain.',
 168, 349.00),

('CoolSculpting / Fat Freezing', 'aesthetics',
 '[
   {"id":"p1","question":"Cryoglobulinaemia, cold agglutinin disease or paroxysmal cold haemoglobinuria?","required":true,"type":"yesno"},
   {"id":"p2","question":"Raynaud''s disease or cold sensitivity?","required":true,"type":"yesno"},
   {"id":"p3","question":"Open wounds, scars or dermatitis in treatment area?","required":true,"type":"yesno"},
   {"id":"p4","question":"Hernia or loose skin causing skin sensitivity in area?","required":true,"type":"yesno"},
   {"id":"p5","question":"Are you pregnant?","required":true,"type":"yesno"}
 ]',
 '[
   {"id":"c1","question":"Do you have cold sensitivity or Raynaud''s disease?","flagging_answers":["yes"]},
   {"id":"c2","question":"Any metal implants or plates in the treatment area?","flagging_answers":["yes"]},
   {"id":"c3","question":"I understand results take 8–12 weeks to fully appear","flagging_answers":["no"]},
   {"id":"c4","question":"I consent to photography for clinical records","flagging_answers":[]}
 ]',
 'Redness, bruising, swelling and numbness are normal and resolve in days–weeks. Paradoxical adipose hyperplasia is rare but possible — contact clinic if area becomes larger after 2 months.',
 60, 600.00),

('IV Therapy', 'wellness',
 '[
   {"id":"p1","question":"Any known allergies to vitamins, minerals or IV components?","required":true,"type":"yesno"},
   {"id":"p2","question":"History of kidney disease or heart failure?","required":true,"type":"yesno"},
   {"id":"p3","question":"Glucose-6-phosphate dehydrogenase (G6PD) deficiency?","required":true,"type":"yesno"},
   {"id":"p4","question":"Are you pregnant?","required":true,"type":"yesno"},
   {"id":"p5","question":"Any bleeding disorders or on anticoagulants?","required":true,"type":"yesno"}
 ]',
 '[
   {"id":"c1","question":"Known allergy to any IV component?","flagging_answers":["yes"]},
   {"id":"c2","question":"History of kidney disease or heart failure?","flagging_answers":["yes"]},
   {"id":"c3","question":"Are you pregnant?","flagging_answers":["yes"]},
   {"id":"c4","question":"I consent to IV insertion and understand risks","flagging_answers":["no"]}
 ]',
 'Stay hydrated. Mild bruising at insertion site is normal. Contact clinic if redness, swelling or hardening at site, or if you feel unwell within 24 hours.',
 90, 150.00),

('Weight Management Programme', 'wellness',
 '[
   {"id":"p1","question":"Any eating disorders (past or present)?","required":true,"type":"yesno"},
   {"id":"p2","question":"BMI below 18.5?","required":true,"type":"yesno"},
   {"id":"p3","question":"Thyroid condition or metabolic disorder?","required":true,"type":"yesno"},
   {"id":"p4","question":"On any prescribed medications?","required":true,"type":"yesno"},
   {"id":"p5","question":"Pregnant or planning to become pregnant?","required":true,"type":"yesno"}
 ]',
 '[
   {"id":"c1","question":"Do you have or have had an eating disorder?","flagging_answers":["yes"]},
   {"id":"c2","question":"Are you pregnant or planning pregnancy?","flagging_answers":["yes"]},
   {"id":"c3","question":"I understand this is a clinical programme with regular reviews","flagging_answers":["no"]}
 ]',
 'Follow the personalised nutrition plan provided. Attend all scheduled reviews. Contact clinic if side effects from any prescribed weight management medication.',
 28, 299.00);

-- ---------------------------------------------------------------------------
-- DONE
-- ---------------------------------------------------------------------------
COMMENT ON TABLE clinical_records    IS 'Master EHR record per patient (allergies, medications, vitals, risk)';
COMMENT ON TABLE vitals_history      IS 'Time-series vitals readings for trending';
COMMENT ON TABLE soap_notes          IS 'SOAP consultation notes — CQC/HIPAA aligned';
COMMENT ON TABLE patient_consents    IS 'Digital consent management — CQC Section 4 compliant';
COMMENT ON TABLE clinical_photos     IS 'Before/after/progress photos with consent tracking';
COMMENT ON TABLE treatment_protocols IS 'Reusable pre-screening checklists and consent forms per treatment';

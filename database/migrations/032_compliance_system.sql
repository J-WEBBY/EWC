-- =============================================================================
-- Migration 032: Full Compliance Management System
--
-- Adds 6 tables:
--   1. compliance_hr_records      — per-staff DBS, RTW, appraisal
--   2. compliance_training        — staff × mandatory training module grid
--   3. compliance_equipment       — equipment service & expiry tracking
--   4. compliance_cqc_answers     — CQC audit checklist answers (57 questions)
--   5. compliance_governance_log  — meetings, significant events, LFE
--   6. compliance_calendar        — 35 recurring compliance tasks
--
-- Seeded:
--   - 20 equipment items (EQ001–EQ020)
--   - 57 CQC audit questions (5 domains)
--   - 35 compliance calendar tasks
-- =============================================================================

-- =============================================================================
-- 1. HR RECORDS
-- =============================================================================

CREATE TABLE IF NOT EXISTS compliance_hr_records (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- DBS
  dbs_number            TEXT,
  dbs_issue_date        DATE,
  dbs_expiry_date       DATE,

  -- Right to Work
  rtw_type              TEXT,       -- 'uk_national', 'eu_settled', 'visa', 'na'
  rtw_expiry_date       DATE,       -- null if permanent RTW

  -- Professional Registration (NMC, GMC, HCPC etc.)
  registration_body     TEXT,       -- 'NMC', 'GMC', 'HCPC', 'GDC', 'N/A'
  registration_number   TEXT,
  registration_expiry   DATE,

  -- Appraisals
  last_appraisal_date   DATE,
  next_appraisal_date   DATE,

  -- Sign-off
  staff_signed          BOOLEAN     NOT NULL DEFAULT FALSE,
  manager_signed        BOOLEAN     NOT NULL DEFAULT FALSE,
  documents_uploaded    BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Admin
  notes                 TEXT,
  assigned_by           UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chr_user_id ON compliance_hr_records(user_id);

CREATE OR REPLACE FUNCTION update_chr_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_chr_updated_at
  BEFORE UPDATE ON compliance_hr_records
  FOR EACH ROW EXECUTE FUNCTION update_chr_updated_at();

-- =============================================================================
-- 2. TRAINING MATRIX
-- =============================================================================
-- One row per user × training module. 17 mandatory modules.

CREATE TABLE IF NOT EXISTS compliance_training (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  module            TEXT        NOT NULL CHECK (module IN (
    'fire_safety', 'manual_handling', 'safeguarding_adults', 'safeguarding_children',
    'basic_life_support', 'infection_control', 'information_governance',
    'conflict_resolution', 'equality_diversity', 'mental_capacity_act',
    'medicines_management', 'food_hygiene', 'health_safety', 'coshh',
    'lone_working', 'dementia_awareness', 'cqc_awareness'
  )),

  -- Frequency determines expiry: 12 = annual, 36 = 3-yearly
  frequency_months  INTEGER     NOT NULL DEFAULT 12,

  completed_date    DATE,
  expiry_date       DATE,       -- completed_date + frequency_months
  certificate_url   TEXT,
  notes             TEXT,

  assigned_by       UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_ct_user_id ON compliance_training(user_id);
CREATE INDEX IF NOT EXISTS idx_ct_module  ON compliance_training(module);

CREATE OR REPLACE FUNCTION update_ct_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_ct_updated_at
  BEFORE UPDATE ON compliance_training
  FOR EACH ROW EXECUTE FUNCTION update_ct_updated_at();

-- =============================================================================
-- 3. EQUIPMENT & EXPIRY
-- =============================================================================

CREATE TABLE IF NOT EXISTS compliance_equipment (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code             TEXT        NOT NULL UNIQUE,   -- EQ001, EQ002 …
  name                  TEXT        NOT NULL,
  category              TEXT        NOT NULL CHECK (category IN (
    'pat_testing', 'equipment_service', 'fire_safety',
    'medicines', 'clinical_stock', 'legionella', 'environmental'
  )),
  location              TEXT,
  serial_number         TEXT,

  last_service_date     DATE,
  next_due_date         DATE,
  check_frequency       TEXT        CHECK (check_frequency IN (
    'daily', 'weekly', 'monthly', 'quarterly', 'biannual', 'annual', 'as_needed'
  )),

  responsible_user_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  action_required       TEXT,
  notes                 TEXT,
  assigned_by           UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ce_category   ON compliance_equipment(category);
CREATE INDEX IF NOT EXISTS idx_ce_next_due   ON compliance_equipment(next_due_date);

CREATE OR REPLACE FUNCTION update_ce_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_ce_updated_at
  BEFORE UPDATE ON compliance_equipment
  FOR EACH ROW EXECUTE FUNCTION update_ce_updated_at();

-- =============================================================================
-- 4. CQC AUDIT ANSWERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS compliance_cqc_answers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question_number   INTEGER     NOT NULL UNIQUE,  -- 1–57
  domain            TEXT        NOT NULL CHECK (domain IN (
    'safe', 'effective', 'caring', 'responsive', 'well_led'
  )),
  audit_area        TEXT        NOT NULL,
  question_text     TEXT        NOT NULL,

  answer            TEXT        CHECK (answer IN ('yes', 'no', 'partial', 'na')),
  evidence_notes    TEXT,
  action_required   TEXT,
  target_date       DATE,

  answered_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  audit_date        DATE,
  reviewed_by       UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cqa_domain  ON compliance_cqc_answers(domain);
CREATE INDEX IF NOT EXISTS idx_cqa_answer  ON compliance_cqc_answers(answer);

CREATE OR REPLACE FUNCTION update_cqa_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_cqa_updated_at
  BEFORE UPDATE ON compliance_cqc_answers
  FOR EACH ROW EXECUTE FUNCTION update_cqa_updated_at();

-- =============================================================================
-- 5. GOVERNANCE LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS compliance_governance_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type              TEXT        NOT NULL CHECK (type IN (
    'clinical_governance_meeting', 'significant_event_review', 'staff_meeting',
    'health_safety_meeting', 'learning_from_events', 'quality_improvement_meeting',
    'medicines_management_meeting', 'safeguarding_case_discussion', 'other'
  )),
  event_date        DATE        NOT NULL,
  agenda_items      TEXT,
  attendees         TEXT,
  minutes_uploaded  BOOLEAN     NOT NULL DEFAULT FALSE,
  actions_arising   TEXT,

  owner_id          UUID        REFERENCES users(id) ON DELETE SET NULL,
  due_date          DATE,
  status            TEXT        NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_progress', 'completed', 'overdue'
  )),

  created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cgl_type       ON compliance_governance_log(type);
CREATE INDEX IF NOT EXISTS idx_cgl_status     ON compliance_governance_log(status);
CREATE INDEX IF NOT EXISTS idx_cgl_event_date ON compliance_governance_log(event_date DESC);

CREATE OR REPLACE FUNCTION update_cgl_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_cgl_updated_at
  BEFORE UPDATE ON compliance_governance_log
  FOR EACH ROW EXECUTE FUNCTION update_cgl_updated_at();

-- =============================================================================
-- 6. COMPLIANCE CALENDAR
-- =============================================================================

CREATE TABLE IF NOT EXISTS compliance_calendar (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_order            INTEGER     NOT NULL,
  task_name             TEXT        NOT NULL,
  frequency             TEXT        NOT NULL CHECK (frequency IN (
    'daily', 'weekly', 'monthly', 'quarterly', 'biannual', 'annual', 'as_needed'
  )),
  month_due             TEXT,           -- 'Every month', 'Jan, Apr, Jul, Oct', etc.
  responsible_user_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  last_completed_date   DATE,
  next_due_date         DATE,
  notes                 TEXT,
  assigned_by           UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_next_due  ON compliance_calendar(next_due_date);
CREATE INDEX IF NOT EXISTS idx_cc_order     ON compliance_calendar(task_order);

CREATE OR REPLACE FUNCTION update_cc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_cc_updated_at
  BEFORE UPDATE ON compliance_calendar
  FOR EACH ROW EXECUTE FUNCTION update_cc_updated_at();

-- =============================================================================
-- SEED: EQUIPMENT (20 items)
-- =============================================================================

INSERT INTO compliance_equipment (item_code, name, category, location, check_frequency) VALUES
  ('EQ001', 'All Electrical Equipment — PAT Test',  'pat_testing',       'Whole Clinic',      'annual'),
  ('EQ002', 'Portable Appliances Check',            'pat_testing',       'All Areas',         'annual'),
  ('EQ003', 'Defibrillator (AED)',                  'equipment_service', 'Reception',         'annual'),
  ('EQ004', 'Autoclave / Steriliser',               'equipment_service', 'Treatment Room',    'annual'),
  ('EQ005', 'Hoist / Lifting Equipment',            'equipment_service', 'Treatment Room',    'biannual'),
  ('EQ006', 'Scales / Weighing Equipment',          'equipment_service', 'Consultation Room', 'annual'),
  ('EQ007', 'Fire Extinguishers',                   'fire_safety',       'All Areas',         'annual'),
  ('EQ008', 'Fire Alarm System',                    'fire_safety',       'Building',          'annual'),
  ('EQ009', 'Emergency Lighting',                   'fire_safety',       'Corridors & Exits', 'monthly'),
  ('EQ010', 'Emergency Drug Kit',                   'medicines',         'Treatment Room',    'monthly'),
  ('EQ011', 'Controlled Drugs Cabinet',             'medicines',         'Clinic Room',       'weekly'),
  ('EQ012', 'Fridge Temperature Log',               'medicines',         'Clinic Room',       'monthly'),
  ('EQ013', 'Oxygen / Medical Gas',                 'medicines',         'Treatment Room',    'monthly'),
  ('EQ014', 'Dressings / Wound Care Stock',         'clinical_stock',    'Treatment Room',    'monthly'),
  ('EQ015', 'Sharps Bins',                          'clinical_stock',    'All Clinical Areas','quarterly'),
  ('EQ016', 'PPE Stock Check',                      'clinical_stock',    'All Areas',         'monthly'),
  ('EQ017', 'Vaccine Stock & Fridge Temp',          'clinical_stock',    'Clinic Fridge',     'weekly'),
  ('EQ018', 'Water Temperature Check (Legionella)', 'legionella',        'All Outlets',       'monthly'),
  ('EQ019', 'Showerhead Descale / Flush',           'legionella',        'Showers',           'quarterly'),
  ('EQ020', 'Clinical Waste Collection',            'environmental',     'All Areas',         'weekly')
ON CONFLICT (item_code) DO NOTHING;

-- =============================================================================
-- SEED: CQC AUDIT QUESTIONS (57 questions)
-- =============================================================================

INSERT INTO compliance_cqc_answers (question_number, domain, audit_area, question_text) VALUES
  -- SAFE (1-20)
  (1,  'safe', 'Safeguarding',            'Are safeguarding policies for adults and children up to date and reviewed within 12 months?'),
  (2,  'safe', 'Safeguarding',            'Have all relevant staff completed safeguarding training to the required level for their role?'),
  (3,  'safe', 'Safeguarding',            'Is there a named safeguarding lead documented with contact details displayed?'),
  (4,  'safe', 'Medicines Management',    'Are controlled drugs stored securely in a double-locked cabinet with access restricted?'),
  (5,  'safe', 'Medicines Management',    'Is the CD register complete, legible and signed by two authorised staff for each entry?'),
  (6,  'safe', 'Medicines Management',    'Are all medicines within expiry date and stored at the correct temperature?'),
  (7,  'safe', 'Medicines Management',    'Is the emergency drug kit complete, sealed and within expiry date?'),
  (8,  'safe', 'Medicines Management',    'Are Patient Group Directions (PGDs) current and signed by authorised practitioners?'),
  (9,  'safe', 'Infection Control',       'Is an up-to-date infection prevention and control policy in place?'),
  (10, 'safe', 'Infection Control',       'Are hand hygiene audits conducted and results recorded?'),
  (11, 'safe', 'Infection Control',       'Is clinical waste segregated correctly and waste collection documented?'),
  (12, 'safe', 'Infection Control',       'Are staff trained in and following decontamination procedures?'),
  (13, 'safe', 'Equipment & Environment', 'Is all electrical equipment PAT tested and within test date?'),
  (14, 'safe', 'Equipment & Environment', 'Are fire extinguishers serviced, in date and accessible?'),
  (15, 'safe', 'Equipment & Environment', 'Is the AED/defibrillator serviced, in date and pads checked monthly?'),
  (16, 'safe', 'Equipment & Environment', 'Is a legionella risk assessment current and water temperature checks recorded?'),
  (17, 'safe', 'Equipment & Environment', 'Are clinical areas clean, uncluttered and free from hazards?'),
  (18, 'safe', 'Staffing',               'Are all clinical staff registered with their relevant regulatory body (NMC, GMC, HCPC)?'),
  (19, 'safe', 'Staffing',               'Are there appropriate staffing levels to maintain patient safety at all times?'),
  (20, 'safe', 'Staffing',               'Is there a process for managing clinical incidents and near misses?'),

  -- EFFECTIVE (21-30)
  (21, 'effective', 'Consent & Capacity', 'Is there a written consent policy in place covering implied, verbal and written consent?'),
  (22, 'effective', 'Consent & Capacity', 'Are staff trained in the Mental Capacity Act and Deprivation of Liberty Safeguards?'),
  (23, 'effective', 'Consent & Capacity', 'Are consent records documented in patient records appropriately?'),
  (24, 'effective', 'Care Planning',      'Do all patients with complex needs have documented, personalised care plans?'),
  (25, 'effective', 'Care Planning',      'Are care plans reviewed regularly with input from the patient/carer?'),
  (26, 'effective', 'Outcomes',           'Are clinical outcomes monitored and benchmarked against national standards?'),
  (27, 'effective', 'Training & Competence', 'Is there a robust induction process for all new staff?'),
  (28, 'effective', 'Training & Competence', 'Are mandatory training completion rates above 95% for all staff?'),
  (29, 'effective', 'Training & Competence', 'Are staff competencies assessed and documented for their specific role?'),
  (30, 'effective', 'Guidelines',         'Are NICE guidelines and local clinical protocols in use and up to date?'),

  -- CARING (31-37)
  (31, 'caring', 'Dignity & Respect',  'Do staff demonstrate compassion and treat patients with dignity and respect?'),
  (32, 'caring', 'Dignity & Respect',  'Is patient privacy maintained in consultation areas and during examinations?'),
  (33, 'caring', 'Patient Experience', 'Is there a system for capturing patient feedback and acting on it?'),
  (34, 'caring', 'Patient Experience', 'Are anonymous patient surveys conducted at least annually?'),
  (35, 'caring', 'Patient Experience', 'Are Friends and Family Test (FFT) results collected and displayed?'),
  (36, 'caring', 'Involvement',        'Are patients involved in decisions about their care and treatment?'),
  (37, 'caring', 'Involvement',        'Are carers and families involved appropriately with patient consent?'),

  -- RESPONSIVE (38-44)
  (38, 'responsive', 'Access',      'Can patients access care in a timely manner, including urgent appointments?'),
  (39, 'responsive', 'Access',      'Are reasonable adjustments made for patients with disabilities?'),
  (40, 'responsive', 'Access',      'Is interpretation / translation support available for patients who need it?'),
  (41, 'responsive', 'Complaints',  'Is there a written complaints policy readily accessible to patients?'),
  (42, 'responsive', 'Complaints',  'Are all complaints acknowledged within 3 working days and responded to within 40 days?'),
  (43, 'responsive', 'Complaints',  'Is learning from complaints shared with staff and used to improve services?'),
  (44, 'responsive', 'End of Life', 'Are patients'' end of life wishes documented and communicated across the team?'),

  -- WELL-LED (45-57)
  (45, 'well_led', 'Leadership & Vision',   'Is there a clear organisational vision and strategy communicated to all staff?'),
  (46, 'well_led', 'Leadership & Vision',   'Does the leadership team have a visible presence and are they accessible to staff?'),
  (47, 'well_led', 'Culture & Values',      'Is there a culture of openness, candour and psychological safety?'),
  (48, 'well_led', 'Culture & Values',      'Is there a Freedom to Speak Up Guardian / process in place?'),
  (49, 'well_led', 'Governance',            'Does the clinical governance meeting happen at least quarterly with documented minutes?'),
  (50, 'well_led', 'Governance',            'Are Significant Events / Learning from Events reviewed and documented monthly?'),
  (51, 'well_led', 'Governance',            'Is there a risk register that is reviewed and updated regularly?'),
  (52, 'well_led', 'Governance',            'Are staff appraisals completed annually for 100% of staff?'),
  (53, 'well_led', 'Governance',            'Are DBS checks in place for all staff requiring them?'),
  (54, 'well_led', 'Staff Wellbeing',       'Are anonymous staff surveys conducted at least annually?'),
  (55, 'well_led', 'Staff Wellbeing',       'Is there access to occupational health or staff wellbeing support?'),
  (56, 'well_led', 'Continuous Improvement','Is there evidence of quality improvement activity in the last 12 months?'),
  (57, 'well_led', 'Continuous Improvement','Are learning from events and complaints used to drive improvement?')
ON CONFLICT (question_number) DO NOTHING;

-- =============================================================================
-- SEED: COMPLIANCE CALENDAR (35 tasks)
-- =============================================================================

INSERT INTO compliance_calendar (task_order, task_name, frequency, month_due) VALUES
  (1,  'PAT Testing — All Electrical Equipment',    'annual',    NULL),
  (2,  'Fire Extinguisher Inspection',              'annual',    NULL),
  (3,  'Fire Alarm System Service',                 'annual',    NULL),
  (4,  'Emergency Lighting Test (Full)',            'annual',    NULL),
  (5,  'Emergency Lighting Test (Short)',           'monthly',   'Every month'),
  (6,  'AED / Defibrillator Service & Pads Check', 'annual',    NULL),
  (7,  'AED Daily / Weekly Check',                  'weekly',    'Every week'),
  (8,  'Autoclave / Steriliser Service',            'annual',    NULL),
  (9,  'Hoist / Lifting Equipment LOLER Inspection','biannual',  'Apr & Oct'),
  (10, 'Legionella Water Temperature Check',        'monthly',   'Every month'),
  (11, 'Showerhead Descale and Flush',              'quarterly', 'Jan, Apr, Jul, Oct'),
  (12, 'Clinical Fridge Temperature Log Review',    'monthly',   'Every month'),
  (13, 'Controlled Drugs Check & Count',            'weekly',    'Every week'),
  (14, 'Emergency Drug Kit Expiry Check',           'monthly',   'Every month'),
  (15, 'Vaccine Stock & Cold Chain Check',          'weekly',    'Every week'),
  (16, 'Drug / Medicines Expiry Date Sweep',        'monthly',   'Every month'),
  (17, 'Clinical Stock Expiry Check (dressings)',   'monthly',   'Every month'),
  (18, 'PPE Stock Level Check',                     'monthly',   'Every month'),
  (19, 'Sharps Bin Collection & Replacement',       'quarterly', NULL),
  (20, 'Clinical Waste Collection',                 'weekly',    NULL),
  (21, 'Infection Control Audit',                   'quarterly', 'Jan, Apr, Jul, Oct'),
  (22, 'Hand Hygiene Audit',                        'quarterly', 'Jan, Apr, Jul, Oct'),
  (23, 'Environmental Cleanliness Audit',           'monthly',   'Every month'),
  (24, 'Medicines Management Audit',                'quarterly', 'Jan, Apr, Jul, Oct'),
  (25, 'Significant Event / LFE Review Meeting',   'monthly',   'Every month'),
  (26, 'Clinical Governance Meeting',               'quarterly', 'Jan, Apr, Jul, Oct'),
  (27, 'Staff Mandatory Training Review',           'monthly',   'Every month'),
  (28, 'DBS Renewal Check (staff due)',             'monthly',   'Every month'),
  (29, 'Staff Appraisal Schedule Review',           'monthly',   'Every month'),
  (30, 'Patient Satisfaction Survey',               'quarterly', 'Jan, Apr, Jul, Oct'),
  (31, 'Anonymous Staff Survey',                    'annual',    NULL),
  (32, 'Freedom to Speak Up Review',                'quarterly', 'Jan, Apr, Jul, Oct'),
  (33, 'CQC Self-Assessment Review',                'annual',    NULL),
  (34, 'Risk Register Review',                      'quarterly', 'Jan, Apr, Jul, Oct'),
  (35, 'Business Continuity Plan Review',           'annual',    NULL)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- VERIFY
-- =============================================================================

DO $$
DECLARE
  v_hr     INT; v_train  INT; v_equip  INT;
  v_cqc    INT; v_gov    INT; v_cal    INT;
BEGIN
  SELECT COUNT(*) INTO v_hr    FROM compliance_hr_records;
  SELECT COUNT(*) INTO v_train FROM compliance_training;
  SELECT COUNT(*) INTO v_equip FROM compliance_equipment;
  SELECT COUNT(*) INTO v_cqc   FROM compliance_cqc_answers;
  SELECT COUNT(*) INTO v_gov   FROM compliance_governance_log;
  SELECT COUNT(*) INTO v_cal   FROM compliance_calendar;

  RAISE NOTICE '✓ Migration 032 — Compliance System';
  RAISE NOTICE '  compliance_hr_records:      % rows', v_hr;
  RAISE NOTICE '  compliance_training:        % rows', v_train;
  RAISE NOTICE '  compliance_equipment:       % rows (seeded %)', v_equip, 20;
  RAISE NOTICE '  compliance_cqc_answers:     % rows (seeded %)', v_cqc, 57;
  RAISE NOTICE '  compliance_governance_log:  % rows', v_gov;
  RAISE NOTICE '  compliance_calendar:        % rows (seeded %)', v_cal, 35;
END $$;

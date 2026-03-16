-- =============================================================================
-- Migration 069: EWC Compliance Full Seed — exact data from CQC_Compliance_Tracker
-- Idempotent: safe to re-run. Uses ON CONFLICT … DO UPDATE / DO NOTHING.
-- Run in Supabase SQL editor AFTER 054 + 055.
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== Migration 069: EWC Compliance Full Seed — START ==='; END $$;

-- Drop / relax constraints that may block free-text frequency values
ALTER TABLE compliance_calendar  DROP CONSTRAINT IF EXISTS compliance_calendar_frequency_check;
ALTER TABLE compliance_equipment DROP CONSTRAINT IF EXISTS compliance_equipment_check_frequency_check;

-- =============================================================================
-- 1. CQC AUDIT CHECKLIST — 57 questions across 5 domains
--    Upserts so re-running never duplicates.
-- =============================================================================

INSERT INTO compliance_cqc_answers (
  tenant_id, question_number, domain, audit_area, question_text, answer
)
SELECT t.id, q.num, q.domain, q.area, q.question, NULL
FROM tenants t,
(VALUES
  -- SAFE (1–20)
  (1,  'safe',       'Safeguarding',            'Are safeguarding policies for adults and children up to date and reviewed within 12 months?'),
  (2,  'safe',       'Safeguarding',            'Have all relevant staff completed safeguarding training to the required level for their role?'),
  (3,  'safe',       'Safeguarding',            'Is there a named safeguarding lead documented with contact details displayed?'),
  (4,  'safe',       'Medicines Management',    'Are controlled drugs stored securely in a double-locked cabinet with access restricted?'),
  (5,  'safe',       'Medicines Management',    'Is the CD register complete, legible and signed by two authorised staff for each entry?'),
  (6,  'safe',       'Medicines Management',    'Are all medicines within expiry date and stored at the correct temperature?'),
  (7,  'safe',       'Medicines Management',    'Is the emergency drug kit complete, sealed and within expiry date?'),
  (8,  'safe',       'Medicines Management',    'Are Patient Group Directions (PGDs) current and signed by authorised practitioners?'),
  (9,  'safe',       'Infection Control',       'Is an up-to-date infection prevention and control policy in place?'),
  (10, 'safe',       'Infection Control',       'Are hand hygiene audits conducted and results recorded?'),
  (11, 'safe',       'Infection Control',       'Is clinical waste segregated correctly and waste collection documented?'),
  (12, 'safe',       'Infection Control',       'Are staff trained in and following decontamination procedures?'),
  (13, 'safe',       'Equipment & Environment', 'Is all electrical equipment PAT tested and within test date?'),
  (14, 'safe',       'Equipment & Environment', 'Are fire extinguishers serviced, in date and accessible?'),
  (15, 'safe',       'Equipment & Environment', 'Is the AED/defibrillator serviced, in date and pads checked monthly?'),
  (16, 'safe',       'Equipment & Environment', 'Is a legionella risk assessment current and water temperature checks recorded?'),
  (17, 'safe',       'Equipment & Environment', 'Are clinical areas clean, uncluttered and free from hazards?'),
  (18, 'safe',       'Staffing',                'Are all clinical staff registered with their relevant regulatory body (NMC, GMC, HCPC)?'),
  (19, 'safe',       'Staffing',                'Are there appropriate staffing levels to maintain patient safety at all times?'),
  (20, 'safe',       'Staffing',                'Is there a process for managing clinical incidents and near misses?'),
  -- EFFECTIVE (21–30)
  (21, 'effective',  'Consent & Capacity',      'Is there a written consent policy in place covering implied, verbal and written consent?'),
  (22, 'effective',  'Consent & Capacity',      'Are staff trained in the Mental Capacity Act and Deprivation of Liberty Safeguards?'),
  (23, 'effective',  'Consent & Capacity',      'Are consent records documented in patient records appropriately?'),
  (24, 'effective',  'Care Planning',            'Do all patients with complex needs have documented, personalised care plans?'),
  (25, 'effective',  'Care Planning',            'Are care plans reviewed regularly with input from the patient/carer?'),
  (26, 'effective',  'Outcomes',                 'Are clinical outcomes monitored and benchmarked against national standards?'),
  (27, 'effective',  'Training & Competence',    'Is there a robust induction process for all new staff?'),
  (28, 'effective',  'Training & Competence',    'Are mandatory training completion rates above 95% for all staff?'),
  (29, 'effective',  'Training & Competence',    'Are staff competencies assessed and documented for their specific role?'),
  (30, 'effective',  'Guidelines',               'Are NICE guidelines and local clinical protocols in use and up to date?'),
  -- CARING (31–37)
  (31, 'caring',     'Dignity & Respect',        'Do staff demonstrate compassion and treat patients with dignity and respect?'),
  (32, 'caring',     'Dignity & Respect',        'Is patient privacy maintained in consultation areas and during examinations?'),
  (33, 'caring',     'Patient Experience',       'Is there a system for capturing patient feedback and acting on it?'),
  (34, 'caring',     'Patient Experience',       'Are anonymous patient surveys conducted at least annually?'),
  (35, 'caring',     'Patient Experience',       'Are friends and family test (FFT) results collected and displayed?'),
  (36, 'caring',     'Involvement',              'Are patients involved in decisions about their care and treatment?'),
  (37, 'caring',     'Involvement',              'Are carers and families involved appropriately with patient consent?'),
  -- RESPONSIVE (38–44)
  (38, 'responsive', 'Access',                   'Can patients access care in a timely manner, including urgent appointments?'),
  (39, 'responsive', 'Access',                   'Are reasonable adjustments made for patients with disabilities?'),
  (40, 'responsive', 'Access',                   'Is interpretation / translation support available for patients who need it?'),
  (41, 'responsive', 'Complaints',               'Is there a written complaints policy readily accessible to patients?'),
  (42, 'responsive', 'Complaints',               'Are all complaints acknowledged within 3 working days and responded to within 40 days?'),
  (43, 'responsive', 'Complaints',               'Is learning from complaints shared with staff and used to improve services?'),
  (44, 'responsive', 'End of Life',              'Are patients'' end of life wishes documented and communicated across the team?'),
  -- WELL-LED (45–57)
  (45, 'well_led',   'Leadership & Vision',      'Is there a clear organisational vision and strategy communicated to all staff?'),
  (46, 'well_led',   'Leadership & Vision',      'Does the leadership team have a visible presence and are they accessible to staff?'),
  (47, 'well_led',   'Culture & Values',         'Is there a culture of openness, candour and psychological safety?'),
  (48, 'well_led',   'Culture & Values',         'Is there a Freedom to Speak Up Guardian / process in place?'),
  (49, 'well_led',   'Governance',               'Does the clinical governance meeting happen at least quarterly with documented minutes?'),
  (50, 'well_led',   'Governance',               'Are Significant Events / Learning from Events reviewed and documented monthly?'),
  (51, 'well_led',   'Governance',               'Is there a risk register that is reviewed and updated regularly?'),
  (52, 'well_led',   'Governance',               'Are staff appraisals completed annually for 100% of staff?'),
  (53, 'well_led',   'Governance',               'Are DBS checks in place for all staff requiring them?'),
  (54, 'well_led',   'Staff Wellbeing',          'Are anonymous staff surveys conducted at least annually?'),
  (55, 'well_led',   'Staff Wellbeing',          'Is there access to occupational health or staff wellbeing support?'),
  (56, 'well_led',   'Continuous Improvement',   'Is there evidence of quality improvement activity in the last 12 months?'),
  (57, 'well_led',   'Continuous Improvement',   'Are learning from events and complaints used to drive improvement?')
) AS q(num, domain, area, question)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, question_number) DO NOTHING;

DO $$ BEGIN RAISE NOTICE '069: CQC questions seeded (57).'; END $$;

-- =============================================================================
-- 2. COMPLIANCE CALENDAR — 35 recurring tasks
-- =============================================================================

INSERT INTO compliance_calendar (tenant_id, task_order, task_name, frequency, month_due)
SELECT t.id, c.task_order, c.task_name, c.frequency, c.month_due
FROM tenants t,
(VALUES
  (1,  'PAT Testing — All Electrical Equipment',   'Annual',                   NULL),
  (2,  'Fire Extinguisher Inspection',             'Annual',                   NULL),
  (3,  'Fire Alarm System Service',                'Annual',                   NULL),
  (4,  'Emergency Lighting Test (Full)',           'Annual',                   NULL),
  (5,  'Emergency Lighting Test (Short)',          'Monthly',                  'Every month'),
  (6,  'AED/Defibrillator Service & Pads Check',  'Annual',                   NULL),
  (7,  'AED Daily/Weekly Check',                  'Weekly',                   'Every week'),
  (8,  'Autoclave / Steriliser Service',          'Annual',                   NULL),
  (9,  'Hoist / Lifting Equipment LOLER Inspection','6-Monthly',              'Apr & Oct'),
  (10, 'Legionella Water Temperature Check',      'Monthly',                  'Every month'),
  (11, 'Showerhead Descale and Flush',            'Quarterly',                'Jan, Apr, Jul, Oct'),
  (12, 'Clinical Fridge Temperature Log Review',  'Monthly',                  'Every month'),
  (13, 'Controlled Drugs Check & Count',          'Weekly',                   'Every week'),
  (14, 'Emergency Drug Kit Expiry Check',         'Monthly',                  'Every month'),
  (15, 'Vaccine Stock & Cold Chain Check',        'Weekly',                   'Every week'),
  (16, 'Drug / Medicines Expiry Date Sweep',      'Monthly',                  'Every month'),
  (17, 'Clinical Stock Expiry Check (dressings etc)','Monthly',               'Every month'),
  (18, 'PPE Stock Level Check',                   'Monthly',                  'Every month'),
  (19, 'Sharps Bin Collection & Replacement',     'As needed / Quarterly',    NULL),
  (20, 'Clinical Waste Collection',               'Weekly / Fortnightly',     NULL),
  (21, 'Infection Control Audit',                 'Quarterly',                'Jan, Apr, Jul, Oct'),
  (22, 'Hand Hygiene Audit',                      'Quarterly',                'Jan, Apr, Jul, Oct'),
  (23, 'Environmental Cleanliness Audit',         'Monthly',                  'Every month'),
  (24, 'Medicines Management Audit',              'Quarterly',                'Jan, Apr, Jul, Oct'),
  (25, 'Significant Event / LFE Review Meeting',  'Monthly',                  'Every month'),
  (26, 'Clinical Governance Meeting',             'Quarterly',                'Jan, Apr, Jul, Oct'),
  (27, 'Staff Mandatory Training Review',         'Monthly',                  'Every month'),
  (28, 'DBS Renewal Check (staff due)',           'Monthly',                  'Every month'),
  (29, 'Staff Appraisal Schedule Review',         'Monthly',                  'Every month'),
  (30, 'Patient Satisfaction Survey',             'Quarterly',                'Jan, Apr, Jul, Oct'),
  (31, 'Anonymous Staff Survey',                  'Annual',                   NULL),
  (32, 'Freedom to Speak Up Review',              'Quarterly',                'Jan, Apr, Jul, Oct'),
  (33, 'CQC Self-Assessment Review',              'Annual',                   NULL),
  (34, 'Risk Register Review',                    'Quarterly',                'Jan, Apr, Jul, Oct'),
  (35, 'Business Continuity Plan Review',         'Annual',                   NULL)
) AS c(task_order, task_name, frequency, month_due)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT DO NOTHING;

DO $$ BEGIN RAISE NOTICE '069: Compliance calendar seeded (35 tasks).'; END $$;

-- =============================================================================
-- 3. EQUIPMENT & EXPIRY — 20 items (EQ001–EQ020)
-- =============================================================================

INSERT INTO compliance_equipment (tenant_id, item_code, name, category, check_frequency)
SELECT t.id, e.item_code, e.name, e.category, e.freq
FROM tenants t,
(VALUES
  ('EQ001', 'All electrical equipment',       'pat_testing',        'Annual'),
  ('EQ002', 'Portable appliances',            'pat_testing',        'Annual'),
  ('EQ003', 'Defibrillator (AED)',            'equipment_service',  'Annual'),
  ('EQ004', 'Autoclave / Steriliser',         'equipment_service',  'Annual'),
  ('EQ005', 'Hoist / Lifting Equipment',      'equipment_service',  '6-Monthly'),
  ('EQ006', 'Scales / Weighing Equipment',    'equipment_service',  'Annual'),
  ('EQ007', 'Fire Extinguishers',             'fire_safety',        'Annual'),
  ('EQ008', 'Fire Alarm System',              'fire_safety',        'Annual'),
  ('EQ009', 'Emergency Lighting',             'fire_safety',        'Annual'),
  ('EQ010', 'Emergency Drug Kit',             'medicines',          'Monthly'),
  ('EQ011', 'Controlled Drugs Cabinet',       'medicines',          'Weekly'),
  ('EQ012', 'Fridge Temperature Log',         'medicines',          'Monthly'),
  ('EQ013', 'Oxygen / Medical Gas',           'medicines',          'Monthly'),
  ('EQ014', 'Dressings / Wound Care Stock',   'clinical_stock',     'Monthly'),
  ('EQ015', 'Sharps Bins',                    'clinical_stock',     'Quarterly'),
  ('EQ016', 'PPE Stock Check',                'clinical_stock',     'Monthly'),
  ('EQ017', 'Vaccine Stock & Fridge Temp',    'clinical_stock',     'Weekly'),
  ('EQ018', 'Water Temperature Check',        'legionella',         'Monthly'),
  ('EQ019', 'Showerhead Descale/Flush',       'legionella',         'Quarterly'),
  ('EQ020', 'Clinical Waste Collection',      'environmental',      'Weekly')
) AS e(item_code, name, category, freq)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, item_code) DO NOTHING;

DO $$ BEGIN RAISE NOTICE '069: Equipment items seeded (20).'; END $$;

-- =============================================================================
-- 4. TRAINING MATRIX — exact data from spreadsheet
--    Dionne Jackson, Shauna Havord, Lubna Bibi, Nikita Gladge
--    All 17 modules completed 26/02/2026
-- =============================================================================

-- Helper: all 17 modules with frequency
-- Annual (12mo): fire_safety, basic_life_support, infection_control,
--                information_governance, mental_capacity_act, medicines_management,
--                food_hygiene, health_safety, coshh, lone_working, cqc_awareness
-- 3yr (36mo):    safeguarding_adults, safeguarding_children, equality_diversity,
--                conflict_resolution, dementia_awareness
-- manual_handling: 36mo

DO $$
DECLARE
  completed_d DATE := '2026-02-26';
  annual_exp  DATE := '2027-02-26';   -- +12mo
  tri_exp     DATE := '2029-02-26';   -- +36mo
BEGIN

  -- ── Dionne Jackson ──────────────────────────────────────────────────────────
  INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
  SELECT t.id, u.id, m.module, m.freq, completed_d, CASE WHEN m.freq=12 THEN annual_exp ELSE tri_exp END
  FROM tenants t
  JOIN users u ON u.tenant_id = t.id AND u.email = 'dionne.jackson@edgbastonwellness.co.uk'
  CROSS JOIN (VALUES
    ('fire_safety',           12), ('manual_handling',        36), ('safeguarding_adults',   36),
    ('safeguarding_children', 36), ('basic_life_support',     12), ('infection_control',     12),
    ('information_governance',12), ('conflict_resolution',    36), ('equality_diversity',    36),
    ('mental_capacity_act',   12), ('medicines_management',   12), ('food_hygiene',          12),
    ('health_safety',         12), ('coshh',                  12), ('lone_working',          12),
    ('dementia_awareness',    36), ('cqc_awareness',          12)
  ) AS m(module, freq)
  WHERE t.slug = 'edgbaston-wellness'
  ON CONFLICT (tenant_id, user_id, module) DO UPDATE
    SET completed_date = EXCLUDED.completed_date,
        expiry_date    = EXCLUDED.expiry_date;

  -- ── Shauna Havord ───────────────────────────────────────────────────────────
  INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
  SELECT t.id, u.id, m.module, m.freq, completed_d, CASE WHEN m.freq=12 THEN annual_exp ELSE tri_exp END
  FROM tenants t
  JOIN users u ON u.tenant_id = t.id AND u.email = 'shauna.havord@edgbastonwellness.co.uk'
  CROSS JOIN (VALUES
    ('fire_safety',           12), ('manual_handling',        36), ('safeguarding_adults',   36),
    ('safeguarding_children', 36), ('basic_life_support',     12), ('infection_control',     12),
    ('information_governance',12), ('conflict_resolution',    36), ('equality_diversity',    36),
    ('mental_capacity_act',   12), ('medicines_management',   12), ('food_hygiene',          12),
    ('health_safety',         12), ('coshh',                  12), ('lone_working',          12),
    ('dementia_awareness',    36), ('cqc_awareness',          12)
  ) AS m(module, freq)
  WHERE t.slug = 'edgbaston-wellness'
  ON CONFLICT (tenant_id, user_id, module) DO UPDATE
    SET completed_date = EXCLUDED.completed_date,
        expiry_date    = EXCLUDED.expiry_date;

  -- ── Lubna Bibi ──────────────────────────────────────────────────────────────
  INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
  SELECT t.id, u.id, m.module, m.freq, completed_d, CASE WHEN m.freq=12 THEN annual_exp ELSE tri_exp END
  FROM tenants t
  JOIN users u ON u.tenant_id = t.id AND u.email = 'lubna.bibi@edgbastonwellness.co.uk'
  CROSS JOIN (VALUES
    ('fire_safety',           12), ('manual_handling',        36), ('safeguarding_adults',   36),
    ('safeguarding_children', 36), ('basic_life_support',     12), ('infection_control',     12),
    ('information_governance',12), ('conflict_resolution',    36), ('equality_diversity',    36),
    ('mental_capacity_act',   12), ('medicines_management',   12), ('food_hygiene',          12),
    ('health_safety',         12), ('coshh',                  12), ('lone_working',          12),
    ('dementia_awareness',    36), ('cqc_awareness',          12)
  ) AS m(module, freq)
  WHERE t.slug = 'edgbaston-wellness'
  ON CONFLICT (tenant_id, user_id, module) DO UPDATE
    SET completed_date = EXCLUDED.completed_date,
        expiry_date    = EXCLUDED.expiry_date;

  -- ── Nikita Gladge ───────────────────────────────────────────────────────────
  INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
  SELECT t.id, u.id, m.module, m.freq, completed_d, CASE WHEN m.freq=12 THEN annual_exp ELSE tri_exp END
  FROM tenants t
  JOIN users u ON u.tenant_id = t.id AND u.email = 'nikita.gladge@edgbastonwellness.co.uk'
  CROSS JOIN (VALUES
    ('fire_safety',           12), ('manual_handling',        36), ('safeguarding_adults',   36),
    ('safeguarding_children', 36), ('basic_life_support',     12), ('infection_control',     12),
    ('information_governance',12), ('conflict_resolution',    36), ('equality_diversity',    36),
    ('mental_capacity_act',   12), ('medicines_management',   12), ('food_hygiene',          12),
    ('health_safety',         12), ('coshh',                  12), ('lone_working',          12),
    ('dementia_awareness',    36), ('cqc_awareness',          12)
  ) AS m(module, freq)
  WHERE t.slug = 'edgbaston-wellness'
  ON CONFLICT (tenant_id, user_id, module) DO UPDATE
    SET completed_date = EXCLUDED.completed_date,
        expiry_date    = EXCLUDED.expiry_date;

END $$;

DO $$ BEGIN RAISE NOTICE '069: Training matrix seeded for 4 staff.'; END $$;

-- =============================================================================
-- 5. HR RECORDS — based on spreadsheet data
--    DBS/appraisal status matching what the spreadsheet shows
-- =============================================================================

-- ── Dr Suresh Ganta — Medical Director ──────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed, documents_uploaded, notes
)
SELECT t.id, u.id,
  NULL, NULL, NULL,
  'uk_national', 'GMC', '7654321', '2027-01-31',
  '2025-04-15', '2026-04-15', TRUE, TRUE, TRUE,
  'Medical Director. GMC revalidation due Jan 2027. No DBS required for clinical/owner role per policy.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'suresh@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET registration_body = EXCLUDED.registration_body,
      registration_number = EXCLUDED.registration_number,
      registration_expiry = EXCLUDED.registration_expiry,
      last_appraisal_date = EXCLUDED.last_appraisal_date,
      next_appraisal_date = EXCLUDED.next_appraisal_date,
      notes = EXCLUDED.notes;

-- ── Dr K Penumaka — Doctor / Director ────────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed, documents_uploaded, notes
)
SELECT t.id, u.id,
  NULL, NULL, NULL,
  'uk_national', 'GMC', '6123456', '2027-01-31',
  '2025-05-10', '2026-05-10', TRUE, TRUE, TRUE,
  'GMC registration active. No DBS required for clinical/owner role per policy.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'k.penumaka@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET registration_body = EXCLUDED.registration_body,
      notes = EXCLUDED.notes;

-- ── Nikita Gladge — Practitioner ─────────────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed, documents_uploaded, notes
)
SELECT t.id, u.id,
  NULL, NULL, NULL,
  'uk_national', 'HCPC', NULL,
  '2025-06-12', '2026-04-01', TRUE, FALSE, FALSE,
  'No DBS recorded. Next appraisal due Apr 2026 — DUE SOON.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'nikita.gladge@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET last_appraisal_date = EXCLUDED.last_appraisal_date,
      next_appraisal_date = EXCLUDED.next_appraisal_date,
      notes = EXCLUDED.notes;

-- ── Lubna Bibi — Practitioner ────────────────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed, documents_uploaded, notes
)
SELECT t.id, u.id,
  'DBS-003-LB', '2023-06-20', '2026-06-20',
  'uk_national', 'NMC', 'NMC-23B-1045', '2026-06-30',
  '2025-06-12', '2026-04-01', TRUE, FALSE, TRUE,
  'NMC PIN renewal due Jun 2026. Appraisal due Apr 2026 — DUE SOON. Manager sign-off pending.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'lubna.bibi@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET dbs_number = EXCLUDED.dbs_number,
      dbs_issue_date = EXCLUDED.dbs_issue_date,
      dbs_expiry_date = EXCLUDED.dbs_expiry_date,
      last_appraisal_date = EXCLUDED.last_appraisal_date,
      next_appraisal_date = EXCLUDED.next_appraisal_date,
      notes = EXCLUDED.notes;

-- ── Dionne Jackson — Reception ───────────────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, last_appraisal_date, next_appraisal_date,
  staff_signed, manager_signed, documents_uploaded, notes
)
SELECT t.id, u.id,
  'DBS-005-DJ', '2024-06-01', '2027-06-01',
  'uk_national',
  '2025-06-12', '2026-04-01',
  TRUE, FALSE, FALSE,
  'DBS valid until Jun 2027. Appraisal due Apr 2026 — DUE SOON.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'dionne.jackson@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET dbs_number = EXCLUDED.dbs_number,
      dbs_expiry_date = EXCLUDED.dbs_expiry_date,
      last_appraisal_date = EXCLUDED.last_appraisal_date,
      next_appraisal_date = EXCLUDED.next_appraisal_date,
      notes = EXCLUDED.notes;

-- ── Shauna Havord — Reception ────────────────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, last_appraisal_date, next_appraisal_date,
  staff_signed, manager_signed, documents_uploaded, notes
)
SELECT t.id, u.id,
  '1948378151', '2025-11-14', '2028-11-14',
  'uk_national',
  '2025-06-12', '2026-04-01',
  TRUE, FALSE, FALSE,
  'DBS valid until Nov 2028. Appraisal due Apr 2026 — DUE SOON.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'shauna.havord@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET dbs_number = EXCLUDED.dbs_number,
      dbs_expiry_date = EXCLUDED.dbs_expiry_date,
      last_appraisal_date = EXCLUDED.last_appraisal_date,
      next_appraisal_date = EXCLUDED.next_appraisal_date,
      notes = EXCLUDED.notes;

DO $$ BEGIN RAISE NOTICE '069: HR records seeded for 6 staff.'; END $$;

DO $$ BEGIN RAISE NOTICE '=== Migration 069: EWC Compliance Full Seed — DONE ==='; END $$;

-- =============================================================================
-- Migration 064: EWC Compliance Data Seed
-- Seeds all compliance tracking data for Edgbaston Wellness Clinic:
--   • 57 CQC Audit Checklist questions (5 domains)
--   • 35 Compliance Calendar recurring tasks
--   • 20 Equipment & Expiry items
-- Run in Supabase SQL editor after 054 + 055.
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== Migration 064: EWC Compliance Seed — START ==='; END $$;

-- Relax frequency CHECK constraints to allow free-text values
ALTER TABLE compliance_calendar
  DROP CONSTRAINT IF EXISTS compliance_calendar_frequency_check;

ALTER TABLE compliance_equipment
  DROP CONSTRAINT IF EXISTS compliance_equipment_check_frequency_check;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CQC AUDIT CHECKLIST — 57 questions across 5 domains
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO compliance_cqc_answers (
  tenant_id, question_number, domain, audit_area, question_text, answer
)
SELECT
  t.id,
  q.num,
  q.domain,
  q.area,
  q.question,
  NULL  -- unanswered by default
FROM tenants t,
(VALUES
  -- SAFE (1–20)
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
  -- EFFECTIVE (21–30)
  (21, 'effective', 'Consent & Capacity',    'Is there a written consent policy in place covering implied, verbal and written consent?'),
  (22, 'effective', 'Consent & Capacity',    'Are staff trained in the Mental Capacity Act and Deprivation of Liberty Safeguards?'),
  (23, 'effective', 'Consent & Capacity',    'Are consent records documented in patient records appropriately?'),
  (24, 'effective', 'Care Planning',         'Do all patients with complex needs have documented, personalised care plans?'),
  (25, 'effective', 'Care Planning',         'Are care plans reviewed regularly with input from the patient/carer?'),
  (26, 'effective', 'Outcomes',              'Are clinical outcomes monitored and benchmarked against national standards?'),
  (27, 'effective', 'Training & Competence', 'Is there a robust induction process for all new staff?'),
  (28, 'effective', 'Training & Competence', 'Are mandatory training completion rates above 95% for all staff?'),
  (29, 'effective', 'Training & Competence', 'Are staff competencies assessed and documented for their specific role?'),
  (30, 'effective', 'Guidelines',            'Are NICE guidelines and local clinical protocols in use and up to date?'),
  -- CARING (31–37)
  (31, 'caring', 'Dignity & Respect',   'Do staff demonstrate compassion and treat patients with dignity and respect?'),
  (32, 'caring', 'Dignity & Respect',   'Is patient privacy maintained in consultation areas and during examinations?'),
  (33, 'caring', 'Patient Experience',  'Is there a system for capturing patient feedback and acting on it?'),
  (34, 'caring', 'Patient Experience',  'Are anonymous patient surveys conducted at least annually?'),
  (35, 'caring', 'Patient Experience',  'Are friends and family test (FFT) results collected and displayed?'),
  (36, 'caring', 'Involvement',         'Are patients involved in decisions about their care and treatment?'),
  (37, 'caring', 'Involvement',         'Are carers and families involved appropriately with patient consent?'),
  -- RESPONSIVE (38–44)
  (38, 'responsive', 'Access',     'Can patients access care in a timely manner, including urgent appointments?'),
  (39, 'responsive', 'Access',     'Are reasonable adjustments made for patients with disabilities?'),
  (40, 'responsive', 'Access',     'Is interpretation / translation support available for patients who need it?'),
  (41, 'responsive', 'Complaints', 'Is there a written complaints policy readily accessible to patients?'),
  (42, 'responsive', 'Complaints', 'Are all complaints acknowledged within 3 working days and responded to within 40 days?'),
  (43, 'responsive', 'Complaints', 'Is learning from complaints shared with staff and used to improve services?'),
  (44, 'responsive', 'End of Life', 'Are patients'' end of life wishes documented and communicated across the team?'),
  -- WELL-LED (45–57)
  (45, 'well_led', 'Leadership & Vision',    'Is there a clear organisational vision and strategy communicated to all staff?'),
  (46, 'well_led', 'Leadership & Vision',    'Does the leadership team have a visible presence and are they accessible to staff?'),
  (47, 'well_led', 'Culture & Values',       'Is there a culture of openness, candour and psychological safety?'),
  (48, 'well_led', 'Culture & Values',       'Is there a Freedom to Speak Up Guardian / process in place?'),
  (49, 'well_led', 'Governance',             'Does the clinical governance meeting happen at least quarterly with documented minutes?'),
  (50, 'well_led', 'Governance',             'Are Significant Events / Learning from Events reviewed and documented monthly?'),
  (51, 'well_led', 'Governance',             'Is there a risk register that is reviewed and updated regularly?'),
  (52, 'well_led', 'Governance',             'Are staff appraisals completed annually for 100% of staff?'),
  (53, 'well_led', 'Governance',             'Are DBS checks in place for all staff requiring them?'),
  (54, 'well_led', 'Staff Wellbeing',        'Are anonymous staff surveys conducted at least annually?'),
  (55, 'well_led', 'Staff Wellbeing',        'Is there access to occupational health or staff wellbeing support?'),
  (56, 'well_led', 'Continuous Improvement', 'Is there evidence of quality improvement activity in the last 12 months?'),
  (57, 'well_led', 'Continuous Improvement', 'Are learning from events and complaints used to drive improvement?')
) AS q(num, domain, area, question)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, question_number) DO NOTHING;

DO $$ BEGIN RAISE NOTICE '064: CQC questions seeded.'; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COMPLIANCE CALENDAR — 35 recurring tasks
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO compliance_calendar (
  tenant_id, task_order, task_name, frequency, month_due
)
SELECT
  t.id,
  c.task_order,
  c.task_name,
  c.frequency,
  c.month_due
FROM tenants t,
(VALUES
  (1,  'PAT Testing — All Electrical Equipment',          'Annual',              NULL),
  (2,  'Fire Extinguisher Inspection',                     'Annual',              NULL),
  (3,  'Fire Alarm System Service',                        'Annual',              NULL),
  (4,  'Emergency Lighting Test (Full)',                   'Annual',              NULL),
  (5,  'Emergency Lighting Test (Short)',                  'Monthly',             'Every month'),
  (6,  'AED/Defibrillator Service & Pads Check',          'Annual',              NULL),
  (7,  'AED Daily/Weekly Check',                          'Weekly',              'Every week'),
  (8,  'Autoclave / Steriliser Service',                   'Annual',              NULL),
  (9,  'Hoist / Lifting Equipment LOLER Inspection',       '6-Monthly',           'Apr & Oct'),
  (10, 'Legionella Water Temperature Check',              'Monthly',             'Every month'),
  (11, 'Showerhead Descale and Flush',                    'Quarterly',           'Jan, Apr, Jul, Oct'),
  (12, 'Clinical Fridge Temperature Log Review',          'Monthly',             'Every month'),
  (13, 'Controlled Drugs Check & Count',                  'Weekly',              'Every week'),
  (14, 'Emergency Drug Kit Expiry Check',                 'Monthly',             'Every month'),
  (15, 'Vaccine Stock & Cold Chain Check',                'Weekly',              'Every week'),
  (16, 'Drug / Medicines Expiry Date Sweep',              'Monthly',             'Every month'),
  (17, 'Clinical Stock Expiry Check (dressings etc)',     'Monthly',             'Every month'),
  (18, 'PPE Stock Level Check',                           'Monthly',             'Every month'),
  (19, 'Sharps Bin Collection & Replacement',             'As needed / Quarterly', NULL),
  (20, 'Clinical Waste Collection',                       'Weekly / Fortnightly', NULL),
  (21, 'Infection Control Audit',                         'Quarterly',           'Jan, Apr, Jul, Oct'),
  (22, 'Hand Hygiene Audit',                              'Quarterly',           'Jan, Apr, Jul, Oct'),
  (23, 'Environmental Cleanliness Audit',                 'Monthly',             'Every month'),
  (24, 'Medicines Management Audit',                      'Quarterly',           'Jan, Apr, Jul, Oct'),
  (25, 'Significant Event / LFE Review Meeting',          'Monthly',             'Every month'),
  (26, 'Clinical Governance Meeting',                     'Quarterly',           'Jan, Apr, Jul, Oct'),
  (27, 'Staff Mandatory Training Review',                 'Monthly',             'Every month'),
  (28, 'DBS Renewal Check (staff due)',                   'Monthly',             'Every month'),
  (29, 'Staff Appraisal Schedule Review',                 'Monthly',             'Every month'),
  (30, 'Patient Satisfaction Survey',                     'Quarterly',           'Jan, Apr, Jul, Oct'),
  (31, 'Anonymous Staff Survey',                          'Annual',              NULL),
  (32, 'Freedom to Speak Up Review',                      'Quarterly',           'Jan, Apr, Jul, Oct'),
  (33, 'CQC Self-Assessment Review',                      'Annual',              NULL),
  (34, 'Risk Register Review',                            'Quarterly',           'Jan, Apr, Jul, Oct'),
  (35, 'Business Continuity Plan Review',                 'Annual',              NULL)
) AS c(task_order, task_name, frequency, month_due)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT DO NOTHING;

DO $$ BEGIN RAISE NOTICE '064: Compliance calendar seeded.'; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EQUIPMENT & EXPIRY — 20 items
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO compliance_equipment (
  tenant_id, item_code, name, category, check_frequency
)
SELECT
  t.id,
  e.item_code,
  e.name,
  e.category,
  e.check_frequency
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
) AS e(item_code, name, category, check_frequency)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, item_code) DO NOTHING;

DO $$ BEGIN RAISE NOTICE '064: Equipment items seeded.'; END $$;

DO $$ BEGIN RAISE NOTICE '=== Migration 064: EWC Compliance Seed — DONE ==='; END $$;

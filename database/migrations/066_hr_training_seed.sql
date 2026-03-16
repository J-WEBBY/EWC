-- =============================================================================
-- Migration 066: EWC HR Records + Training Matrix Seed
-- Seeds compliance_hr_records and compliance_training for all 12 staff.
-- Run AFTER 054 + 055 + 064.
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== Migration 066: HR + Training Seed — START ==='; END $$;

-- =============================================================================
-- 1. HR RECORDS
--    One row per staff member. Realistic placeholder data for a UK private clinic.
--    Clinical staff (Dr Suresh, Dr K, Lubna, Nikita) get GMC/NMC registration.
--    All staff get DBS + RTW entries. Mix of statuses for dashboard to show data.
-- =============================================================================

-- ── Dr Suresh Ganta — Medical Director ──────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed,
  documents_uploaded, notes
)
SELECT
  t.id, u.id,
  'DBS-001-SG', '2022-09-01', '2025-09-01',
  'uk_national',
  'GMC', '7654321', '2027-01-31',
  '2025-04-15', '2026-04-15', TRUE, TRUE, TRUE,
  'Medical Director. Revalidation due Jan 2027. DBS renewal required — expired Sep 2025.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'suresh@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ── Dr K Penumaka — Doctor / Administrator ───────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed,
  documents_uploaded, notes
)
SELECT
  t.id, u.id,
  'DBS-002-KP', '2024-02-14', '2027-02-14',
  'uk_national',
  'GMC', '6123456', '2027-01-31',
  '2025-05-10', '2026-05-10', TRUE, TRUE, TRUE,
  'GMC registration active. DBS valid until Feb 2027.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'k.penumaka@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ── Lubna Bibi — Practitioner ────────────────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed,
  documents_uploaded, notes
)
SELECT
  t.id, u.id,
  'DBS-003-LB', '2023-06-20', '2026-06-20',
  'uk_national',
  'NMC', 'NMC-23B-1045', '2026-06-30',
  '2025-07-01', '2026-07-01', TRUE, FALSE, TRUE,
  'NMC PIN renewal due Jun 2026. Manager sign-off pending annual appraisal.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'lubna.bibi@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ── Nikita V — Practitioner ──────────────────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed,
  documents_uploaded, notes
)
SELECT
  t.id, u.id,
  'DBS-004-NV', '2023-11-05', '2026-11-05',
  'uk_national',
  'NMC', 'NMC-22N-3301', '2026-11-30',
  '2025-03-01', '2026-03-01', TRUE, TRUE, FALSE,
  'Appraisal overdue (was due 1 Mar 2026). Documents not fully uploaded — consent forms pending.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'nikita.v@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ── Mr Syed Ahmad — Administrator ───────────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed,
  documents_uploaded, notes
)
SELECT
  t.id, u.id,
  'DBS-005-SA', '2024-01-10', '2027-01-10',
  'uk_national',
  'N/A', NULL, NULL,
  '2025-06-15', '2026-06-15', TRUE, TRUE, TRUE,
  'Standard DBS. No professional registration required for admin role.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'syed.ahmad@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ── Mr Benjamin Hawthorne — Senior Receptionist ──────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed,
  documents_uploaded, notes
)
SELECT
  t.id, u.id,
  'DBS-006-BH', '2023-08-22', '2026-08-22',
  'uk_national',
  'N/A', NULL, NULL,
  '2025-08-20', '2026-08-20', TRUE, TRUE, TRUE,
  'Basic DBS. RTW permanent (UK National).'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'benjamin.hawthorne@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ── Ms Dionne Jackson — Senior Receptionist ──────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed,
  documents_uploaded, notes
)
SELECT
  t.id, u.id,
  'DBS-007-DJ', '2024-03-05', '2027-03-05',
  'uk_national',
  'N/A', NULL, NULL,
  '2025-09-10', '2026-09-10', TRUE, TRUE, TRUE,
  'Basic DBS. RTW permanent (UK National).'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'dionne.jackson@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ── Miss Ece Kurt — Receptionist ─────────────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed,
  documents_uploaded, notes
)
SELECT
  t.id, u.id,
  'DBS-008-EK', '2025-01-15', '2028-01-15',
  'uk_national',
  'N/A', NULL, NULL,
  '2025-11-20', '2026-11-20', TRUE, FALSE, FALSE,
  'New joiner Jan 2025. Appraisal due Nov 2026. Manager sign-off and docs outstanding.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'ece.kurt@edgbastonwellness.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ── Joseph Enemuwe — Solutions Architect ──────────────────────────────────────
INSERT INTO compliance_hr_records (
  tenant_id, user_id, dbs_number, dbs_issue_date, dbs_expiry_date,
  rtw_type, registration_body, registration_number, registration_expiry,
  last_appraisal_date, next_appraisal_date, staff_signed, manager_signed,
  documents_uploaded, notes
)
SELECT
  t.id, u.id,
  NULL, NULL, NULL,
  'uk_national',
  'N/A', NULL, NULL,
  NULL, NULL, FALSE, FALSE, FALSE,
  'External contractor (Jwebly Ltd). DBS not required. System admin access only.'
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'joseph@jwebly.co.uk'
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- =============================================================================
-- 2. TRAINING RECORDS
--    Seeds completed training for clinical + key admin staff.
--    Uses a mix of compliant, due-soon, and overdue entries for realistic dashboard.
--    Frequency months: fire_safety=12, manual_handling=36, safeguarding=36,
--    basic_life_support=12, infection_control=12, info_governance=12, cqc_awareness=12
-- =============================================================================

-- Helper: insert one training record
-- Pattern: email, module, freq_months, completed_date, expiry_date

-- ── Dr Suresh Ganta ──────────────────────────────────────────────────────────
INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
SELECT t.id, u.id, m.module, m.freq, m.completed::DATE, m.expiry::DATE
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'suresh@edgbastonwellness.co.uk'
CROSS JOIN (VALUES
  ('fire_safety',           12, '2025-09-10', '2026-09-10'),
  ('manual_handling',       36, '2024-02-14', '2027-02-14'),
  ('safeguarding_adults',   36, '2024-03-20', '2027-03-20'),
  ('safeguarding_children', 36, '2024-03-20', '2027-03-20'),
  ('basic_life_support',    12, '2025-01-08', '2026-01-08'),
  ('infection_control',     12, '2025-08-01', '2026-08-01'),
  ('information_governance',12, '2025-07-15', '2026-07-15'),
  ('mental_capacity_act',   36, '2024-05-10', '2027-05-10'),
  ('medicines_management',  12, '2025-04-20', '2026-04-20'),
  ('cqc_awareness',         12, '2025-03-05', '2026-03-05')
) AS m(module, freq, completed, expiry)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id, module) DO NOTHING;

-- ── Dr K Penumaka ────────────────────────────────────────────────────────────
INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
SELECT t.id, u.id, m.module, m.freq, m.completed::DATE, m.expiry::DATE
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'k.penumaka@edgbastonwellness.co.uk'
CROSS JOIN (VALUES
  ('fire_safety',           12, '2025-09-10', '2026-09-10'),
  ('manual_handling',       36, '2023-06-01', '2026-06-01'),
  ('safeguarding_adults',   36, '2024-03-20', '2027-03-20'),
  ('safeguarding_children', 36, '2024-03-20', '2027-03-20'),
  ('basic_life_support',    12, '2025-02-10', '2026-02-10'),
  ('infection_control',     12, '2025-08-01', '2026-08-01'),
  ('information_governance',12, '2025-07-15', '2026-07-15'),
  ('mental_capacity_act',   36, '2024-05-10', '2027-05-10'),
  ('medicines_management',  12, '2025-04-20', '2026-04-20'),
  ('cqc_awareness',         12, '2025-03-05', '2026-03-05')
) AS m(module, freq, completed, expiry)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id, module) DO NOTHING;

-- ── Lubna Bibi ───────────────────────────────────────────────────────────────
INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
SELECT t.id, u.id, m.module, m.freq, m.completed::DATE, m.expiry::DATE
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'lubna.bibi@edgbastonwellness.co.uk'
CROSS JOIN (VALUES
  ('fire_safety',           12, '2025-09-10', '2026-09-10'),
  ('manual_handling',       36, '2023-07-05', '2026-07-05'),
  ('safeguarding_adults',   36, '2024-04-15', '2027-04-15'),
  ('safeguarding_children', 36, '2024-04-15', '2027-04-15'),
  ('basic_life_support',    12, '2025-03-01', '2026-03-01'),
  ('infection_control',     12, '2025-08-01', '2026-08-01'),
  ('information_governance',12, '2024-07-10', '2025-07-10'),
  ('cqc_awareness',         12, '2025-02-20', '2026-02-20')
) AS m(module, freq, completed, expiry)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id, module) DO NOTHING;

-- ── Nikita V ─────────────────────────────────────────────────────────────────
INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
SELECT t.id, u.id, m.module, m.freq, m.completed::DATE, m.expiry::DATE
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'nikita.v@edgbastonwellness.co.uk'
CROSS JOIN (VALUES
  ('fire_safety',           12, '2025-09-10', '2026-09-10'),
  ('manual_handling',       36, '2023-08-12', '2026-08-12'),
  ('safeguarding_adults',   36, '2024-04-15', '2027-04-15'),
  ('safeguarding_children', 36, '2024-04-15', '2027-04-15'),
  ('basic_life_support',    12, '2024-12-01', '2025-12-01'),
  ('infection_control',     12, '2025-08-01', '2026-08-01'),
  ('information_governance',12, '2024-08-20', '2025-08-20'),
  ('cqc_awareness',         12, '2025-02-20', '2026-02-20')
) AS m(module, freq, completed, expiry)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id, module) DO NOTHING;

-- ── Mr Syed Ahmad ────────────────────────────────────────────────────────────
INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
SELECT t.id, u.id, m.module, m.freq, m.completed::DATE, m.expiry::DATE
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'syed.ahmad@edgbastonwellness.co.uk'
CROSS JOIN (VALUES
  ('fire_safety',           12, '2025-09-10', '2026-09-10'),
  ('manual_handling',       36, '2024-01-20', '2027-01-20'),
  ('safeguarding_adults',   36, '2024-06-05', '2027-06-05'),
  ('infection_control',     12, '2025-08-01', '2026-08-01'),
  ('information_governance',12, '2025-07-15', '2026-07-15'),
  ('cqc_awareness',         12, '2025-03-10', '2026-03-10'),
  ('health_safety',         36, '2024-02-10', '2027-02-10')
) AS m(module, freq, completed, expiry)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id, module) DO NOTHING;

-- ── Mr Benjamin Hawthorne ────────────────────────────────────────────────────
INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
SELECT t.id, u.id, m.module, m.freq, m.completed::DATE, m.expiry::DATE
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'benjamin.hawthorne@edgbastonwellness.co.uk'
CROSS JOIN (VALUES
  ('fire_safety',           12, '2025-09-10', '2026-09-10'),
  ('manual_handling',       36, '2024-03-15', '2027-03-15'),
  ('safeguarding_adults',   36, '2024-06-05', '2027-06-05'),
  ('safeguarding_children', 36, '2024-06-05', '2027-06-05'),
  ('infection_control',     12, '2025-08-01', '2026-08-01'),
  ('information_governance',12, '2025-07-15', '2026-07-15'),
  ('conflict_resolution',   24, '2024-04-10', '2026-04-10'),
  ('cqc_awareness',         12, '2025-03-10', '2026-03-10')
) AS m(module, freq, completed, expiry)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id, module) DO NOTHING;

-- ── Ms Dionne Jackson ────────────────────────────────────────────────────────
INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
SELECT t.id, u.id, m.module, m.freq, m.completed::DATE, m.expiry::DATE
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'dionne.jackson@edgbastonwellness.co.uk'
CROSS JOIN (VALUES
  ('fire_safety',           12, '2025-09-10', '2026-09-10'),
  ('manual_handling',       36, '2024-03-15', '2027-03-15'),
  ('safeguarding_adults',   36, '2024-06-05', '2027-06-05'),
  ('safeguarding_children', 36, '2024-06-05', '2027-06-05'),
  ('infection_control',     12, '2025-08-01', '2026-08-01'),
  ('information_governance',12, '2025-07-15', '2026-07-15'),
  ('conflict_resolution',   24, '2024-09-01', '2026-09-01'),
  ('cqc_awareness',         12, '2025-03-10', '2026-03-10')
) AS m(module, freq, completed, expiry)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id, module) DO NOTHING;

-- ── Miss Ece Kurt ────────────────────────────────────────────────────────────
INSERT INTO compliance_training (tenant_id, user_id, module, frequency_months, completed_date, expiry_date)
SELECT t.id, u.id, m.module, m.freq, m.completed::DATE, m.expiry::DATE
FROM tenants t
JOIN users u ON u.tenant_id = t.id AND u.email = 'ece.kurt@edgbastonwellness.co.uk'
CROSS JOIN (VALUES
  ('fire_safety',           12, '2025-09-10', '2026-09-10'),
  ('safeguarding_adults',   36, '2025-02-10', '2028-02-10'),
  ('infection_control',     12, '2025-08-01', '2026-08-01'),
  ('information_governance',12, '2025-02-10', '2026-02-10'),
  ('cqc_awareness',         12, '2025-03-10', '2026-03-10')
) AS m(module, freq, completed, expiry)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, user_id, module) DO NOTHING;

DO $$ BEGIN RAISE NOTICE '=== Migration 066: HR + Training Seed — COMPLETE ==='; END $$;

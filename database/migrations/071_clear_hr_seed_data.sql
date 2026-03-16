-- =============================================================================
-- Migration 071: Clear pre-seeded HR record data
-- Removes all compliance data seeded by migration 069 from compliance_hr_records.
-- Keeps: staff_id, job_title, dept_team (set by migration 070 from users table).
-- All other fields (DBS, RTW, registration, appraisals, sign-offs, notes) are
-- cleared so the client can enter their own data from scratch.
-- Idempotent — safe to re-run.
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== Migration 071: Clear HR seed data — START ==='; END $$;

UPDATE compliance_hr_records chr
SET
  dbs_number            = NULL,
  dbs_issue_date        = NULL,
  dbs_expiry_date       = NULL,
  rtw_type              = NULL,
  rtw_expiry_date       = NULL,
  registration_body     = NULL,
  registration_number   = NULL,
  registration_expiry   = NULL,
  last_appraisal_date   = NULL,
  next_appraisal_date   = NULL,
  staff_signed          = FALSE,
  manager_signed        = FALSE,
  documents_uploaded    = FALSE,
  notes                 = NULL
FROM tenants t
WHERE chr.tenant_id = t.id
  AND t.slug = 'edgbaston-wellness';

DO $$ BEGIN RAISE NOTICE '071: All HR compliance data cleared — staff IDs and job titles retained.'; END $$;
DO $$ BEGIN RAISE NOTICE '=== Migration 071: Clear HR seed data — DONE ==='; END $$;

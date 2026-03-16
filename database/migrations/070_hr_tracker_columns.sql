-- =============================================================================
-- Migration 070: HR Tracker — additional columns + staff ID assignment
-- Idempotent. Run in Supabase SQL editor AFTER 054 + 055 + 069.
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== Migration 070: HR Tracker columns — START ==='; END $$;

-- ── 1. Add new columns (IF NOT EXISTS — safe to re-run) ──────────────────────
ALTER TABLE compliance_hr_records
  ADD COLUMN IF NOT EXISTS staff_id      TEXT,
  ADD COLUMN IF NOT EXISTS job_title     TEXT,
  ADD COLUMN IF NOT EXISTS dept_team     TEXT,
  ADD COLUMN IF NOT EXISTS start_date    DATE,
  ADD COLUMN IF NOT EXISTS contract_type TEXT;

-- ── 2. Ensure every real EWC staff member has an HR record row ───────────────
--    Excludes: system admin, Jwebly dev, shared reception account
INSERT INTO compliance_hr_records (tenant_id, user_id)
SELECT t.id, u.id
FROM tenants t
JOIN users u ON u.tenant_id = t.id
WHERE t.slug = 'edgbaston-wellness'
  AND u.email NOT IN (
    'admin@edgbastonwellness.co.uk',
    'joseph@jwebly.co.uk',
    'reception@edgbastonwellness.co.uk'
  )
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ── 3. Assign staff IDs alphabetically by last_name, first_name ──────────────
WITH ranked AS (
  SELECT
    u.id AS user_id,
    ROW_NUMBER() OVER (ORDER BY u.last_name, u.first_name) AS rn
  FROM tenants t
  JOIN users u ON u.tenant_id = t.id
  WHERE t.slug = 'edgbaston-wellness'
    AND u.email NOT IN (
      'admin@edgbastonwellness.co.uk',
      'joseph@jwebly.co.uk',
      'reception@edgbastonwellness.co.uk'
    )
),
ids AS (
  SELECT user_id, 'S' || LPAD(rn::TEXT, 3, '0') AS staff_id
  FROM ranked
)
UPDATE compliance_hr_records chr
SET    staff_id = ids.staff_id
FROM   ids
JOIN   tenants t ON t.slug = 'edgbaston-wellness'
WHERE  chr.user_id    = ids.user_id
  AND  chr.tenant_id  = t.id;

-- ── 4. Pre-populate job_title from users.job_title (already known) ────────────
UPDATE compliance_hr_records chr
SET    job_title = u.job_title,
       dept_team = d.name
FROM   users u
JOIN   tenants t ON t.id = u.tenant_id
LEFT JOIN departments d ON d.id = u.department_id
WHERE  chr.user_id   = u.id
  AND  chr.tenant_id = t.id
  AND  t.slug = 'edgbaston-wellness'
  AND  chr.job_title IS NULL;

DO $$ BEGIN RAISE NOTICE '070: HR Tracker columns added + staff IDs assigned.'; END $$;
DO $$ BEGIN RAISE NOTICE '=== Migration 070: HR Tracker columns — DONE ==='; END $$;

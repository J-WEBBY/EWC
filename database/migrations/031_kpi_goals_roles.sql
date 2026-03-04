-- =============================================================================
-- Migration 031: KPI Goals, Compliance Items, New Roles
--
-- Adds:
--   1. support_admin role (level 70, isAdmin: true) — office manager / ops lead
--   2. Updates viewer role — adds can_view_reports + can_view_compliance
--      for external audit / compliance review use cases
--   3. staff_goals table — personal / department / clinic goals
--   4. goal_updates table — timestamped progress logs per goal
--   5. staff_compliance_items table — per-staff cert, training, CQC items
-- =============================================================================

-- =============================================================================
-- 1. ADD SUPPORT_ADMIN ROLE
-- =============================================================================

INSERT INTO roles (name, slug, permission_level, is_admin, permissions)
VALUES (
  'Support Admin',
  'support_admin',
  70,
  TRUE,
  '{
    "can_manage_users":             false,
    "can_manage_agents":            false,
    "can_view_all_signals":         true,
    "can_approve_signals":          true,
    "can_manage_knowledge_base":    false,
    "can_view_reports":             true,
    "can_view_analytics":           true,
    "can_manage_integrations":      false,
    "can_manage_system":            false,
    "can_view_audit_trail":         false,
    "can_view_voice":               true,
    "can_view_patients":            true,
    "can_view_compliance":          true,
    "can_view_all_staff_kpis":      true,
    "can_set_department_goals":     true,
    "can_approve_compliance_items": true
  }'
)
ON CONFLICT (slug) DO UPDATE SET
  permission_level = EXCLUDED.permission_level,
  is_admin         = EXCLUDED.is_admin,
  permissions      = EXCLUDED.permissions;

-- =============================================================================
-- 2. UPDATE VIEWER ROLE — external audit / compliance review access
-- =============================================================================

UPDATE roles SET
  name        = 'View Only',
  permissions = '{
    "can_manage_users":             false,
    "can_view_all_signals":         false,
    "can_view_department_signals":  false,
    "can_create_signals":           false,
    "can_approve_signals":          false,
    "can_view_reports":             true,
    "can_view_analytics":           false,
    "can_manage_integrations":      false,
    "can_manage_system":            false,
    "can_view_voice":               false,
    "can_view_patients":            false,
    "can_view_compliance":          true,
    "can_view_all_staff_kpis":      true,
    "can_view_audit_trail":         false
  }'
WHERE slug = 'viewer';

-- =============================================================================
-- 3. STAFF_GOALS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS staff_goals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by     UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Content
  title           TEXT        NOT NULL,
  description     TEXT,
  notes           TEXT,

  -- Classification
  category        TEXT        NOT NULL
    CHECK (category IN (
      'appointments', 'revenue', 'patients', 'compliance',
      'training', 'operational', 'personal', 'retention', 'acquisition'
    )),
  scope           TEXT        NOT NULL DEFAULT 'personal'
    CHECK (scope IN ('personal', 'department', 'clinic')),

  -- Measurement
  target_value    DECIMAL(12, 2) NOT NULL,
  current_value   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  unit            TEXT        NOT NULL DEFAULT 'count'
    CHECK (unit IN (
      'count', 'gbp', 'percent', 'hours', 'sessions',
      'appointments', 'patients', 'days', 'score'
    )),

  -- Timing
  period          TEXT        NOT NULL DEFAULT 'monthly'
    CHECK (period IN ('weekly', 'monthly', 'quarterly', 'annual', 'custom')),
  start_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE        NOT NULL,

  -- Status (auto-computed in app, stored for query performance)
  status          TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN (
      'draft', 'active', 'on_track', 'at_risk', 'completed', 'missed', 'paused'
    )),

  -- Hierarchy (cascaded goals from director → team)
  is_cascaded     BOOLEAN     NOT NULL DEFAULT FALSE,
  parent_goal_id  UUID        REFERENCES staff_goals(id) ON DELETE SET NULL,
  department_id   UUID        REFERENCES departments(id) ON DELETE SET NULL,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_goals_owner    ON staff_goals(owner_id);
CREATE INDEX IF NOT EXISTS idx_staff_goals_status   ON staff_goals(status);
CREATE INDEX IF NOT EXISTS idx_staff_goals_scope    ON staff_goals(scope);
CREATE INDEX IF NOT EXISTS idx_staff_goals_period   ON staff_goals(period);
CREATE INDEX IF NOT EXISTS idx_staff_goals_due_date ON staff_goals(due_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_staff_goals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_staff_goals_updated_at
  BEFORE UPDATE ON staff_goals
  FOR EACH ROW EXECUTE FUNCTION update_staff_goals_updated_at();

-- =============================================================================
-- 4. GOAL_UPDATES TABLE — progress log
-- =============================================================================

CREATE TABLE IF NOT EXISTS goal_updates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id     UUID        NOT NULL REFERENCES staff_goals(id) ON DELETE CASCADE,
  value       DECIMAL(12, 2) NOT NULL,   -- new current_value being reported
  note        TEXT,
  updated_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_updates_goal_id    ON goal_updates(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_updates_created_at ON goal_updates(created_at);

-- =============================================================================
-- 5. STAFF_COMPLIANCE_ITEMS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS staff_compliance_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Classification
  category        TEXT        NOT NULL
    CHECK (category IN (
      'clinical_cert', 'training', 'dbs', 'registration',
      'cqc', 'gdpr', 'health_safety', 'equipment', 'insurance'
    )),
  title           TEXT        NOT NULL,
  description     TEXT,

  -- Status
  status          TEXT        NOT NULL DEFAULT 'not_started'
    CHECK (status IN (
      'compliant', 'due_soon', 'overdue', 'not_started', 'in_progress', 'waived', 'expired'
    )),

  -- Dates
  due_date        DATE,
  completed_date  DATE,
  expiry_date     DATE,       -- for certs that expire (DBS, GMC, NMC)

  -- Evidence
  evidence_url    TEXT,
  evidence_note   TEXT,

  -- Verification
  verified_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at     TIMESTAMPTZ,

  -- Config
  notify_days_before  INTEGER NOT NULL DEFAULT 30,  -- days before due/expiry to flag
  is_cqc_critical     BOOLEAN NOT NULL DEFAULT FALSE,
  is_mandatory        BOOLEAN NOT NULL DEFAULT TRUE,
  is_recurring        BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_months   INTEGER,  -- e.g. 12 = annual renewal

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_owner    ON staff_compliance_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status   ON staff_compliance_items(status);
CREATE INDEX IF NOT EXISTS idx_compliance_category ON staff_compliance_items(category);
CREATE INDEX IF NOT EXISTS idx_compliance_due_date ON staff_compliance_items(due_date);
CREATE INDEX IF NOT EXISTS idx_compliance_cqc      ON staff_compliance_items(is_cqc_critical);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_compliance_updated_at
  BEFORE UPDATE ON staff_compliance_items
  FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

-- =============================================================================
-- VERIFY
-- =============================================================================

DO $$
DECLARE
  v_roles       INT;
  v_goals_cols  INT;
  v_comp_cols   INT;
BEGIN
  SELECT COUNT(*) INTO v_roles FROM roles;
  SELECT COUNT(*) INTO v_goals_cols
    FROM information_schema.columns WHERE table_name = 'staff_goals';
  SELECT COUNT(*) INTO v_comp_cols
    FROM information_schema.columns WHERE table_name = 'staff_compliance_items';

  RAISE NOTICE '✓ Migration 031 complete';
  RAISE NOTICE '  Total roles: %',              v_roles;
  RAISE NOTICE '  staff_goals columns: %',      v_goals_cols;
  RAISE NOTICE '  staff_compliance_items cols: %', v_comp_cols;
  RAISE NOTICE '  New role: support_admin (level 70, is_admin=true)';
  RAISE NOTICE '  Updated: viewer → View Only (can_view_reports + can_view_compliance)';
END $$;

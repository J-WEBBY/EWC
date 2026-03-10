-- =============================================================================
-- Jwebly Health Platform Schema — Migration 001
-- Run in the NEW Supabase project (jptrsqadybyzkxznwtql)
-- =============================================================================

-- ── Tenants ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        UNIQUE NOT NULL,          -- e.g. 'ewc'
  name            TEXT        NOT NULL,                 -- 'Edgbaston Wellness Clinic'
  schema_name     TEXT        UNIQUE NOT NULL,          -- PostgreSQL schema name
  status          TEXT        NOT NULL DEFAULT 'onboarding'
                              CHECK (status IN ('onboarding','active','suspended','trial')),
  plan            TEXT        NOT NULL DEFAULT 'starter'
                              CHECK (plan IN ('starter','growth','enterprise')),
  activated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Activation Keys ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activation_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key_plain       TEXT        UNIQUE NOT NULL,          -- JWBLY-XXXX-XXXX-XXXX-XXXX (plaintext for dev; hash in prod)
  key_preview     TEXT        NOT NULL,                 -- last segment for display e.g. 'A001'
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','claimed','expired','revoked')),
  claimed_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Onboarding State ─────────────────────────────────────────────────────────
-- Stores pre-populated + user-confirmed data per onboarding phase
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  activation_key_id UUID      REFERENCES activation_keys(id),
  current_phase   INT         NOT NULL DEFAULT 1,        -- 1–6
  completed_phases INT[]      NOT NULL DEFAULT '{}',
  phase_data      JSONB       NOT NULL DEFAULT '{}',     -- all phase payloads keyed by phase number
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Pre-onboarding Clinic Data ────────────────────────────────────────────────
-- Agency-populated before handing key to client
CREATE TABLE IF NOT EXISTS clinic_profiles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Overview (Phase 1)
  clinic_name     TEXT        NOT NULL,
  clinic_type     TEXT[]      NOT NULL DEFAULT '{}',     -- ['aesthetics','wellness','medical']
  tagline         TEXT,
  address_line1   TEXT,
  address_line2   TEXT,
  city            TEXT,
  postcode        TEXT,
  phone           TEXT,
  email           TEXT,
  website         TEXT,
  cqc_number      TEXT,
  founded_year    INT,
  director_name   TEXT,
  director_title  TEXT,

  -- Brand (Phase 2)
  primary_color   TEXT        DEFAULT '#0058E6',
  logo_url        TEXT,
  agent_name      TEXT        DEFAULT 'Aria',            -- primary AI agent
  receptionist_name TEXT      DEFAULT 'Komal',           -- voice receptionist

  -- Confirmed by client
  overview_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  brand_confirmed     BOOLEAN NOT NULL DEFAULT FALSE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Team (Phase 3 — pre-populated by agency) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_team_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name      TEXT        NOT NULL,
  last_name       TEXT        NOT NULL,
  role            TEXT        NOT NULL,                  -- 'director','practitioner','receptionist','admin','nurse'
  department      TEXT,
  email           TEXT,
  phone           TEXT,
  is_admin        BOOLEAN     NOT NULL DEFAULT FALSE,
  username        TEXT,                                  -- generated in Phase 4
  temp_password   TEXT,                                  -- one-time, hashed after download
  credentials_downloaded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activation_keys_tenant  ON activation_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activation_keys_status  ON activation_keys(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_tenant       ON onboarding_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_tenant             ON onboarding_team_members(tenant_id);

-- ── Updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION platform_set_updated_at();

CREATE OR REPLACE TRIGGER onboarding_updated_at
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION platform_set_updated_at();

CREATE OR REPLACE TRIGGER clinic_profiles_updated_at
  BEFORE UPDATE ON clinic_profiles
  FOR EACH ROW EXECUTE FUNCTION platform_set_updated_at();

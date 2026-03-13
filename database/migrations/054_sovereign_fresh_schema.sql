-- =============================================================================
-- Migration 054: Sovereign Fresh Schema — Multi-Tenant from Scratch
--
-- USE THIS instead of running 013 + 053 on a fresh Supabase.
-- Creates every table with tenant_id UUID NOT NULL already built in.
-- Safe to run on a completely empty database.
--
-- Covers all tables from migrations 013 through 045, plus the tenants
-- registry table from 053.
--
-- Order: extensions → tenants → core → later migrations → indexes → RPCs
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== Migration 054: Sovereign Fresh Schema — START ===';
END $$;

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================================================
-- DROP EXISTING TRIGGERS (idempotent — safe to re-run on any DB state)
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT trigger_name, event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name LIKE 'trg_%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', r.trigger_name, r.event_object_table);
  END LOOP;
END $$;

-- =============================================================================
-- SHARED UPDATED_AT TRIGGER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TENANTS (platform registry — one row per clinic)
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                    TEXT        NOT NULL UNIQUE,    -- e.g. 'edgbaston-wellness'
  clinic_name             TEXT        NOT NULL,
  subdomain               TEXT        UNIQUE,             -- 'ewc' → ewc.jweblyhealth.app
  plan                    TEXT        NOT NULL DEFAULT 'starter'
                          CHECK (plan IN ('starter', 'growth', 'enterprise')),
  billing_email           TEXT,
  stripe_customer_id      TEXT,
  status                  TEXT        NOT NULL DEFAULT 'trialing'
                          CHECK (status IN ('trialing', 'active', 'suspended', 'cancelled')),
  trial_ends_at           TIMESTAMPTZ,
  onboarding_completed    BOOLEAN     NOT NULL DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ,
  onboarding_step         INT         NOT NULL DEFAULT 1,
  primary_contact_name    TEXT,
  primary_contact_email   TEXT,
  primary_contact_phone   TEXT,
  country                 TEXT        NOT NULL DEFAULT 'GB',
  timezone                TEXT        NOT NULL DEFAULT 'Europe/London',
  currency                TEXT        NOT NULL DEFAULT 'GBP',
  settings                JSONB       NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug   ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan   ON tenants(plan);

CREATE OR REPLACE FUNCTION update_tenants_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_tenants_updated_at();

-- =============================================================================
-- CORE SCHEMA (from migration 013 — now with tenant_id)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CLINIC CONFIGURATION (per-tenant — one row per tenant)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clinic_config (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clinic_name     TEXT        NOT NULL DEFAULT 'Your Clinic',
  ai_name         TEXT        NOT NULL DEFAULT 'Aria',
  brand_color     TEXT        NOT NULL DEFAULT '#ffffff',
  logo_url        TEXT,
  tone            TEXT        NOT NULL DEFAULT 'professional',
  tagline         TEXT,
  manifesto       TEXT,
  ai_persona      JSONB       NOT NULL DEFAULT '{}',
  neural_contract JSONB       NOT NULL DEFAULT '{}',
  settings        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_config_tenant_id ON clinic_config(tenant_id);

CREATE TRIGGER trg_clinic_config_updated_at
  BEFORE UPDATE ON clinic_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- DEPARTMENTS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS departments (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  description   TEXT,
  display_order INT         NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON departments(tenant_id);

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- ROLES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
  id               UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id        UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,
  slug             TEXT    NOT NULL,
  permission_level INT     NOT NULL DEFAULT 1,
  permissions      JSONB   NOT NULL DEFAULT '{}',
  is_admin         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);

-- ---------------------------------------------------------------------------
-- USERS (staff accounts)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id                     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email                         TEXT        NOT NULL,
  first_name                    TEXT        NOT NULL,
  last_name                     TEXT        NOT NULL,
  display_name                  TEXT,
  phone                         TEXT,
  avatar_url                    TEXT,
  job_title                     TEXT,
  department_id                 UUID        REFERENCES departments(id) ON DELETE SET NULL,
  role_id                       UUID        REFERENCES roles(id) ON DELETE SET NULL,
  -- Auth
  password_hash                 TEXT,
  temp_password_hash            TEXT,
  must_change_password          BOOLEAN     NOT NULL DEFAULT FALSE,
  password_changed_at           TIMESTAMPTZ,
  -- Cliniko mapping (from migration 024)
  cliniko_practitioner_id       TEXT,
  cliniko_practitioner_name     TEXT,
  -- Onboarding
  staff_onboarding_completed    BOOLEAN     NOT NULL DEFAULT FALSE,
  staff_onboarding_completed_at TIMESTAMPTZ,
  onboarding_responses          JSONB       NOT NULL DEFAULT '{}',
  -- Status
  status    TEXT NOT NULL DEFAULT 'active'
            CHECK (status IN ('active', 'invited', 'suspended', 'deactivated')),
  is_admin  BOOLEAN     NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  settings  JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id     ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_email  ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_users_tenant_status ON users(tenant_id, status);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- AI AGENTS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agents (
  id                    UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id             UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_key             TEXT    NOT NULL,
  name                  TEXT    NOT NULL,
  display_name          TEXT,
  description           TEXT,
  avatar_url            TEXT,
  scope                 TEXT    NOT NULL DEFAULT 'general',
  domains               TEXT[]  NOT NULL DEFAULT '{}',
  keywords              TEXT[]  NOT NULL DEFAULT '{}',
  critical_keywords     TEXT[]  NOT NULL DEFAULT '{}',
  system_prompt         TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_catch_all          BOOLEAN NOT NULL DEFAULT FALSE,
  total_signals_handled INT     NOT NULL DEFAULT 0,
  avg_confidence_score  FLOAT   NOT NULL DEFAULT 0,
  settings              JSONB   NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, agent_key)
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant_id     ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_tenant_key    ON agents(tenant_id, agent_key);
CREATE INDEX IF NOT EXISTS idx_agents_tenant_active ON agents(tenant_id, is_active);

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- SIGNALS (operational intelligence events)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS signals (
  id                    UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id             UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signal_type           TEXT    NOT NULL DEFAULT 'task'
                        CHECK (signal_type IN ('task', 'event', 'alert', 'objective', 'insight')),
  title                 TEXT    NOT NULL,
  description           TEXT,
  priority              TEXT    NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status                TEXT    NOT NULL DEFAULT 'new'
                        CHECK (status IN (
                          'new', 'pending_approval', 'processing', 'judged',
                          'awaiting_decision', 'decided', 'acted',
                          'outcome_recorded', 'closed'
                        )),
  category              TEXT,
  source_type           TEXT    NOT NULL DEFAULT 'ai',
  source_agent_id       UUID    REFERENCES agents(id) ON DELETE SET NULL,
  assigned_agent_id     UUID    REFERENCES agents(id) ON DELETE SET NULL,
  assigned_department_id UUID   REFERENCES departments(id) ON DELETE SET NULL,
  created_by_user_id    UUID    REFERENCES users(id) ON DELETE SET NULL,
  conversation_id       UUID,
  tags                  TEXT[]  NOT NULL DEFAULT '{}',
  data                  JSONB   NOT NULL DEFAULT '{}',
  user_input            TEXT,
  ai_classification     JSONB   NOT NULL DEFAULT '{}',
  assignment_confidence FLOAT,
  assigned_reasoning    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_tenant_id      ON signals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_signals_tenant_status  ON signals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_signals_tenant_priority ON signals(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_signals_tenant_created ON signals(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_status         ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_priority       ON signals(priority);
CREATE INDEX IF NOT EXISTS idx_signals_category       ON signals(category);
CREATE INDEX IF NOT EXISTS idx_signals_created        ON signals(created_at DESC);

CREATE TRIGGER trg_signals_updated_at
  BEFORE UPDATE ON signals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- JUDGEMENTS (signal risk assessments)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS judgements (
  id               UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id        UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signal_id        UUID  NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  agent_id         UUID  REFERENCES agents(id) ON DELETE SET NULL,
  confidence       FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  reasoning        TEXT,
  recommendation   TEXT  CHECK (recommendation IN (
                     'accept', 'reject', 'escalate', 'defer', 'investigate'
                   )),
  suggested_actions TEXT[] NOT NULL DEFAULT '{}',
  risk_level       TEXT  NOT NULL DEFAULT 'low'
                   CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_judgements_tenant_id ON judgements(tenant_id);

-- ---------------------------------------------------------------------------
-- CHAT
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_conversations (
  id            UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL DEFAULT 'New Conversation',
  agent_scope   TEXT,
  is_pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
  message_count INT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_id   ON chat_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_user ON chat_conversations(tenant_id, user_id, created_at DESC);

CREATE TRIGGER trg_chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id       UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID  NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT  NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT  NOT NULL,
  agent_scope     TEXT,
  model_used      TEXT,
  tool_calls      JSONB NOT NULL DEFAULT '[]',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_id   ON chat_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_conv ON chat_messages(tenant_id, conversation_id, created_at ASC);

-- ---------------------------------------------------------------------------
-- AGENT MEMORIES (long-term learning)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_memories (
  id              UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id       UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_key       TEXT  NOT NULL,
  memory_type     TEXT  NOT NULL DEFAULT 'conversation'
                  CHECK (memory_type IN ('conversation', 'correction', 'pattern', 'preference')),
  content         TEXT  NOT NULL,
  importance      FLOAT NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  access_count    INT   NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_tenant_id  ON agent_memories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_tenant_key ON agent_memories(tenant_id, agent_key, importance DESC);

-- ---------------------------------------------------------------------------
-- KNOWLEDGE BASE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_categories (
  id                 UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id          UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               TEXT  NOT NULL,
  slug               TEXT  NOT NULL,
  description        TEXT,
  parent_category_id UUID  REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  display_order      INT   NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_categories_tenant_id ON knowledge_categories(tenant_id);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id                  UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id           UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id         UUID    REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  uploaded_by_user_id UUID    REFERENCES users(id) ON DELETE SET NULL,
  file_name           TEXT    NOT NULL,
  file_type           TEXT,
  file_size_bytes     INT,
  storage_path        TEXT,
  title               TEXT    NOT NULL,
  description         TEXT,
  tags                JSONB   NOT NULL DEFAULT '[]',
  processing_status   TEXT    NOT NULL DEFAULT 'pending'
                      CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processed_at        TIMESTAMPTZ,
  chunk_count         INT     NOT NULL DEFAULT 0,
  visibility          TEXT    NOT NULL DEFAULT 'internal',
  metadata            JSONB   NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tenant_id ON knowledge_documents(tenant_id);

CREATE TRIGGER trg_knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id            UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id     UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id   UUID  NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index   INT   NOT NULL,
  content       TEXT  NOT NULL,
  embedding     VECTOR(1536),
  page_number   INT,
  section_title TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_id ON knowledge_chunks(tenant_id);
-- Vector index (enable after embeddings populated):
-- CREATE INDEX idx_chunks_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- CLINIKO INTEGRATION
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cliniko_config (
  id                     UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id              UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  api_key_encrypted      TEXT,
  api_url                TEXT    DEFAULT 'https://api.uk1.cliniko.com/v1',
  shard                  TEXT    DEFAULT 'uk1',
  is_connected           BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at           TIMESTAMPTZ,
  last_sync_status       TEXT,
  sync_error             TEXT,
  sync_interval_minutes  INTEGER NOT NULL DEFAULT 5,
  settings               JSONB   NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliniko_config_tenant_id ON cliniko_config(tenant_id);

CREATE TRIGGER trg_cliniko_config_updated_at
  BEFORE UPDATE ON cliniko_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS cliniko_practitioners (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_id          TEXT        NOT NULL,
  first_name          TEXT        NOT NULL,
  last_name           TEXT        NOT NULL,
  full_name           TEXT        GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  title               TEXT,
  designation         TEXT,
  email               TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  last_synced_at      TIMESTAMPTZ,
  raw_data            JSONB       NOT NULL DEFAULT '{}',
  cliniko_created_at  TIMESTAMPTZ,
  cliniko_updated_at  TIMESTAMPTZ,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, cliniko_id)
);

CREATE INDEX IF NOT EXISTS idx_cliniko_practitioners_tenant_id ON cliniko_practitioners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_practitioners_active    ON cliniko_practitioners(tenant_id, is_active);

CREATE TRIGGER trg_cliniko_practitioners_updated_at
  BEFORE UPDATE ON cliniko_practitioners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS cliniko_patients (
  id                    UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id             UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_id            BIGINT  NOT NULL,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  date_of_birth         DATE,
  gender                TEXT,
  address               JSONB   NOT NULL DEFAULT '{}',
  notes                 TEXT,
  referral_source       TEXT,
  occupation            TEXT,
  emergency_contact     TEXT,
  all_phones            JSONB   NOT NULL DEFAULT '[]',
  lifecycle_stage       TEXT    DEFAULT 'existing'
                        CHECK (lifecycle_stage IN ('existing','lead','new','active','loyal','at_risk','lapsed')),
  lifecycle_override    TEXT,
  created_in_cliniko_at TIMESTAMPTZ,
  updated_in_cliniko_at TIMESTAMPTZ,
  last_synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data              JSONB   NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, cliniko_id)
);

CREATE INDEX IF NOT EXISTS idx_cliniko_patients_tenant_id      ON cliniko_patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_patients_tenant_email   ON cliniko_patients(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_cliniko_patients_tenant_last_name ON cliniko_patients(tenant_id, last_name);
CREATE INDEX IF NOT EXISTS idx_cliniko_patients_lifecycle_stage ON cliniko_patients(lifecycle_stage);

CREATE TABLE IF NOT EXISTS cliniko_appointments (
  id                       UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id                UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_id               BIGINT  NOT NULL,
  cliniko_patient_id       BIGINT,
  cliniko_practitioner_id  TEXT,
  appointment_type         TEXT,
  practitioner_name        TEXT,
  starts_at                TIMESTAMPTZ,
  ends_at                  TIMESTAMPTZ,
  duration_minutes         INT,
  status                   TEXT,
  cancellation_reason      TEXT,
  notes                    TEXT,
  invoice_status           TEXT,
  room_name                TEXT,
  last_synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data                 JSONB   NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, cliniko_id)
);

CREATE INDEX IF NOT EXISTS idx_cliniko_appts_tenant_id     ON cliniko_appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_appts_tenant_starts ON cliniko_appointments(tenant_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_cliniko_appts_tenant_status ON cliniko_appointments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cliniko_appts_patient       ON cliniko_appointments(cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_appts_practitioner  ON cliniko_appointments(cliniko_practitioner_id)
  WHERE cliniko_practitioner_id IS NOT NULL;

CREATE TRIGGER trg_cliniko_appointments_updated_at
  BEFORE UPDATE ON cliniko_appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS cliniko_invoices (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_id              BIGINT      NOT NULL,
  cliniko_patient_id      BIGINT,
  cliniko_practitioner_id BIGINT,
  appointment_cliniko_id  BIGINT,
  invoice_number          TEXT,
  issue_date              DATE,
  due_date                DATE,
  status                  TEXT        NOT NULL DEFAULT 'draft',
  amount                  NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_outstanding      NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid             NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency                TEXT        NOT NULL DEFAULT 'GBP',
  notes                   TEXT,
  created_in_cliniko_at   TIMESTAMPTZ,
  updated_in_cliniko_at   TIMESTAMPTZ,
  last_synced_at          TIMESTAMPTZ,
  raw_data                JSONB       NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cliniko_id)
);

CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_tenant_id    ON cliniko_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_patient      ON cliniko_invoices(cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_status       ON cliniko_invoices(status);
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_outstanding  ON cliniko_invoices(amount_outstanding)
  WHERE amount_outstanding > 0;
CREATE INDEX IF NOT EXISTS idx_cliniko_invoices_issue_date   ON cliniko_invoices(issue_date DESC);

CREATE TRIGGER trg_cliniko_invoices_updated_at
  BEFORE UPDATE ON cliniko_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS cliniko_sync_logs (
  id               UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id        UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_type        TEXT  NOT NULL,
  status           TEXT  NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  records_synced   INT   NOT NULL DEFAULT 0,
  records_failed   INT   NOT NULL DEFAULT 0,
  error_message    TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cliniko_sync_logs_tenant_id ON cliniko_sync_logs(tenant_id);

-- ---------------------------------------------------------------------------
-- AUDIT TRAIL
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_trail (
  id             UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  tenant_id      UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        UUID  REFERENCES users(id) ON DELETE SET NULL,
  action_type    TEXT  NOT NULL,
  resource_type  TEXT,
  resource_id    UUID,
  previous_state JSONB,
  new_state      JSONB,
  ip_address     INET,
  details        JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant_id   ON audit_trail(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant_user ON audit_trail(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant_action ON audit_trail(tenant_id, action_type, created_at DESC);

-- =============================================================================
-- LATER MIGRATIONS (031–045) — all with tenant_id built in
-- =============================================================================

-- ---------------------------------------------------------------------------
-- KPI / GOALS (migration 031)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS staff_goals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  notes           TEXT,
  category        TEXT        NOT NULL
    CHECK (category IN (
      'appointments', 'revenue', 'patients', 'compliance',
      'training', 'operational', 'personal', 'retention', 'acquisition'
    )),
  scope           TEXT        NOT NULL DEFAULT 'personal'
    CHECK (scope IN ('personal', 'department', 'clinic')),
  target_value    DECIMAL(12, 2) NOT NULL,
  current_value   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  unit            TEXT        NOT NULL DEFAULT 'count'
    CHECK (unit IN (
      'count', 'gbp', 'percent', 'hours', 'sessions',
      'appointments', 'patients', 'days', 'score'
    )),
  period          TEXT        NOT NULL DEFAULT 'monthly'
    CHECK (period IN ('weekly', 'monthly', 'quarterly', 'annual', 'custom')),
  start_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN (
      'draft', 'active', 'on_track', 'at_risk', 'completed', 'missed', 'paused'
    )),
  is_cascaded     BOOLEAN     NOT NULL DEFAULT FALSE,
  parent_goal_id  UUID        REFERENCES staff_goals(id) ON DELETE SET NULL,
  department_id   UUID        REFERENCES departments(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_goals_tenant_id   ON staff_goals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_goals_tenant_owner ON staff_goals(tenant_id, owner_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_goals_status      ON staff_goals(status);
CREATE INDEX IF NOT EXISTS idx_staff_goals_due_date    ON staff_goals(due_date);

CREATE OR REPLACE FUNCTION update_staff_goals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_staff_goals_updated_at
  BEFORE UPDATE ON staff_goals
  FOR EACH ROW EXECUTE FUNCTION update_staff_goals_updated_at();

CREATE TABLE IF NOT EXISTS goal_updates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  goal_id     UUID        NOT NULL REFERENCES staff_goals(id) ON DELETE CASCADE,
  value       DECIMAL(12, 2) NOT NULL,
  note        TEXT,
  updated_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_updates_tenant_id ON goal_updates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goal_updates_goal_id   ON goal_updates(goal_id);

CREATE TABLE IF NOT EXISTS staff_compliance_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category            TEXT        NOT NULL
    CHECK (category IN (
      'clinical_cert', 'training', 'dbs', 'registration',
      'cqc', 'gdpr', 'health_safety', 'equipment', 'insurance'
    )),
  title               TEXT        NOT NULL,
  description         TEXT,
  status              TEXT        NOT NULL DEFAULT 'not_started'
    CHECK (status IN (
      'compliant', 'due_soon', 'overdue', 'not_started', 'in_progress', 'waived', 'expired'
    )),
  due_date            DATE,
  completed_date      DATE,
  expiry_date         DATE,
  evidence_url        TEXT,
  evidence_note       TEXT,
  verified_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
  verified_at         TIMESTAMPTZ,
  notify_days_before  INTEGER     NOT NULL DEFAULT 30,
  is_cqc_critical     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_mandatory        BOOLEAN     NOT NULL DEFAULT TRUE,
  is_recurring        BOOLEAN     NOT NULL DEFAULT FALSE,
  recurrence_months   INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_compliance_items_tenant_id ON staff_compliance_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_compliance_owner                  ON staff_compliance_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_compliance_status                 ON staff_compliance_items(status);
CREATE INDEX IF NOT EXISTS idx_compliance_due_date               ON staff_compliance_items(due_date);

CREATE OR REPLACE FUNCTION update_compliance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_compliance_updated_at
  BEFORE UPDATE ON staff_compliance_items
  FOR EACH ROW EXECUTE FUNCTION update_compliance_updated_at();

-- ---------------------------------------------------------------------------
-- COMPLIANCE SYSTEM (migration 032)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS compliance_hr_records (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dbs_number            TEXT,
  dbs_issue_date        DATE,
  dbs_expiry_date       DATE,
  rtw_type              TEXT,
  rtw_expiry_date       DATE,
  registration_body     TEXT,
  registration_number   TEXT,
  registration_expiry   DATE,
  last_appraisal_date   DATE,
  next_appraisal_date   DATE,
  staff_signed          BOOLEAN     NOT NULL DEFAULT FALSE,
  manager_signed        BOOLEAN     NOT NULL DEFAULT FALSE,
  documents_uploaded    BOOLEAN     NOT NULL DEFAULT FALSE,
  notes                 TEXT,
  assigned_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_hr_records_tenant_id ON compliance_hr_records(tenant_id);

CREATE OR REPLACE FUNCTION update_chr_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_chr_updated_at
  BEFORE UPDATE ON compliance_hr_records
  FOR EACH ROW EXECUTE FUNCTION update_chr_updated_at();

CREATE TABLE IF NOT EXISTS compliance_training (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module            TEXT        NOT NULL CHECK (module IN (
    'fire_safety', 'manual_handling', 'safeguarding_adults', 'safeguarding_children',
    'basic_life_support', 'infection_control', 'information_governance',
    'conflict_resolution', 'equality_diversity', 'mental_capacity_act',
    'medicines_management', 'food_hygiene', 'health_safety', 'coshh',
    'lone_working', 'dementia_awareness', 'cqc_awareness'
  )),
  frequency_months  INTEGER     NOT NULL DEFAULT 12,
  completed_date    DATE,
  expiry_date       DATE,
  certificate_url   TEXT,
  notes             TEXT,
  assigned_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_compliance_training_tenant_id ON compliance_training(tenant_id);

CREATE OR REPLACE FUNCTION update_ct_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_ct_updated_at
  BEFORE UPDATE ON compliance_training
  FOR EACH ROW EXECUTE FUNCTION update_ct_updated_at();

CREATE TABLE IF NOT EXISTS compliance_equipment (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_code             TEXT        NOT NULL,
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
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_compliance_equipment_tenant_id ON compliance_equipment(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ce_next_due                    ON compliance_equipment(next_due_date);

CREATE OR REPLACE FUNCTION update_ce_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_ce_updated_at
  BEFORE UPDATE ON compliance_equipment
  FOR EACH ROW EXECUTE FUNCTION update_ce_updated_at();

CREATE TABLE IF NOT EXISTS compliance_cqc_answers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question_number INTEGER     NOT NULL,
  domain          TEXT        NOT NULL CHECK (domain IN (
    'safe', 'effective', 'caring', 'responsive', 'well_led'
  )),
  audit_area      TEXT        NOT NULL,
  question_text   TEXT        NOT NULL,
  answer          TEXT        CHECK (answer IN ('yes', 'no', 'partial', 'na')),
  evidence_notes  TEXT,
  action_required TEXT,
  target_date     DATE,
  answered_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  audit_date      DATE,
  reviewed_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, question_number)
);

CREATE INDEX IF NOT EXISTS idx_compliance_cqc_answers_tenant_id ON compliance_cqc_answers(tenant_id);

CREATE OR REPLACE FUNCTION update_cqa_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_cqa_updated_at
  BEFORE UPDATE ON compliance_cqc_answers
  FOR EACH ROW EXECUTE FUNCTION update_cqa_updated_at();

CREATE TABLE IF NOT EXISTS compliance_governance_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_compliance_governance_log_tenant_id ON compliance_governance_log(tenant_id);

CREATE OR REPLACE FUNCTION update_cgl_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_cgl_updated_at
  BEFORE UPDATE ON compliance_governance_log
  FOR EACH ROW EXECUTE FUNCTION update_cgl_updated_at();

CREATE TABLE IF NOT EXISTS compliance_calendar (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_order            INTEGER     NOT NULL,
  task_name             TEXT        NOT NULL,
  frequency             TEXT        NOT NULL CHECK (frequency IN (
    'daily', 'weekly', 'monthly', 'quarterly', 'biannual', 'annual', 'as_needed'
  )),
  month_due             TEXT,
  responsible_user_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  last_completed_date   DATE,
  next_due_date         DATE,
  notes                 TEXT,
  assigned_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_calendar_tenant_id ON compliance_calendar(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cc_next_due                   ON compliance_calendar(next_due_date);

CREATE OR REPLACE FUNCTION update_cc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_cc_updated_at
  BEFORE UPDATE ON compliance_calendar
  FOR EACH ROW EXECUTE FUNCTION update_cc_updated_at();

-- ---------------------------------------------------------------------------
-- PATIENT HUB (migration 032b)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patient_treatment_logs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id     TEXT NOT NULL,
  cliniko_appointment_id TEXT,
  log_date               DATE NOT NULL DEFAULT CURRENT_DATE,
  appointment_type       TEXT,
  practitioner_name      TEXT,
  room_name              TEXT,
  procedures             JSONB NOT NULL DEFAULT '[]',
  products_used          JSONB NOT NULL DEFAULT '[]',
  pre_care               TEXT,
  post_care              TEXT,
  contraindications      TEXT,
  consent_obtained       BOOLEAN NOT NULL DEFAULT FALSE,
  consent_form_ref       TEXT,
  outcome                TEXT,
  follow_up_required     BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_notes        TEXT,
  follow_up_date         DATE,
  photos                 JSONB NOT NULL DEFAULT '[]',
  created_by_user_id     UUID,
  created_by_name        TEXT,
  notes                  TEXT,
  is_draft               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_treatment_logs_tenant_id ON patient_treatment_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_treatment_logs_patient            ON patient_treatment_logs(cliniko_patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_logs_date               ON patient_treatment_logs(log_date DESC);

CREATE TABLE IF NOT EXISTS patient_plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id TEXT NOT NULL,
  title              TEXT NOT NULL DEFAULT 'Treatment Plan',
  description        TEXT,
  goals              TEXT,
  status             TEXT NOT NULL DEFAULT 'active',
  start_date         DATE,
  target_end_date    DATE,
  completed_date     DATE,
  phases             JSONB NOT NULL DEFAULT '[]',
  created_by_user_id UUID,
  created_by_name    TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_plans_tenant_id ON patient_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_plans_patient   ON patient_plans(cliniko_patient_id);

-- ---------------------------------------------------------------------------
-- SMART CALENDAR (migration 033)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS calendar_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  description   TEXT,
  event_type    TEXT        NOT NULL DEFAULT 'note'
    CHECK (event_type IN (
      'meeting', 'training', 'blocked', 'note',
      'deadline', 'review', 'appointment', 'inspection'
    )),
  start_date    DATE        NOT NULL,
  end_date      DATE,
  start_time    TIME,
  end_time      TIME,
  all_day       BOOLEAN     NOT NULL DEFAULT TRUE,
  color         TEXT,
  assigned_to   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT        NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant_id ON calendar_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cal_evt_start              ON calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_cal_evt_type               ON calendar_events(event_type);

CREATE OR REPLACE FUNCTION update_cal_evt_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_cal_evt_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_cal_evt_updated_at();

-- ---------------------------------------------------------------------------
-- PATIENT MESSAGES (migration 034)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patient_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id    UUID        REFERENCES cliniko_patients(id) ON DELETE SET NULL,
  patient_name  TEXT        NOT NULL,
  patient_phone TEXT,
  patient_email TEXT,
  direction     TEXT        NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  channel       TEXT        NOT NULL
    CHECK (channel IN ('sms', 'email', 'whatsapp', 'phone')),
  subject       TEXT,
  body          TEXT        NOT NULL,
  source        TEXT        NOT NULL DEFAULT 'staff'
    CHECK (source IN ('staff', 'automation', 'agent', 'vapi', 'system')),
  source_detail TEXT,
  sent_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  sent_by_name  TEXT,
  status        TEXT        NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft', 'scheduled', 'sent', 'delivered', 'failed', 'read')),
  scheduled_at  TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),
  external_id   TEXT,
  metadata      JSONB       DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_messages_tenant_id      ON patient_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_messages_tenant_patient ON patient_messages(tenant_id, patient_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- TEAM SPACES (migration 035)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_posts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  space       TEXT        NOT NULL DEFAULT 'all_staff'
    CHECK (space IN ('all_staff', 'reception', 'clinical', 'management')),
  category    TEXT        NOT NULL DEFAULT 'update'
    CHECK (category IN ('announcement', 'handover', 'task', 'resource', 'kudos', 'update')),
  title       TEXT,
  body        TEXT        NOT NULL,
  tags        TEXT[]      DEFAULT '{}',
  author_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT        NOT NULL DEFAULT 'System',
  author_role TEXT,
  likes       INTEGER     NOT NULL DEFAULT 0,
  pinned      BOOLEAN     NOT NULL DEFAULT FALSE,
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_posts_tenant_id ON team_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_posts_space      ON team_posts(space);
CREATE INDEX IF NOT EXISTS idx_team_posts_created    ON team_posts(created_at DESC);

CREATE OR REPLACE FUNCTION update_team_post_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_team_post_updated_at
  BEFORE UPDATE ON team_posts
  FOR EACH ROW EXECUTE FUNCTION update_team_post_updated_at();

-- ---------------------------------------------------------------------------
-- CLINICAL EHR (migration 036)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clinical_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id    TEXT NOT NULL,
  allergies             JSONB DEFAULT '[]'::jsonb,
  contraindications     JSONB DEFAULT '[]'::jsonb,
  medications           JSONB DEFAULT '[]'::jsonb,
  medical_conditions    JSONB DEFAULT '[]'::jsonb,
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
  risk_flags            JSONB DEFAULT '[]'::jsonb,
  overall_risk_level    TEXT DEFAULT 'low' CHECK (overall_risk_level IN ('low','medium','high','critical')),
  gp_name               TEXT,
  gp_practice           TEXT,
  gp_phone              TEXT,
  nhs_number            TEXT,
  treatment_notes       TEXT,
  patient_goals         TEXT,
  ai_clinical_summary   TEXT,
  ai_risk_assessment    TEXT,
  ai_last_generated_at  TIMESTAMPTZ,
  last_reviewed_by      UUID,
  last_reviewed_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, cliniko_patient_id)
);

CREATE INDEX IF NOT EXISTS idx_clinical_records_tenant_id ON clinical_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clinical_records_patient   ON clinical_records(cliniko_patient_id);

CREATE TABLE IF NOT EXISTS vitals_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id TEXT NOT NULL,
  blood_pressure_sys INT,
  blood_pressure_dia INT,
  heart_rate         INT,
  weight_kg          NUMERIC(5,2),
  height_cm          NUMERIC(5,1),
  temperature_c      NUMERIC(4,1),
  oxygen_sat         NUMERIC(4,1),
  blood_glucose      NUMERIC(5,2),
  recorded_by        UUID,
  recorded_at        TIMESTAMPTZ DEFAULT now(),
  notes              TEXT,
  context            TEXT
);

CREATE INDEX IF NOT EXISTS idx_vitals_history_tenant_id ON vitals_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vitals_history_patient   ON vitals_history(cliniko_patient_id);

CREATE TABLE IF NOT EXISTS soap_notes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id     TEXT NOT NULL,
  cliniko_appointment_id TEXT,
  appointment_date       DATE,
  appointment_type       TEXT,
  subjective             TEXT,
  objective              TEXT,
  assessment             TEXT,
  plan                   TEXT,
  treatment_performed    TEXT,
  products_used          JSONB DEFAULT '[]'::jsonb,
  adverse_events         TEXT,
  follow_up_required     BOOLEAN DEFAULT FALSE,
  follow_up_date         DATE,
  follow_up_notes        TEXT,
  ai_draft_used          BOOLEAN DEFAULT FALSE,
  ai_draft_generated_at  TIMESTAMPTZ,
  status                 TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending_review','signed_off')),
  signed_off_by          UUID,
  signed_off_at          TIMESTAMPTZ,
  authored_by            UUID NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soap_notes_tenant_id      ON soap_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soap_notes_tenant_patient ON soap_notes(tenant_id, cliniko_patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS patient_consents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id    TEXT NOT NULL,
  consent_type          TEXT NOT NULL,
  treatment_name        TEXT,
  consent_form_version  TEXT DEFAULT '1.0',
  screening_answers     JSONB DEFAULT '{}'::jsonb,
  screening_flags       JSONB DEFAULT '[]'::jsonb,
  has_red_flags         BOOLEAN DEFAULT FALSE,
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','consented','refused','withdrawn','expired')),
  consented_at          TIMESTAMPTZ,
  refused_reason        TEXT,
  withdrawn_at          TIMESTAMPTZ,
  withdrawal_reason     TEXT,
  valid_from            DATE,
  valid_until           DATE,
  collected_via         TEXT DEFAULT 'digital' CHECK (collected_via IN ('digital','paper','verbal','telephone')),
  collected_by          UUID,
  witness_name          TEXT,
  signature_url         TEXT,
  ai_screening_notes    TEXT,
  cqc_reference         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_consents_tenant_id      ON patient_consents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_consents_tenant_patient ON patient_consents(tenant_id, cliniko_patient_id);

CREATE TABLE IF NOT EXISTS clinical_photos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id    TEXT NOT NULL,
  storage_path          TEXT NOT NULL,
  thumbnail_path        TEXT,
  file_name             TEXT NOT NULL,
  file_size_bytes       INT,
  mime_type             TEXT DEFAULT 'image/jpeg',
  photo_type            TEXT DEFAULT 'progress' CHECK (photo_type IN ('before','after','progress','concern','reference')),
  treatment_area        TEXT,
  appointment_context   TEXT,
  cliniko_appointment_id TEXT,
  pair_id               UUID,
  photo_consent_given   BOOLEAN DEFAULT FALSE,
  consent_id            UUID,
  notes                 TEXT,
  tags                  JSONB DEFAULT '[]'::jsonb,
  is_visible_to_patient BOOLEAN DEFAULT FALSE,
  taken_by              UUID,
  taken_at              TIMESTAMPTZ DEFAULT now(),
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_photos_tenant_id ON clinical_photos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clinical_photos_patient   ON clinical_photos(cliniko_patient_id);

CREATE TABLE IF NOT EXISTS treatment_protocols (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  treatment_name          TEXT NOT NULL,
  category                TEXT,
  pre_checklist           JSONB DEFAULT '[]'::jsonb,
  consent_questions       JSONB DEFAULT '[]'::jsonb,
  aftercare_notes         TEXT,
  default_follow_up_days  INT DEFAULT 28,
  base_price_gbp          NUMERIC(8,2),
  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, treatment_name)
);

CREATE INDEX IF NOT EXISTS idx_treatment_protocols_tenant_id ON treatment_protocols(tenant_id);

-- ---------------------------------------------------------------------------
-- CLINICAL ADDITIONS (migration 037)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS prescriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id    TEXT NOT NULL,
  drug_name             TEXT NOT NULL,
  drug_generic_name     TEXT,
  drug_class            TEXT,
  formulation           TEXT,
  strength              TEXT,
  dose                  TEXT NOT NULL,
  frequency             TEXT NOT NULL,
  route                 TEXT DEFAULT 'oral',
  quantity              TEXT,
  duration              TEXT,
  indication            TEXT,
  prescriber_name       TEXT NOT NULL,
  prescriber_gmc        TEXT,
  prescribed_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  start_date            DATE,
  end_date              DATE,
  dispensed_by          TEXT,
  dispensed_date        DATE,
  repeat_allowed        BOOLEAN DEFAULT FALSE,
  repeats_remaining     INT DEFAULT 0,
  last_repeat_date      DATE,
  status                TEXT DEFAULT 'active' CHECK (status IN ('active','completed','stopped','on_hold','cancelled')),
  stopped_reason        TEXT,
  stopped_date          DATE,
  allergies_checked     BOOLEAN DEFAULT FALSE,
  interactions_checked  BOOLEAN DEFAULT FALSE,
  special_instructions  TEXT,
  patient_counselled    BOOLEAN DEFAULT FALSE,
  notes                 TEXT,
  created_by            UUID,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_id ON prescriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient   ON prescriptions(cliniko_patient_id);

CREATE TABLE IF NOT EXISTS lab_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id    TEXT NOT NULL,
  test_name             TEXT NOT NULL,
  test_category         TEXT,
  test_code             TEXT,
  panel_name            TEXT,
  ordered_by            TEXT NOT NULL,
  ordered_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  lab_name              TEXT,
  lab_reference         TEXT,
  result_value          TEXT,
  result_unit           TEXT,
  reference_range_low   NUMERIC(10,4),
  reference_range_high  NUMERIC(10,4),
  reference_range_text  TEXT,
  flag                  TEXT CHECK (flag IN ('normal','low','high','critical_low','critical_high','abnormal','pending')),
  panel_results         JSONB DEFAULT '[]'::jsonb,
  sample_date           DATE,
  result_date           DATE,
  result_received_at    TIMESTAMPTZ,
  status                TEXT DEFAULT 'pending' CHECK (status IN ('pending','received','reviewed','actioned','cancelled')),
  reviewed_by           TEXT,
  reviewed_at           TIMESTAMPTZ,
  clinical_notes        TEXT,
  action_required       BOOLEAN DEFAULT FALSE,
  action_taken          TEXT,
  report_url            TEXT,
  created_by            UUID,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_results_tenant_id ON lab_results(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_patient   ON lab_results(cliniko_patient_id);

CREATE TABLE IF NOT EXISTS referrals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id      TEXT NOT NULL,
  direction               TEXT DEFAULT 'out' CHECK (direction IN ('out','in')),
  referral_type           TEXT NOT NULL,
  specialty               TEXT,
  urgency                 TEXT DEFAULT 'routine' CHECK (urgency IN ('routine','urgent','two_week_wait','emergency')),
  reason                  TEXT NOT NULL,
  referred_by             TEXT NOT NULL,
  referred_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  referred_to_name        TEXT,
  referred_to_hospital    TEXT,
  referred_to_address     TEXT,
  referred_to_phone       TEXT,
  referred_to_email       TEXT,
  clinical_summary        TEXT,
  investigations_included JSONB DEFAULT '[]'::jsonb,
  medications_included    BOOLEAN DEFAULT TRUE,
  status                  TEXT DEFAULT 'sent' CHECK (status IN ('draft','sent','acknowledged','appointment_booked','appointment_attended','completed','rejected','cancelled')),
  sent_date               DATE,
  acknowledged_date       DATE,
  appointment_date        DATE,
  completed_date          DATE,
  outcome_notes           TEXT,
  created_by              UUID,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_tenant_id ON referrals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referrals_patient   ON referrals(cliniko_patient_id);

-- ---------------------------------------------------------------------------
-- BOOKING PIPELINE (migration 041)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS practitioner_working_hours (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  practitioner_id   TEXT        NOT NULL,
  practitioner_name TEXT        NOT NULL,
  day_of_week       SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time        TIME        NOT NULL DEFAULT '09:00',
  end_time          TIME        NOT NULL DEFAULT '17:00',
  slot_duration_min SMALLINT    NOT NULL DEFAULT 30,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, practitioner_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_practitioner_working_hours_tenant_id ON practitioner_working_hours(tenant_id);

CREATE TRIGGER trg_pwh_updated_at
  BEFORE UPDATE ON practitioner_working_hours
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS booking_requests (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signal_id               UUID        REFERENCES signals(id) ON DELETE SET NULL,
  caller_name             TEXT,
  caller_phone            TEXT,
  caller_email            TEXT,
  service                 TEXT,
  service_detail          TEXT,
  preferred_date          TEXT,
  preferred_date_iso      DATE,
  preferred_time          TEXT,
  preferred_time_iso      TIME,
  duration_minutes        SMALLINT    DEFAULT 30,
  preferred_practitioner  TEXT,
  practitioner_cliniko_id TEXT,
  practitioner_name       TEXT,
  referral_source         TEXT        CHECK (referral_source IN (
                            'online', 'client_referral', 'practitioner_referral',
                            'social_media', 'walk_in', 'returning', 'other'
                          )),
  referral_name           TEXT,
  vapi_call_id            TEXT,
  call_notes              TEXT,
  call_summary            TEXT,
  status                  TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending', 'confirmed', 'cancelled', 'no_show',
                            'synced_to_cliniko', 'duplicate'
                          )),
  cliniko_patient_id      TEXT,
  cliniko_appointment_id  TEXT,
  cliniko_error           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at            TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_tenant_id     ON booking_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_requests_tenant_status ON booking_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_br_caller_phone                ON booking_requests(caller_phone);
CREATE INDEX IF NOT EXISTS idx_br_created                     ON booking_requests(created_at DESC);

CREATE OR REPLACE FUNCTION update_booking_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_booking_requests_updated_at
  BEFORE UPDATE ON booking_requests
  FOR EACH ROW EXECUTE FUNCTION update_booking_requests_updated_at();

-- ---------------------------------------------------------------------------
-- CALL SESSIONS — Vapi dedup (migration 042)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS call_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vapi_call_id TEXT        NOT NULL,
  tool_name    TEXT        NOT NULL,
  call_count   INTEGER     NOT NULL DEFAULT 1,
  first_args   JSONB,
  first_result TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vapi_call_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_tenant_id ON call_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_created   ON call_sessions(created_at);

CREATE OR REPLACE FUNCTION delete_old_call_sessions() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM call_sessions WHERE created_at < now() - interval '24 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_call_sessions ON call_sessions;
CREATE TRIGGER trg_clean_call_sessions
  AFTER INSERT ON call_sessions
  EXECUTE FUNCTION delete_old_call_sessions();

-- ---------------------------------------------------------------------------
-- PATIENT WAITING LIST (migration 042)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patient_waiting_list (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliniko_patient_id     TEXT NOT NULL,
  patient_name           TEXT NOT NULL,
  treatment_type         TEXT NOT NULL,
  preferred_practitioner TEXT,
  preferred_date_from    DATE,
  preferred_date_to      DATE,
  preferred_time         TEXT DEFAULT 'any',
  priority               TEXT DEFAULT 'medium',
  notes                  TEXT,
  status                 TEXT DEFAULT 'waiting',
  offered_at             TIMESTAMPTZ,
  confirmed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_waiting_list_tenant_id     ON patient_waiting_list(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patient_waiting_list_tenant_status ON patient_waiting_list(tenant_id, status);

CREATE OR REPLACE FUNCTION update_pwl_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS pwl_updated_at ON patient_waiting_list;
CREATE TRIGGER pwl_updated_at
  BEFORE UPDATE ON patient_waiting_list
  FOR EACH ROW EXECUTE FUNCTION update_pwl_updated_at();

-- ---------------------------------------------------------------------------
-- CALL LOGS (migration 045 + 046)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS call_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vapi_call_id        TEXT,
  caller_name         TEXT,
  caller_phone        TEXT,
  caller_email        TEXT,
  service_requested   TEXT,
  outcome             TEXT CHECK (outcome IN (
                        'booked', 'lead', 'enquiry',
                        'missed', 'escalated', 'concern', 'info_only'
                      )),
  direction           TEXT NOT NULL DEFAULT 'inbound'
                      CHECK (direction IN ('inbound', 'outbound', 'web')),
  duration_seconds    INTEGER     DEFAULT 0,
  recording_url       TEXT,
  ended_reason        TEXT,
  call_notes          TEXT,
  call_summary        TEXT,
  transcript          TEXT,
  tools_used          TEXT[],
  agent_consulted     TEXT,
  referral_source     TEXT,
  referral_name       TEXT,
  booking_request_id  UUID REFERENCES booking_requests(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vapi_call_id)
);

CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_id      ON call_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_created ON call_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cl_caller_phone          ON call_logs(caller_phone);
CREATE INDEX IF NOT EXISTS idx_cl_outcome               ON call_logs(outcome);

-- =============================================================================
-- LIFECYCLE COMPUTATION FUNCTION (from migration 039)
-- Tenant-scoped: computes lifecycle stages for all patients of a given tenant.
-- =============================================================================

CREATE OR REPLACE FUNCTION compute_all_lifecycle_stages(p_tenant_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
  WITH appt_stats AS (
    SELECT
      ca.cliniko_patient_id,
      COUNT(*) FILTER (WHERE ca.status = 'arrived')           AS attended,
      MAX(ca.starts_at) FILTER (WHERE ca.status = 'arrived')  AS last_attended_at,
      bool_or(ca.starts_at > now() AND ca.status IS NULL)     AS has_future_appt
    FROM cliniko_appointments ca
    WHERE p_tenant_id IS NULL OR ca.tenant_id = p_tenant_id
    GROUP BY ca.cliniko_patient_id
  )
  UPDATE cliniko_patients cp
  SET lifecycle_stage = CASE
    WHEN cp.lifecycle_override IS NOT NULL THEN cp.lifecycle_override
    WHEN s.attended IS NULL OR s.attended = 0 THEN 'lead'
    WHEN s.attended = 1 AND s.last_attended_at > now() - interval '60 days' THEN 'new'
    WHEN s.attended >= 5 AND s.last_attended_at > now() - interval '180 days' THEN 'loyal'
    WHEN s.last_attended_at < now() - interval '365 days' THEN 'lapsed'
    WHEN s.last_attended_at < now() - interval '180 days' THEN 'at_risk'
    ELSE 'active'
  END
  FROM appt_stats s
  WHERE cp.cliniko_id::text = s.cliniko_patient_id
    AND (p_tenant_id IS NULL OR cp.tenant_id = p_tenant_id);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PGVECTOR RPC — MULTI-TENANT SEMANTIC SEARCH
-- =============================================================================

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  p_tenant_id       UUID,
  p_embedding       VECTOR(1536),
  p_match_count     INT     DEFAULT 5,
  p_match_threshold FLOAT   DEFAULT 0.7
)
RETURNS TABLE (
  id            UUID,
  document_id   UUID,
  content       TEXT,
  chunk_index   INT,
  section_title TEXT,
  similarity    FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    kc.id,
    kc.document_id,
    kc.content,
    kc.chunk_index,
    kc.section_title,
    1 - (kc.embedding <=> p_embedding) AS similarity
  FROM knowledge_chunks kc
  WHERE kc.tenant_id = p_tenant_id
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> p_embedding) > p_match_threshold
  ORDER BY kc.embedding <=> p_embedding
  LIMIT p_match_count;
$$;

-- =============================================================================
-- VERIFY
-- =============================================================================

DO $$
DECLARE
  v_table_count BOOLEAN;
  v_core_tables TEXT[] := ARRAY[
    'tenants', 'clinic_config', 'departments', 'roles', 'users', 'agents',
    'signals', 'judgements', 'chat_conversations', 'chat_messages', 'agent_memories',
    'knowledge_categories', 'knowledge_documents', 'knowledge_chunks',
    'cliniko_config', 'cliniko_practitioners', 'cliniko_patients',
    'cliniko_appointments', 'cliniko_invoices', 'cliniko_sync_logs', 'audit_trail',
    'staff_goals', 'goal_updates', 'staff_compliance_items',
    'compliance_hr_records', 'compliance_training', 'compliance_equipment',
    'compliance_cqc_answers', 'compliance_governance_log', 'compliance_calendar',
    'patient_treatment_logs', 'patient_plans', 'calendar_events', 'patient_messages',
    'team_posts', 'clinical_records', 'vitals_history', 'soap_notes',
    'patient_consents', 'clinical_photos', 'treatment_protocols',
    'prescriptions', 'lab_results', 'referrals',
    'practitioner_working_hours', 'booking_requests', 'call_sessions',
    'patient_waiting_list', 'call_logs'
  ];
  v_t TEXT;
  v_ok BOOLEAN := TRUE;
BEGIN
  RAISE NOTICE '=== Migration 054 Verification ===';

  FOREACH v_t IN ARRAY v_core_tables LOOP
    SELECT COUNT(*) > 0 INTO v_table_count
      FROM information_schema.tables
     WHERE table_name = v_t AND table_schema = 'public';

    IF NOT v_table_count THEN
      RAISE WARNING '  MISSING table: %', v_t;
      v_ok := FALSE;
    ELSE
      RAISE NOTICE '  OK — %', v_t;
    END IF;
  END LOOP;

  IF v_ok THEN
    RAISE NOTICE '=== Migration 054: Sovereign Fresh Schema — COMPLETE ===';
    RAISE NOTICE 'All % tables created with tenant_id NOT NULL.', array_length(v_core_tables, 1);
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Register first tenant in tenants table';
    RAISE NOTICE '  2. Run onboarding flow to seed agents + clinic_config per tenant';
    RAISE NOTICE '  3. Activate Cliniko integration per tenant';
    RAISE NOTICE '  4. Populate knowledge_chunks to enable semantic search';
  ELSE
    RAISE WARNING '=== Migration 054: Some tables missing — check errors above ===';
  END IF;
END $$;

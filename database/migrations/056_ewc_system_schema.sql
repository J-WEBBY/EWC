-- =============================================================================
-- Migration 056: EWC System Schema — Clean Single-Tenant
--
-- Run this on a FRESH Supabase project (molydoulcdtcoywjsjrn).
-- No tenant_id anywhere — single clinic, single system.
-- Patient/clinical data lives in Cliniko (accessed via API, not stored here).
--
-- Staff passwords:
--   admin@edgbastonwellness.co.uk  → Admin13!   (system account)
--   joseph@jwebly.co.uk            → Admin13!   (developer)
--   suresh@edgbastonwellness.co.uk → Admin13!   (owner — no forced change)
--   All other staff                → EWC2026!   (must_change_password = TRUE)
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================================================
-- DROP OLD TABLES (safe on fresh DB — CASCADE handles dependencies)
-- =============================================================================
DROP TABLE IF EXISTS audit_trail              CASCADE;
DROP TABLE IF EXISTS knowledge_chunks         CASCADE;
DROP TABLE IF EXISTS knowledge_documents      CASCADE;
DROP TABLE IF EXISTS knowledge_categories     CASCADE;
DROP TABLE IF EXISTS agent_memories           CASCADE;
DROP TABLE IF EXISTS chat_messages            CASCADE;
DROP TABLE IF EXISTS chat_conversations       CASCADE;
DROP TABLE IF EXISTS judgements               CASCADE;
DROP TABLE IF EXISTS signals                  CASCADE;
DROP TABLE IF EXISTS automations              CASCADE;
DROP TABLE IF EXISTS compliance_items         CASCADE;
DROP TABLE IF EXISTS cliniko_config           CASCADE;
DROP TABLE IF EXISTS clinic_config            CASCADE;
DROP TABLE IF EXISTS users                    CASCADE;
DROP TABLE IF EXISTS roles                    CASCADE;
DROP TABLE IF EXISTS departments              CASCADE;
DROP TABLE IF EXISTS agents                   CASCADE;
-- Legacy tables (if old migrations were partially run)
DROP TABLE IF EXISTS cliniko_patients         CASCADE;
DROP TABLE IF EXISTS cliniko_appointments     CASCADE;
DROP TABLE IF EXISTS cliniko_invoices         CASCADE;
DROP TABLE IF EXISTS cliniko_practitioners    CASCADE;
DROP TABLE IF EXISTS cliniko_sync_logs        CASCADE;
DROP TABLE IF EXISTS clinical_records         CASCADE;
DROP TABLE IF EXISTS vitals_history           CASCADE;
DROP TABLE IF EXISTS soap_notes               CASCADE;
DROP TABLE IF EXISTS patient_consents         CASCADE;
DROP TABLE IF EXISTS clinical_photos          CASCADE;
DROP TABLE IF EXISTS treatment_protocols      CASCADE;
DROP TABLE IF EXISTS tenants                  CASCADE;

-- =============================================================================
-- SCHEMA
-- =============================================================================

-- clinic_config — single row, clinic identity + brand
CREATE TABLE clinic_config (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_name     TEXT NOT NULL DEFAULT 'Edgbaston Wellness Clinic',
  clinic_email    TEXT,
  clinic_phone    TEXT,
  clinic_address  TEXT DEFAULT '123 Harborne Road, Edgbaston, Birmingham B15 3AA',
  brand_color     TEXT DEFAULT '#011440',
  ai_name         TEXT DEFAULT 'EWC Intelligence',
  logo_url        TEXT,
  timezone        TEXT DEFAULT 'Europe/London',
  currency        TEXT DEFAULT 'GBP',
  settings        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- departments
CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- roles
CREATE TABLE roles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL UNIQUE,
  slug             TEXT NOT NULL UNIQUE,
  permission_level INT NOT NULL DEFAULT 20,
  is_admin         BOOLEAN DEFAULT FALSE,
  is_clinical      BOOLEAN DEFAULT FALSE,
  permissions      JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- users — EWC staff accounts only
CREATE TABLE users (
  id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                         TEXT NOT NULL UNIQUE,
  title                         TEXT,
  first_name                    TEXT NOT NULL,
  last_name                     TEXT NOT NULL,
  display_name                  TEXT,
  job_title                     TEXT,
  password_hash                 TEXT NOT NULL,
  must_change_password          BOOLEAN DEFAULT FALSE,
  status                        TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  is_admin                      BOOLEAN DEFAULT FALSE,
  is_clinical                   BOOLEAN DEFAULT FALSE,
  role_id                       UUID REFERENCES roles(id),
  department_id                 UUID REFERENCES departments(id),
  staff_onboarding_completed    BOOLEAN DEFAULT FALSE,
  staff_onboarding_completed_at TIMESTAMPTZ,
  last_login_at                 TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ DEFAULT NOW()
);

-- agents — AI agent configs
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  agent_key     TEXT NOT NULL UNIQUE,
  type          TEXT DEFAULT 'primary',
  description   TEXT,
  system_prompt TEXT,
  accent_color  TEXT DEFAULT '#011440',
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  is_catch_all  BOOLEAN DEFAULT FALSE,
  scope         TEXT,
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- signals — operational alerts and flags
CREATE TABLE signals (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT NOT NULL,
  description  TEXT,
  signal_type  TEXT DEFAULT 'alert',
  category     TEXT DEFAULT 'operational',
  priority     TEXT DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  status       TEXT DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  source       TEXT DEFAULT 'system',
  metadata     JSONB DEFAULT '{}',
  assigned_to  UUID REFERENCES users(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- judgements — Judgement Engine outputs
CREATE TABLE judgements (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT NOT NULL,
  content      TEXT,
  summary      TEXT,
  agent_id     UUID REFERENCES agents(id),
  triggered_by TEXT DEFAULT 'system',
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- chat_conversations
CREATE TABLE chat_conversations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id),
  agent_id   UUID REFERENCES agents(id),
  title      TEXT,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- chat_messages
CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- agent_memories
CREATE TABLE agent_memories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id    UUID REFERENCES agents(id),
  memory_type TEXT DEFAULT 'context',
  content     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- automations — workflow configurations
CREATE TABLE automations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL,
  description    TEXT,
  trigger_type   TEXT DEFAULT 'manual',
  trigger_config JSONB DEFAULT '{}',
  actions        JSONB DEFAULT '[]',
  is_active      BOOLEAN DEFAULT FALSE,
  last_run_at    TIMESTAMPTZ,
  run_count      INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- compliance_items
CREATE TABLE compliance_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT DEFAULT 'operational',
  frequency    TEXT DEFAULT 'monthly',
  assigned_to  UUID REFERENCES users(id),
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','overdue')),
  evidence_url TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- cliniko_config — API connection settings
CREATE TABLE cliniko_config (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key        TEXT,
  shard          TEXT DEFAULT 'uk1',
  is_active      BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  last_tested_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- knowledge_categories
CREATE TABLE knowledge_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  icon        TEXT,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- knowledge_documents
CREATE TABLE knowledge_documents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES knowledge_categories(id),
  title       TEXT NOT NULL,
  content     TEXT,
  file_url    TEXT,
  file_type   TEXT,
  metadata    JSONB DEFAULT '{}',
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- knowledge_chunks — vector search
CREATE TABLE knowledge_chunks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  embedding   vector(1536),
  chunk_index INT DEFAULT 0,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- audit_trail
CREATE TABLE audit_trail (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id),
  action     TEXT NOT NULL,
  table_name TEXT,
  record_id  UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX idx_signals_status   ON signals(status);
CREATE INDEX idx_signals_priority ON signals(priority);
CREATE INDEX idx_signals_created  ON signals(created_at DESC);
CREATE INDEX idx_chat_conv_user   ON chat_conversations(user_id);
CREATE INDEX idx_chat_msg_conv    ON chat_messages(conversation_id);
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_audit_trail_user    ON audit_trail(user_id);
CREATE INDEX idx_audit_trail_created ON audit_trail(created_at DESC);
CREATE INDEX idx_users_email         ON users(email);
CREATE INDEX idx_agents_key          ON agents(agent_key);

-- =============================================================================
-- SEED — Clinic Config
-- =============================================================================
INSERT INTO clinic_config (clinic_name, clinic_email, brand_color, ai_name, timezone, currency)
VALUES ('Edgbaston Wellness Clinic', 'info@edgbastonwellness.co.uk', '#011440', 'EWC Intelligence', 'Europe/London', 'GBP');

-- =============================================================================
-- SEED — Departments
-- =============================================================================
INSERT INTO departments (name, description) VALUES
  ('Management',             'Clinic leadership and administration'),
  ('Medical',                'Doctors and clinical medical staff'),
  ('Aesthetics',             'Aesthetic practitioners and nurses'),
  ('Reception & Patient Care','Front-of-house and patient coordination')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- SEED — Roles
-- =============================================================================
INSERT INTO roles (name, slug, permission_level, is_admin, is_clinical, permissions) VALUES
  (
    'System Admin', 'system_admin', 200, TRUE, FALSE,
    '{"can_manage_users":true,"can_manage_agents":true,"can_view_all_signals":true,"can_manage_knowledge_base":true,"can_view_reports":true,"can_manage_integrations":true,"can_manage_system":true,"can_view_audit_trail":true}'
  ),
  (
    'Manager', 'manager', 100, TRUE, FALSE,
    '{"can_manage_users":true,"can_manage_agents":true,"can_view_all_signals":true,"can_manage_knowledge_base":true,"can_view_reports":true,"can_manage_integrations":true,"can_view_audit_trail":true}'
  ),
  (
    'Admin', 'admin', 70, TRUE, FALSE,
    '{"can_manage_users":true,"can_view_all_signals":true,"can_manage_knowledge_base":true,"can_view_reports":true}'
  ),
  (
    'Practitioner', 'practitioner', 30, FALSE, TRUE,
    '{"can_view_department_signals":true,"can_create_signals":true}'
  ),
  (
    'Receptionist', 'receptionist', 20, FALSE, FALSE,
    '{"can_view_department_signals":true,"can_create_signals":true}'
  )
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- SEED — Staff Accounts
-- Passwords use bcrypt (gen_salt with cost 10).
-- Requires pgcrypto extension (already enabled above).
-- =============================================================================

-- System admin account
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'admin@edgbastonwellness.co.uk', NULL, 'Admin', 'User', 'System Administrator', 'System Administrator',
  crypt('Admin13!', gen_salt('bf', 10)), FALSE, 'active', TRUE, FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'system_admin'),
  (SELECT id FROM departments WHERE name = 'Management')
) ON CONFLICT (email) DO NOTHING;

-- Joseph Enemuwe — Jwebly Developer
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'joseph@jwebly.co.uk', NULL, 'Joseph', 'Enemuwe', 'Joseph Enemuwe', 'Solutions Architect (Jwebly)',
  crypt('Admin13!', gen_salt('bf', 10)), FALSE, 'active', TRUE, FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'system_admin'),
  (SELECT id FROM departments WHERE name = 'Management')
) ON CONFLICT (email) DO NOTHING;

-- Dr Suresh Ganta — Owner / Medical Director
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'suresh@edgbastonwellness.co.uk', 'Dr', 'Suresh', 'Ganta', 'Dr Suresh Ganta', 'Medical Director',
  crypt('Admin13!', gen_salt('bf', 10)), FALSE, 'active', TRUE, TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'manager'),
  (SELECT id FROM departments WHERE name = 'Management')
) ON CONFLICT (email) DO NOTHING;

-- Dr K Penumaka — Doctor / Admin
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'k.penumaka@edgbastonwellness.co.uk', 'Dr', 'K', 'Penumaka', 'Dr K Penumaka', 'Doctor',
  crypt('EWC2026!', gen_salt('bf', 10)), TRUE, 'active', TRUE, TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'admin'),
  (SELECT id FROM departments WHERE name = 'Medical')
) ON CONFLICT (email) DO NOTHING;

-- Mr Syed Ahmad — Administrator
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'syed.ahmad@edgbastonwellness.co.uk', 'Mr', 'Syed', 'Ahmad', 'Mr Syed Ahmad', 'Administrator',
  crypt('EWC2026!', gen_salt('bf', 10)), TRUE, 'active', TRUE, FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'admin'),
  (SELECT id FROM departments WHERE name = 'Management')
) ON CONFLICT (email) DO NOTHING;

-- Lubna Bibi — Practitioner
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'lubna.bibi@edgbastonwellness.co.uk', NULL, 'Lubna', 'Bibi', 'Lubna Bibi', 'Practitioner',
  crypt('EWC2026!', gen_salt('bf', 10)), TRUE, 'active', FALSE, TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'practitioner'),
  (SELECT id FROM departments WHERE name = 'Aesthetics')
) ON CONFLICT (email) DO NOTHING;

-- Nikita V — Practitioner
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'nikita.v@edgbastonwellness.co.uk', NULL, 'Nikita', 'V', 'Nikita V', 'Practitioner',
  crypt('EWC2026!', gen_salt('bf', 10)), TRUE, 'active', FALSE, TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'practitioner'),
  (SELECT id FROM departments WHERE name = 'Aesthetics')
) ON CONFLICT (email) DO NOTHING;

-- Mr Benjamin Hawthorne — Senior Receptionist
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'benjamin.hawthorne@edgbastonwellness.co.uk', 'Mr', 'Benjamin', 'Hawthorne', 'Mr Benjamin Hawthorne', 'Senior Receptionist',
  crypt('EWC2026!', gen_salt('bf', 10)), TRUE, 'active', FALSE, FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'receptionist'),
  (SELECT id FROM departments WHERE name = 'Reception & Patient Care')
) ON CONFLICT (email) DO NOTHING;

-- Ms Dionne Jackson — Senior Receptionist
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'dionne.jackson@edgbastonwellness.co.uk', 'Ms', 'Dionne', 'Jackson', 'Ms Dionne Jackson', 'Senior Receptionist',
  crypt('EWC2026!', gen_salt('bf', 10)), TRUE, 'active', FALSE, FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'receptionist'),
  (SELECT id FROM departments WHERE name = 'Reception & Patient Care')
) ON CONFLICT (email) DO NOTHING;

-- Miss Ece Kurt — Receptionist
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'ece.kurt@edgbastonwellness.co.uk', 'Miss', 'Ece', 'Kurt', 'Miss Ece Kurt', 'Receptionist',
  crypt('EWC2026!', gen_salt('bf', 10)), TRUE, 'active', FALSE, FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'receptionist'),
  (SELECT id FROM departments WHERE name = 'Reception & Patient Care')
) ON CONFLICT (email) DO NOTHING;

-- Reception Edgbaston — Shared account
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'reception@edgbastonwellness.co.uk', NULL, 'Reception', 'Edgbaston', 'Reception Edgbaston', 'Reception (Shared)',
  crypt('EWC2026!', gen_salt('bf', 10)), TRUE, 'active', FALSE, FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'receptionist'),
  (SELECT id FROM departments WHERE name = 'Reception & Patient Care')
) ON CONFLICT (email) DO NOTHING;

-- Miss Shauna Havord — Receptionist
INSERT INTO users (email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin, is_clinical,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id)
VALUES (
  'shauna.havord@edgbastonwellness.co.uk', 'Miss', 'Shauna', 'Havord', 'Miss Shauna Havord', 'Receptionist',
  crypt('EWC2026!', gen_salt('bf', 10)), TRUE, 'active', FALSE, FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'receptionist'),
  (SELECT id FROM departments WHERE name = 'Reception & Patient Care')
) ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- SEED — AI Agents
-- =============================================================================
INSERT INTO agents (name, display_name, agent_key, type, description, accent_color, is_catch_all) VALUES
  (
    'EWC', 'EWC', 'primary_agent', 'primary',
    'Primary operational intelligence orchestrator for Edgbaston Wellness Clinic',
    '#011440', TRUE
  ),
  (
    'Orion', 'Orion', 'sales_agent', 'sales',
    'Patient acquisition and revenue intelligence agent',
    '#D8A600', FALSE
  ),
  (
    'Aria', 'Aria', 'crm_agent', 'crm',
    'Patient retention and relationship management agent',
    '#00A693', FALSE
  )
ON CONFLICT (agent_key) DO NOTHING;

-- =============================================================================
-- SEED — Knowledge Categories
-- =============================================================================
INSERT INTO knowledge_categories (name, description, sort_order) VALUES
  ('Treatments',         'Treatment protocols and procedures',             1),
  ('Pricing & Packages', 'Pricing information and package details',        2),
  ('Clinical Protocols', 'Clinical guidelines and safety protocols',       3),
  ('Patient FAQs',       'Frequently asked patient questions and answers', 4),
  ('Compliance & CQC',   'CQC requirements and compliance documentation',  5),
  ('Operations',         'Internal operational procedures and policies',   6)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- SEED — Cliniko Config (placeholder — API key added via Integrations page)
-- =============================================================================
INSERT INTO cliniko_config (shard, is_active) VALUES ('uk1', FALSE);

DO $$ BEGIN RAISE NOTICE '=== Migration 056: EWC System Schema — COMPLETE ==='; END $$;

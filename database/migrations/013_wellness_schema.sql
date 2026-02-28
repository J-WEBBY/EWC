-- =============================================================================
-- Migration 013: Edgbaston Wellness Clinic — Core Schema
-- Single-tenant, no RLS complexity, Cliniko integration-ready
-- Run AFTER migration 012
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================================================
-- CLINIC CONFIGURATION (single row — the clinic's identity)
-- =============================================================================

CREATE TABLE clinic_config (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  clinic_name   TEXT        NOT NULL DEFAULT 'Edgbaston Wellness Clinic',
  ai_name       TEXT        NOT NULL DEFAULT 'Aria',
  brand_color   TEXT        NOT NULL DEFAULT '#ffffff',
  logo_url      TEXT,
  tone          TEXT        NOT NULL DEFAULT 'professional',
  tagline       TEXT,
  manifesto     TEXT,
  ai_persona    JSONB       NOT NULL DEFAULT '{}',
  neural_contract JSONB     NOT NULL DEFAULT '{}',
  settings      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ORGANISATIONAL STRUCTURE
-- =============================================================================

CREATE TABLE departments (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name          TEXT        NOT NULL,
  description   TEXT,
  display_order INT         NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  id               UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  name             TEXT    NOT NULL,
  slug             TEXT    UNIQUE NOT NULL,
  permission_level INT     NOT NULL DEFAULT 1,
  permissions      JSONB   NOT NULL DEFAULT '{}',
  is_admin         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- USERS (staff accounts)
-- =============================================================================

CREATE TABLE users (
  id                            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  email                         TEXT        UNIQUE NOT NULL,
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- AI AGENTS
-- =============================================================================

CREATE TABLE agents (
  id                   UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  agent_key            TEXT    UNIQUE NOT NULL,
  name                 TEXT    NOT NULL,
  description          TEXT,
  avatar_url           TEXT,
  scope                TEXT    NOT NULL DEFAULT 'general',
  domains              TEXT[]  NOT NULL DEFAULT '{}',
  keywords             TEXT[]  NOT NULL DEFAULT '{}',
  critical_keywords    TEXT[]  NOT NULL DEFAULT '{}',
  system_prompt        TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  is_catch_all         BOOLEAN NOT NULL DEFAULT FALSE,
  total_signals_handled INT    NOT NULL DEFAULT 0,
  avg_confidence_score FLOAT   NOT NULL DEFAULT 0,
  settings             JSONB   NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SIGNALS (operational intelligence events)
-- =============================================================================

CREATE TABLE signals (
  id                    UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
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
  conversation_id       UUID,   -- references chat_conversations
  tags                  TEXT[]  NOT NULL DEFAULT '{}',
  data                  JSONB   NOT NULL DEFAULT '{}',
  user_input            TEXT,
  ai_classification     JSONB   NOT NULL DEFAULT '{}',
  assignment_confidence FLOAT,
  assigned_reasoning    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signals_status   ON signals(status);
CREATE INDEX idx_signals_priority ON signals(priority);
CREATE INDEX idx_signals_category ON signals(category);
CREATE INDEX idx_signals_created  ON signals(created_at DESC);

-- =============================================================================
-- JUDGEMENTS (signal risk assessments)
-- =============================================================================

CREATE TABLE judgements (
  id               UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
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

-- =============================================================================
-- CHAT
-- =============================================================================

CREATE TABLE chat_conversations (
  id            UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT    NOT NULL DEFAULT 'New Conversation',
  agent_scope   TEXT,
  is_pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
  message_count INT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_convs_user ON chat_conversations(user_id, created_at DESC);

CREATE TABLE chat_messages (
  id              UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID  NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT  NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT  NOT NULL,
  agent_scope     TEXT,
  model_used      TEXT,
  tool_calls      JSONB NOT NULL DEFAULT '[]',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_msgs_conv ON chat_messages(conversation_id, created_at ASC);

-- =============================================================================
-- AGENT MEMORIES (long-term learning)
-- =============================================================================

CREATE TABLE agent_memories (
  id              UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
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

CREATE INDEX idx_agent_memories_key ON agent_memories(agent_key, importance DESC);

-- =============================================================================
-- KNOWLEDGE BASE
-- =============================================================================

CREATE TABLE knowledge_categories (
  id                 UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  name               TEXT  NOT NULL,
  slug               TEXT  UNIQUE NOT NULL,
  description        TEXT,
  parent_category_id UUID  REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  display_order      INT   NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE knowledge_documents (
  id                 UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  category_id        UUID    REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  uploaded_by_user_id UUID   REFERENCES users(id) ON DELETE SET NULL,
  file_name          TEXT    NOT NULL,
  file_type          TEXT,
  file_size_bytes    INT,
  storage_path       TEXT,
  title              TEXT    NOT NULL,
  description        TEXT,
  tags               JSONB   NOT NULL DEFAULT '[]',
  processing_status  TEXT    NOT NULL DEFAULT 'pending'
                     CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processed_at       TIMESTAMPTZ,
  chunk_count        INT     NOT NULL DEFAULT 0,
  visibility         TEXT    NOT NULL DEFAULT 'internal',
  metadata           JSONB   NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE knowledge_chunks (
  id            UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  document_id   UUID  NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index   INT   NOT NULL,
  content       TEXT  NOT NULL,
  embedding     VECTOR(1536),
  page_number   INT,
  section_title TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vector similarity search index (IVFFlat — fast approximate search)
-- Enable after embeddings are populated: CREATE INDEX idx_chunks_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- pgvector RPC for semantic search
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  p_embedding     VECTOR(1536),
  p_match_count   INT     DEFAULT 5,
  p_match_threshold FLOAT DEFAULT 0.7
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
  WHERE kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> p_embedding) > p_match_threshold
  ORDER BY kc.embedding <=> p_embedding
  LIMIT p_match_count;
$$;

-- =============================================================================
-- CLINIKO INTEGRATION
-- =============================================================================

-- Connection config (one row)
CREATE TABLE cliniko_config (
  id                UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  api_key_encrypted TEXT,                    -- Store encrypted; decrypt in application layer
  api_url           TEXT    DEFAULT 'https://api.au1.cliniko.com/v1',
  shard             TEXT    DEFAULT 'au1',   -- Cliniko shard (au1, uk1, etc.)
  is_connected      BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at      TIMESTAMPTZ,
  last_sync_status  TEXT,
  sync_error        TEXT,
  settings          JSONB   NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patients cached from Cliniko
CREATE TABLE cliniko_patients (
  id                      UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliniko_id              BIGINT  UNIQUE NOT NULL,   -- Cliniko's patient ID
  first_name              TEXT,
  last_name               TEXT,
  email                   TEXT,
  phone                   TEXT,
  date_of_birth           DATE,
  gender                  TEXT,
  address                 JSONB   NOT NULL DEFAULT '{}',
  notes                   TEXT,
  referral_source         TEXT,
  created_in_cliniko_at   TIMESTAMPTZ,
  updated_in_cliniko_at   TIMESTAMPTZ,
  last_synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data                JSONB   NOT NULL DEFAULT '{}',  -- Full Cliniko API response
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cliniko_patients_email    ON cliniko_patients(email);
CREATE INDEX idx_cliniko_patients_last_name ON cliniko_patients(last_name);

-- Appointments cached from Cliniko
CREATE TABLE cliniko_appointments (
  id                   UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliniko_id           BIGINT  UNIQUE NOT NULL,
  cliniko_patient_id   BIGINT  REFERENCES cliniko_patients(cliniko_id) ON DELETE SET NULL,
  appointment_type     TEXT,
  practitioner_name    TEXT,
  starts_at            TIMESTAMPTZ,
  ends_at              TIMESTAMPTZ,
  duration_minutes     INT,
  -- Status values from Cliniko: nil (booked), Arrived, Did Not Arrive, Cancelled, etc.
  status               TEXT,
  cancellation_reason  TEXT,
  notes                TEXT,
  invoice_status       TEXT,
  room_name            TEXT,
  last_synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_data             JSONB   NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cliniko_appts_patient   ON cliniko_appointments(cliniko_patient_id);
CREATE INDEX idx_cliniko_appts_starts_at ON cliniko_appointments(starts_at DESC);
CREATE INDEX idx_cliniko_appts_status    ON cliniko_appointments(status);

-- Sync audit log
CREATE TABLE cliniko_sync_logs (
  id               UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  sync_type        TEXT  NOT NULL,   -- 'patients', 'appointments', 'full'
  status           TEXT  NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  records_synced   INT   NOT NULL DEFAULT 0,
  records_failed   INT   NOT NULL DEFAULT 0,
  error_message    TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- =============================================================================
-- AUDIT TRAIL
-- =============================================================================

CREATE TABLE audit_trail (
  id             UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
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

CREATE INDEX idx_audit_trail_user    ON audit_trail(user_id, created_at DESC);
CREATE INDEX idx_audit_trail_action  ON audit_trail(action_type, created_at DESC);

-- =============================================================================
-- TRIGGERS — auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinic_config_updated_at
  BEFORE UPDATE ON clinic_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_signals_updated_at
  BEFORE UPDATE ON signals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_chat_conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_cliniko_config_updated_at
  BEFORE UPDATE ON cliniko_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_cliniko_appointments_updated_at
  BEFORE UPDATE ON cliniko_appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DO $$
BEGIN
  RAISE NOTICE 'Migration 013 complete — Edgbaston Wellness Clinic schema created.';
END $$;

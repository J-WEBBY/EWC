-- =============================================================================
-- Migration 053: Multi-Tenant Conversion
--
-- Converts the single-tenant EWC schema to multi-tenant by:
--   1. TRUNCATING all tables (clears all EWC-specific seed/live data)
--   2. Adding tenant_id UUID to every table
--   3. Adding tenant_id indexes for query performance
--   4. Enforcing NOT NULL on tenant_id columns
--
-- IMPORTANT: This migration is DESTRUCTIVE — all existing data is cleared.
--            Agents, config, and seed data will be re-created per tenant
--            during the new-tenant onboarding flow.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
--                 + DO/EXCEPTION blocks for NOT NULL constraints.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== Migration 053: Multi-Tenant Conversion — START ===';
END $$;


-- =============================================================================
-- SECTION 1: TRUNCATE ALL TABLES
-- Clear every EWC-specific row. CASCADE handles FK dependencies.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 1: Truncating all tables...';
END $$;

-- Core schema tables — each wrapped in IF EXISTS so migration is safe
-- even if some tables were never created (partial schema installs).
DO $$
DECLARE v_tables TEXT[] := ARRAY[
  'knowledge_chunks', 'knowledge_documents', 'knowledge_categories',
  'chat_messages', 'chat_conversations', 'agent_memories',
  'judgements', 'signals',
  'cliniko_sync_logs', 'cliniko_appointments', 'cliniko_patients', 'cliniko_config',
  'audit_trail', 'users', 'roles', 'departments', 'agents', 'clinic_config'
];
v_t TEXT;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_t AND table_schema = 'public') THEN
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(v_t) || ' CASCADE';
      RAISE NOTICE 'Truncated: %', v_t;
    ELSE
      RAISE NOTICE 'Table % does not exist — skipping.', v_t;
    END IF;
  END LOOP;
END $$;

-- Later-migration tables (truncate with IF EXISTS safety via DO block)
DO $$
BEGIN
  -- KPI / goals (migration 031)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goal_updates') THEN
    TRUNCATE TABLE goal_updates CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_goals') THEN
    TRUNCATE TABLE staff_goals CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_compliance_items') THEN
    TRUNCATE TABLE staff_compliance_items CASCADE;
  END IF;

  -- Compliance system (migration 032)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compliance_calendar') THEN
    TRUNCATE TABLE compliance_calendar CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compliance_governance_log') THEN
    TRUNCATE TABLE compliance_governance_log CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compliance_cqc_answers') THEN
    TRUNCATE TABLE compliance_cqc_answers CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compliance_equipment') THEN
    TRUNCATE TABLE compliance_equipment CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compliance_training') THEN
    TRUNCATE TABLE compliance_training CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compliance_hr_records') THEN
    TRUNCATE TABLE compliance_hr_records CASCADE;
  END IF;

  -- Patient hub (migration 032b)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_plans') THEN
    TRUNCATE TABLE patient_plans CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_treatment_logs') THEN
    TRUNCATE TABLE patient_treatment_logs CASCADE;
  END IF;

  -- Smart calendar (migration 033)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calendar_events') THEN
    TRUNCATE TABLE calendar_events CASCADE;
  END IF;

  -- Patient messages (migration 034)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_messages') THEN
    TRUNCATE TABLE patient_messages CASCADE;
  END IF;

  -- Team spaces (migration 035)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_posts') THEN
    TRUNCATE TABLE team_posts CASCADE;
  END IF;

  -- Clinical EHR (migration 036)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_photos') THEN
    TRUNCATE TABLE clinical_photos CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_consents') THEN
    TRUNCATE TABLE patient_consents CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'soap_notes') THEN
    TRUNCATE TABLE soap_notes CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vitals_history') THEN
    TRUNCATE TABLE vitals_history CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clinical_records') THEN
    TRUNCATE TABLE clinical_records CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'treatment_protocols') THEN
    TRUNCATE TABLE treatment_protocols CASCADE;
  END IF;

  -- Clinical additions (migration 037)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referrals') THEN
    TRUNCATE TABLE referrals CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lab_results') THEN
    TRUNCATE TABLE lab_results CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prescriptions') THEN
    TRUNCATE TABLE prescriptions CASCADE;
  END IF;

  -- Booking pipeline (migration 041)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_requests') THEN
    TRUNCATE TABLE booking_requests CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'practitioner_working_hours') THEN
    TRUNCATE TABLE practitioner_working_hours CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cliniko_practitioners') THEN
    TRUNCATE TABLE cliniko_practitioners CASCADE;
  END IF;

  -- Call sessions / waiting list (migration 042)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'call_sessions') THEN
    TRUNCATE TABLE call_sessions CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'patient_waiting_list') THEN
    TRUNCATE TABLE patient_waiting_list CASCADE;
  END IF;

  -- Call logs (migration 045)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'call_logs') THEN
    TRUNCATE TABLE call_logs CASCADE;
  END IF;

  RAISE NOTICE 'Step 1 complete: all tables truncated.';
END $$;


-- =============================================================================
-- SECTION 2: ADD tenant_id TO CORE SCHEMA TABLES (migration 013)
-- Strategy: ADD COLUMN IF NOT EXISTS (nullable first), then NOT NULL later.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 2: Adding tenant_id to core schema tables (migration 013)...';
END $$;

-- clinic_config
-- Was a single-row table. Now per-tenant — one row per tenant.
ALTER TABLE clinic_config
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- departments
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- roles
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- agents
-- Was seeded with 3 rows (primary_agent, sales_agent, crm_agent).
-- Will be re-seeded per tenant during onboarding.
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- signals
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- judgements
ALTER TABLE judgements
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- chat_conversations
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- chat_messages
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- agent_memories
ALTER TABLE agent_memories
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- knowledge_categories
ALTER TABLE knowledge_categories
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- knowledge_documents
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- knowledge_chunks
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- cliniko_config
-- Was a single-row table. Now per-tenant — one row per tenant.
ALTER TABLE cliniko_config
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- cliniko_patients
ALTER TABLE cliniko_patients
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- cliniko_appointments
ALTER TABLE cliniko_appointments
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- cliniko_sync_logs
ALTER TABLE cliniko_sync_logs
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- audit_trail
ALTER TABLE audit_trail
  ADD COLUMN IF NOT EXISTS tenant_id UUID;


-- =============================================================================
-- SECTION 3: ADD tenant_id TO LATER-MIGRATION TABLES (migrations 031–052)
-- Uses DO/EXCEPTION blocks so each ALTER is safe if the table does not exist.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 3: Adding tenant_id to later-migration tables (031-052)...';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 031: KPI / Goals / Staff Compliance
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE staff_goals ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table staff_goals does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE goal_updates ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table goal_updates does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE staff_compliance_items ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table staff_compliance_items does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 032: Compliance System
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE compliance_hr_records ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table compliance_hr_records does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_training ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table compliance_training does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_equipment ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table compliance_equipment does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_cqc_answers ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table compliance_cqc_answers does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_governance_log ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table compliance_governance_log does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_calendar ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table compliance_calendar does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 032b: Patient Hub
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE patient_treatment_logs ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table patient_treatment_logs does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE patient_plans ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table patient_plans does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 033: Smart Calendar
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table calendar_events does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 034: Patient Messages
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE patient_messages ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table patient_messages does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 035: Team Spaces (stored as team_posts)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE team_posts ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table team_posts does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 036: Clinical EHR
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE clinical_records ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table clinical_records does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE vitals_history ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table vitals_history does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE soap_notes ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table soap_notes does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE patient_consents ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table patient_consents does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE clinical_photos ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table clinical_photos does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE treatment_protocols ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table treatment_protocols does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 037: Clinical Additions
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table prescriptions does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table lab_results does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE referrals ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table referrals does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 041: Booking Pipeline
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE cliniko_practitioners ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table cliniko_practitioners does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE practitioner_working_hours ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table practitioner_working_hours does not exist — skipping.';
END $$;

DO $$ BEGIN
  ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table booking_requests does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 042: Call Sessions + Waiting List
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table call_sessions does not exist — skipping.';
END $$;

DO $$ BEGIN
  -- Note: actual table name from migration 042 is patient_waiting_list
  ALTER TABLE patient_waiting_list ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table patient_waiting_list does not exist — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- Migration 045: Call Logs
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS tenant_id UUID;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table call_logs does not exist — skipping.';
END $$;


-- =============================================================================
-- SECTION 4: CREATE tenant_id INDEXES
-- Covers all tables from both core and later migrations.
-- All use CREATE INDEX IF NOT EXISTS — safe to re-run.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 4: Creating tenant_id indexes...';
END $$;

-- Core schema indexes
CREATE INDEX IF NOT EXISTS idx_clinic_config_tenant_id       ON clinic_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id         ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id               ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id               ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_tenant_id              ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_signals_tenant_id             ON signals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_judgements_tenant_id          ON judgements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_id  ON chat_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_id       ON chat_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_tenant_id      ON agent_memories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_categories_tenant_id ON knowledge_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tenant_id ON knowledge_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_id    ON knowledge_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_config_tenant_id      ON cliniko_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_patients_tenant_id    ON cliniko_patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_appointments_tenant_id ON cliniko_appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cliniko_sync_logs_tenant_id   ON cliniko_sync_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant_id         ON audit_trail(tenant_id);

-- Later-migration indexes (only if table exists — wrapped in DO blocks)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_staff_goals_tenant_id
    ON staff_goals(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_goal_updates_tenant_id
    ON goal_updates(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_staff_compliance_items_tenant_id
    ON staff_compliance_items(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_compliance_hr_records_tenant_id
    ON compliance_hr_records(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_compliance_training_tenant_id
    ON compliance_training(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_compliance_equipment_tenant_id
    ON compliance_equipment(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_compliance_cqc_answers_tenant_id
    ON compliance_cqc_answers(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_compliance_governance_log_tenant_id
    ON compliance_governance_log(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_compliance_calendar_tenant_id
    ON compliance_calendar(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_patient_treatment_logs_tenant_id
    ON patient_treatment_logs(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_patient_plans_tenant_id
    ON patient_plans(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant_id
    ON calendar_events(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_patient_messages_tenant_id
    ON patient_messages(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_team_posts_tenant_id
    ON team_posts(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_clinical_records_tenant_id
    ON clinical_records(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_vitals_history_tenant_id
    ON vitals_history(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_soap_notes_tenant_id
    ON soap_notes(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_patient_consents_tenant_id
    ON patient_consents(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_clinical_photos_tenant_id
    ON clinical_photos(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_treatment_protocols_tenant_id
    ON treatment_protocols(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_id
    ON prescriptions(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_lab_results_tenant_id
    ON lab_results(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_referrals_tenant_id
    ON referrals(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_cliniko_practitioners_tenant_id
    ON cliniko_practitioners(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_practitioner_working_hours_tenant_id
    ON practitioner_working_hours(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_booking_requests_tenant_id
    ON booking_requests(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_call_sessions_tenant_id
    ON call_sessions(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_patient_waiting_list_tenant_id
    ON patient_waiting_list(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_id
    ON call_logs(tenant_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- =============================================================================
-- SECTION 5: ENFORCE NOT NULL ON tenant_id
-- All tables were just truncated so there are zero rows — no UPDATE backfill
-- needed. We simply set NOT NULL directly. Each statement is wrapped in a
-- DO/EXCEPTION block so a second run is idempotent (already-NOT-NULL is a
-- no-op in Postgres if the column is already constrained).
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 5: Enforcing NOT NULL on tenant_id columns...';
END $$;

-- Core schema — these tables are guaranteed to exist
DO $$ BEGIN
  ALTER TABLE clinic_config ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'clinic_config.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE departments ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'departments.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE roles ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'roles.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'users.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE agents ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'agents.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE signals ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'signals.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE judgements ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'judgements.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE chat_conversations ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'chat_conversations.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE chat_messages ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'chat_messages.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE agent_memories ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'agent_memories.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE knowledge_categories ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'knowledge_categories.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE knowledge_documents ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'knowledge_documents.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE knowledge_chunks ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'knowledge_chunks.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE cliniko_config ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cliniko_config.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE cliniko_patients ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cliniko_patients.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE cliniko_appointments ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cliniko_appointments.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE cliniko_sync_logs ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cliniko_sync_logs.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE audit_trail ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'audit_trail.tenant_id NOT NULL already enforced or error: %', SQLERRM;
END $$;

-- Later-migration tables (skip gracefully if table absent)
DO $$ BEGIN
  ALTER TABLE staff_goals ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'staff_goals.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE goal_updates ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'goal_updates.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE staff_compliance_items ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'staff_compliance_items.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_hr_records ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'compliance_hr_records.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_training ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'compliance_training.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_equipment ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'compliance_equipment.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_cqc_answers ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'compliance_cqc_answers.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_governance_log ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'compliance_governance_log.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE compliance_calendar ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'compliance_calendar.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE patient_treatment_logs ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'patient_treatment_logs.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE patient_plans ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'patient_plans.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE calendar_events ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'calendar_events.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE patient_messages ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'patient_messages.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE team_posts ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'team_posts.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE clinical_records ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'clinical_records.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE vitals_history ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'vitals_history.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE soap_notes ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'soap_notes.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE patient_consents ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'patient_consents.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE clinical_photos ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'clinical_photos.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE treatment_protocols ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'treatment_protocols.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE prescriptions ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'prescriptions.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE lab_results ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'lab_results.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE referrals ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'referrals.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE cliniko_practitioners ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'cliniko_practitioners.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE practitioner_working_hours ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'practitioner_working_hours.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE booking_requests ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'booking_requests.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE call_sessions ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'call_sessions.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE patient_waiting_list ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'patient_waiting_list.tenant_id: %', SQLERRM;
END $$;

DO $$ BEGIN
  ALTER TABLE call_logs ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'call_logs.tenant_id: %', SQLERRM;
END $$;


-- =============================================================================
-- SECTION 6: DROP UNIQUE CONSTRAINTS THAT ARE NOW TENANT-SCOPED
--
-- Some tables had UNIQUE constraints on columns that must now be unique only
-- within a tenant. We drop the old constraint and create a composite one.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 6: Updating unique constraints to be tenant-scoped...';
END $$;

-- roles.slug was UNIQUE globally — now unique per tenant
DO $$ BEGIN
  ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_slug_key;
  -- Add composite unique: tenant_id + slug
  ALTER TABLE roles ADD CONSTRAINT roles_tenant_slug_unique UNIQUE (tenant_id, slug);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'roles slug constraint update: %', SQLERRM;
END $$;

-- users.email was UNIQUE globally — now unique per tenant
DO $$ BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
  ALTER TABLE users ADD CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'users email constraint update: %', SQLERRM;
END $$;

-- agents.agent_key was UNIQUE globally — now unique per tenant
DO $$ BEGIN
  ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_agent_key_key;
  ALTER TABLE agents ADD CONSTRAINT agents_tenant_agent_key_unique UNIQUE (tenant_id, agent_key);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'agents agent_key constraint update: %', SQLERRM;
END $$;

-- knowledge_categories.slug was UNIQUE globally — now unique per tenant
DO $$ BEGIN
  ALTER TABLE knowledge_categories DROP CONSTRAINT IF EXISTS knowledge_categories_slug_key;
  ALTER TABLE knowledge_categories ADD CONSTRAINT knowledge_categories_tenant_slug_unique UNIQUE (tenant_id, slug);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'knowledge_categories slug constraint update: %', SQLERRM;
END $$;

-- cliniko_patients.cliniko_id was UNIQUE globally — now unique per tenant
-- (Two different tenants could theoretically share a Cliniko shard but will
-- have their own patient IDs. Composite constraint is the correct approach.)
DO $$ BEGIN
  ALTER TABLE cliniko_patients DROP CONSTRAINT IF EXISTS cliniko_patients_cliniko_id_key;
  ALTER TABLE cliniko_patients ADD CONSTRAINT cliniko_patients_tenant_cliniko_id_unique UNIQUE (tenant_id, cliniko_id);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cliniko_patients cliniko_id constraint update: %', SQLERRM;
END $$;

-- cliniko_appointments.cliniko_id was UNIQUE globally — now unique per tenant
DO $$ BEGIN
  ALTER TABLE cliniko_appointments DROP CONSTRAINT IF EXISTS cliniko_appointments_cliniko_id_key;
  ALTER TABLE cliniko_appointments ADD CONSTRAINT cliniko_appointments_tenant_cliniko_id_unique UNIQUE (tenant_id, cliniko_id);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'cliniko_appointments cliniko_id constraint update: %', SQLERRM;
END $$;

-- compliance_training (user_id, module) — now (tenant_id, user_id, module)
DO $$ BEGIN
  ALTER TABLE compliance_training DROP CONSTRAINT IF EXISTS compliance_training_user_id_module_key;
  ALTER TABLE compliance_training ADD CONSTRAINT compliance_training_tenant_user_module_unique
    UNIQUE (tenant_id, user_id, module);
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'compliance_training constraint update: %', SQLERRM;
END $$;

-- compliance_cqc_answers.question_number — now per tenant
DO $$ BEGIN
  ALTER TABLE compliance_cqc_answers DROP CONSTRAINT IF EXISTS compliance_cqc_answers_question_number_key;
  ALTER TABLE compliance_cqc_answers ADD CONSTRAINT compliance_cqc_answers_tenant_question_unique
    UNIQUE (tenant_id, question_number);
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'compliance_cqc_answers constraint update: %', SQLERRM;
END $$;

-- compliance_hr_records.user_id — now per tenant
DO $$ BEGIN
  ALTER TABLE compliance_hr_records DROP CONSTRAINT IF EXISTS compliance_hr_records_user_id_key;
  ALTER TABLE compliance_hr_records ADD CONSTRAINT compliance_hr_records_tenant_user_unique
    UNIQUE (tenant_id, user_id);
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'compliance_hr_records constraint update: %', SQLERRM;
END $$;

-- cliniko_practitioners.cliniko_id — now per tenant
DO $$ BEGIN
  ALTER TABLE cliniko_practitioners DROP CONSTRAINT IF EXISTS cliniko_practitioners_cliniko_id_key;
  ALTER TABLE cliniko_practitioners ADD CONSTRAINT cliniko_practitioners_tenant_cliniko_id_unique
    UNIQUE (tenant_id, cliniko_id);
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'cliniko_practitioners constraint update: %', SQLERRM;
END $$;

-- practitioner_working_hours (practitioner_id, day_of_week) — now per tenant
DO $$ BEGIN
  ALTER TABLE practitioner_working_hours DROP CONSTRAINT IF EXISTS practitioner_working_hours_practitioner_id_day_of_week_key;
  ALTER TABLE practitioner_working_hours ADD CONSTRAINT pwh_tenant_practitioner_day_unique
    UNIQUE (tenant_id, practitioner_id, day_of_week);
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'practitioner_working_hours constraint update: %', SQLERRM;
END $$;

-- call_sessions (vapi_call_id, tool_name) — now per tenant
DO $$ BEGIN
  ALTER TABLE call_sessions DROP CONSTRAINT IF EXISTS call_sessions_vapi_call_id_tool_name_key;
  ALTER TABLE call_sessions ADD CONSTRAINT call_sessions_tenant_vapi_call_tool_unique
    UNIQUE (tenant_id, vapi_call_id, tool_name);
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'call_sessions constraint update: %', SQLERRM;
END $$;

-- call_logs.vapi_call_id — now per tenant (a call_id is globally unique from
-- Vapi, so this is safe to leave as-is, but we make it tenant-scoped for
-- consistency in case future sharding routes different tenants through the
-- same Vapi account)
DO $$ BEGIN
  ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS call_logs_vapi_call_id_key;
  ALTER TABLE call_logs ADD CONSTRAINT call_logs_tenant_vapi_call_id_unique
    UNIQUE (tenant_id, vapi_call_id);
EXCEPTION WHEN undefined_table THEN NULL;
WHEN others THEN RAISE NOTICE 'call_logs constraint update: %', SQLERRM;
END $$;


-- =============================================================================
-- SECTION 7: COMPOSITE INDEXES FOR HIGH-FREQUENCY TENANT QUERIES
--
-- The most common query pattern will be WHERE tenant_id = $1 AND <filter>.
-- Composite indexes on (tenant_id, <frequently-filtered-column>) outperform
-- separate single-column indexes for these queries.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 7: Creating composite tenant query indexes...';
END $$;

CREATE INDEX IF NOT EXISTS idx_users_tenant_email
  ON users(tenant_id, email);

CREATE INDEX IF NOT EXISTS idx_users_tenant_status
  ON users(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_agents_tenant_key
  ON agents(tenant_id, agent_key);

CREATE INDEX IF NOT EXISTS idx_agents_tenant_active
  ON agents(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_signals_tenant_status
  ON signals(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_signals_tenant_priority
  ON signals(tenant_id, priority);

CREATE INDEX IF NOT EXISTS idx_signals_tenant_created
  ON signals(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant_user
  ON chat_conversations(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_tenant_conv
  ON chat_messages(tenant_id, conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_memories_tenant_key
  ON agent_memories(tenant_id, agent_key, importance DESC);

CREATE INDEX IF NOT EXISTS idx_cliniko_patients_tenant_email
  ON cliniko_patients(tenant_id, email);

CREATE INDEX IF NOT EXISTS idx_cliniko_patients_tenant_last_name
  ON cliniko_patients(tenant_id, last_name);

CREATE INDEX IF NOT EXISTS idx_cliniko_appointments_tenant_starts
  ON cliniko_appointments(tenant_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_cliniko_appointments_tenant_status
  ON cliniko_appointments(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant_user
  ON audit_trail(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant_action
  ON audit_trail(tenant_id, action_type, created_at DESC);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_booking_requests_tenant_status
    ON booking_requests(tenant_id, status);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_created
    ON call_logs(tenant_id, created_at DESC);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_patient_messages_tenant_patient
    ON patient_messages(tenant_id, patient_id, created_at DESC);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_clinical_records_tenant_patient
    ON clinical_records(tenant_id, cliniko_patient_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_soap_notes_tenant_patient
    ON soap_notes(tenant_id, cliniko_patient_id, created_at DESC);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_patient_consents_tenant_patient
    ON patient_consents(tenant_id, cliniko_patient_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_staff_goals_tenant_owner
    ON staff_goals(tenant_id, owner_id, status);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_patient_waiting_list_tenant_status
    ON patient_waiting_list(tenant_id, status);
EXCEPTION WHEN undefined_table THEN NULL; END $$;


-- =============================================================================
-- SECTION 8: UPDATE match_knowledge_chunks() RPC FOR MULTI-TENANT
--
-- The pgvector similarity search function must be tenant-scoped so that
-- knowledge base searches never leak data across tenants.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 8: Updating match_knowledge_chunks() for multi-tenant...';
END $$;

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

-- Note: The old single-tenant signature (without p_tenant_id) is now replaced.
-- Any application code calling match_knowledge_chunks() must pass tenant_id
-- as the first argument.


-- =============================================================================
-- SECTION 9: TENANTS TABLE
--
-- Create the central tenants registry table. Each row represents one clinic.
-- The tenant_id UUID in all other tables references this table's id.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Step 9: Creating tenants table...';
END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity
  slug            TEXT        NOT NULL UNIQUE,   -- url-safe identifier: 'edgbaston-wellness'
  clinic_name     TEXT        NOT NULL,
  subdomain       TEXT        UNIQUE,            -- 'ewc' → ewc.jwebly.com (future)

  -- Plan & billing
  plan            TEXT        NOT NULL DEFAULT 'starter'
                  CHECK (plan IN ('starter', 'growth', 'enterprise')),
  billing_email   TEXT,
  stripe_customer_id TEXT,

  -- Status
  status          TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('trialing', 'active', 'suspended', 'cancelled')),
  trial_ends_at   TIMESTAMPTZ,

  -- Onboarding
  onboarding_completed    BOOLEAN     NOT NULL DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ,
  onboarding_step         INT         NOT NULL DEFAULT 1,

  -- Contact
  primary_contact_name    TEXT,
  primary_contact_email   TEXT,
  primary_contact_phone   TEXT,

  -- Region / compliance
  country         TEXT        NOT NULL DEFAULT 'GB',
  timezone        TEXT        NOT NULL DEFAULT 'Europe/London',
  currency        TEXT        NOT NULL DEFAULT 'GBP',

  -- Metadata
  settings        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
-- VERIFY
-- =============================================================================

DO $$
DECLARE
  v_core_tables    TEXT[] := ARRAY[
    'clinic_config', 'departments', 'roles', 'users', 'agents',
    'signals', 'judgements', 'chat_conversations', 'chat_messages',
    'agent_memories', 'knowledge_categories', 'knowledge_documents',
    'knowledge_chunks', 'cliniko_config', 'cliniko_patients',
    'cliniko_appointments', 'cliniko_sync_logs', 'audit_trail'
  ];
  v_table          TEXT;
  v_has_tenant_id  INT;
  v_is_not_null    TEXT;
  v_tenant_count   INT;
BEGIN
  RAISE NOTICE '=== Migration 053 Verification ===';

  -- Check tenants table
  SELECT COUNT(*) INTO v_tenant_count FROM tenants;
  RAISE NOTICE 'tenants table: exists, % rows', v_tenant_count;

  -- Verify core tables have tenant_id as NOT NULL
  FOREACH v_table IN ARRAY v_core_tables LOOP
    SELECT COUNT(*) INTO v_has_tenant_id
      FROM information_schema.columns
     WHERE table_name = v_table AND column_name = 'tenant_id';

    SELECT is_nullable INTO v_is_not_null
      FROM information_schema.columns
     WHERE table_name = v_table AND column_name = 'tenant_id';

    IF v_has_tenant_id = 0 THEN
      RAISE WARNING '  MISSING tenant_id: %', v_table;
    ELSIF v_is_not_null = 'YES' THEN
      RAISE WARNING '  tenant_id is still NULLABLE: %', v_table;
    ELSE
      RAISE NOTICE '  OK — %: tenant_id NOT NULL', v_table;
    END IF;
  END LOOP;

  RAISE NOTICE '=== Migration 053: Multi-Tenant Conversion — COMPLETE ===';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Update all server actions to pass tenant_id on INSERT/SELECT';
  RAISE NOTICE '  2. Update match_knowledge_chunks() callers with tenant_id arg';
  RAISE NOTICE '  3. Seed first tenant via onboarding flow (creates agents + config)';
  RAISE NOTICE '  4. Remove getLatestTenantAndUser() fallback — tenant_id now required';
END $$;

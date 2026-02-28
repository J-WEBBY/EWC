-- =============================================================================
-- Migration 012: Drop All Existing Tables
-- Edgbaston Wellness Clinic — Clean slate before new schema
-- Run this in Supabase SQL Editor BEFORE migration 013
-- =============================================================================

-- Drop in reverse dependency order to avoid FK violations

-- Deep Probe (005)
DROP TABLE IF EXISTS deep_probe_values CASCADE;
DROP TABLE IF EXISTS deep_probe_workflows CASCADE;
DROP TABLE IF EXISTS deep_probe_insights CASCADE;
DROP TABLE IF EXISTS deep_probe_messages CASCADE;
DROP TABLE IF EXISTS deep_probe_conversations CASCADE;

-- Agent system (009-011)
DROP TABLE IF EXISTS agent_memories CASCADE;
DROP TABLE IF EXISTS agent_tool_calls CASCADE;
DROP TABLE IF EXISTS agents CASCADE;

-- Chat
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_conversations CASCADE;

-- Signals & Judgements
DROP TABLE IF EXISTS judgements CASCADE;
DROP TABLE IF EXISTS signals CASCADE;

-- Knowledge Base
DROP TABLE IF EXISTS knowledge_chunks CASCADE;
DROP TABLE IF EXISTS knowledge_documents CASCADE;
DROP TABLE IF EXISTS knowledge_categories CASCADE;

-- Integrations
DROP TABLE IF EXISTS integrations CASCADE;
DROP TABLE IF EXISTS integration_types CASCADE;

-- Audit
DROP TABLE IF EXISTS audit_trail CASCADE;

-- Onboarding
DROP TABLE IF EXISTS onboarding_progress CASCADE;
DROP TABLE IF EXISTS activation_keys CASCADE;

-- Org structure
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS department_templates CASCADE;

-- Tenant layer
DROP TABLE IF EXISTS discovery_audits CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS industries CASCADE;

-- Agency
DROP TABLE IF EXISTS agency_users CASCADE;

-- System
DROP TABLE IF EXISTS system_settings CASCADE;

-- Drop any triggers and functions that may have been created
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS match_knowledge_chunks(UUID, vector, INT, FLOAT) CASCADE;

-- Confirm
DO $$
BEGIN
  RAISE NOTICE 'Migration 012 complete — all tables dropped. Ready for 013.';
END $$;

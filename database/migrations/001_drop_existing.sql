-- =====================================================
-- JWEBLY SYSTEM - Migration 001: Drop Existing Tables
-- WARNING: This will delete ALL existing data
-- =====================================================

-- Disable RLS temporarily for cleanup
ALTER TABLE IF EXISTS tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activation_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS staff_onboarding DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dashboard_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_chunks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_trail DISABLE ROW LEVEL SECURITY;

-- Drop existing tables in reverse dependency order
DROP TABLE IF EXISTS knowledge_chunks CASCADE;
DROP TABLE IF EXISTS knowledge_documents CASCADE;
DROP TABLE IF EXISTS dashboard_configs CASCADE;
DROP TABLE IF EXISTS staff_onboarding CASCADE;
DROP TABLE IF EXISTS audit_trail CASCADE;
DROP TABLE IF EXISTS activation_keys CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Drop any other tables that might exist
DROP TABLE IF EXISTS integrations CASCADE;
DROP TABLE IF EXISTS integration_types CASCADE;
DROP TABLE IF EXISTS onboarding_progress CASCADE;
DROP TABLE IF EXISTS knowledge_categories CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS department_templates CASCADE;
DROP TABLE IF EXISTS discovery_audits CASCADE;
DROP TABLE IF EXISTS industries CASCADE;
DROP TABLE IF EXISTS agency_users CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;

-- Drop Deep Probe tables (Migration 005)
DROP TABLE IF EXISTS deep_probe_values CASCADE;
DROP TABLE IF EXISTS deep_probe_workflows CASCADE;
DROP TABLE IF EXISTS deep_probe_insights CASCADE;
DROP TABLE IF EXISTS deep_probe_messages CASCADE;
DROP TABLE IF EXISTS deep_probe_conversations CASCADE;

-- Drop custom types if they exist
DROP TYPE IF EXISTS onboarding_phase CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS subscription_tier CASCADE;

-- All existing tables dropped successfully

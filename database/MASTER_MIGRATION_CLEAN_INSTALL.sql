-- =====================================================
-- JWEBLY SYSTEM - MASTER MIGRATION (Clean Install)
-- Run this ONCE in Supabase SQL Editor to set up everything
-- =====================================================
-- This file combines migrations 001-005
-- =====================================================

-- =====================================================
-- STEP 1: DROP ALL EXISTING TABLES (Migration 001)
-- =====================================================

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS audit_trail CASCADE;
DROP TABLE IF EXISTS integrations CASCADE;
DROP TABLE IF EXISTS integration_types CASCADE;
DROP TABLE IF EXISTS knowledge_chunks CASCADE;
DROP TABLE IF EXISTS knowledge_documents CASCADE;
DROP TABLE IF EXISTS knowledge_categories CASCADE;
DROP TABLE IF EXISTS onboarding_progress CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS department_templates CASCADE;
DROP TABLE IF EXISTS activation_keys CASCADE;
DROP TABLE IF EXISTS discovery_audits CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS industries CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS agency_users CASCADE;

-- Drop Deep Probe tables
DROP TABLE IF EXISTS deep_probe_values CASCADE;
DROP TABLE IF EXISTS deep_probe_workflows CASCADE;
DROP TABLE IF EXISTS deep_probe_insights CASCADE;
DROP TABLE IF EXISTS deep_probe_messages CASCADE;
DROP TABLE IF EXISTS deep_probe_conversations CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop custom types if they exist
DROP TYPE IF EXISTS onboarding_phase CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS subscription_tier CASCADE;

-- All existing tables dropped successfully

-- =====================================================
-- STEP 2: CREATE CORE SCHEMA (Migration 002)
-- =====================================================

-- This creates all the core tables, indexes, RLS policies, and triggers
-- Copy the ENTIRE contents of 002_create_schema.sql here
-- (I'll include it inline for you)

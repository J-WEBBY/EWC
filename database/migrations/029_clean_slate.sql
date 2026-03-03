-- =============================================================================
-- 029_clean_slate.sql — Wipe demo / test data, keep schema + config intact
-- Run in Supabase SQL editor before connecting real Cliniko API
-- =============================================================================

-- Cliniko sync data
DELETE FROM cliniko_sync_logs;
DELETE FROM cliniko_appointments;
DELETE FROM cliniko_patients;

-- Operational data
DELETE FROM signals;
DELETE FROM judgements;
DELETE FROM audit_trail;

-- Agent memory and conversations
DELETE FROM agent_memories;
DELETE FROM chat_messages;
DELETE FROM chat_conversations;

-- Routing corrections (accumulated from demo usage)
DELETE FROM routing_corrections WHERE true;

-- Signal categories (will be rebuilt by real traffic)
DELETE FROM signal_categories WHERE true;

-- Reset agent signal counters
UPDATE agents SET signal_count = 0, avg_confidence = 0 WHERE true;

-- ============================================================
-- KEEP (do not touch):
--   users, roles, departments
--   agents (system_prompt etc)
--   clinic_config
--   knowledge_categories, knowledge_documents, knowledge_chunks
--   cliniko_config
-- ============================================================

SELECT 'Clean slate complete. Ready for real Cliniko sync.' AS status;

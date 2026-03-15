-- =============================================================================
-- Migration 058: Drop local Cliniko data cache tables
-- Patient data now accessed live via Cliniko API — nothing stored locally.
-- Only cliniko_config is retained (stores API key + shard + connection state).
-- =============================================================================

DROP TABLE IF EXISTS cliniko_sync_logs    CASCADE;
DROP TABLE IF EXISTS cliniko_invoices     CASCADE;
DROP TABLE IF EXISTS cliniko_appointments CASCADE;
DROP TABLE IF EXISTS cliniko_patients     CASCADE;
DROP TABLE IF EXISTS cliniko_practitioners CASCADE;

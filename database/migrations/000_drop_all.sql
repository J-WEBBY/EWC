-- =============================================================================
-- Migration 000: Drop All Tables (Nuclear Reset)
-- Run this FIRST on a database with old single-tenant tables.
-- Then run 054 → 055 → 064 in order.
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== DROP ALL: Clearing old schema ==='; END $$;

-- Drop all triggers first
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT trigger_name, event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I CASCADE', r.trigger_name, r.event_object_table);
  END LOOP;
END $$;

-- Drop all tables in one shot (CASCADE handles FK dependencies)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename);
  END LOOP;
END $$;

-- Drop all user-defined functions (skip extension-owned ones)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.func_sig);
  END LOOP;
END $$;

DO $$ BEGIN RAISE NOTICE '=== DROP ALL: Complete — now run 054 then 055 then 064 ==='; END $$;

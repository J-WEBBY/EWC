-- =============================================================================
-- Migration 043: Fix booking_requests
--
-- Fixes:
--   1. Drop the referral_source CHECK constraint — Haiku may send values that
--      are valid in intent but fail the strict enum check (e.g. casing issues,
--      'social media' with space vs 'social_media'). The app now normalises
--      the value before inserting, so the DB constraint adds no safety value.
--
--   2. Ensure call_sessions table exists for write-tool deduplication
--      (same as 042_call_sessions.sql — safe to re-run with IF NOT EXISTS).
-- =============================================================================

-- 1. Drop referral_source CHECK constraint
ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS booking_requests_referral_source_check;

-- 2. Call sessions (dedup table) — safe re-run
CREATE TABLE IF NOT EXISTS call_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id text        NOT NULL,
  tool_name    text        NOT NULL,
  call_count   integer     NOT NULL DEFAULT 1,
  first_args   jsonb,
  first_result text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vapi_call_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_call_id  ON call_sessions(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_created  ON call_sessions(created_at);

-- Auto-delete sessions older than 24h
CREATE OR REPLACE FUNCTION delete_old_call_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM call_sessions WHERE created_at < now() - interval '24 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_call_sessions ON call_sessions;
CREATE TRIGGER trg_clean_call_sessions
  AFTER INSERT ON call_sessions
  FOR EACH ROW EXECUTE FUNCTION delete_old_call_sessions();

-- Verify
DO $$
DECLARE
  v_bookings INT;
  v_sessions INT;
BEGIN
  SELECT COUNT(*) INTO v_bookings FROM booking_requests;
  SELECT COUNT(*) INTO v_sessions FROM call_sessions;
  RAISE NOTICE '✓ Migration 043 complete';
  RAISE NOTICE '  booking_requests: % rows (referral_source constraint removed)', v_bookings;
  RAISE NOTICE '  call_sessions:    % rows (dedup table ready)', v_sessions;
END $$;

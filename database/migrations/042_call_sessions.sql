-- =============================================================================
-- Migration 042: call_sessions
-- Deduplication table for mid-call tool calls.
-- When Komal fires create_booking_request (or any write tool) multiple times
-- for the same call, only the first execution writes to the DB.
-- Subsequent calls return the cached result instantly.
-- =============================================================================

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

-- Auto-delete sessions older than 24h (calls never last that long)
CREATE OR REPLACE FUNCTION delete_old_call_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM call_sessions WHERE created_at < now() - interval '24 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clean_call_sessions ON call_sessions;
CREATE TRIGGER trg_clean_call_sessions
  AFTER INSERT ON call_sessions
  EXECUTE FUNCTION delete_old_call_sessions();

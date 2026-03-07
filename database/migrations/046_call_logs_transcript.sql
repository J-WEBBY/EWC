-- =============================================================================
-- Migration 046: Add transcript to call_logs
--
-- Adds a full call transcript column so the webhook can store the complete
-- conversation and the voice page can display it in the call detail panel.
-- Also ensures vapi_call_id has a UNIQUE constraint for reliable upserts.
-- =============================================================================

-- 1. Add transcript column
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transcript TEXT;

-- 2. Ensure vapi_call_id uniqueness (prevents duplicate rows for same call)
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_logs_vapi_call_id_unique
  ON call_logs(vapi_call_id)
  WHERE vapi_call_id IS NOT NULL;

-- Verify
DO $$
DECLARE v_rows INT;
BEGIN
  SELECT COUNT(*) INTO v_rows FROM call_logs;
  RAISE NOTICE '✓ Migration 046 complete';
  RAISE NOTICE '  call_logs: % rows, transcript column added', v_rows;
END $$;

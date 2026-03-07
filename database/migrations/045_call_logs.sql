-- =============================================================================
-- Migration 045: Call Logs
--
-- Replaces voice-call signals with a dedicated call_logs table.
-- Every Vapi call (inbound, outbound, missed) gets one row here.
-- Booking calls also link to booking_requests via booking_request_id.
--
-- This is the single source of truth for the voice receptionist call history.
-- Signals table is no longer written for voice calls.
-- =============================================================================

CREATE TABLE IF NOT EXISTS call_logs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id        TEXT        UNIQUE,          -- Vapi's call ID — dedup guarantee

  -- Caller identity (enriched from tool args)
  caller_name         TEXT,
  caller_phone        TEXT,
  caller_email        TEXT,

  -- What the call was about
  service_requested   TEXT,                        -- treatment/service discussed
  outcome             TEXT CHECK (outcome IN (
                        'booked', 'lead', 'enquiry',
                        'missed', 'escalated', 'concern', 'info_only'
                      )),
  direction           TEXT NOT NULL DEFAULT 'inbound'
                      CHECK (direction IN ('inbound', 'outbound', 'web')),

  -- Call metadata
  duration_seconds    INTEGER     DEFAULT 0,
  recording_url       TEXT,
  ended_reason        TEXT,                        -- Vapi ended_reason (e.g. 'hangup', 'silence-timed-out')

  -- Notes and summary (written after call ends)
  call_notes          TEXT,                        -- free text: referral, treatment notes, allergies, history
  call_summary        TEXT,                        -- Vapi AI summary

  -- Intelligence metadata
  tools_used          TEXT[],                      -- which Komal tools fired during the call
  agent_consulted     TEXT,                        -- 'orion' | 'aria' | null

  -- Referral (from create_booking_request or capture_lead args)
  referral_source     TEXT,
  referral_name       TEXT,

  -- Link to booking (set if create_booking_request was called)
  booking_request_id  UUID REFERENCES booking_requests(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cl_vapi_call_id  ON call_logs(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_cl_caller_phone  ON call_logs(caller_phone);
CREATE INDEX IF NOT EXISTS idx_cl_outcome       ON call_logs(outcome);
CREATE INDEX IF NOT EXISTS idx_cl_created       ON call_logs(created_at DESC);

-- Verify
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM call_logs;
  RAISE NOTICE '✓ Migration 045 complete — call_logs table ready';
  RAISE NOTICE '  call_logs: % rows', v_count;
  RAISE NOTICE '  Voice calls now write here, not to signals.';
END $$;

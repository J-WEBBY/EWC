-- =============================================================================
-- Migration 033: Smart Calendar System
--
-- Adds:
--   1. calendar_events — user-created events, blockers, training slots, meetings
--
-- Compliance tasks, goals, and signals are sourced from existing tables
-- and overlaid on the calendar client-side (no duplication).
-- =============================================================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  title         TEXT        NOT NULL,
  description   TEXT,
  event_type    TEXT        NOT NULL DEFAULT 'note'
    CHECK (event_type IN (
      'meeting', 'training', 'blocked', 'note',
      'deadline', 'review', 'appointment', 'inspection'
    )),

  -- Timing
  start_date    DATE        NOT NULL,
  end_date      DATE,
  start_time    TIME,
  end_time      TIME,
  all_day       BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Appearance
  color         TEXT,       -- hex override (optional)

  -- Assignment
  assigned_to   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,

  -- Status
  status        TEXT        NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),

  -- Timestamps
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cal_evt_start    ON calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_cal_evt_assigned ON calendar_events(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cal_evt_type     ON calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cal_evt_status   ON calendar_events(status);

CREATE OR REPLACE FUNCTION update_cal_evt_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_cal_evt_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_cal_evt_updated_at();

-- =============================================================================
-- VERIFY
-- =============================================================================

DO $$
DECLARE v_cols INT;
BEGIN
  SELECT COUNT(*) INTO v_cols
    FROM information_schema.columns WHERE table_name = 'calendar_events';
  RAISE NOTICE '✓ Migration 033 complete';
  RAISE NOTICE '  calendar_events columns: %', v_cols;
END $$;

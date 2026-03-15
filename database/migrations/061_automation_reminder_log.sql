-- =============================================================================
-- Migration 061: automation_reminder_log
-- Tracks which reminders have been sent to prevent duplicate sends.
-- One row per appointment + reminder type. Unique constraint = deduplication.
-- =============================================================================

CREATE TABLE IF NOT EXISTS automation_reminder_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_appt_id  text        NOT NULL,   -- Cliniko appointment ID (string — safe from float64)
  reminder_type    text        NOT NULL,   -- '24h' | '2h'
  patient_name     text,
  patient_phone    text,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_reminder_per_appt UNIQUE (cliniko_appt_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_appt ON automation_reminder_log (cliniko_appt_id);
CREATE INDEX IF NOT EXISTS idx_reminder_log_sent ON automation_reminder_log (sent_at DESC);

COMMENT ON TABLE automation_reminder_log IS
  'Deduplication log for booking reminder automation. One row per appointment+type prevents duplicate sends even if cron fires multiple times.';

-- =============================================================================
-- Migration 062: automation_noshow_log
-- Tracks no-show follow-up state per appointment.
-- One row per DNA appointment — updated as the automation progresses.
-- =============================================================================

CREATE TABLE IF NOT EXISTS automation_noshow_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_appt_id     text        NOT NULL UNIQUE,
  patient_name        text,
  patient_phone       text,
  appointment_time    timestamptz,
  detected_at         timestamptz NOT NULL DEFAULT now(),
  stage               text        NOT NULL DEFAULT 'detected',
    -- 'detected' | 'call_attempted' | 'whatsapp_sent' | 'signal_raised' | 'resolved'
  call_attempted_at   timestamptz,
  whatsapp_sent_at    timestamptz,
  signal_raised_at    timestamptz,
  signal_id           uuid,
  notes               text
);

CREATE INDEX IF NOT EXISTS idx_noshow_log_stage      ON automation_noshow_log (stage);
CREATE INDEX IF NOT EXISTS idx_noshow_log_detected   ON automation_noshow_log (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_noshow_log_appt_time  ON automation_noshow_log (appointment_time);

COMMENT ON TABLE automation_noshow_log IS
  'State machine for no-show follow-up automation. Tracks each DNA appointment through stages: detected → call_attempted → whatsapp_sent → signal_raised → resolved.';

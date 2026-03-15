-- =============================================================================
-- 056_automation_communications.sql
-- Tracks every message sent through automation workflows (SMS, WhatsApp, Voice)
-- =============================================================================

CREATE TABLE IF NOT EXISTS automation_communications (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id    TEXT        NOT NULL,                -- e.g. 'booking_confirmation'
  automation_name  TEXT        NOT NULL,                -- human label
  patient_name     TEXT        NOT NULL,
  channel          TEXT        NOT NULL CHECK (channel IN ('WhatsApp', 'SMS', 'Email', 'Voice')),
  message          TEXT        NOT NULL,                -- full message body sent
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  provider_id      TEXT,                                -- Twilio SID / Vapi call ID
  error_message    TEXT,                                -- populated on failure
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_communications_sent_at_idx
  ON automation_communications (sent_at DESC);

CREATE INDEX IF NOT EXISTS automation_communications_automation_id_idx
  ON automation_communications (automation_id);

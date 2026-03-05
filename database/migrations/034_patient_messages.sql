-- =============================================================================
-- Migration 034: Patient Messages
--
-- Stores outbound messages sent to patients (SMS, email, WhatsApp)
-- and inbound messages received from patients.
-- Sources: staff (manual compose), automation, agent (AI-drafted), vapi (call follow-up)
-- =============================================================================

CREATE TABLE IF NOT EXISTS patient_messages (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Patient reference (nullable — supports messages before Cliniko sync)
  patient_id    UUID        REFERENCES cliniko_patients(id) ON DELETE SET NULL,
  patient_name  TEXT        NOT NULL,
  patient_phone TEXT,
  patient_email TEXT,

  -- Message
  direction     TEXT        NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  channel       TEXT        NOT NULL
    CHECK (channel IN ('sms', 'email', 'whatsapp', 'phone')),
  subject       TEXT,
  body          TEXT        NOT NULL,

  -- Who sent it
  source        TEXT        NOT NULL DEFAULT 'staff'
    CHECK (source IN ('staff', 'automation', 'agent', 'vapi', 'system')),
  source_detail TEXT,             -- e.g. 'Dr Ganata', 'Botox Follow-up', 'Aria'
  sent_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  sent_by_name  TEXT,

  -- Status
  status        TEXT        NOT NULL DEFAULT 'sent'
    CHECK (status IN ('draft', 'scheduled', 'sent', 'delivered', 'failed', 'read')),

  -- Timing
  scheduled_at  TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ DEFAULT NOW(),

  -- External integration reference (Twilio SID, email message-id, etc.)
  external_id   TEXT,

  -- Extra structured data
  metadata      JSONB       DEFAULT '{}',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pat_msgs_patient   ON patient_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_pat_msgs_direction ON patient_messages(direction);
CREATE INDEX IF NOT EXISTS idx_pat_msgs_channel   ON patient_messages(channel);
CREATE INDEX IF NOT EXISTS idx_pat_msgs_source    ON patient_messages(source);
CREATE INDEX IF NOT EXISTS idx_pat_msgs_created   ON patient_messages(created_at DESC);

-- =============================================================================
-- VERIFY
-- =============================================================================

DO $$
DECLARE v_cols INT;
BEGIN
  SELECT COUNT(*) INTO v_cols
    FROM information_schema.columns WHERE table_name = 'patient_messages';
  RAISE NOTICE '✓ Migration 034 complete';
  RAISE NOTICE '  patient_messages columns: %', v_cols;
END $$;

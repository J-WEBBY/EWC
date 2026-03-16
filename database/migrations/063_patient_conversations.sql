-- =============================================================================
-- Migration 063: patient_conversations + patient_messages
-- Two-way conversation threads between patients and AI agents via
-- WhatsApp, SMS, Email, or Voice.
-- =============================================================================

-- One conversation per patient + channel thread
CREATE TABLE IF NOT EXISTS patient_conversations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_name     text,
  patient_phone    text,
  patient_email    text,
  channel          text        NOT NULL,   -- 'WhatsApp' | 'SMS' | 'Email' | 'Voice'
  agent_key        text,                   -- 'crm_agent' | 'sales_agent' | 'primary_agent'
  agent_name       text,                   -- display name: 'Aria' | 'Orion' | 'EWC'
  automation_source text,                  -- which automation started this: 'booking_reminder' etc
  status           text        NOT NULL DEFAULT 'active',  -- 'active' | 'closed' | 'resolved'
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  unread_count     int         NOT NULL DEFAULT 0
);

-- Individual messages within a conversation
CREATE TABLE IF NOT EXISTS patient_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL REFERENCES patient_conversations(id) ON DELETE CASCADE,
  direction        text        NOT NULL,   -- 'outbound' | 'inbound'
  content          text        NOT NULL,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  status           text,                   -- 'sent' | 'delivered' | 'failed' | 'pending'
  provider_id      text,                   -- Twilio SID
  error_message    text,
  agent_key        text                    -- which agent sent this (outbound AI messages)
);

CREATE INDEX IF NOT EXISTS idx_conversations_phone    ON patient_conversations (patient_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_channel  ON patient_conversations (channel);
CREATE INDEX IF NOT EXISTS idx_conversations_status   ON patient_conversations (status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON patient_conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation  ON patient_messages (conversation_id, sent_at ASC);

COMMENT ON TABLE patient_conversations IS
  'Two-way conversation threads between patients and AI agents via WhatsApp/SMS/Email/Voice.';
COMMENT ON TABLE patient_messages IS
  'Individual messages within a patient conversation. direction=outbound for AI sends, inbound for patient replies.';

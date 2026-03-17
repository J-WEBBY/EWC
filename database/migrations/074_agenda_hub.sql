-- Migration 074: Agenda Hub — evidence, timeline, reports
-- Run in Supabase SQL editor

-- ── Evidence files per agenda ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_evidence (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agenda_id     UUID        NOT NULL REFERENCES staff_goals(id) ON DELETE CASCADE,
  uploaded_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  file_name     TEXT        NOT NULL,
  file_mime     TEXT        NOT NULL DEFAULT 'application/octet-stream',
  file_data     TEXT        NOT NULL,  -- base64 encoded, max ~2MB binary
  file_size     INTEGER,
  caption       TEXT,
  evidence_type TEXT        NOT NULL DEFAULT 'photo'
    CHECK (evidence_type IN ('photo', 'certificate', 'document', 'screenshot', 'other')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_evidence_agenda ON agenda_evidence(agenda_id);
CREATE INDEX IF NOT EXISTS idx_agenda_evidence_tenant ON agenda_evidence(tenant_id);

-- ── Timeline notes per agenda ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_timeline (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agenda_id   UUID        NOT NULL REFERENCES staff_goals(id) ON DELETE CASCADE,
  author_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  content     TEXT        NOT NULL,
  note_type   TEXT        NOT NULL DEFAULT 'update'
    CHECK (note_type IN ('update', 'blocker', 'observation', 'completion', 'system')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_timeline_agenda ON agenda_timeline(agenda_id);
CREATE INDEX IF NOT EXISTS idx_agenda_timeline_tenant ON agenda_timeline(tenant_id);

-- ── Agenda reports (sent between users) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_reports (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agenda_id      UUID        NOT NULL REFERENCES staff_goals(id) ON DELETE CASCADE,
  sender_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  recipient_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_note     TEXT,
  -- Snapshot of agenda at time of sending (JSON)
  agenda_snapshot JSONB,
  is_read        BOOLEAN     NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_reports_recipient ON agenda_reports(recipient_id);
CREATE INDEX IF NOT EXISTS idx_agenda_reports_tenant    ON agenda_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agenda_reports_agenda    ON agenda_reports(agenda_id);

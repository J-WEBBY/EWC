-- =============================================================================
-- Migration 041: Booking Pipeline
--
-- Adds:
--   1. cliniko_practitioners   — local cache of Cliniko practitioners
--   2. practitioner_working_hours — weekly availability per practitioner
--   3. booking_requests        — staging table for Komal-sourced bookings
--
-- Flow:
--   Komal call → create_booking_request tool → webhook → booking_requests row
--   Staff confirms on Calendar/Receptionist page → Cliniko write → appointment created
-- =============================================================================

-- =============================================================================
-- 1. CLINIKO PRACTITIONERS (local cache, populated by sync)
-- =============================================================================

CREATE TABLE IF NOT EXISTS cliniko_practitioners (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliniko_id          TEXT        UNIQUE NOT NULL,
  first_name          TEXT        NOT NULL,
  last_name           TEXT        NOT NULL,
  full_name           TEXT        GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  title               TEXT,
  designation         TEXT,
  email               TEXT,
  active              BOOLEAN     NOT NULL DEFAULT TRUE,
  cliniko_created_at  TIMESTAMPTZ,
  cliniko_updated_at  TIMESTAMPTZ,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_cliniko_id ON cliniko_practitioners(cliniko_id);
CREATE INDEX IF NOT EXISTS idx_cp_active     ON cliniko_practitioners(active);

-- =============================================================================
-- 2. PRACTITIONER WORKING HOURS
-- Weekly recurring schedule. 0=Sunday, 1=Monday ... 6=Saturday.
-- Multiple rows per practitioner (one per working day).
-- =============================================================================

CREATE TABLE IF NOT EXISTS practitioner_working_hours (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id   TEXT        NOT NULL,   -- cliniko_id from cliniko_practitioners
  practitioner_name TEXT        NOT NULL,
  day_of_week       SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time        TIME        NOT NULL DEFAULT '09:00',
  end_time          TIME        NOT NULL DEFAULT '17:00',
  slot_duration_min SMALLINT    NOT NULL DEFAULT 30,  -- appointment slot length in minutes
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (practitioner_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_pwh_practitioner ON practitioner_working_hours(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_pwh_day          ON practitioner_working_hours(day_of_week);
CREATE INDEX IF NOT EXISTS idx_pwh_active       ON practitioner_working_hours(is_active);

-- Seed default working hours for Dr Suresh Ganata (to be updated from Cliniko)
-- Monday–Friday, 9am–6pm, 30-min slots
INSERT INTO practitioner_working_hours (practitioner_id, practitioner_name, day_of_week, start_time, end_time)
VALUES
  ('default', 'Dr Suresh Ganata', 1, '09:00', '18:00'),
  ('default', 'Dr Suresh Ganata', 2, '09:00', '18:00'),
  ('default', 'Dr Suresh Ganata', 3, '09:00', '18:00'),
  ('default', 'Dr Suresh Ganata', 4, '09:00', '18:00'),
  ('default', 'Dr Suresh Ganata', 5, '09:00', '17:00')
ON CONFLICT (practitioner_id, day_of_week) DO NOTHING;

-- =============================================================================
-- 3. BOOKING REQUESTS (staging table — Komal call → staff confirmation → Cliniko)
-- =============================================================================

CREATE TABLE IF NOT EXISTS booking_requests (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id               UUID        REFERENCES signals(id) ON DELETE SET NULL,

  -- Caller identity
  caller_name             TEXT,
  caller_phone            TEXT,
  caller_email            TEXT,

  -- Booking details (from call)
  service                 TEXT,        -- treatment/service requested
  service_detail          TEXT,        -- e.g. "forehead + crow's feet" for Botox
  preferred_date          TEXT,        -- as spoken by caller e.g. "next Tuesday"
  preferred_date_iso      DATE,        -- parsed ISO date (nullable until confirmed)
  preferred_time          TEXT,        -- e.g. "morning", "after 2pm"
  preferred_time_iso      TIME,        -- parsed time (nullable until confirmed)
  duration_minutes        SMALLINT    DEFAULT 30,

  -- Practitioner preferences
  preferred_practitioner  TEXT,        -- name as spoken ("the doctor", "Dr Suresh")
  practitioner_cliniko_id TEXT,        -- resolved Cliniko practitioner ID
  practitioner_name       TEXT,        -- resolved practitioner full name

  -- Referral / source
  referral_source         TEXT        CHECK (referral_source IN (
                            'online', 'client_referral', 'practitioner_referral',
                            'social_media', 'walk_in', 'returning', 'other'
                          )),
  referral_name           TEXT,        -- who referred them

  -- Call context
  vapi_call_id            TEXT,
  call_notes              TEXT,        -- key points from call
  call_summary            TEXT,        -- Vapi AI summary

  -- Status tracking
  status                  TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending', 'confirmed', 'cancelled', 'no_show',
                            'synced_to_cliniko', 'duplicate'
                          )),

  -- Cliniko write outcome
  cliniko_patient_id      TEXT,        -- set after patient created/found in Cliniko
  cliniko_appointment_id  TEXT,        -- set after appointment created in Cliniko
  cliniko_error           TEXT,        -- error message if Cliniko write failed

  -- Timestamps
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at            TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_br_status       ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_br_caller_phone ON booking_requests(caller_phone);
CREATE INDEX IF NOT EXISTS idx_br_created      ON booking_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_br_signal_id    ON booking_requests(signal_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_booking_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_booking_requests_updated_at
  BEFORE UPDATE ON booking_requests
  FOR EACH ROW EXECUTE FUNCTION update_booking_requests_updated_at();

-- =============================================================================
-- VERIFY
-- =============================================================================

DO $$
DECLARE
  v_practitioners  INT;
  v_working_hours  INT;
  v_bookings       INT;
BEGIN
  SELECT COUNT(*) INTO v_practitioners FROM cliniko_practitioners;
  SELECT COUNT(*) INTO v_working_hours  FROM practitioner_working_hours;
  SELECT COUNT(*) INTO v_bookings       FROM booking_requests;
  RAISE NOTICE '✓ Migration 041 complete — Booking Pipeline';
  RAISE NOTICE '  cliniko_practitioners:      % rows', v_practitioners;
  RAISE NOTICE '  practitioner_working_hours: % rows (default schedule seeded)', v_working_hours;
  RAISE NOTICE '  booking_requests:           % rows', v_bookings;
END $$;

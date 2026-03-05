-- =============================================================================
-- Migration 039: Persist lifecycle_stage on cliniko_patients
-- Enables server-side lifecycle filtering (no more client-side filter on 24 rows)
-- Run in Supabase SQL editor
-- =============================================================================

ALTER TABLE cliniko_patients
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT DEFAULT 'existing'
    CHECK (lifecycle_stage IN ('existing','lead','new','active','loyal','at_risk','lapsed'));

CREATE INDEX IF NOT EXISTS idx_cliniko_patients_lifecycle_stage
  ON cliniko_patients(lifecycle_stage);

-- =============================================================================
-- compute_all_lifecycle_stages()
-- Called by the Cliniko sync after appointments are synced.
-- Only updates patients where lifecycle is NOT manually set.
-- Logic mirrors TypeScript computeLifecycle() in patients.ts.
-- =============================================================================

CREATE OR REPLACE FUNCTION compute_all_lifecycle_stages()
RETURNS void AS $$
BEGIN
  WITH appt_stats AS (
    SELECT
      cliniko_patient_id,
      COUNT(*) FILTER (WHERE status = 'arrived')                      AS attended,
      MAX(starts_at) FILTER (WHERE status = 'arrived')                AS last_attended_at,
      bool_or(
        starts_at > now()
        AND status NOT IN ('cancelled', 'did_not_arrive')
      )                                                                AS has_future
    FROM cliniko_appointments
    GROUP BY cliniko_patient_id
  )
  UPDATE cliniko_patients p
  SET lifecycle_stage = CASE
    WHEN COALESCE(s.has_future, false)
      THEN 'active'
    WHEN COALESCE(s.attended, 0) = 0
      THEN 'existing'
    WHEN EXTRACT(EPOCH FROM (now() - s.last_attended_at)) / 86400 <= 90
      AND s.attended >= 5
      THEN 'loyal'
    WHEN EXTRACT(EPOCH FROM (now() - s.last_attended_at)) / 86400 <= 90
      AND s.attended <= 2
      THEN 'new'
    WHEN EXTRACT(EPOCH FROM (now() - s.last_attended_at)) / 86400 <= 90
      THEN 'active'
    WHEN EXTRACT(EPOCH FROM (now() - s.last_attended_at)) / 86400 <= 180
      THEN 'at_risk'
    ELSE 'lapsed'
  END
  FROM (
    SELECT id, cliniko_id
    FROM cliniko_patients
    WHERE lifecycle_manually_set = false OR lifecycle_manually_set IS NULL
  ) candidates
  LEFT JOIN appt_stats s ON s.cliniko_patient_id = candidates.cliniko_id
  WHERE p.id = candidates.id;
END;
$$ LANGUAGE plpgsql;

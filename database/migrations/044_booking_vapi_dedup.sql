-- =============================================================================
-- Migration 044: Booking request deduplication
--
-- Adds a partial unique index on booking_requests(vapi_call_id) so that a
-- single Vapi call can never produce more than one booking row. The UNIQUE
-- constraint is partial (WHERE vapi_call_id IS NOT NULL) so manual bookings
-- with no call ID are still allowed.
--
-- Safe to run after 041 + 043.
-- =============================================================================

-- Partial unique index: one row per Vapi call ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_br_vapi_call_id_unique
  ON booking_requests(vapi_call_id)
  WHERE vapi_call_id IS NOT NULL;

-- Verify
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 044 complete';
  RAISE NOTICE '  booking_requests.vapi_call_id now has a partial unique index';
  RAISE NOTICE '  One booking row per Vapi call — duplicates will be rejected at DB level';
END $$;

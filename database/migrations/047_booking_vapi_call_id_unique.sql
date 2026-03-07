-- Migration 047: Add UNIQUE constraint on booking_requests.vapi_call_id
-- Prevents duplicate booking rows when Komal calls create_booking_request twice in a call.
-- The tool handler already checks before inserting, but this is a DB-level safety net.

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_requests_vapi_call_id_unique
  ON booking_requests(vapi_call_id)
  WHERE vapi_call_id IS NOT NULL;

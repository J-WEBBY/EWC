-- =============================================================================
-- Migration 072: Clear all pre-seeded training data
-- Removes training records seeded by migration 069.
-- Users can enter their own completion dates from scratch.
-- Idempotent — safe to re-run.
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== Migration 072: Clear training seed data — START ==='; END $$;

DELETE FROM compliance_training ct
USING tenants t
WHERE ct.tenant_id = t.id
  AND t.slug = 'edgbaston-wellness';

DO $$ BEGIN RAISE NOTICE '072: All training records cleared.'; END $$;
DO $$ BEGIN RAISE NOTICE '=== Migration 072: Clear training seed data — DONE ==='; END $$;

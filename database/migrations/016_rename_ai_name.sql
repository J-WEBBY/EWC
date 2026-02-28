-- =============================================================================
-- Migration 016: Rename ai_name from Aria to EWC in clinic_config
-- =============================================================================

UPDATE clinic_config
SET
  ai_name     = 'EWC',
  manifesto   = 'We believe that exceptional care begins with exceptional intelligence. EWC is your operational partner — always present, always informed, always one step ahead.',
  updated_at  = NOW();

-- Confirm
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 016 complete';
  RAISE NOTICE '✓ clinic_config.ai_name → EWC';
END $$;

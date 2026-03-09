-- =============================================================================
-- Migration 052: Fix doctor's name — Ganata → Ganta in all agent prompts
--
-- The correct name is Dr Suresh Ganta (not Ganata).
-- This migration corrects all three agent system prompts in the DB.
-- Run after 027_agent_display_names_and_prompts.sql
-- =============================================================================

-- Fix all three agents in one pass using regexp_replace
UPDATE agents
SET
  system_prompt = REPLACE(REPLACE(system_prompt, 'Dr Suresh Ganata', 'Dr Suresh Ganta'), 'Dr Ganata', 'Dr Ganta'),
  updated_at    = NOW()
WHERE agent_key IN ('primary_agent', 'sales_agent', 'crm_agent')
  AND system_prompt LIKE '%Ganata%';

-- Verify
DO $$
DECLARE
  still_wrong INT;
BEGIN
  SELECT COUNT(*) INTO still_wrong
  FROM agents
  WHERE agent_key IN ('primary_agent', 'sales_agent', 'crm_agent')
    AND system_prompt LIKE '%Ganata%';

  IF still_wrong = 0 THEN
    RAISE NOTICE '✓ Migration 052 complete — "Ganata" corrected to "Ganta" in all agent prompts';
  ELSE
    RAISE WARNING '! % agent prompt(s) still contain "Ganata" — check manually', still_wrong;
  END IF;
END $$;

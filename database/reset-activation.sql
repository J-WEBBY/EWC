-- =====================================================
-- RESET ACTIVATION KEY FOR REUSE
-- Run this in Supabase SQL Editor
-- =====================================================

-- This script allows you to reuse the activation key and email
-- by cleaning up the auth user and resetting the key

-- =====================================================
-- STEP 1: Find the user to delete
-- =====================================================

-- First, let's see what we're about to delete
SELECT
    'Users Table' as source,
    id,
    email,
    tenant_id,
    is_owner,
    status,
    created_at
FROM users
WHERE email = 'joe@uoo.co.uk';

-- =====================================================
-- STEP 2: Delete user record from users table
-- =====================================================

DELETE FROM users
WHERE email = 'joe@uoo.co.uk';

-- =====================================================
-- STEP 3: Reset activation key to unused
-- =====================================================

UPDATE activation_keys
SET
    is_used = false,
    used_at = NULL,
    used_by_user_id = NULL
WHERE key_code = 'JWEBLY-DEMO-2026';

-- =====================================================
-- STEP 4: Clean up any Deep Probe conversations
-- (Optional - only if you want to start fresh)
-- =====================================================

-- Uncomment these lines if you want to delete Deep Probe data too
-- DELETE FROM deep_probe_conversations
-- WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- =====================================================
-- STEP 5: Reset tenant onboarding state
-- (Optional - brings tenant back to initial state)
-- =====================================================

-- Uncomment if you want to reset the entire onboarding
-- UPDATE tenants
-- SET
--     onboarding_phase = 'pending',
--     onboarding_started_at = NULL,
--     onboarding_completed_at = NULL
-- WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check activation key status
SELECT
    key_code,
    is_used,
    used_at,
    intended_email,
    tenant_id
FROM activation_keys
WHERE key_code = 'JWEBLY-DEMO-2026';

-- Check if user still exists
SELECT COUNT(*) as remaining_users
FROM users
WHERE email = 'joe@uoo.co.uk';

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

SELECT 'Activation key reset successfully! You can now use it again.' as status;

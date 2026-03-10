import { createClient } from '@supabase/supabase-js';

/**
 * Platform client — Jwebly multi-tenant platform DB.
 * Used for: activation key validation, tenant management, onboarding.
 */
export function createPlatformClient() {
  const url = process.env.PLATFORM_SUPABASE_URL!;
  const key = process.env.PLATFORM_SUPABASE_SERVICE_KEY!;
  if (!url || !key) throw new Error('CRITICAL: Platform Supabase credentials missing.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

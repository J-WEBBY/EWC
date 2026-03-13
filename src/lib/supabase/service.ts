import { createClient } from '@supabase/supabase-js';

export function createSovereignClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl) {
    throw new Error("CRITICAL: NEXT_PUBLIC_SUPABASE_URL is missing from environment.");
  }
  if (!supabaseServiceKey) {
    throw new Error("CRITICAL: SUPABASE_SERVICE_ROLE_KEY is missing from environment.");
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
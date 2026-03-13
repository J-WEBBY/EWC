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

/**
 * getSovereignTenantId
 *
 * The sovereign DB is single-tenant — exactly one row in `tenants`.
 * The session stores the PLATFORM DB tenant UUID which differs from the
 * sovereign DB's own tenant UUID. Use this helper everywhere a sovereign
 * DB query needs to filter by tenant_id.
 */
export async function getSovereignTenantId(): Promise<string | null> {
  const db = createSovereignClient();
  const { data } = await db.from('tenants').select('id').limit(1).single();
  return data?.id ?? null;
}
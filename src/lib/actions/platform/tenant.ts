'use server';

import { createPlatformClient } from '@/lib/supabase/platform';

export interface TenantBrand {
  id: string;
  clinic_name: string;
  brand_color: string;
  logo_url: string | null;
  slug: string;
}

/**
 * Look up a tenant by subdomain slug.
 * Called by the login page server component when running on a tenant subdomain.
 * Returns 404-equivalent if slug not found or tenant is suspended/unknown.
 */
export async function getTenantBySlug(slug: string): Promise<
  { success: true; tenant: TenantBrand } |
  { success: false; error: string }
> {
  // ── Dev bypass ─────────────────────────────────────────────────────────────
  if (!process.env.PLATFORM_SUPABASE_URL || !process.env.PLATFORM_SUPABASE_SERVICE_KEY) {
    // Accept 'dev' slug only in bypass mode
    const knownDevSlugs = ['dev'];
    if (knownDevSlugs.includes(slug.toLowerCase())) {
      return {
        success: true,
        tenant: {
          id:           'dev',
          clinic_name:  'Demo Clinic',
          brand_color:  '#0058E6',
          logo_url:     null,
          slug,
        },
      };
    }
    return { success: false, error: 'Tenant not found' };
  }

  // ── Platform DB lookup ─────────────────────────────────────────────────────
  try {
    const db = createPlatformClient();

    const { data: tenant } = await db
      .from('tenants')
      .select('id, name, slug, status')
      .eq('slug', slug.toLowerCase())
      .single();

    // Reject unknown, suspended, or not-yet-active tenants
    if (!tenant || tenant.status === 'suspended' || tenant.status === 'pending') {
      return { success: false, error: 'Tenant not found' };
    }

    const { data: profile } = await db
      .from('clinic_profiles')
      .select('clinic_name, primary_color, logo_url')
      .eq('tenant_id', tenant.id)
      .single();

    return {
      success: true,
      tenant: {
        id:           tenant.id,
        clinic_name:  profile?.clinic_name ?? tenant.name,
        brand_color:  profile?.primary_color ?? '#0058E6',
        logo_url:     profile?.logo_url ?? null,
        slug:         tenant.slug,
      },
    };
  } catch (err) {
    console.error('[getTenantBySlug]', err);
    return { success: false, error: 'Failed to load tenant' };
  }
}

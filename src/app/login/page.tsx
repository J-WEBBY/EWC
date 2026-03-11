import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTenantBySlug } from '@/lib/actions/platform/tenant';
import LoginClient from './client';

/**
 * Login page — server wrapper.
 *
 * On a tenant subdomain ({slug}.jwebly.app):
 *   - Reads x-tenant-slug injected by middleware
 *   - Validates the slug against platform DB
 *   - Returns hard 404 if unknown slug (security wall — nothing leaks)
 *   - Passes clinic name directly to client component (no client-side fetch)
 *
 * On root domain or dev (no x-tenant-slug):
 *   - Client component falls back to getClinicInfo() from sovereign DB
 */
export default async function LoginPage() {
  const headersList = headers();
  const tenantSlug  = headersList.get('x-tenant-slug');

  if (tenantSlug) {
    // Subdomain mode — validate tenant before rendering anything
    const result = await getTenantBySlug(tenantSlug);

    if (!result.success) {
      // Unknown or inactive subdomain → hard 404
      // Nothing is rendered — not even a login form
      notFound();
    }

    return <LoginClient initialClinicName={result.tenant.clinic_name} />;
  }

  // Root domain / dev mode — client handles clinic info fetch
  return <LoginClient />;
}

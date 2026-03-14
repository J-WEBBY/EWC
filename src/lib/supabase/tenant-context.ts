'use server';

/**
 * Tenant context helpers — multi-tenant session layer
 *
 * Two cookies work together:
 *   jwh_tenant    — set during onboarding activation (tenantId + tenantSlug)
 *                   scoped to .jweblyhealth.app (all subdomains)
 *   staff_session — set after staff login (userId + tenantId)
 *                   scoped to the specific tenant subdomain
 *
 * All server actions call getStaffSession() to get both userId and tenantId,
 * then filter every DB query with .eq('tenant_id', tenantId).
 */

import { cookies } from 'next/headers';

export interface StaffSession {
  userId:     string;
  tenantId:   string;
  tenantSlug: string;
}

export interface TenantOnlySession {
  tenantId:   string;
  tenantSlug: string;
}

// ── Get full staff session (userId + tenantId) ────────────────────────────────
// Used by all server actions that need to know who is logged in.
export async function getStaffSession(): Promise<StaffSession | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('staff_session')?.value;
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<StaffSession>;
    if (!session.userId) return null;
    return {
      userId:     session.userId,
      tenantId:   session.tenantId || 'clinic',
      tenantSlug: session.tenantSlug ?? '',
    };
  } catch {
    return null;
  }
}

// ── Get tenant context only (no user — e.g. for login page) ──────────────────
// Reads jwh_tenant cookie set during onboarding, OR falls back to staff_session.
export async function getTenantOnlySession(): Promise<TenantOnlySession | null> {
  try {
    const cookieStore = await cookies();

    // Prefer staff_session (already logged-in user)
    const staffRaw = cookieStore.get('staff_session')?.value;
    if (staffRaw) {
      const s = JSON.parse(staffRaw) as Partial<StaffSession>;
      if (s.tenantId) return { tenantId: s.tenantId, tenantSlug: s.tenantSlug ?? '' };
    }

    // Fall back to onboarding cookie
    const onboardRaw = cookieStore.get('jwh_tenant')?.value;
    if (onboardRaw) {
      const s = JSON.parse(onboardRaw) as Partial<TenantOnlySession>;
      if (s.tenantId) return { tenantId: s.tenantId, tenantSlug: s.tenantSlug ?? '' };
    }

    return null;
  } catch {
    return null;
  }
}

// ── Get tenantId only (convenience) ──────────────────────────────────────────
export async function getTenantId(): Promise<string | null> {
  const session = await getStaffSession() ?? await getTenantOnlySession();
  return session?.tenantId ?? null;
}

// ── Set staff session cookie after login ─────────────────────────────────────
export async function setStaffSession(
  userId: string,
  tenantId: string,
  tenantSlug: string,
  rootDomain?: string,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('staff_session', JSON.stringify({ userId, tenantId, tenantSlug }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
    // Scope to specific subdomain only — not shared across tenants
    ...(rootDomain ? { domain: `${tenantSlug}.${rootDomain}` } : {}),
  });
}

// ── Clear staff session on logout ─────────────────────────────────────────────
export async function clearStaffSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('staff_session');
}

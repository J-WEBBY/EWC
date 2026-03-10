'use server';

import { createPlatformClient } from '@/lib/supabase/platform';
import { cookies } from 'next/headers';

export interface ClinicProfile {
  clinic_name: string;
  clinic_type: string[];
  tagline: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  cqc_number: string | null;
  founded_year: number | null;
  director_name: string | null;
  director_title: string | null;
  primary_color: string;
  logo_url: string | null;
  agent_name: string;
  receptionist_name: string;
}

export interface TenantSession {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  profile: ClinicProfile;
  onboardingPhase: number;
  completedPhases: number[];
  sessionId: string;
}

// ── Validate activation key and bootstrap onboarding session ─────────────────
export async function validateActivationKey(key: string): Promise<
  { success: true;  tenant: TenantSession } |
  { success: false; error: string }
> {
  try {
    const db = createPlatformClient();

    // 1. Look up the key
    const { data: keyRow, error: keyErr } = await db
      .from('activation_keys')
      .select('id, tenant_id, status')
      .eq('key_plain', key.toUpperCase().trim())
      .single();

    if (keyErr) {
      console.error('[validateActivationKey] key lookup error:', keyErr.message, keyErr.code);
      // If table doesn't exist yet (DB not migrated), give a clear message
      if (keyErr.code === '42P01') {
        return { success: false, error: 'Platform database not yet initialised. Run migrations first.' };
      }
      return { success: false, error: 'Key not recognised. Contact your Jwebly account manager.' };
    }
    if (!keyRow) {
      return { success: false, error: 'Key not recognised. Contact your Jwebly account manager.' };
    }
    if (keyRow.status === 'revoked') {
      return { success: false, error: 'This key has been revoked. Contact support.' };
    }
    if (keyRow.status === 'expired') {
      return { success: false, error: 'This key has expired. Contact your account manager.' };
    }

    // 2. Load tenant
    const { data: tenant, error: tErr } = await db
      .from('tenants')
      .select('id, slug, name')
      .eq('id', keyRow.tenant_id)
      .single();

    if (tErr || !tenant) {
      return { success: false, error: 'Tenant not found. Contact support.' };
    }

    // 3. Load clinic profile
    const { data: profile } = await db
      .from('clinic_profiles')
      .select('*')
      .eq('tenant_id', tenant.id)
      .single();

    // 4. Get or create onboarding session
    let { data: session } = await db
      .from('onboarding_sessions')
      .select('id, current_phase, completed_phases')
      .eq('tenant_id', tenant.id)
      .single();

    if (!session) {
      const { data: newSession } = await db
        .from('onboarding_sessions')
        .insert({
          tenant_id: tenant.id,
          activation_key_id: keyRow.id,
          current_phase: 1,
          completed_phases: [],
        })
        .select('id, current_phase, completed_phases')
        .single();
      session = newSession;
    }

    // 5. Mark key as claimed (first time only)
    if (keyRow.status === 'active') {
      await db
        .from('activation_keys')
        .update({ status: 'claimed', claimed_at: new Date().toISOString() })
        .eq('id', keyRow.id);
    }

    // 6. Store tenant context in cookie
    const cookieStore = await cookies();
    cookieStore.set('jwh_tenant', JSON.stringify({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      sessionId: session!.id,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return {
      success: true,
      tenant: {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        profile: profile ?? buildEmptyProfile(tenant.name),
        onboardingPhase: session!.current_phase,
        completedPhases: session!.completed_phases ?? [],
        sessionId: session!.id,
      },
    };
  } catch (err) {
    console.error('[validateActivationKey]', err);
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}

// ── Get current tenant session from cookie ────────────────────────────────────
export async function getTenantSession(): Promise<TenantSession | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('jwh_tenant')?.value;
    if (!raw) return null;

    const { tenantId, sessionId } = JSON.parse(raw);
    const db = createPlatformClient();

    const [{ data: tenant }, { data: session }] = await Promise.all([
      db.from('tenants').select('id, slug, name').eq('id', tenantId).single(),
      db.from('onboarding_sessions').select('id, current_phase, completed_phases').eq('id', sessionId).single(),
    ]);

    if (!tenant || !session) return null;

    const { data: profile } = await db
      .from('clinic_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      profile: profile ?? buildEmptyProfile(tenant.name),
      onboardingPhase: session.current_phase,
      completedPhases: session.completed_phases ?? [],
      sessionId: session.id,
    };
  } catch {
    return null;
  }
}

// ── Advance onboarding phase ──────────────────────────────────────────────────
export async function advanceOnboardingPhase(
  sessionId: string,
  phase: number,
  phaseData: Record<string, unknown>,
): Promise<{ success: boolean }> {
  try {
    const db = createPlatformClient();
    const { data: session } = await db
      .from('onboarding_sessions')
      .select('completed_phases, phase_data')
      .eq('id', sessionId)
      .single();

    if (!session) return { success: false };

    const completed = Array.from(new Set([...(session.completed_phases ?? []), phase]));
    const data = { ...(session.phase_data ?? {}), [phase]: phaseData };

    await db
      .from('onboarding_sessions')
      .update({ current_phase: phase + 1, completed_phases: completed, phase_data: data })
      .eq('id', sessionId);

    return { success: true };
  } catch {
    return { success: false };
  }
}

function buildEmptyProfile(name: string): ClinicProfile {
  return {
    clinic_name: name, clinic_type: [], tagline: null,
    address_line1: null, address_line2: null, city: null, postcode: null,
    phone: null, email: null, website: null, cqc_number: null,
    founded_year: null, director_name: null, director_title: null,
    primary_color: '#0058E6', logo_url: null,
    agent_name: 'Aria', receptionist_name: 'Komal',
  };
}

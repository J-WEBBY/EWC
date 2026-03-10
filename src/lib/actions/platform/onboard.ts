'use server';

import { createPlatformClient } from '@/lib/supabase/platform';
import { cookies } from 'next/headers';

// ── Read tenant context from cookie ──────────────────────────────────────────
async function getTenantId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('jwh_tenant')?.value;
  if (!raw) return null;
  try { return JSON.parse(raw).tenantId ?? null; } catch { return null; }
}

async function getSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('jwh_tenant')?.value;
  if (!raw) return null;
  try { return JSON.parse(raw).sessionId ?? null; } catch { return null; }
}

// ── Phase 1: Save clinic overview ────────────────────────────────────────────
export interface Phase1Data {
  clinic_name: string;
  clinic_type: string[];
  tagline: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postcode: string;
  phone: string;
  email: string;
  website: string;
  cqc_number: string;
  founded_year: number | null;
  director_name: string;
  director_title: string;
}

export async function savePhase1(data: Phase1Data): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId();
    const sessionId = await getSessionId();
    if (!tenantId) return { success: false, error: 'Session expired. Please re-activate.' };

    const db = createPlatformClient();

    // Update clinic_profiles
    const { error: profileErr } = await db
      .from('clinic_profiles')
      .update({
        clinic_name:    data.clinic_name,
        clinic_type:    data.clinic_type,
        tagline:        data.tagline || null,
        address_line1:  data.address_line1 || null,
        address_line2:  data.address_line2 || null,
        city:           data.city || null,
        postcode:       data.postcode || null,
        phone:          data.phone || null,
        email:          data.email || null,
        website:        data.website || null,
        cqc_number:     data.cqc_number || null,
        founded_year:   data.founded_year || null,
        director_name:  data.director_name || null,
        director_title: data.director_title || null,
        overview_confirmed: true,
        updated_at:     new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);

    if (profileErr) return { success: false, error: profileErr.message };

    // Advance onboarding session to phase 2
    if (sessionId) {
      const { data: session } = await db
        .from('onboarding_sessions')
        .select('completed_phases, phase_data')
        .eq('id', sessionId)
        .single();

      if (session) {
        const completed = Array.from(new Set([...(session.completed_phases ?? []), 1]));
        await db
          .from('onboarding_sessions')
          .update({
            current_phase:    2,
            completed_phases: completed,
            phase_data:       { ...(session.phase_data ?? {}), 1: data },
          })
          .eq('id', sessionId);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[savePhase1]', err);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ── Phase 2: Save agent names ─────────────────────────────────────────────────
export interface Phase2Data {
  agents: { role: string; display_name: string }[];
}

export async function savePhase2(data: Phase2Data): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId();
    const sessionId = await getSessionId();
    if (!tenantId) return { success: false, error: 'Session expired. Please re-activate.' };

    // Dev bypass — no platform DB
    if (!process.env.PLATFORM_SUPABASE_URL) {
      console.log('[savePhase2] dev bypass — agent names:', data.agents);
      return { success: true };
    }

    const db = createPlatformClient();

    // Update agent display names in clinic_profiles (stored as JSON)
    await db
      .from('clinic_profiles')
      .update({ agent_names: data.agents, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);

    // Advance onboarding session to phase 3
    if (sessionId) {
      const { data: session } = await db
        .from('onboarding_sessions')
        .select('completed_phases, phase_data')
        .eq('id', sessionId)
        .single();

      if (session) {
        const completed = Array.from(new Set([...(session.completed_phases ?? []), 2]));
        await db
          .from('onboarding_sessions')
          .update({
            current_phase:    3,
            completed_phases: completed,
            phase_data:       { ...(session.phase_data ?? {}), 2: data },
          })
          .eq('id', sessionId);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[savePhase2]', err);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ── Phase 3: Save team members ────────────────────────────────────────────────
export interface TeamMember {
  full_name: string;
  email: string;
  role: string;
  username: string;
  login_method: 'email_otp' | 'username';
  department?: string;
}

export interface Phase3Data {
  members: TeamMember[];
}

export async function savePhase3(data: Phase3Data): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId();
    const sessionId = await getSessionId();
    if (!tenantId) return { success: false, error: 'Session expired. Please re-activate.' };

    // Dev bypass — no platform DB
    if (!process.env.PLATFORM_SUPABASE_URL) {
      console.log('[savePhase3] dev bypass — team members:', data.members);
      return { success: true };
    }

    const db = createPlatformClient();

    // Store team member invites in clinic_profiles (stored as JSON)
    await db
      .from('clinic_profiles')
      .update({ team_members: data.members, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);

    // Advance onboarding session to phase 4
    if (sessionId) {
      const { data: session } = await db
        .from('onboarding_sessions')
        .select('completed_phases, phase_data')
        .eq('id', sessionId)
        .single();

      if (session) {
        const completed = Array.from(new Set([...(session.completed_phases ?? []), 3]));
        await db
          .from('onboarding_sessions')
          .update({
            current_phase:    4,
            completed_phases: completed,
            phase_data:       { ...(session.phase_data ?? {}), 3: data },
          })
          .eq('id', sessionId);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[savePhase3]', err);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ── Phase 5: Complete onboarding + go live ────────────────────────────────────
export async function completeOnboarding(): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId  = await getTenantId();
    const sessionId = await getSessionId();
    if (!tenantId) return { success: false, error: 'Session expired. Please re-activate.' };

    // Dev bypass
    if (!process.env.PLATFORM_SUPABASE_URL) {
      console.log('[completeOnboarding] dev bypass — marking tenant live');
      return { success: true };
    }

    const db = createPlatformClient();

    // Mark tenant as active
    await db.from('tenants').update({ status: 'active', activated_at: new Date().toISOString() }).eq('id', tenantId);

    // Close onboarding session
    if (sessionId) {
      const completed = [1, 2, 3, 4, 5];
      await db.from('onboarding_sessions').update({
        current_phase:    5,
        completed_phases: completed,
        completed_at:     new Date().toISOString(),
      }).eq('id', sessionId);
    }

    return { success: true };
  } catch (err) {
    console.error('[completeOnboarding]', err);
    return { success: false, error: 'Failed to activate. Please try again.' };
  }
}

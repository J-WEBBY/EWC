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

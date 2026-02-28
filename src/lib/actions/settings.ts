'use server';

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// TYPES
// =============================================================================

export interface ClinicSettings {
  id: string;
  clinic_name: string;
  ai_name: string;
  brand_color: string;
  logo_url: string | null;
  tone: string;
  tagline: string | null;
  manifesto: string | null;
  ai_persona: Record<string, unknown>;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SettingsUpdatePayload {
  clinic_name?: string;
  ai_name?: string;
  brand_color?: string;
  tone?: string;
  tagline?: string;
  manifesto?: string;
}

// =============================================================================
// getClinicSettings
// =============================================================================

export async function getClinicSettings(): Promise<{
  success: boolean;
  settings?: ClinicSettings;
  error?: string;
}> {
  try {
    const sovereign = createSovereignClient();
    const { data, error } = await sovereign
      .from('clinic_config')
      .select('*')
      .single();

    if (error || !data) {
      console.error('[settings] getClinicSettings failed:', error?.message);
      return { success: false, error: 'NOT_FOUND' };
    }

    return { success: true, settings: data as ClinicSettings };
  } catch (err) {
    console.error('[settings] threw:', err);
    return { success: false, error: 'FETCH_FAILED' };
  }
}

// =============================================================================
// updateClinicSettings
// =============================================================================

export async function updateClinicSettings(
  payload: SettingsUpdatePayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const sovereign = createSovereignClient();

    const { error } = await sovereign
      .from('clinic_config')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // update the single row

    if (error) {
      console.error('[settings] update failed:', error.message);
      return { success: false, error: 'UPDATE_FAILED' };
    }

    return { success: true };
  } catch (err) {
    console.error('[settings] updateClinicSettings threw:', err);
    return { success: false, error: 'UPDATE_FAILED' };
  }
}

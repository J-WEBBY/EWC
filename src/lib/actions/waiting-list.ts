'use server';

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// Types
// =============================================================================

export interface WaitListEntry {
  id: string;
  cliniko_patient_id: string;
  patient_name: string;
  treatment_type: string;
  preferred_practitioner: string | null;
  preferred_date_from: string | null;
  preferred_date_to: string | null;
  preferred_time: string;
  priority: 'high' | 'medium' | 'low';
  notes: string | null;
  status: 'waiting' | 'offered' | 'confirmed' | 'cancelled';
  offered_at: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddToWaitListInput {
  cliniko_patient_id: string;
  patient_name: string;
  treatment_type: string;
  preferred_practitioner?: string;
  preferred_date_from?: string;
  preferred_date_to?: string;
  preferred_time?: string;
  priority?: 'high' | 'medium' | 'low';
  notes?: string;
}

// =============================================================================
// getPatientWaitList
// =============================================================================

export async function getPatientWaitList(clinikoPatientId: string): Promise<{
  success: boolean;
  entries: WaitListEntry[];
  error?: string;
}> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('patient_waiting_list')
      .select('*')
      .eq('cliniko_patient_id', clinikoPatientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, entries: (data ?? []) as WaitListEntry[] };
  } catch (err) {
    console.error('[waiting-list] getPatientWaitList error:', err);
    return { success: false, entries: [], error: String(err) };
  }
}

// =============================================================================
// getAllWaitList — for clinic-wide view
// =============================================================================

export async function getAllWaitList(status?: WaitListEntry['status']): Promise<{
  success: boolean;
  entries: WaitListEntry[];
  error?: string;
}> {
  try {
    const db = createSovereignClient();
    let q = db
      .from('patient_waiting_list')
      .select('*')
      .order('priority', { ascending: false })  // high first
      .order('created_at', { ascending: true });

    if (status) q = q.eq('status', status);
    else q = q.neq('status', 'cancelled');

    const { data, error } = await q;
    if (error) throw error;
    return { success: true, entries: (data ?? []) as WaitListEntry[] };
  } catch (err) {
    console.error('[waiting-list] getAllWaitList error:', err);
    return { success: false, entries: [], error: String(err) };
  }
}

// =============================================================================
// addToWaitList
// =============================================================================

export async function addToWaitList(input: AddToWaitListInput): Promise<{
  success: boolean;
  entry?: WaitListEntry;
  error?: string;
}> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('patient_waiting_list')
      .insert({
        cliniko_patient_id:   input.cliniko_patient_id,
        patient_name:         input.patient_name,
        treatment_type:       input.treatment_type,
        preferred_practitioner: input.preferred_practitioner ?? null,
        preferred_date_from:  input.preferred_date_from ?? null,
        preferred_date_to:    input.preferred_date_to ?? null,
        preferred_time:       input.preferred_time ?? 'any',
        priority:             input.priority ?? 'medium',
        notes:                input.notes ?? null,
        status:               'waiting',
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, entry: data as WaitListEntry };
  } catch (err) {
    console.error('[waiting-list] addToWaitList error:', err);
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// updateWaitListStatus
// =============================================================================

export async function updateWaitListStatus(
  id: string,
  status: WaitListEntry['status'],
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const patch: Record<string, unknown> = { status };
    if (status === 'offered')   patch.offered_at   = new Date().toISOString();
    if (status === 'confirmed') patch.confirmed_at = new Date().toISOString();

    const { error } = await db
      .from('patient_waiting_list')
      .update(patch)
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[waiting-list] updateWaitListStatus error:', err);
    return { success: false, error: String(err) };
  }
}

// =============================================================================
// removeFromWaitList
// =============================================================================

export async function removeFromWaitList(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('patient_waiting_list')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[waiting-list] removeFromWaitList error:', err);
    return { success: false, error: String(err) };
  }
}

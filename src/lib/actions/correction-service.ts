'use server';

import { createSovereignClient } from '@/lib/supabase/service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =============================================================================
// correctClassification — record a user correction to AI routing
// =============================================================================

export async function correctClassification(
  _tenantId: string,
  signalId: string,
  userId: string,
  data: {
    corrected_agent_id?: string;
    corrected_category?: string;
    corrected_subcategory?: string;
    correction_reason?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(signalId)) return { success: false, error: 'INVALID_SIGNAL' };
  if (!UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();

    // 1. Fetch original signal classification
    const { data: signal, error: sigErr } = await sovereign
      .from('signals')
      .select('id, source_agent_id, ai_classification, assignment_confidence, category, signal_type, title, description')
      .eq('id', signalId)
      .single();

    if (sigErr || !signal) {
      return { success: false, error: 'SIGNAL_NOT_FOUND' };
    }

    const aiClass = (signal.ai_classification || {}) as Record<string, unknown>;

    // 2. Insert into routing_corrections (table may not exist yet — silently skip on error)
    await sovereign
      .from('routing_corrections')
      .insert({
        signal_id: signalId,
        original_agent_id: signal.source_agent_id || null,
        original_category: (aiClass.category as string) || signal.category || null,
        original_subcategory: (aiClass.subcategory as string) || null,
        original_confidence: signal.assignment_confidence || null,
        corrected_agent_id: data.corrected_agent_id || null,
        corrected_category: data.corrected_category || null,
        corrected_subcategory: data.corrected_subcategory || null,
        correction_reason: data.correction_reason || null,
        signal_text: signal.description || signal.title || '',
        signal_metadata: aiClass,
        corrected_by: userId,
      });

    // 3. Update signal with correction fields
    const updatePayload: Record<string, unknown> = {
      corrected_by: userId,
      corrected_at: new Date().toISOString(),
      correction_reason: data.correction_reason || null,
    };

    if (data.corrected_agent_id) {
      updatePayload.user_corrected_agent_id = data.corrected_agent_id;
      updatePayload.source_agent_id = data.corrected_agent_id;
    }

    if (data.corrected_category || data.corrected_subcategory) {
      updatePayload.user_corrected_classification = {
        category: data.corrected_category || null,
        subcategory: data.corrected_subcategory || null,
      };
    }

    const { error: updateErr } = await sovereign
      .from('signals')
      .update(updatePayload)
      .eq('id', signalId);

    if (updateErr) {
      console.error('[correction-service] update signal error:', updateErr);
      return { success: false, error: 'UPDATE_FAILED' };
    }

    return { success: true };
  } catch (err) {
    console.error('[correction-service] correctClassification threw:', err);
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// =============================================================================
// getCorrections — fetch correction history (for learning UI)
// =============================================================================

export async function getCorrections(
  _tenantId?: string,
  limit = 50,
): Promise<{ success: boolean; corrections?: Record<string, unknown>[]; error?: string }> {
  try {
    const sovereign = createSovereignClient();

    const { data, error } = await sovereign
      .from('routing_corrections')
      .select('*')
      .order('corrected_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[correction-service] getCorrections error:', error);
      return { success: false, error: 'QUERY_FAILED' };
    }

    return { success: true, corrections: data || [] };
  } catch (err) {
    console.error('[correction-service] getCorrections threw:', err);
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

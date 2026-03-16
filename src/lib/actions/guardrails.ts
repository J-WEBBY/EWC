'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';

// =============================================================================
// TYPES
// =============================================================================

export type GuardrailRuleType =
  | 'never_say'
  | 'always_say'
  | 'topic_block'
  | 'required_disclaimer'
  | 'tone_rule'
  | 'compliance_rule';

export type GuardrailAppliesTo = 'all' | 'primary_agent' | 'sales_agent' | 'crm_agent';

export interface Guardrail {
  id: string;
  tenant_id: string;
  title: string;
  rule_type: GuardrailRuleType;
  applies_to: GuardrailAppliesTo;
  content: string;
  priority: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// getGuardrails — all guardrails for tenant ordered by priority desc
// =============================================================================

export async function getGuardrails(): Promise<Guardrail[]> {
  try {
    const session = await getStaffSession();
    const tenantId = session?.tenantId ?? 'clinic';
    const sovereign = createSovereignClient();

    const { data, error } = await sovereign
      .from('agent_guardrails')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[guardrails] getGuardrails failed:', error.message);
      return [];
    }

    return (data || []) as Guardrail[];
  } catch (err) {
    console.error('[guardrails] getGuardrails threw:', err);
    return [];
  }
}

// =============================================================================
// createGuardrail
// =============================================================================

export async function createGuardrail(data: {
  title: string;
  rule_type: GuardrailRuleType;
  applies_to: GuardrailAppliesTo;
  content: string;
  priority?: number;
  is_active?: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const session = await getStaffSession();
    const tenantId = session?.tenantId ?? 'clinic';
    const userId = session?.userId ?? null;
    const sovereign = createSovereignClient();

    const { data: row, error } = await sovereign
      .from('agent_guardrails')
      .insert({
        tenant_id: tenantId,
        title: data.title.trim(),
        rule_type: data.rule_type,
        applies_to: data.applies_to ?? 'all',
        content: data.content.trim(),
        priority: data.priority ?? 0,
        is_active: data.is_active ?? true,
        created_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[guardrails] createGuardrail failed:', error.message);
      return { success: false, error: 'CREATE_FAILED' };
    }

    return { success: true, id: (row as { id: string }).id };
  } catch (err) {
    console.error('[guardrails] createGuardrail threw:', err);
    return { success: false, error: 'UNEXPECTED_ERROR' };
  }
}

// =============================================================================
// updateGuardrail
// =============================================================================

export async function updateGuardrail(
  id: string,
  data: Partial<Omit<Guardrail, 'id' | 'tenant_id' | 'created_by' | 'created_at' | 'updated_at'>>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const sovereign = createSovereignClient();

    const { error } = await sovereign
      .from('agent_guardrails')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[guardrails] updateGuardrail failed:', error.message);
      return { success: false, error: 'UPDATE_FAILED' };
    }

    return { success: true };
  } catch (err) {
    console.error('[guardrails] updateGuardrail threw:', err);
    return { success: false, error: 'UNEXPECTED_ERROR' };
  }
}

// =============================================================================
// deleteGuardrail
// =============================================================================

export async function deleteGuardrail(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const sovereign = createSovereignClient();

    const { error } = await sovereign
      .from('agent_guardrails')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[guardrails] deleteGuardrail failed:', error.message);
      return { success: false, error: 'DELETE_FAILED' };
    }

    return { success: true };
  } catch (err) {
    console.error('[guardrails] deleteGuardrail threw:', err);
    return { success: false, error: 'UNEXPECTED_ERROR' };
  }
}

// =============================================================================
// toggleGuardrail
// =============================================================================

export async function toggleGuardrail(
  id: string,
  is_active: boolean,
): Promise<{ success: boolean; error?: string }> {
  return updateGuardrail(id, { is_active });
}

// =============================================================================
// getActiveGuardrailsForAgent — returns formatted string for system prompt injection
// =============================================================================

export async function getActiveGuardrailsForAgent(
  tenantId: string,
  agentKey: string,
): Promise<string> {
  try {
    const sovereign = createSovereignClient();

    const { data, error } = await sovereign
      .from('agent_guardrails')
      .select('rule_type, content, applies_to')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error || !data || data.length === 0) return '';

    const RULE_LABELS: Record<GuardrailRuleType, string> = {
      never_say:            'NEVER SAY',
      always_say:           'ALWAYS SAY',
      topic_block:          'TOPIC BLOCK',
      required_disclaimer:  'REQUIRED',
      tone_rule:            'TONE',
      compliance_rule:      'COMPLIANCE',
    };

    const filtered = (data as Array<{ rule_type: string; content: string; applies_to: string }>)
      .filter(r => r.applies_to === 'all' || r.applies_to === agentKey);

    if (filtered.length === 0) return '';

    const lines = filtered
      .map(r => `[${RULE_LABELS[r.rule_type as GuardrailRuleType] ?? r.rule_type.toUpperCase()}] ${r.content}`)
      .join('\n');

    return `=== GUARDRAILS (you must follow all of these without exception) ===\n${lines}\n=== END GUARDRAILS ===`;
  } catch (err) {
    console.error('[guardrails] getActiveGuardrailsForAgent threw:', err);
    return '';
  }
}

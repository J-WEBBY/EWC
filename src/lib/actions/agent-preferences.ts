'use server';

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// Per-user agent preferences — stored in users.settings.agent_prefs[agentKey]
// No migration needed — uses the existing JSONB settings column on users.
// =============================================================================

export interface AgentPreferences {
  tone: 'casual' | 'professional' | 'formal';
  verbosity: 'brief' | 'standard' | 'detailed';
  focus_areas: string[];
  custom_instructions: string;
}

export const DEFAULT_AGENT_PREFS: AgentPreferences = {
  tone: 'professional',
  verbosity: 'standard',
  focus_areas: [],
  custom_instructions: '',
};

export async function getAgentPreferences(
  userId: string,
  agentKey: string,
): Promise<AgentPreferences> {
  try {
    const db = createSovereignClient();
    const { data } = await db
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single();

    const settings = data?.settings as Record<string, unknown> | null;
    const agentPrefs = (settings?.agent_prefs as Record<string, unknown> | null)?.[agentKey];

    return agentPrefs
      ? { ...DEFAULT_AGENT_PREFS, ...(agentPrefs as Partial<AgentPreferences>) }
      : { ...DEFAULT_AGENT_PREFS };
  } catch {
    return { ...DEFAULT_AGENT_PREFS };
  }
}

export async function saveAgentPreferences(
  userId: string,
  agentKey: string,
  prefs: AgentPreferences,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();

    const { data } = await db
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single();

    const currentSettings = (data?.settings as Record<string, unknown>) || {};
    const currentAgentPrefs = (currentSettings.agent_prefs as Record<string, unknown>) || {};

    await db
      .from('users')
      .update({
        settings: {
          ...currentSettings,
          agent_prefs: { ...currentAgentPrefs, [agentKey]: prefs },
        },
      })
      .eq('id', userId);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}

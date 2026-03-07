// Plain constants — no 'use server'. Importable from both server actions and client pages.

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

// =============================================================================
// Compliance Constants — shared between server actions and client components
// NOT a 'use server' file — safe to import anywhere
// =============================================================================

export const TRAINING_MODULES = [
  'fire_safety', 'manual_handling', 'safeguarding_adults', 'safeguarding_children',
  'basic_life_support', 'infection_control', 'information_governance',
  'conflict_resolution', 'equality_diversity', 'mental_capacity_act',
  'medicines_management', 'food_hygiene', 'health_safety', 'coshh',
  'lone_working', 'dementia_awareness', 'cqc_awareness',
] as const;

export type TrainingModule = typeof TRAINING_MODULES[number];

export const MODULE_FREQUENCY: Record<string, number> = {
  fire_safety: 12, manual_handling: 12, safeguarding_adults: 36, safeguarding_children: 36,
  basic_life_support: 12, infection_control: 12, information_governance: 12,
  conflict_resolution: 36, equality_diversity: 36, mental_capacity_act: 36,
  medicines_management: 12, food_hygiene: 36, health_safety: 12, coshh: 12,
  lone_working: 12, dementia_awareness: 36, cqc_awareness: 12,
};

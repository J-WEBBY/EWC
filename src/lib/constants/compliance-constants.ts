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

// Frequencies in months — matched to EWC CQC Compliance Tracker spreadsheet
export const MODULE_FREQUENCY: Record<string, number> = {
  fire_safety: 12,           // Annual
  manual_handling: 12,       // Annual
  safeguarding_adults: 60,   // 5yr
  safeguarding_children: 60, // 5yr
  basic_life_support: 12,    // Annual
  infection_control: 12,     // Annual
  information_governance: 12,// Annual
  conflict_resolution: 12,   // Annual
  equality_diversity: 60,    // 5yr
  mental_capacity_act: 12,   // Annual
  medicines_management: 12,  // Annual
  food_hygiene: 12,          // Annual
  health_safety: 12,         // Annual
  coshh: 12,                 // Annual
  lone_working: 36,          // 3yr
  dementia_awareness: 36,    // 3yr
  cqc_awareness: 12,         // Annual
};

// Human-readable frequency label
export const MODULE_FREQ_LABEL: Record<string, string> = {
  fire_safety: 'Annual',           manual_handling: 'Annual',
  safeguarding_adults: '5yr',      safeguarding_children: '5yr',
  basic_life_support: 'Annual',    infection_control: 'Annual',
  information_governance: 'Annual',conflict_resolution: 'Annual',
  equality_diversity: '5yr',       mental_capacity_act: 'Annual',
  medicines_management: 'Annual',  food_hygiene: 'Annual',
  health_safety: 'Annual',         coshh: 'Annual',
  lone_working: '3yr',             dementia_awareness: '3yr',
  cqc_awareness: 'Annual',
};

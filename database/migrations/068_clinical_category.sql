-- Migration 068: Add 'clinical' to staff_goals category check
ALTER TABLE staff_goals DROP CONSTRAINT IF EXISTS staff_goals_category_check;
ALTER TABLE staff_goals ADD CONSTRAINT staff_goals_category_check CHECK (
  category IN (
    'appointments','revenue','patients','compliance',
    'training','operational','personal','retention','acquisition','clinical'
  )
);

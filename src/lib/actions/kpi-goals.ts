'use server';

// =============================================================================
// KPI & Goals Server Actions — Edgbaston Wellness Clinic
// Handles: staff goals CRUD, compliance items, personal KPI metrics, clinic KPIs
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// TYPES
// =============================================================================

export type GoalCategory =
  | 'appointments' | 'revenue' | 'patients' | 'compliance'
  | 'training' | 'operational' | 'personal' | 'retention' | 'acquisition';

export type GoalScope    = 'personal' | 'department' | 'clinic';
export type GoalPeriod   = 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
export type GoalUnit     = 'count' | 'gbp' | 'percent' | 'hours' | 'sessions' | 'appointments' | 'patients' | 'days' | 'score';
export type GoalStatus   = 'draft' | 'active' | 'on_track' | 'at_risk' | 'completed' | 'missed' | 'paused';

export type ComplianceCategory =
  | 'clinical_cert' | 'training' | 'dbs' | 'registration'
  | 'cqc' | 'gdpr' | 'health_safety' | 'equipment' | 'insurance';

export type ComplianceStatus =
  | 'compliant' | 'due_soon' | 'overdue' | 'not_started' | 'in_progress' | 'waived' | 'expired';

export interface StaffGoal {
  id:             string;
  owner_id:       string;
  assigned_by:    string | null;
  title:          string;
  description:    string | null;
  notes:          string | null;
  category:       GoalCategory;
  scope:          GoalScope;
  target_value:   number;
  current_value:  number;
  unit:           GoalUnit;
  period:         GoalPeriod;
  start_date:     string;
  due_date:       string;
  status:         GoalStatus;
  is_cascaded:    boolean;
  parent_goal_id: string | null;
  department_id:  string | null;
  created_at:     string;
  updated_at:     string;
  // joined
  owner_name?:    string;
  owner_role?:    string;
  assigner_name?: string;
}

export interface GoalUpdate {
  id:         string;
  goal_id:    string;
  value:      number;
  note:       string | null;
  updated_by: string;
  created_at: string;
  updater_name?: string;
}

export interface ComplianceItem {
  id:                  string;
  owner_id:            string;
  category:            ComplianceCategory;
  title:               string;
  description:         string | null;
  status:              ComplianceStatus;
  due_date:            string | null;
  completed_date:      string | null;
  expiry_date:         string | null;
  evidence_url:        string | null;
  evidence_note:       string | null;
  verified_by:         string | null;
  verified_at:         string | null;
  notify_days_before:  number;
  is_cqc_critical:     boolean;
  is_mandatory:        boolean;
  is_recurring:        boolean;
  recurrence_months:   number | null;
  created_at:          string;
  updated_at:          string;
  verifier_name?:      string;
}

export interface PersonalKPIMetrics {
  userId:            string;
  roleName:          string;
  // Appointments (Practitioner)
  appointments_this_month:   number;
  appointments_last_month:   number;
  appointments_target:       number;
  // Patients
  active_patients:           number;
  new_patients_this_month:   number;
  returning_rate:            number;  // 0-1
  // Revenue (gentle — aggregated, no per-patient breakdown)
  revenue_contribution_pct:  number;  // share of clinic total (0-100)
  // Goals summary
  goals_total:       number;
  goals_completed:   number;
  goals_on_track:    number;
  goals_at_risk:     number;
  goals_missed:      number;
  completion_rate:   number;  // 0-1
  // Compliance
  compliance_total:       number;
  compliance_compliant:   number;
  compliance_due_soon:    number;
  compliance_overdue:     number;
  compliance_score:       number;  // 0-100
  cqc_critical_overdue:   number;
}

export interface SparklinePoint { label: string; value: number; }

export interface ClinicKPIMetrics {
  // Revenue
  mrr:                   number;
  mrr_target:            number;
  mrr_last_month:        number;
  arr_projected:         number;
  mtd_revenue:           number;
  mtd_target:            number;
  mtd_projected:         number;
  outstanding_invoices:  number;
  collection_rate:       number;  // 0-1
  revenue_by_treatment:  { name: string; value: number; pct: number }[];
  revenue_by_practitioner: { name: string; value: number }[];
  // Patients
  total_patients:        number;
  active_patients_30d:   number;
  new_patients_mtd:      number;
  new_patients_target:   number;
  churn_rate:            number;  // 0-1
  avg_ltv:               number;
  nps_score:             number;
  // Appointments
  appointments_mtd:      number;
  appointments_target:   number;
  utilisation_rate:      number;  // 0-1
  show_rate:             number;
  dna_rate:              number;
  late_cancel_rate:      number;
  avg_wait_days:         number;
  rebooking_rate:        number;
  // Voice / AI
  komal_calls_mtd:       number;
  booking_conversions:   number;
  missed_calls_pct:      number;
  signals_open:          number;
  signals_resolved_mtd:  number;
  avg_resolution_hours:  number;
  // Compliance
  cqc_readiness_score:         number;  // 0-100
  staff_cert_compliance_pct:   number;
  equipment_compliance_pct:    number;
  cqc_critical_overdue:        number;
  // Sparklines (last 6 months)
  sparkline_mrr:          SparklinePoint[];
  sparkline_appointments: SparklinePoint[];
  sparkline_patients:     SparklinePoint[];
  sparkline_nps:          SparklinePoint[];
}

export interface StaffGoalsSummary {
  userId:       string;
  displayName:  string;
  roleName:     string;
  departmentName: string | null;
  goals_total:  number;
  goals_on_track: number;
  goals_at_risk:  number;
  goals_completed: number;
  goals_missed:    number;
  completion_rate: number;
  compliance_score: number;
  appointments_mtd: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function calcGoalStatus(goal: {
  target_value: number;
  current_value: number;
  due_date: string;
  status: GoalStatus;
}): GoalStatus {
  if (goal.status === 'paused' || goal.status === 'draft') return goal.status;
  const progress    = goal.target_value > 0 ? goal.current_value / goal.target_value : 0;
  const daysUntilDue = Math.ceil(
    (new Date(goal.due_date).getTime() - Date.now()) / 86_400_000
  );
  if (progress >= 1)                         return 'completed';
  if (daysUntilDue < 0)                      return 'missed';
  if (progress < 0.3 && daysUntilDue <= 7)   return 'at_risk';
  if (progress < 0.5 && daysUntilDue <= 14)  return 'at_risk';
  return 'on_track';
}

function calcComplianceScore(items: ComplianceItem[]): number {
  if (!items.length) return 100;
  const mandatory = items.filter(i => i.is_mandatory);
  if (!mandatory.length) return 100;
  const compliant = mandatory.filter(i =>
    i.status === 'compliant' || i.status === 'waived'
  ).length;
  return Math.round((compliant / mandatory.length) * 100);
}

// =============================================================================
// STAFF GOALS — CRUD
// =============================================================================

export async function getMyGoals(userId: string): Promise<StaffGoal[]> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('staff_goals')
    .select(`
      *,
      owner:owner_id(first_name, last_name, role_id(name)),
      assigner:assigned_by(first_name, last_name)
    `)
    .eq('owner_id', userId)
    .order('due_date', { ascending: true });

  if (error) {
    console.error('[kpi-goals] getMyGoals error:', error);
    return [];
  }

  return (data ?? []).map((g: Record<string, unknown>) => {
    const owner = g.owner as { first_name?: string; last_name?: string; role_id?: { name?: string } } | null;
    const assigner = g.assigner as { first_name?: string; last_name?: string } | null;
    return {
      ...g,
      owner_name:    owner ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() : undefined,
      owner_role:    owner?.role_id?.name ?? undefined,
      assigner_name: assigner ? `${assigner.first_name ?? ''} ${assigner.last_name ?? ''}`.trim() : undefined,
      status:        calcGoalStatus(g as { target_value: number; current_value: number; due_date: string; status: GoalStatus }),
    } as StaffGoal;
  });
}

export async function createGoal(goal: {
  owner_id:      string;
  assigned_by?:  string;
  title:         string;
  description?:  string;
  category:      GoalCategory;
  scope:         GoalScope;
  target_value:  number;
  unit:          GoalUnit;
  period:        GoalPeriod;
  start_date:    string;
  due_date:      string;
  notes?:        string;
  department_id?: string;
  is_cascaded?:  boolean;
  parent_goal_id?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('staff_goals')
    .insert({
      ...goal,
      current_value: 0,
      status:        'active',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[kpi-goals] createGoal error:', error);
    return { success: false, error: error.message };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function updateGoalProgress(
  goalId:    string,
  value:     number,
  note:      string | undefined,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  const db = createSovereignClient();

  // Fetch current goal to recalculate status
  const { data: goal, error: fetchErr } = await db
    .from('staff_goals')
    .select('target_value, due_date, status')
    .eq('id', goalId)
    .single();

  if (fetchErr || !goal) {
    return { success: false, error: fetchErr?.message ?? 'Goal not found' };
  }

  const newStatus = calcGoalStatus({
    target_value:  (goal as { target_value: number }).target_value,
    current_value: value,
    due_date:      (goal as { due_date: string }).due_date,
    status:        (goal as { status: GoalStatus }).status,
  });

  // Insert update log
  const { error: logErr } = await db.from('goal_updates').insert({
    goal_id:    goalId,
    value,
    note:       note ?? null,
    updated_by: updatedBy,
  });
  if (logErr) console.warn('[kpi-goals] goal_updates insert:', logErr.message);

  // Update goal itself
  const { error: updateErr } = await db
    .from('staff_goals')
    .update({ current_value: value, status: newStatus })
    .eq('id', goalId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }
  return { success: true };
}

export async function deleteGoal(
  goalId: string
): Promise<{ success: boolean; error?: string }> {
  const db = createSovereignClient();
  const { error } = await db.from('staff_goals').delete().eq('id', goalId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getGoalHistory(goalId: string): Promise<GoalUpdate[]> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('goal_updates')
    .select(`
      *,
      updater:updated_by(first_name, last_name)
    `)
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[kpi-goals] getGoalHistory error:', error);
    return [];
  }

  return (data ?? []).map((u: Record<string, unknown>) => {
    const updater = u.updater as { first_name?: string; last_name?: string } | null;
    return {
      ...u,
      updater_name: updater
        ? `${updater.first_name ?? ''} ${updater.last_name ?? ''}`.trim()
        : undefined,
    } as GoalUpdate;
  });
}

// =============================================================================
// STAFF GOALS — DIRECTOR VIEW (all staff)
// =============================================================================

export async function getAllStaffGoals(): Promise<StaffGoal[]> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('staff_goals')
    .select(`
      *,
      owner:owner_id(first_name, last_name, role_id(name)),
      assigner:assigned_by(first_name, last_name)
    `)
    .order('due_date', { ascending: true });

  if (error) {
    console.error('[kpi-goals] getAllStaffGoals error:', error);
    return [];
  }

  return (data ?? []).map((g: Record<string, unknown>) => {
    const owner = g.owner as { first_name?: string; last_name?: string; role_id?: { name?: string } } | null;
    const assigner = g.assigner as { first_name?: string; last_name?: string } | null;
    return {
      ...g,
      owner_name:    owner ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() : undefined,
      owner_role:    owner?.role_id?.name ?? undefined,
      assigner_name: assigner ? `${assigner.first_name ?? ''} ${assigner.last_name ?? ''}`.trim() : undefined,
      status:        calcGoalStatus(g as { target_value: number; current_value: number; due_date: string; status: GoalStatus }),
    } as StaffGoal;
  });
}

export async function getAllStaffGoalsSummary(): Promise<StaffGoalsSummary[]> {
  const db = createSovereignClient();

  // Fetch all users + their goals + compliance items
  const { data: users, error: uErr } = await db
    .from('users')
    .select(`
      id, first_name, last_name, display_name,
      role_id(name),
      departments(name)
    `)
    .eq('status', 'active')
    .neq('display_name', 'Reception Edgbaston');

  if (uErr || !users) return [];

  const summaries: StaffGoalsSummary[] = await Promise.all(
    (users as Record<string, unknown>[]).map(async u => {
      const userId = u.id as string;
      const role   = (u.role_id as { name?: string } | null)?.name ?? 'Unknown';
      const dept   = (u.departments as { name?: string } | null)?.name ?? null;

      const goals = await getMyGoals(userId);
      const compItems = await getMyComplianceItems(userId);

      const on_track  = goals.filter(g => g.status === 'on_track').length;
      const at_risk   = goals.filter(g => g.status === 'at_risk').length;
      const completed = goals.filter(g => g.status === 'completed').length;
      const missed    = goals.filter(g => g.status === 'missed').length;

      const completionRate = goals.length > 0
        ? Math.round(((completed) / goals.length) * 100)
        : 0;

      // Appointments this month (Cliniko data — fallback to 0 if not available)
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const { count: apptCount } = await db
        .from('cliniko_appointments')
        .select('id', { count: 'exact', head: true })
        .ilike('practitioner_name', `%${(u.first_name as string) ?? ''}%`)
        .gte('starts_at', startOfMonth);

      return {
        userId,
        displayName:     (u.display_name as string | null)
          ?? `${u.first_name as string} ${u.last_name as string}`,
        roleName:        role,
        departmentName:  dept,
        goals_total:     goals.length,
        goals_on_track:  on_track,
        goals_at_risk:   at_risk,
        goals_completed: completed,
        goals_missed:    missed,
        completion_rate: completionRate,
        compliance_score: calcComplianceScore(compItems),
        appointments_mtd: apptCount ?? 0,
      };
    })
  );

  return summaries;
}

// =============================================================================
// COMPLIANCE ITEMS
// =============================================================================

export async function getMyComplianceItems(userId: string): Promise<ComplianceItem[]> {
  const db = createSovereignClient();
  const { data, error } = await db
    .from('staff_compliance_items')
    .select(`*, verifier:verified_by(first_name, last_name)`)
    .eq('owner_id', userId)
    .order('is_cqc_critical', { ascending: false })
    .order('due_date', { ascending: true });

  if (error) {
    console.error('[kpi-goals] getMyComplianceItems error:', error);
    return [];
  }

  // Auto-compute status based on dates
  const today = new Date();
  return (data ?? []).map((item: Record<string, unknown>) => {
    const verifier = item.verifier as { first_name?: string; last_name?: string } | null;
    let status = item.status as ComplianceStatus;

    // Re-compute due_soon / overdue based on dates unless already compliant/waived
    if (status !== 'compliant' && status !== 'waived') {
      const due   = item.due_date ? new Date(item.due_date as string) : null;
      const expiry = item.expiry_date ? new Date(item.expiry_date as string) : null;
      const refDate = expiry ?? due;
      if (refDate) {
        const daysLeft = Math.ceil((refDate.getTime() - today.getTime()) / 86_400_000);
        if (daysLeft < 0)        status = 'overdue';
        else if (daysLeft <= (item.notify_days_before as number ?? 30)) status = 'due_soon';
      }
    }

    return {
      ...item,
      status,
      verifier_name: verifier
        ? `${verifier.first_name ?? ''} ${verifier.last_name ?? ''}`.trim()
        : undefined,
    } as ComplianceItem;
  });
}

export async function updateComplianceItem(
  itemId:  string,
  updates: Partial<{
    status:         ComplianceStatus;
    completed_date: string;
    expiry_date:    string;
    evidence_url:   string;
    evidence_note:  string;
    verified_by:    string;
    verified_at:    string;
    due_date:       string;
  }>
): Promise<{ success: boolean; error?: string }> {
  const db = createSovereignClient();
  const { error } = await db
    .from('staff_compliance_items')
    .update(updates)
    .eq('id', itemId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// Seed default compliance items for a newly activated user based on their role
export async function seedComplianceItemsForUser(
  userId:   string,
  roleName: string
): Promise<void> {
  const db = createSovereignClient();

  // Check if items already exist
  const { count } = await db
    .from('staff_compliance_items')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId);

  if ((count ?? 0) > 0) return; // already seeded

  const roleKey = roleName.toLowerCase().replace(/\s+/g, '_');

  const items: Omit<ComplianceItem, 'id' | 'created_at' | 'updated_at' | 'verifier_name'>[] = [];

  const base = {
    owner_id: userId,
    status: 'not_started' as ComplianceStatus,
    completed_date: null,
    evidence_url: null,
    evidence_note: null,
    verified_by: null,
    verified_at: null,
    is_recurring: true,
  };

  // ---- DIRECTOR / ADMIN ----
  if (roleKey === 'admin' || roleKey === 'support_admin') {
    items.push(
      { ...base, category: 'cqc', title: 'CQC Registered Manager — Annual Declaration', description: 'Confirm ongoing suitability as Registered Manager per CQC regulation 5', due_date: endOfYear(), expiry_date: null, notify_days_before: 60, is_cqc_critical: true, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'cqc', title: 'CQC Statement of Purpose — Annual Review', description: 'Review and update Statement of Purpose including services, locations, and registered activities', due_date: endOfYear(), expiry_date: null, notify_days_before: 60, is_cqc_critical: true, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'cqc', title: 'Infection Prevention & Control Audit', description: 'Complete IPC audit against NICE guidelines and document outcomes', due_date: endOfQuarter(), expiry_date: null, notify_days_before: 30, is_cqc_critical: true, is_mandatory: true, recurrence_months: 3 },
      { ...base, category: 'gdpr', title: 'ICO Registration — Annual Renewal', description: 'Renew Information Commissioner\'s Office registration (Data Controller)', due_date: endOfYear(), expiry_date: null, notify_days_before: 60, is_cqc_critical: false, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'gdpr', title: 'Data Protection Impact Assessment (DPIA)', description: 'Complete DPIA for new AI processing systems (Aria, Komal, agent memories)', due_date: endOfYear(), expiry_date: null, notify_days_before: 30, is_cqc_critical: false, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'health_safety', title: 'Fire Risk Assessment — Annual', description: 'Commission or complete fire risk assessment for all clinic premises', due_date: endOfYear(), expiry_date: null, notify_days_before: 60, is_cqc_critical: false, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'training', title: 'Safeguarding Adults Level 3', description: 'Level 3 safeguarding adults training for leadership roles', due_date: daysFromNow(365), expiry_date: daysFromNow(365), notify_days_before: 60, is_cqc_critical: true, is_mandatory: true, recurrence_months: 36 },
      { ...base, category: 'training', title: 'Mental Capacity Act Training', description: 'Statutory MCA training for all staff in supervisory roles', due_date: daysFromNow(365), expiry_date: daysFromNow(365), notify_days_before: 60, is_cqc_critical: true, is_mandatory: true, recurrence_months: 24 },
      { ...base, category: 'insurance', title: 'Professional Indemnity Insurance', description: 'Verify PII policy is active and adequate for all services offered', due_date: endOfYear(), expiry_date: null, notify_days_before: 90, is_cqc_critical: false, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'cqc', title: 'Duty of Candour Policy — Annual Review', description: 'Review and update Duty of Candour policy and procedure', due_date: endOfYear(), expiry_date: null, notify_days_before: 30, is_cqc_critical: true, is_mandatory: true, recurrence_months: 12 },
    );
  }

  // ---- PRACTITIONER ----
  if (roleKey === 'practitioner') {
    items.push(
      { ...base, category: 'registration', title: 'GMC / NMC / HCPC Registration — Annual Check', description: 'Confirm active professional registration status with regulator', due_date: endOfYear(), expiry_date: daysFromNow(365), notify_days_before: 60, is_cqc_critical: true, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'clinical_cert', title: 'Level 7 Aesthetics Certificate — Renewal', description: 'Maintain Level 7 qualification for advanced aesthetic procedures (Botox, fillers)', due_date: daysFromNow(730), expiry_date: daysFromNow(730), notify_days_before: 90, is_cqc_critical: true, is_mandatory: true, recurrence_months: 24 },
      { ...base, category: 'training', title: 'Basic Life Support (BLS) — Annual', description: 'Annual BLS and AED training certification', due_date: daysFromNow(365), expiry_date: daysFromNow(365), notify_days_before: 60, is_cqc_critical: true, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'training', title: 'Anaphylaxis & Emergency Drugs Training', description: 'Annual training on recognition and management of anaphylaxis', due_date: daysFromNow(365), expiry_date: daysFromNow(365), notify_days_before: 60, is_cqc_critical: true, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'training', title: 'Safeguarding Adults Level 2', description: 'Level 2 safeguarding adults training for clinical practitioners', due_date: daysFromNow(730), expiry_date: daysFromNow(730), notify_days_before: 60, is_cqc_critical: true, is_mandatory: true, recurrence_months: 24 },
      { ...base, category: 'training', title: 'Infection Control Training', description: 'Annual infection prevention and control training', due_date: daysFromNow(365), expiry_date: daysFromNow(365), notify_days_before: 30, is_cqc_critical: true, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'dbs', title: 'Enhanced DBS Check', description: 'Enhanced Disclosure and Barring Service check (healthcare setting)', due_date: daysFromNow(1095), expiry_date: daysFromNow(1095), notify_days_before: 90, is_cqc_critical: true, is_mandatory: true, recurrence_months: 36 },
      { ...base, category: 'training', title: 'CPD Hours — Annual (35h minimum)', description: 'Maintain minimum 35 CPD hours per year per GMC/NMC requirements', due_date: endOfYear(), expiry_date: null, notify_days_before: 60, is_cqc_critical: false, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'insurance', title: 'Medical Indemnity Insurance', description: 'Confirm personal medical indemnity insurance is active and covers all procedures', due_date: endOfYear(), expiry_date: null, notify_days_before: 90, is_cqc_critical: true, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'training', title: 'Mental Health First Aid (MHFA)', description: 'Mental Health First Aid certification — recommended for clinical team', due_date: daysFromNow(730), expiry_date: daysFromNow(730), notify_days_before: 60, is_cqc_critical: false, is_mandatory: false, recurrence_months: 24 },
    );
  }

  // ---- RECEPTIONIST ----
  if (roleKey === 'receptionist') {
    items.push(
      { ...base, category: 'gdpr', title: 'GDPR / UK Data Protection Training', description: 'Annual GDPR awareness training for all front desk staff', due_date: daysFromNow(365), expiry_date: daysFromNow(365), notify_days_before: 30, is_cqc_critical: false, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'gdpr', title: 'Data Subject Rights Training', description: 'Training on handling DSAR, right to erasure, and consent withdrawal', due_date: daysFromNow(365), expiry_date: daysFromNow(365), notify_days_before: 30, is_cqc_critical: false, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'training', title: 'Information Governance (IG) Training', description: 'Annual IG training covering data handling, confidentiality, and Caldicott principles', due_date: daysFromNow(365), expiry_date: daysFromNow(365), notify_days_before: 30, is_cqc_critical: false, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'training', title: 'Safeguarding Adults Level 1', description: 'Level 1 safeguarding awareness for reception and administrative staff', due_date: daysFromNow(730), expiry_date: daysFromNow(730), notify_days_before: 60, is_cqc_critical: true, is_mandatory: true, recurrence_months: 36 },
      { ...base, category: 'training', title: 'Basic Life Support Awareness', description: 'Awareness-level BLS training for front desk staff', due_date: daysFromNow(365), expiry_date: daysFromNow(365), notify_days_before: 60, is_cqc_critical: false, is_mandatory: true, recurrence_months: 12 },
      { ...base, category: 'dbs', title: 'Basic DBS Check', description: 'Basic Disclosure and Barring Service check for non-clinical staff', due_date: daysFromNow(1095), expiry_date: daysFromNow(1095), notify_days_before: 90, is_cqc_critical: false, is_mandatory: true, recurrence_months: 36 },
    );
  }

  if (items.length > 0) {
    const { error } = await db.from('staff_compliance_items').insert(items);
    if (error) console.error('[kpi-goals] seedComplianceItemsForUser error:', error);
  }
}

// Date helpers
function endOfYear(): string {
  const d = new Date();
  return `${d.getFullYear()}-12-31`;
}
function endOfQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  const ends = ['03-31', '06-30', '09-30', '12-31'];
  return `${d.getFullYear()}-${ends[q]}`;
}
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// =============================================================================
// PERSONAL KPI METRICS
// =============================================================================

export async function getPersonalKPIMetrics(
  userId:   string,
  roleName: string,
  displayName: string
): Promise<PersonalKPIMetrics> {
  const db = createSovereignClient();

  const now         = new Date();
  const y           = now.getFullYear();
  const m           = String(now.getMonth() + 1).padStart(2, '0');
  const startOfMonth = `${y}-${m}-01`;

  const prevDate = new Date(y, now.getMonth() - 1, 1);
  const prevY    = prevDate.getFullYear();
  const prevM    = String(prevDate.getMonth() + 1).padStart(2, '0');
  const startOfPrev  = `${prevY}-${prevM}-01`;
  const endOfPrev    = `${y}-${m}-01`;

  // Practitioner-specific: appointment count from Cliniko
  const firstName = displayName.split(' ')[0];
  const { count: apptThisMonth } = await db
    .from('cliniko_appointments')
    .select('id', { count: 'exact', head: true })
    .ilike('practitioner_name', `%${firstName}%`)
    .gte('starts_at', startOfMonth);

  const { count: apptLastMonth } = await db
    .from('cliniko_appointments')
    .select('id', { count: 'exact', head: true })
    .ilike('practitioner_name', `%${firstName}%`)
    .gte('starts_at', startOfPrev)
    .lt('starts_at', endOfPrev);

  // Active patients assigned
  const { count: activePatients } = await db
    .from('cliniko_patients')
    .select('id', { count: 'exact', head: true })
    .not('last_appointment_date', 'is', null);

  const { count: newPatients } = await db
    .from('cliniko_patients')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfMonth);

  // Goals
  const goals = await getMyGoals(userId);
  const completed  = goals.filter(g => g.status === 'completed').length;
  const on_track   = goals.filter(g => g.status === 'on_track').length;
  const at_risk    = goals.filter(g => g.status === 'at_risk').length;
  const missed     = goals.filter(g => g.status === 'missed').length;

  // Compliance
  const compItems = await getMyComplianceItems(userId);
  const compCompliant = compItems.filter(c => c.status === 'compliant' || c.status === 'waived').length;
  const compDueSoon   = compItems.filter(c => c.status === 'due_soon').length;
  const compOverdue   = compItems.filter(c => c.status === 'overdue').length;
  const cqcCritOverdue = compItems.filter(c => c.is_cqc_critical && c.status === 'overdue').length;

  const totalM = compItems.filter(c => c.is_mandatory).length;
  const compScore = totalM > 0
    ? Math.round((compItems.filter(c => c.is_mandatory && (c.status === 'compliant' || c.status === 'waived')).length / totalM) * 100)
    : 100;

  return {
    userId,
    roleName,
    appointments_this_month:  apptThisMonth ?? 0,
    appointments_last_month:  apptLastMonth ?? 0,
    appointments_target:      roleName.toLowerCase() === 'practitioner' ? 60 : 0,
    active_patients:          activePatients ?? 0,
    new_patients_this_month:  newPatients ?? 0,
    returning_rate:           0.72,   // placeholder until full Cliniko sync
    revenue_contribution_pct: 0,
    goals_total:     goals.length,
    goals_completed: completed,
    goals_on_track:  on_track,
    goals_at_risk:   at_risk,
    goals_missed:    missed,
    completion_rate: goals.length > 0 ? completed / goals.length : 0,
    compliance_total:     compItems.length,
    compliance_compliant: compCompliant,
    compliance_due_soon:  compDueSoon,
    compliance_overdue:   compOverdue,
    compliance_score:     compScore,
    cqc_critical_overdue: cqcCritOverdue,
  };
}

// =============================================================================
// CLINIC KPI METRICS (Director / Support Admin view)
// =============================================================================

export async function getClinicKPIMetrics(): Promise<ClinicKPIMetrics> {
  const db = createSovereignClient();

  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const startOfMonth = `${y}-${m}-01`;
  const dayOfMonth   = now.getDate();
  const daysInMonth  = new Date(y, now.getMonth() + 1, 0).getDate();

  // Patient counts
  const { count: totalPatients }  = await db
    .from('cliniko_patients')
    .select('id', { count: 'exact', head: true });

  const { count: activePatients } = await db
    .from('cliniko_patients')
    .select('id', { count: 'exact', head: true })
    .gte('last_appointment_date', new Date(Date.now() - 30 * 86_400_000).toISOString());

  const { count: newPatientsMtd } = await db
    .from('cliniko_patients')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfMonth);

  // Appointment counts
  const { count: apptMtd } = await db
    .from('cliniko_appointments')
    .select('id', { count: 'exact', head: true })
    .gte('starts_at', startOfMonth);

  // Signals
  const { count: openSignals } = await db
    .from('signals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');

  const { count: resolvedMtd } = await db
    .from('signals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'resolved')
    .gte('created_at', startOfMonth);

  // Revenue — estimated from appointment count × avg treatment value (£180)
  const apptCount    = apptMtd ?? 0;
  const avgTreatment = 180;
  const mtdRevenue   = apptCount * avgTreatment;
  const mtdTarget    = 25000;
  const projected    = daysInMonth > 0
    ? Math.round((mtdRevenue / dayOfMonth) * daysInMonth)
    : mtdRevenue;
  const mrr = projected;

  // Sparklines — last 6 months placeholder
  const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
  const sparklineMrr: SparklinePoint[] = months.map((label, i) => ({
    label,
    value: 18000 + i * 1400 + Math.round(Math.random() * 1200),
  }));
  const sparklineAppts: SparklinePoint[] = months.map((label, i) => ({
    label,
    value: 80 + i * 8 + Math.round(Math.random() * 10),
  }));
  const sparklinePatients: SparklinePoint[] = months.map((label, i) => ({
    label,
    value: 120 + i * 12,
  }));
  const sparklineNps: SparklinePoint[] = months.map((label, i) => ({
    label,
    value: 62 + i * 3,
  }));

  // Treatment breakdown (estimated until Cliniko invoices connected)
  const revByTreatment = [
    { name: 'Botox',          value: Math.round(mtdRevenue * 0.32), pct: 32 },
    { name: 'Fillers',        value: Math.round(mtdRevenue * 0.20), pct: 20 },
    { name: 'CoolSculpting',  value: Math.round(mtdRevenue * 0.15), pct: 15 },
    { name: 'IV Therapy',     value: Math.round(mtdRevenue * 0.12), pct: 12 },
    { name: 'Weight Mgmt',    value: Math.round(mtdRevenue * 0.10), pct: 10 },
    { name: 'Other',          value: Math.round(mtdRevenue * 0.11), pct: 11 },
  ];

  return {
    mrr,
    mrr_target:           mtdTarget,
    mrr_last_month:       Math.round(mrr * 0.91),
    arr_projected:        mrr * 12,
    mtd_revenue:          mtdRevenue,
    mtd_target:           mtdTarget,
    mtd_projected:        projected,
    outstanding_invoices: Math.round(mtdRevenue * 0.08),
    collection_rate:      0.92,
    revenue_by_treatment: revByTreatment,
    revenue_by_practitioner: [
      { name: 'Dr S Ganta',  value: Math.round(mtdRevenue * 0.38) },
      { name: 'Dr K Penumaka', value: Math.round(mtdRevenue * 0.29) },
      { name: 'Lubna Bibi',  value: Math.round(mtdRevenue * 0.21) },
      { name: 'Nikita V',    value: Math.round(mtdRevenue * 0.12) },
    ],
    total_patients:      totalPatients ?? 0,
    active_patients_30d: activePatients ?? 0,
    new_patients_mtd:    newPatientsMtd ?? 0,
    new_patients_target: 20,
    churn_rate:          0.04,
    avg_ltv:             2160,
    nps_score:           74,
    appointments_mtd:    apptMtd ?? 0,
    appointments_target: 140,
    utilisation_rate:    0.78,
    show_rate:           0.88,
    dna_rate:            0.07,
    late_cancel_rate:    0.05,
    avg_wait_days:       3.2,
    rebooking_rate:      0.64,
    komal_calls_mtd:     0,
    booking_conversions: 0,
    missed_calls_pct:    0,
    signals_open:        openSignals ?? 0,
    signals_resolved_mtd: resolvedMtd ?? 0,
    avg_resolution_hours: 4.2,
    cqc_readiness_score:       82,
    staff_cert_compliance_pct: 0,  // populated once staff seed compliance items
    equipment_compliance_pct:  0,
    cqc_critical_overdue:      0,
    sparkline_mrr:          sparklineMrr,
    sparkline_appointments: sparklineAppts,
    sparkline_patients:     sparklinePatients,
    sparkline_nps:          sparklineNps,
  };
}

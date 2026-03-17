'use server';

// =============================================================================
// Compliance Server Actions — Edgbaston Wellness Clinic
// Covers: HR Tracker, Training Matrix, Equipment, CQC Audit,
//         Governance Log, Compliance Calendar, Dashboard
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { TRAINING_MODULES, MODULE_FREQUENCY } from '@/lib/constants/compliance-constants';

// =============================================================================
// TYPES
// =============================================================================

export interface ActiveUser {
  id:           string;
  full_name:    string;
  role_name:    string;
  email:        string;
}

export interface HRRecord {
  id:                   string;
  user_id:              string;
  full_name:            string;
  role_name:            string;
  // Profile
  staff_id:             string | null;
  job_title:            string | null;
  dept_team:            string | null;
  start_date:           string | null;
  contract_type:        string | null;
  // DBS
  dbs_number:           string | null;
  dbs_issue_date:       string | null;
  dbs_expiry_date:      string | null;
  dbs_status:           'valid' | 'due_soon' | 'expired' | 'na' | 'no_dbs';
  // RTW
  rtw_type:             string | null;
  rtw_expiry_date:      string | null;
  rtw_status:           'valid' | 'due_soon' | 'expired' | 'na' | 'permanent';
  // Registration
  registration_body:    string | null;
  registration_number:  string | null;
  registration_expiry:  string | null;
  registration_status:  'valid' | 'due_soon' | 'expired' | 'na';
  // Appraisals
  last_appraisal_date:  string | null;
  next_appraisal_date:  string | null;
  appraisal_status:     'on_track' | 'due_soon' | 'overdue' | 'not_set';
  // Sign-off
  staff_signed:         boolean;
  manager_signed:       boolean;
  documents_uploaded:   boolean;
  notes:                string | null;
}

export interface TrainingEntry {
  user_id:          string;
  full_name:        string;
  role_name:        string;
  module:           string;
  frequency_months: number;
  completed_date:   string | null;
  expiry_date:      string | null;
  status:           'compliant' | 'due_soon' | 'overdue' | 'not_recorded';
  certificate_url:  string | null;
  notes:            string | null;
}

export interface TrainingMatrixRow {
  user_id:   string;
  full_name: string;
  role_name: string;
  modules:   Record<string, TrainingEntry | null>;
}

export interface EquipmentItem {
  id:                   string;
  item_code:            string;
  name:                 string;
  category:             string;
  location:             string | null;
  serial_number:        string | null;
  last_service_date:    string | null;
  next_due_date:        string | null;
  check_frequency:      string | null;
  status:               'ok' | 'due_this_month' | 'overdue' | 'not_scheduled';
  responsible_user_id:  string | null;
  responsible_name:     string | null;
  action_required:      string | null;
  notes:                string | null;
}

export interface CQCAnswer {
  id:               string;
  question_number:  number;
  domain:           string;
  audit_area:       string;
  question_text:    string;
  answer:           'yes' | 'no' | 'partial' | 'na' | null;
  evidence_notes:   string | null;
  action_required:  string | null;
  target_date:      string | null;
  answered_by:      string | null;
  audit_date:       string | null;
}

export interface GovernanceEntry {
  id:               string;
  type:             string;
  event_date:       string;
  agenda_items:     string | null;
  attendees:        string | null;
  minutes_uploaded: boolean;
  actions_arising:  string | null;
  owner_id:         string | null;
  owner_name:       string | null;
  due_date:         string | null;
  status:           'open' | 'in_progress' | 'completed' | 'overdue';
  created_at:       string;
}

export interface CalendarTask {
  id:                   string;
  task_order:           number;
  task_name:            string;
  frequency:            string;
  month_due:            string | null;
  responsible_user_id:  string | null;
  responsible_name:     string | null;
  last_completed_date:  string | null;
  next_due_date:        string | null;
  status:               'ok' | 'due_soon' | 'overdue' | 'not_scheduled';
  notes:                string | null;
}

export interface MedicineItem {
  id:                   string;
  item_code:            string;
  name:                 string;
  item_type:            'medicine' | 'stock' | 'consumable';
  category:             string | null;
  quantity:             number | null;
  unit:                 string | null;
  batch_number:         string | null;
  expiry_date:          string | null;
  storage_location:     string | null;
  min_stock_level:      number | null;
  status:               'ok' | 'low_stock' | 'expiring_soon' | 'expired' | 'out_of_stock';
  responsible_user_id:  string | null;
  responsible_name:     string | null;
  last_checked_date:    string | null;
  notes:                string | null;
}

export interface ComplianceDashboard {
  // HR
  total_staff:            number;
  dbs_issues:             number;   // expired + due_soon
  rtw_issues:             number;
  appraisals_overdue:     number;
  // Training
  training_gaps:          number;   // overdue entries
  // Equipment
  equipment_overdue:      number;
  equipment_due_soon:     number;
  // CQC
  cqc_score_pct:          number;   // yes / (yes+no+partial) * 100
  cqc_answered:           number;
  cqc_total:              number;
  cqc_no_count:           number;
  cqc_partial_count:      number;
  // Governance
  governance_open:        number;
  governance_overdue:     number;
  // Calendar
  calendar_overdue:       number;
  calendar_due_soon:      number;
}

// =============================================================================
// HELPERS
// =============================================================================

function computeDbsStatus(expiryDate: string | null): HRRecord['dbs_status'] {
  if (!expiryDate) return 'no_dbs';
  const expiry = new Date(expiryDate);
  const now = new Date();
  const in90 = new Date(now); in90.setDate(now.getDate() + 90);
  if (expiry < now) return 'expired';
  if (expiry < in90) return 'due_soon';
  return 'valid';
}

function computeRtwStatus(expiryDate: string | null, rtwType: string | null): HRRecord['rtw_status'] {
  if (!rtwType || rtwType === 'uk_national') return 'permanent';
  if (rtwType === 'na') return 'na';
  if (!expiryDate) return 'na';
  const expiry = new Date(expiryDate);
  const now = new Date();
  const in90 = new Date(now); in90.setDate(now.getDate() + 90);
  if (expiry < now) return 'expired';
  if (expiry < in90) return 'due_soon';
  return 'valid';
}

function computeRegistrationStatus(expiryDate: string | null, body: string | null): HRRecord['registration_status'] {
  if (!body || body === 'N/A') return 'na';
  if (!expiryDate) return 'na';
  const expiry = new Date(expiryDate);
  const now = new Date();
  const in90 = new Date(now); in90.setDate(now.getDate() + 90);
  if (expiry < now) return 'expired';
  if (expiry < in90) return 'due_soon';
  return 'valid';
}

function computeAppraisalStatus(nextDate: string | null): HRRecord['appraisal_status'] {
  if (!nextDate) return 'not_set';
  const d = new Date(nextDate);
  const now = new Date();
  const in60 = new Date(now); in60.setDate(now.getDate() + 60);
  if (d < now) return 'overdue';
  if (d < in60) return 'due_soon';
  return 'on_track';
}

function computeTrainingStatus(completedDate: string | null, expiryDate: string | null): TrainingEntry['status'] {
  if (!completedDate) return 'not_recorded';
  const expiry = expiryDate ? new Date(expiryDate) : null;
  if (!expiry) return 'not_recorded';
  const now = new Date();
  const in90 = new Date(now); in90.setDate(now.getDate() + 90);
  if (expiry < now) return 'overdue';
  if (expiry < in90) return 'due_soon';
  return 'compliant';
}

function computeEquipmentStatus(nextDue: string | null): EquipmentItem['status'] {
  if (!nextDue) return 'not_scheduled';
  const d = new Date(nextDue);
  const now = new Date();
  const in30 = new Date(now); in30.setDate(now.getDate() + 30);
  if (d < now) return 'overdue';
  if (d < in30) return 'due_this_month';
  return 'ok';
}

function computeCalendarStatus(nextDue: string | null): CalendarTask['status'] {
  if (!nextDue) return 'not_scheduled';
  const d = new Date(nextDue);
  const now = new Date();
  const in30 = new Date(now); in30.setDate(now.getDate() + 30);
  if (d < now) return 'overdue';
  if (d < in30) return 'due_soon';
  return 'ok';
}

function computeMedicineStatus(
  expiryDate: string | null,
  quantity: number | null,
  minStock: number | null
): MedicineItem['status'] {
  if (quantity !== null && quantity === 0) return 'out_of_stock';
  if (quantity !== null && minStock !== null && quantity <= minStock) return 'low_stock';
  if (!expiryDate) return 'ok';
  const exp = new Date(expiryDate);
  const now = new Date();
  const in60 = new Date(now); in60.setDate(now.getDate() + 60);
  if (exp < now) return 'expired';
  if (exp < in60) return 'expiring_soon';
  return 'ok';
}

// =============================================================================
// GET ACTIVE USERS
// =============================================================================

export async function getActiveUsers(): Promise<ActiveUser[]> {
  const session = await getStaffSession();
  if (!session) return [];
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('users')
      .select(`id, first_name, last_name, email, roles!inner(name)`)
      .order('first_name');

    if (error || !data) return [];

    return data.map((u: Record<string, unknown>) => ({
      id:        u.id as string,
      full_name: `${u.first_name} ${u.last_name}`.trim(),
      role_name: (u.roles as Record<string, unknown>)?.name as string ?? '—',
      email:     u.email as string,
    }));
  } catch { return []; }
}

// =============================================================================
// HR RECORDS
// =============================================================================

export async function getHRRecords(): Promise<HRRecord[]> {
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  try {
    const db = createSovereignClient();

    const { data: users, error: uErr } = await db
      .from('users')
      .select('id, first_name, last_name, roles!inner(name)')
      .order('first_name');

    if (uErr || !users) return [];

    const { data: records } = await db
      .from('compliance_hr_records')
      .select('*');

    const recordMap: Record<string, Record<string, unknown>> = {};
    for (const r of records ?? []) {
      recordMap[(r as Record<string, unknown>).user_id as string] = r as Record<string, unknown>;
    }

    return users.map((u: Record<string, unknown>) => {
      const r = recordMap[u.id as string] ?? {};
      const getStr  = (k: string): string | null => (r[k] ?? null) as string | null;
      const getBool = (k: string): boolean => (r[k] as boolean) ?? false;
      return {
        id:                   getStr('id') ?? '',
        user_id:              u.id as string,
        full_name:            `${u.first_name} ${u.last_name}`.trim(),
        role_name:            (u.roles as Record<string, unknown>)?.name as string ?? '—',
        staff_id:             getStr('staff_id'),
        job_title:            getStr('job_title'),
        dept_team:            getStr('dept_team'),
        start_date:           getStr('start_date'),
        contract_type:        getStr('contract_type'),
        dbs_number:           getStr('dbs_number'),
        dbs_issue_date:       getStr('dbs_issue_date'),
        dbs_expiry_date:      getStr('dbs_expiry_date'),
        dbs_status:           computeDbsStatus(getStr('dbs_expiry_date')),
        rtw_type:             getStr('rtw_type'),
        rtw_expiry_date:      getStr('rtw_expiry_date'),
        rtw_status:           computeRtwStatus(getStr('rtw_expiry_date'), getStr('rtw_type')),
        registration_body:    getStr('registration_body'),
        registration_number:  getStr('registration_number'),
        registration_expiry:  getStr('registration_expiry'),
        registration_status:  computeRegistrationStatus(getStr('registration_expiry'), getStr('registration_body')),
        last_appraisal_date:  getStr('last_appraisal_date'),
        next_appraisal_date:  getStr('next_appraisal_date'),
        appraisal_status:     computeAppraisalStatus(getStr('next_appraisal_date')),
        staff_signed:         getBool('staff_signed'),
        manager_signed:       getBool('manager_signed'),
        documents_uploaded:   getBool('documents_uploaded'),
        notes:                getStr('notes'),
      };
    });
  } catch { return []; }
}

export async function upsertHRRecord(
  userId: string,
  data: {
    staff_id?: string | null;
    job_title?: string | null;
    dept_team?: string | null;
    start_date?: string | null;
    contract_type?: string | null;
    dbs_number?: string | null;
    dbs_issue_date?: string | null;
    dbs_expiry_date?: string | null;
    rtw_type?: string | null;
    rtw_expiry_date?: string | null;
    registration_body?: string | null;
    registration_number?: string | null;
    registration_expiry?: string | null;
    last_appraisal_date?: string | null;
    next_appraisal_date?: string | null;
    staff_signed?: boolean;
    manager_signed?: boolean;
    documents_uploaded?: boolean;
    notes?: string | null;
    assigned_by?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    // Look up the real tenant_id UUID from the target user row (session.tenantId may fall back to 'clinic')
    const { data: userRow } = await db.from('users').select('tenant_id').eq('id', userId).single();
    const tenantId = userRow?.tenant_id as string | undefined;
    if (!tenantId) return { success: false, error: 'User not found' };
    const { error } = await db
      .from('compliance_hr_records')
      .upsert({ tenant_id: tenantId, user_id: userId, ...data }, { onConflict: 'tenant_id,user_id' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function deleteHRRecord(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_hr_records')
      .delete()
      .eq('user_id', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// TRAINING MATRIX
// =============================================================================

export async function getTrainingMatrix(): Promise<TrainingMatrixRow[]> {
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  try {
    const db = createSovereignClient();

    const { data: users, error: uErr } = await db
      .from('users')
      .select('id, first_name, last_name, roles!inner(name)')
      .order('first_name');

    if (uErr || !users) return [];

    const { data: entries } = await db
      .from('compliance_training')
      .select('*');

    const entryMap: Record<string, Record<string, Record<string, unknown>>> = {};
    for (const e of entries ?? []) {
      const entry = e as Record<string, unknown>;
      const uid = entry.user_id as string;
      const mod = entry.module as string;
      if (!entryMap[uid]) entryMap[uid] = {};
      entryMap[uid][mod] = entry;
    }

    return users.map((u: Record<string, unknown>) => {
      const uid = u.id as string;
      const modules: Record<string, TrainingEntry | null> = {};
      for (const mod of TRAINING_MODULES) {
        const e = entryMap[uid]?.[mod];
        if (e) {
          modules[mod] = {
            user_id:          uid,
            full_name:        `${u.first_name} ${u.last_name}`.trim(),
            role_name:        (u.roles as Record<string, unknown>)?.name as string ?? '—',
            module:           mod,
            frequency_months: (e.frequency_months as number) ?? 12,
            completed_date:   (e.completed_date as string | null) ?? null,
            expiry_date:      (e.expiry_date as string | null) ?? null,
            status:           computeTrainingStatus(e.completed_date as string | null, e.expiry_date as string | null),
            certificate_url:  (e.certificate_url as string | null) ?? null,
            notes:            (e.notes as string | null) ?? null,
          };
        } else {
          modules[mod] = null;
        }
      }
      return {
        user_id:   uid,
      full_name: `${u.first_name} ${u.last_name}`.trim(),
        role_name: (u.roles as Record<string, unknown>)?.name as string ?? '—',
        modules,
      };
    });
  } catch { return []; }
}

export async function upsertTrainingEntry(
  userId: string,
  module: string,
  data: {
    completed_date?: string;
    certificate_url?: string;
    notes?: string;
    assigned_by?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    // Look up real tenant_id UUID from user row (session.tenantId may fall back to 'clinic')
    const { data: userRow } = await db.from('users').select('tenant_id').eq('id', userId).single();
    const tenantId = userRow?.tenant_id as string | undefined;
    if (!tenantId) return { success: false, error: 'User not found' };
    const freq = MODULE_FREQUENCY[module] ?? 12;
    let expiryDate: string | undefined;
    if (data.completed_date) {
      const d = new Date(data.completed_date);
      d.setMonth(d.getMonth() + freq);
      expiryDate = d.toISOString().split('T')[0];
    }
    const { error } = await db
      .from('compliance_training')
      .upsert({
        tenant_id: tenantId, user_id: userId, module, frequency_months: freq,
        completed_date: data.completed_date ?? null,
        expiry_date: expiryDate ?? null,
        certificate_url: data.certificate_url ?? null,
        notes: data.notes ?? null,
        assigned_by: data.assigned_by ?? null,
      }, { onConflict: 'tenant_id,user_id,module' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function deleteTrainingEntry(
  userId: string,
  module: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_training')
      .delete()
      .eq('user_id', userId)
      .eq('module', module);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// EQUIPMENT
// =============================================================================

export async function getEquipmentList(): Promise<EquipmentItem[]> {
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('compliance_equipment')
      .select(`
        id, item_code, name, category, location, serial_number,
        last_service_date, next_due_date, check_frequency,
        responsible_user_id, action_required, notes,
        users:responsible_user_id(first_name, last_name)
      `)
      .order('item_code');

    if (error || !data) return [];

    return data.map((e: Record<string, unknown>) => {
      const ru = e.users as Record<string, string> | null;
      return {
        id:                  e.id as string,
        item_code:           e.item_code as string,
        name:                e.name as string,
        category:            e.category as string,
        location:            (e.location as string | null) ?? null,
        serial_number:       (e.serial_number as string | null) ?? null,
        last_service_date:   (e.last_service_date as string | null) ?? null,
        next_due_date:       (e.next_due_date as string | null) ?? null,
        check_frequency:     (e.check_frequency as string | null) ?? null,
        status:              computeEquipmentStatus(e.next_due_date as string | null),
        responsible_user_id: (e.responsible_user_id as string | null) ?? null,
        responsible_name:    ru ? `${ru.first_name} ${ru.last_name}`.trim() : null,
        action_required:     (e.action_required as string | null) ?? null,
        notes:               (e.notes as string | null) ?? null,
      };
    });
  } catch { return []; }
}

export async function createEquipmentItem(data: {
  name: string;
  category: string;
  check_frequency?: string;
  location?: string;
  serial_number?: string;
  last_service_date?: string;
  next_due_date?: string;
  responsible_user_id?: string | null;
  action_required?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    const { data: userRow } = await db.from('users').select('tenant_id').eq('id', session.userId).single();
    const tenantId = userRow?.tenant_id as string | undefined;
    if (!tenantId) return { success: false, error: 'Tenant not found' };
    // Generate next item code
    const { data: existing } = await db
      .from('compliance_equipment')
      .select('item_code')
      .eq('tenant_id', tenantId)
      .order('item_code', { ascending: false })
      .limit(1);
    const lastCode = existing?.[0]?.item_code ?? 'EQ000';
    const lastNum = parseInt(lastCode.replace(/\D/g, ''), 10) || 0;
    const item_code = `EQ${String(lastNum + 1).padStart(3, '0')}`;
    const { error } = await db
      .from('compliance_equipment')
      .insert({ tenant_id: tenantId, item_code, ...data });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function deleteEquipmentItem(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_equipment')
      .delete()
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function updateEquipmentItem(
  id: string,
  data: {
    name?: string;
    check_frequency?: string;
    last_service_date?: string;
    next_due_date?: string;
    serial_number?: string;
    location?: string;
    responsible_user_id?: string | null;
    action_required?: string;
    notes?: string;
    assigned_by?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_equipment')
      .update(data)
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// MEDICINES & STOCK
// =============================================================================

export async function getMedicines(): Promise<MedicineItem[]> {
  const session = await getStaffSession();
  if (!session) return [];
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('compliance_medicines')
      .select(`
        id, item_code, name, item_type, category, quantity, unit, batch_number,
        expiry_date, storage_location, min_stock_level,
        responsible_user_id, last_checked_date, notes,
        users:responsible_user_id(first_name, last_name)
      `)
      .order('item_code');
    if (error || !data) return [];
    return data.map((e: Record<string, unknown>) => {
      const ru = e.users as Record<string, string> | null;
      return {
        id:                  e.id as string,
        item_code:           e.item_code as string,
        name:                e.name as string,
        item_type:           (e.item_type as MedicineItem['item_type']) ?? 'medicine',
        category:            (e.category as string | null) ?? null,
        quantity:            (e.quantity as number | null) ?? null,
        unit:                (e.unit as string | null) ?? null,
        batch_number:        (e.batch_number as string | null) ?? null,
        expiry_date:         (e.expiry_date as string | null) ?? null,
        storage_location:    (e.storage_location as string | null) ?? null,
        min_stock_level:     (e.min_stock_level as number | null) ?? null,
        status:              computeMedicineStatus(e.expiry_date as string | null, e.quantity as number | null, e.min_stock_level as number | null),
        responsible_user_id: (e.responsible_user_id as string | null) ?? null,
        responsible_name:    ru ? `${ru.first_name} ${ru.last_name}`.trim() : null,
        last_checked_date:   (e.last_checked_date as string | null) ?? null,
        notes:               (e.notes as string | null) ?? null,
      };
    });
  } catch { return []; }
}

export async function createMedicine(data: {
  name: string;
  item_type: string;
  category?: string;
  quantity?: number;
  unit?: string;
  batch_number?: string;
  expiry_date?: string;
  storage_location?: string;
  min_stock_level?: number;
  responsible_user_id?: string | null;
  last_checked_date?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    const { data: userRow } = await db.from('users').select('tenant_id').eq('id', session.userId).single();
    const tenantId = userRow?.tenant_id as string | undefined;
    if (!tenantId) return { success: false, error: 'Tenant not found' };
    // Generate item code
    const { data: existing } = await db
      .from('compliance_medicines')
      .select('item_code')
      .eq('tenant_id', tenantId)
      .order('item_code', { ascending: false })
      .limit(1);
    const lastCode = existing?.[0]?.item_code ?? 'MED000';
    const lastNum = parseInt(lastCode.replace(/\D/g, ''), 10) || 0;
    const item_code = `MED${String(lastNum + 1).padStart(3, '0')}`;
    const { error } = await db
      .from('compliance_medicines')
      .insert({ tenant_id: tenantId, item_code, ...data });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function updateMedicine(
  id: string,
  data: {
    name?: string;
    item_type?: string;
    category?: string | null;
    quantity?: number | null;
    unit?: string | null;
    batch_number?: string | null;
    expiry_date?: string | null;
    storage_location?: string | null;
    min_stock_level?: number | null;
    responsible_user_id?: string | null;
    last_checked_date?: string | null;
    notes?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_medicines')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function deleteMedicine(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const db = createSovereignClient();
    const { error } = await db.from('compliance_medicines').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// CQC AUDIT
// =============================================================================

export async function getCQCAudit(): Promise<CQCAnswer[]> {
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('compliance_cqc_answers')
      .select('*')
      .order('question_number');

    if (error || !data) return [];

    return data.map((q: Record<string, unknown>) => ({
      id:              q.id as string,
      question_number: q.question_number as number,
      domain:          q.domain as string,
      audit_area:      q.audit_area as string,
      question_text:   q.question_text as string,
      answer:          (q.answer as CQCAnswer['answer']) ?? null,
      evidence_notes:  (q.evidence_notes as string | null) ?? null,
      action_required: (q.action_required as string | null) ?? null,
      target_date:     (q.target_date as string | null) ?? null,
      answered_by:     (q.answered_by as string | null) ?? null,
      audit_date:      (q.audit_date as string | null) ?? null,
    }));
  } catch { return []; }
}

export async function saveCQCAnswer(
  questionNumber: number,
  data: {
    answer: 'yes' | 'no' | 'partial' | 'na' | null;
    evidence_notes?: string;
    action_required?: string;
    target_date?: string;
    answered_by?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_cqc_answers')
      .update({
        answer:          data.answer,
        evidence_notes:  data.evidence_notes ?? null,
        action_required: data.action_required ?? null,
        target_date:     data.target_date ?? null,
        answered_by:     data.answered_by ?? null,
        audit_date:      new Date().toISOString().split('T')[0],
      })
      .eq('question_number', questionNumber)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// GOVERNANCE LOG
// =============================================================================

export async function getGovernanceLog(): Promise<GovernanceEntry[]> {
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('compliance_governance_log')
      .select(`
        id, type, event_date, agenda_items, attendees, minutes_uploaded,
        actions_arising, owner_id, due_date, status, created_at,
        users:owner_id(first_name, last_name)
      `)
      .order('event_date', { ascending: false });

    if (error || !data) return [];

    return data.map((e: Record<string, unknown>) => {
      const owner = e.users as Record<string, string> | null;
      return {
        id:               e.id as string,
        type:             e.type as string,
        event_date:       e.event_date as string,
        agenda_items:     (e.agenda_items as string | null) ?? null,
        attendees:        (e.attendees as string | null) ?? null,
        minutes_uploaded: (e.minutes_uploaded as boolean) ?? false,
        actions_arising:  (e.actions_arising as string | null) ?? null,
        owner_id:         (e.owner_id as string | null) ?? null,
        owner_name:       owner ? `${owner.first_name} ${owner.last_name}`.trim() : null,
        due_date:         (e.due_date as string | null) ?? null,
        status:           (e.status as GovernanceEntry['status']) ?? 'open',
        created_at:       e.created_at as string,
      };
    });
  } catch { return []; }
}

export async function createGovernanceEntry(data: {
  type: string;
  event_date: string;
  agenda_items?: string;
  attendees?: string;
  minutes_uploaded?: boolean;
  actions_arising?: string;
  owner_id?: string;
  due_date?: string;
  status?: string;
  created_by?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { data: row, error } = await db
      .from('compliance_governance_log')
      .insert({ tenant_id: tenantId, ...data })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, id: (row as Record<string, string>)?.id };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function updateGovernanceEntry(
  id: string,
  data: Partial<{
    type: string;
    event_date: string;
    agenda_items: string;
    attendees: string;
    minutes_uploaded: boolean;
    actions_arising: string;
    owner_id: string | null;
    due_date: string;
    status: string;
  }>
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_governance_log')
      .update(data)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function deleteGovernanceEntry(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_governance_log')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// COMPLIANCE CALENDAR
// =============================================================================

export async function getCalendarTasks(): Promise<CalendarTask[]> {
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('compliance_calendar')
      .select(`
        id, task_order, task_name, frequency, month_due,
        responsible_user_id, last_completed_date, next_due_date, notes,
        users:responsible_user_id(first_name, last_name)
      `)
      .order('task_order');

    if (error || !data) return [];

    return data.map((t: Record<string, unknown>) => {
      const ru = t.users as Record<string, string> | null;
      return {
        id:                  t.id as string,
        task_order:          t.task_order as number,
        task_name:           t.task_name as string,
        frequency:           t.frequency as string,
        month_due:           (t.month_due as string | null) ?? null,
        responsible_user_id: (t.responsible_user_id as string | null) ?? null,
        responsible_name:    ru ? `${ru.first_name} ${ru.last_name}`.trim() : null,
        last_completed_date: (t.last_completed_date as string | null) ?? null,
        next_due_date:       (t.next_due_date as string | null) ?? null,
        status:              computeCalendarStatus(t.next_due_date as string | null),
        notes:               (t.notes as string | null) ?? null,
      };
    });
  } catch { return []; }
}

export async function createCalendarTask(data: {
  task_name: string;
  frequency: string;
  month_due?: string;
  next_due_date?: string;
  responsible_user_id?: string | null;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { data: existing } = await db
      .from('compliance_calendar')
      .select('task_order')
      .eq('tenant_id', tenantId)
      .order('task_order', { ascending: false })
      .limit(1);
    const nextOrder = (existing?.[0]?.task_order ?? 0) + 1;
    const { error } = await db
      .from('compliance_calendar')
      .insert({ tenant_id: tenantId, task_order: nextOrder, ...data });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function deleteCalendarTask(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_calendar')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

export async function updateCalendarTask(
  id: string,
  data: {
    last_completed_date?: string;
    next_due_date?: string;
    responsible_user_id?: string | null;
    notes?: string;
    assigned_by?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const db = createSovereignClient();
    const { error } = await db
      .from('compliance_calendar')
      .update(data)
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) { return { success: false, error: String(e) }; }
}

// =============================================================================
// DASHBOARD
// =============================================================================

const EMPTY_DASHBOARD: ComplianceDashboard = {
  total_staff: 0, dbs_issues: 0, rtw_issues: 0, appraisals_overdue: 0,
  training_gaps: 0, equipment_overdue: 0, equipment_due_soon: 0,
  cqc_score_pct: 0, cqc_answered: 0, cqc_total: 0, cqc_no_count: 0, cqc_partial_count: 0,
  governance_open: 0, governance_overdue: 0, calendar_overdue: 0, calendar_due_soon: 0,
};

export async function getComplianceDashboard(): Promise<ComplianceDashboard> {
  const session = await getStaffSession();
  if (!session) return EMPTY_DASHBOARD;
  const { tenantId } = session;
  try {
    const db = createSovereignClient();

    const [users, hrRecords, training, equipment, cqcAnswers, govLog, calendar] = await Promise.all([
      db.from('users').select('id'),
      db.from('compliance_hr_records').select('dbs_expiry_date, rtw_type, rtw_expiry_date, next_appraisal_date'),
      db.from('compliance_training').select('completed_date, expiry_date'),
      db.from('compliance_equipment').select('next_due_date'),
      db.from('compliance_cqc_answers').select('answer'),
      db.from('compliance_governance_log').select('status'),
      db.from('compliance_calendar').select('next_due_date'),
    ]);

    const totalStaff = users.data?.length ?? 0;

  // HR issues
  let dbsIssues = 0; let rtwIssues = 0; let appraisalsOverdue = 0;
  for (const r of hrRecords.data ?? []) {
    const hr = r as Record<string, unknown>;
    const dbs = computeDbsStatus(hr.dbs_expiry_date as string | null);
    if (dbs === 'expired' || dbs === 'due_soon') dbsIssues++;
    const rtw = computeRtwStatus(hr.rtw_expiry_date as string | null, hr.rtw_type as string | null);
    if (rtw === 'expired' || rtw === 'due_soon') rtwIssues++;
    const ap = computeAppraisalStatus(hr.next_appraisal_date as string | null);
    if (ap === 'overdue') appraisalsOverdue++;
  }

  // Training gaps (overdue entries)
  let trainingGaps = 0;
  for (const e of training.data ?? []) {
    const t = e as Record<string, unknown>;
    if (computeTrainingStatus(t.completed_date as string | null, t.expiry_date as string | null) === 'overdue') trainingGaps++;
  }

  // Equipment
  let equipOverdue = 0; let equipDueSoon = 0;
  for (const e of equipment.data ?? []) {
    const eq = e as Record<string, unknown>;
    const s = computeEquipmentStatus(eq.next_due_date as string | null);
    if (s === 'overdue') equipOverdue++;
    if (s === 'due_this_month') equipDueSoon++;
  }

  // CQC score
  const cqcRows = cqcAnswers.data ?? [];
  const cqcTotal = cqcRows.length;
  const cqcYes = cqcRows.filter((r) => (r as Record<string, unknown>).answer === 'yes').length;
  const cqcNo = cqcRows.filter((r) => (r as Record<string, unknown>).answer === 'no').length;
  const cqcPartial = cqcRows.filter((r) => (r as Record<string, unknown>).answer === 'partial').length;
  const cqcAnswered = cqcRows.filter((r) => (r as Record<string, unknown>).answer !== null).length;
  const cqcScore = cqcAnswered > 0 ? Math.round((cqcYes / cqcAnswered) * 100) : 0;

  // Governance
  let govOpen = 0; let govOverdue = 0;
  for (const e of govLog.data ?? []) {
    const g = e as Record<string, unknown>;
    if (g.status === 'open' || g.status === 'in_progress') govOpen++;
    if (g.status === 'overdue') govOverdue++;
  }

  // Calendar
  let calOverdue = 0; let calDueSoon = 0;
  for (const t of calendar.data ?? []) {
    const c = t as Record<string, unknown>;
    const s = computeCalendarStatus(c.next_due_date as string | null);
    if (s === 'overdue') calOverdue++;
    if (s === 'due_soon') calDueSoon++;
  }

  return {
    total_staff:         totalStaff,
    dbs_issues:          dbsIssues,
    rtw_issues:          rtwIssues,
    appraisals_overdue:  appraisalsOverdue,
    training_gaps:       trainingGaps,
    equipment_overdue:   equipOverdue,
    equipment_due_soon:  equipDueSoon,
    cqc_score_pct:       cqcScore,
    cqc_answered:        cqcAnswered,
    cqc_total:           cqcTotal,
    cqc_no_count:        cqcNo,
    cqc_partial_count:   cqcPartial,
    governance_open:     govOpen,
    governance_overdue:  govOverdue,
    calendar_overdue:    calOverdue,
      calendar_due_soon:   calDueSoon,
    };
  } catch { return EMPTY_DASHBOARD; }
}


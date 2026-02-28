'use server';

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// TYPES
// =============================================================================

export interface Patient {
  id: string;
  cliniko_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  notes: string | null;
  referral_source: string | null;
  created_in_cliniko_at: string | null;
  last_synced_at: string;
  created_at: string;
}

export interface PatientAppointment {
  id: string;
  cliniko_id: number;
  appointment_type: string | null;
  practitioner_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  status: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  invoice_status: string | null;
  room_name: string | null;
}

export interface PatientSummary {
  patient: Patient;
  appointment_count: number;
  last_appointment_at: string | null;
  next_appointment_at: string | null;
  latest_treatment: string | null;
}

// =============================================================================
// getPatients — list with optional search
// =============================================================================

export async function getPatients(
  search?: string,
): Promise<{ success: boolean; patients?: PatientSummary[]; total?: number; error?: string }> {
  try {
    const sovereign = createSovereignClient();

    let query = sovereign
      .from('cliniko_patients')
      .select('*')
      .order('last_name', { ascending: true })
      .limit(100);

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error('[patients] getPatients error:', error);
      return { success: false, error: error.message };
    }

    if (!rows || rows.length === 0) {
      return { success: true, patients: [], total: 0 };
    }

    // Fetch appointment stats for these patients in one query
    const clinikoIds = rows.map(r => r.cliniko_id);
    const { data: appts } = await sovereign
      .from('cliniko_appointments')
      .select('cliniko_patient_id, starts_at, appointment_type, status')
      .in('cliniko_patient_id', clinikoIds)
      .order('starts_at', { ascending: false });

    const apptsByPatient = new Map<number, typeof appts>();
    for (const appt of appts || []) {
      const pid = appt.cliniko_patient_id as number;
      if (!apptsByPatient.has(pid)) apptsByPatient.set(pid, []);
      apptsByPatient.get(pid)!.push(appt);
    }

    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patients: PatientSummary[] = rows.map((r: any) => {
      const patientAppts = apptsByPatient.get(r.cliniko_id) || [];
      const past = patientAppts.filter(a => a.starts_at && a.starts_at < now);
      const future = patientAppts.filter(a => a.starts_at && a.starts_at >= now);

      return {
        patient: {
          id: r.id,
          cliniko_id: r.cliniko_id,
          first_name: r.first_name || '',
          last_name: r.last_name || '',
          email: r.email || null,
          phone: r.phone || null,
          date_of_birth: r.date_of_birth || null,
          gender: r.gender || null,
          notes: r.notes || null,
          referral_source: r.referral_source || null,
          created_in_cliniko_at: r.created_in_cliniko_at || null,
          last_synced_at: r.last_synced_at,
          created_at: r.created_at,
        },
        appointment_count: past.length,
        last_appointment_at: past[0]?.starts_at || null,
        next_appointment_at: future.length > 0 ? future[future.length - 1].starts_at : null,
        latest_treatment: past[0]?.appointment_type || null,
      };
    });

    return { success: true, patients, total: rows.length };
  } catch (err) {
    console.error('[patients] getPatients threw:', err);
    return { success: false, error: 'Failed to load patients' };
  }
}

// =============================================================================
// getPatientDetail — single patient + full appointment history
// =============================================================================

export async function getPatientDetail(
  clinikoId: number,
): Promise<{ success: boolean; patient?: Patient; appointments?: PatientAppointment[]; error?: string }> {
  try {
    const sovereign = createSovereignClient();

    const [patientRes, apptsRes] = await Promise.all([
      sovereign.from('cliniko_patients').select('*').eq('cliniko_id', clinikoId).single(),
      sovereign
        .from('cliniko_appointments')
        .select('*')
        .eq('cliniko_patient_id', clinikoId)
        .order('starts_at', { ascending: false })
        .limit(50),
    ]);

    if (patientRes.error || !patientRes.data) {
      return { success: false, error: 'Patient not found' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = patientRes.data;
    const patient: Patient = {
      id: r.id,
      cliniko_id: r.cliniko_id,
      first_name: r.first_name || '',
      last_name: r.last_name || '',
      email: r.email || null,
      phone: r.phone || null,
      date_of_birth: r.date_of_birth || null,
      gender: r.gender || null,
      notes: r.notes || null,
      referral_source: r.referral_source || null,
      created_in_cliniko_at: r.created_in_cliniko_at || null,
      last_synced_at: r.last_synced_at,
      created_at: r.created_at,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appointments: PatientAppointment[] = (apptsRes.data || []).map((a: any) => ({
      id: a.id,
      cliniko_id: a.cliniko_id,
      appointment_type: a.appointment_type || null,
      practitioner_name: a.practitioner_name || null,
      starts_at: a.starts_at || null,
      ends_at: a.ends_at || null,
      duration_minutes: a.duration_minutes || null,
      status: a.status || null,
      cancellation_reason: a.cancellation_reason || null,
      notes: a.notes || null,
      invoice_status: a.invoice_status || null,
      room_name: a.room_name || null,
    }));

    return { success: true, patient, appointments };
  } catch (err) {
    console.error('[patients] getPatientDetail threw:', err);
    return { success: false, error: 'Failed to load patient detail' };
  }
}

// =============================================================================
// getPatientStats — aggregate numbers for header cards
// =============================================================================

export async function getPatientStats(): Promise<{
  success: boolean;
  stats?: {
    total: number;
    active_this_month: number;
    no_show_count: number;
    upcoming_today: number;
  };
  error?: string;
}> {
  try {
    const sovereign = createSovereignClient();

    const [totalRes, appointmentsRes] = await Promise.all([
      sovereign.from('cliniko_patients').select('id', { count: 'exact', head: true }),
      sovereign
        .from('cliniko_appointments')
        .select('cliniko_patient_id, starts_at, status')
        .gte('starts_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const total = totalRes.count ?? 0;
    const appts = appointmentsRes.data || [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const activeThisMonth = new Set(appts.map(a => a.cliniko_patient_id)).size;
    const noShows = appts.filter(a => a.status === 'Did Not Arrive').length;
    const upcomingToday = appts.filter(a => {
      if (!a.starts_at) return false;
      const d = new Date(a.starts_at);
      return d >= todayStart && d <= todayEnd;
    }).length;

    return {
      success: true,
      stats: {
        total,
        active_this_month: activeThisMonth,
        no_show_count: noShows,
        upcoming_today: upcomingToday,
      },
    };
  } catch (err) {
    console.error('[patients] getPatientStats threw:', err);
    return { success: false, error: 'Failed to load stats' };
  }
}

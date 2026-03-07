// =============================================================================
// GET /api/cliniko/debug
// Diagnostic endpoint — returns appointment counts from the DB to help
// diagnose why the calendar might not be showing real Cliniko appointments.
// Remove this file once debugging is complete.
// =============================================================================

import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = createSovereignClient();
  const now = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  const pad   = (n: number) => String(n).padStart(2, '0');
  const from  = `${year}-${pad(month)}-01`;
  const next  = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;

  try {
    // Total appointment count
    const { count: total } = await db
      .from('cliniko_appointments')
      .select('*', { count: 'exact', head: true });

    // Upcoming appointments (after now)
    const { count: upcoming } = await db
      .from('cliniko_appointments')
      .select('*', { count: 'exact', head: true })
      .gte('starts_at', now.toISOString())
      .not('status', 'in', '("cancelled","did_not_arrive")');

    // Current month appointments
    const { count: thisMonth } = await db
      .from('cliniko_appointments')
      .select('*', { count: 'exact', head: true })
      .gte('starts_at', from)
      .lt('starts_at', next)
      .not('status', 'in', '("cancelled","did_not_arrive")');

    // Sample 5 upcoming appointments with their actual starts_at values
    const { data: sample, error: sampleErr } = await db
      .from('cliniko_appointments')
      .select('id, cliniko_id, cliniko_patient_id, cliniko_practitioner_id, appointment_type, starts_at, status')
      .gte('starts_at', now.toISOString())
      .not('status', 'in', '("cancelled","did_not_arrive")')
      .order('starts_at', { ascending: true })
      .limit(5);

    // Status distribution
    const { data: statusCounts } = await db
      .from('cliniko_appointments')
      .select('status')
      .gte('starts_at', now.toISOString())
      .limit(500);

    const statusDist: Record<string, number> = {};
    (statusCounts ?? []).forEach(r => {
      const s = r.status ?? 'null';
      statusDist[s] = (statusDist[s] ?? 0) + 1;
    });

    // Patient count
    const { count: patients } = await db
      .from('cliniko_patients')
      .select('*', { count: 'exact', head: true });

    // Practitioner count
    const { count: practitioners } = await db
      .from('cliniko_practitioners')
      .select('*', { count: 'exact', head: true });

    // cliniko_id type (from first appointment)
    const { data: typeCheck } = await db
      .from('cliniko_appointments')
      .select('cliniko_id, cliniko_patient_id, cliniko_practitioner_id')
      .limit(1)
      .single();

    return NextResponse.json({
      db_state: {
        total_appointments:        total ?? 0,
        upcoming_appointments:     upcoming ?? 0,
        this_month_appointments:   thisMonth ?? 0,
        current_month:             `${year}-${pad(month)}`,
        patient_count:             patients ?? 0,
        practitioner_count:        practitioners ?? 0,
      },
      cliniko_id_type: typeCheck
        ? {
            cliniko_id:              typeof typeCheck.cliniko_id,
            cliniko_id_value:        String(typeCheck.cliniko_id),
            cliniko_patient_id:      typeof typeCheck.cliniko_patient_id,
            cliniko_patient_id_value: String(typeCheck.cliniko_patient_id),
          }
        : null,
      upcoming_sample: sample ?? [],
      sample_error:    sampleErr?.message ?? null,
      status_distribution_upcoming: statusDist,
      query_range: { from, to: next },
      server_time: now.toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

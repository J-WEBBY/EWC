// ONE-TIME MIGRATION ROUTE — DELETE AFTER USE
// Deduplicates cliniko_patients (keeps highest cliniko_id = has appointments)

import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

export async function POST() {
  const supabase = createSovereignClient();
  const results: string[] = [];

  // Fetch all patients ordered by cliniko_id DESC (highest first = has appointments)
  const { data: allPatients, error: fetchErr } = await supabase
    .from('cliniko_patients')
    .select('id, cliniko_id, first_name, last_name')
    .order('cliniko_id', { ascending: false });

  if (fetchErr || !allPatients) {
    return NextResponse.json({ error: 'Failed to fetch patients', detail: fetchErr?.message }, { status: 500 });
  }

  results.push(`total_before: ${allPatients.length}`);

  // Keep first occurrence per name (highest cliniko_id), mark rest for deletion
  const seen = new Map<string, boolean>();
  const toDelete: string[] = [];

  for (const p of allPatients) {
    const key = `${p.first_name}|${p.last_name}`;
    if (seen.has(key)) {
      toDelete.push(p.id);
    } else {
      seen.set(key, true);
    }
  }

  results.push(`duplicates_found: ${toDelete.length}`);

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('cliniko_patients')
      .delete()
      .in('id', toDelete);

    if (delErr) {
      results.push(`delete: FAILED — ${delErr.message}`);
    } else {
      results.push(`delete: ${toDelete.length} duplicates removed ✓`);
    }
  }

  const { count } = await supabase
    .from('cliniko_patients')
    .select('*', { count: 'exact', head: true });

  results.push(`total_after: ${count}`);

  return NextResponse.json({ success: true, results });
}

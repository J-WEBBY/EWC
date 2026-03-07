// =============================================================================
// POST /api/cliniko/backfill
//
// Fixes appointments that still have null appointment_type after running
// migration 049. This happens when raw_data came from an older sync where
// the Cliniko API didn't embed appointment_type_name inline.
//
// Strategy:
//  1. Fetch all appointment types from Cliniko (~100 types, one request)
//  2. Query appointments that still have null appointment_type, grab raw_data
//  3. Extract appointment_type_id from raw_data->'appointment_type'->'links'->>'self'
//  4. Map type_id → type_name, batch UPDATE in chunks of 500
//
// Returns JSON: { updated, skipped, error? }
// Remove this route once backfill is confirmed complete.
// =============================================================================

import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';
import { getClinikoClient } from '@/lib/cliniko/client';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60; // seconds — enough for 21k lookups (all in-DB after step 2)

export async function POST() {
  const supabase = createSovereignClient();

  // ── 1. Get Cliniko client ──────────────────────────────────────────────────
  const client = await getClinikoClient();
  if (!client) {
    return NextResponse.json({ error: 'Cliniko not connected' }, { status: 400 });
  }

  try {
    // ── 2. Fetch all appointment types (usually <100, single paginated call) ──
    const types = await client.getAppointmentTypes();
    if (!types.length) {
      return NextResponse.json({ updated: 0, skipped: 0, message: 'No appointment types found in Cliniko' });
    }

    // Build a map: type_id (string) → type_name
    const typeNameMap = new Map<string, string>();
    for (const t of types) {
      const idMatch = (t.links?.self ?? '').match(/\/(\d+)$/);
      if (idMatch) {
        typeNameMap.set(idMatch[1], t.name ?? 'Unknown');
      }
    }

    // ── 3. Page through appointments with null appointment_type ────────────────
    // Only fetch id + raw_data — we don't need anything else
    const PAGE = 1000;
    let offset = 0;
    let updated = 0;
    let skipped = 0; // rows where we couldn't find a type name

    while (true) {
      const { data: rows, error: fetchErr } = await supabase
        .from('cliniko_appointments')
        .select('id, raw_data')
        .is('appointment_type', null)
        .range(offset, offset + PAGE - 1);

      if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }

      if (!rows || rows.length === 0) break;

      // ── 4. Group appointment UUIDs by their Cliniko type_id ─────────────────
      const byTypeId = new Map<string, string[]>(); // typeId → [uuid, ...]

      for (const row of rows) {
        // Try to get the type ID from raw_data
        // Path A: raw_data.appointment_type.links.self (from /appointments endpoint)
        // Path B: raw_data.appointment_type_id (some Cliniko API versions)
        const rd = row.raw_data as Record<string, unknown> | null;
        if (!rd) { skipped++; continue; }

        let typeId: string | null = null;

        // Path A: appointment_type.links.self
        const atLinks = (rd.appointment_type as Record<string, unknown>)?.links as Record<string, string> | undefined;
        if (atLinks?.self) {
          const m = atLinks.self.match(/\/(\d+)$/);
          if (m) typeId = m[1];
        }

        // Path B: direct appointment_type_id field
        if (!typeId && rd.appointment_type_id) {
          typeId = String(rd.appointment_type_id);
        }

        if (!typeId) { skipped++; continue; }

        const typeName = typeNameMap.get(typeId);
        if (!typeName) { skipped++; continue; }

        if (!byTypeId.has(typeName)) byTypeId.set(typeName, []);
        byTypeId.get(typeName)!.push(row.id as string);
      }

      // ── 5. Batch UPDATE each type group in chunks of 500 ────────────────────
      const CHUNK = 500;
      for (const [typeName, ids] of Array.from(byTypeId.entries())) {
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const { error: updErr } = await supabase
            .from('cliniko_appointments')
            .update({ appointment_type: typeName })
            .in('id', chunk);

          if (updErr) {
            console.error(`[backfill] Update error for type "${typeName}":`, updErr.message);
          } else {
            updated += chunk.length;
          }
        }
      }

      if (rows.length < PAGE) break; // last page
      offset += PAGE;
    }

    return NextResponse.json({
      updated,
      skipped,
      type_count: typeNameMap.size,
      message: `Backfill complete. ${updated} appointments updated, ${skipped} skipped (no type ID in raw_data).`,
    });

  } catch (err) {
    console.error('[backfill] Unexpected error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

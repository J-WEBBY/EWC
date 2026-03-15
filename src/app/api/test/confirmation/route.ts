// =============================================================================
// TEST ENDPOINT — Booking Confirmation
// POST /api/test/confirmation
// Body: { phone: "+447...", firstName?: "Test" }
// Fires a booking confirmation message exactly as the automation would.
// Remove this file before production go-live.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { fireBookingConfirmation } from '@/lib/actions/booking-pipeline';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { phone?: string; firstName?: string };
    const phone     = body.phone ?? '';
    const firstName = body.firstName ?? 'Test';

    if (!phone) {
      return NextResponse.json({ error: 'phone required' }, { status: 400 });
    }

    await fireBookingConfirmation({
      patientName:      `${firstName} Patient`,
      firstName,
      phone,
      email:            null,
      appointmentType:  'Botox Consultation',
      practitionerName: 'Dr Suresh Ganata',
      startsAt:         new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // tomorrow
    });

    return NextResponse.json({ ok: true, message: 'Confirmation fired — check your phone and automation_communications table.' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

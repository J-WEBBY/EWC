// =============================================================================
// Tools: Cliniko write operations — create patient, book/cancel appointment,
// log communication note. Agents call Cliniko API directly, no DB cache.
// =============================================================================

import { getClinikoClient } from '@/lib/cliniko/client';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

// ── create_patient ─────────────────────────────────────────────────────────────

async function createPatientHandler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const client = await getClinikoClient();
    if (!client) return { content: 'Cliniko not connected.', isError: true };

    const firstName = typeof input.first_name === 'string' ? input.first_name.trim() : '';
    const lastName  = typeof input.last_name  === 'string' ? input.last_name.trim()  : '';
    if (!firstName || !lastName) {
      return { content: 'first_name and last_name are required.', isError: true };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = { first_name: firstName, last_name: lastName };
    if (typeof input.email === 'string' && input.email.trim()) body.email = input.email.trim();
    if (typeof input.phone === 'string' && input.phone.trim())
      body.phone_numbers = [{ number: input.phone.trim(), phone_type: 'Mobile' }];
    if (typeof input.date_of_birth   === 'string') body.date_of_birth   = input.date_of_birth.trim();
    if (typeof input.referral_source === 'string') body.referral_source = input.referral_source.trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patient = await client.createPatient(body) as any;
    const fullName = [patient.first_name, patient.last_name].filter(Boolean).join(' ');

    return {
      content: `Patient created: **${fullName}** (Cliniko ID: ${patient.id}).`,
      metadata: { patientId: String(patient.id), name: fullName },
    };
  } catch (err) {
    return { content: `Failed to create patient: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

export const createPatientTool: AgentTool = {
  name: 'create_patient',
  description: 'Create a new patient record in Cliniko. Use for new enquiries or leads.',
  input_schema: {
    type: 'object',
    properties: {
      first_name:      { type: 'string', description: 'Patient first name (required)' },
      last_name:       { type: 'string', description: 'Patient last name (required)' },
      email:           { type: 'string', description: 'Patient email address' },
      phone:           { type: 'string', description: 'Patient mobile number' },
      date_of_birth:   { type: 'string', description: 'Date of birth YYYY-MM-DD' },
      referral_source: { type: 'string', description: 'How the patient heard about the clinic' },
    },
    required: ['first_name', 'last_name'],
  },
  handler: createPatientHandler,
};

// ── book_appointment ───────────────────────────────────────────────────────────

async function bookAppointmentHandler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const client = await getClinikoClient();
    if (!client) return { content: 'Cliniko not connected.', isError: true };

    const patientId = typeof input.patient_id === 'string' ? input.patient_id.trim() : '';
    const startsAt  = typeof input.starts_at  === 'string' ? input.starts_at.trim()  : '';
    if (!patientId || !startsAt) {
      return { content: 'patient_id and starts_at are required.', isError: true };
    }

    const businessId = await client.getBusinessId();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = { patient_id: patientId, starts_at: startsAt, business_id: businessId };
    if (typeof input.practitioner_id     === 'string') body.practitioner_id     = input.practitioner_id.trim();
    if (typeof input.appointment_type_id === 'string') body.appointment_type_id = input.appointment_type_id.trim();
    if (typeof input.notes               === 'string') body.notes               = input.notes.trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appt = await client.createAppointment(body) as any;
    const typeName = appt.appointment_type?.name ?? 'Appointment';
    const startFmt = new Date(appt.starts_at).toLocaleString('en-GB');

    return {
      content: `Appointment booked: **${typeName}** on ${startFmt} for patient ${patientId} (ID: ${appt.id}).`,
      metadata: { appointmentId: String(appt.id), patientId, startsAt: appt.starts_at },
    };
  } catch (err) {
    return { content: `Failed to book appointment: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

export const bookAppointmentTool: AgentTool = {
  name: 'book_appointment',
  description: 'Book a new appointment in Cliniko for an existing patient.',
  input_schema: {
    type: 'object',
    properties: {
      patient_id:          { type: 'string', description: 'Cliniko patient ID (required)' },
      starts_at:           { type: 'string', description: 'Start datetime ISO e.g. 2026-03-20T10:00:00+00:00 (required)' },
      practitioner_id:     { type: 'string', description: 'Cliniko practitioner ID' },
      appointment_type_id: { type: 'string', description: 'Cliniko appointment type ID' },
      notes:               { type: 'string', description: 'Notes for this appointment' },
    },
    required: ['patient_id', 'starts_at'],
  },
  handler: bookAppointmentHandler,
};

// ── cancel_appointment ─────────────────────────────────────────────────────────

async function cancelAppointmentHandler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const client = await getClinikoClient();
    if (!client) return { content: 'Cliniko not connected.', isError: true };

    const apptId = typeof input.appointment_id === 'string' ? input.appointment_id.trim() : '';
    if (!apptId) return { content: 'appointment_id is required.', isError: true };

    const reason = typeof input.cancellation_reason === 'string'
      ? input.cancellation_reason.trim()
      : 'Cancelled by staff';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.updateAppointment(apptId, { cancellation_reason: reason } as any);

    return { content: `Appointment ${apptId} cancelled. Reason: ${reason}` };
  } catch (err) {
    return { content: `Failed to cancel: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

export const cancelAppointmentTool: AgentTool = {
  name: 'cancel_appointment',
  description: 'Cancel an existing appointment in Cliniko.',
  input_schema: {
    type: 'object',
    properties: {
      appointment_id:      { type: 'string', description: 'Cliniko appointment ID (required)' },
      cancellation_reason: { type: 'string', description: 'Reason for cancellation' },
    },
    required: ['appointment_id'],
  },
  handler: cancelAppointmentHandler,
};

// ── log_cliniko_note ───────────────────────────────────────────────────────────

async function logClinikoNoteHandler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  try {
    const client = await getClinikoClient();
    if (!client) return { content: 'Cliniko not connected.', isError: true };

    const patientId   = typeof input.patient_id === 'string' ? input.patient_id.trim() : '';
    const noteContent = typeof input.content    === 'string' ? input.content.trim()    : '';
    if (!patientId || !noteContent) return { content: 'patient_id and content are required.', isError: true };

    await client.createCommunicationNote({ content: noteContent, patient_id: parseInt(patientId, 10) });

    return { content: `Communication note logged to Cliniko for patient ${patientId}.` };
  } catch (err) {
    return { content: `Failed to log note: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

export const logClinikoNoteTool: AgentTool = {
  name: 'log_cliniko_note',
  description: 'Log a communication note on a patient record in Cliniko. Use after any patient interaction to keep the clinical record current.',
  input_schema: {
    type: 'object',
    properties: {
      patient_id: { type: 'string', description: 'Cliniko patient ID (required)' },
      content:    { type: 'string', description: 'Note content — what was discussed, any follow-up needed (required)' },
    },
    required: ['patient_id', 'content'],
  },
  handler: logClinikoNoteHandler,
};
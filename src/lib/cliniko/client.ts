// =============================================================================
// Cliniko API Client
// Auth: HTTP Basic — api_key as username, blank password
// Rate limit: 200 req/min — we throttle conservatively
// Pagination: per_page=100, follow links.next
// User-Agent required by Cliniko (returns 400 without it)
// =============================================================================

import type {
  ClinikoPractitionersResponse, ClinikoPractitioner,
  ClinikoPatientsResponse, ClinikoPatient,
  ClinikoAppointmentsResponse, ClinikoAppointment,
  ClinikoInvoicesResponse, ClinikoInvoice,
  ClinikoCommunicationNoteCreate, ClinikoCommunicationNote,
  ClinikoAppointmentType, ClinikoAppointmentTypesResponse,
  ClinikoBusinessesResponse, ClinikoPatientCreate,
} from './types';

const USER_AGENT = 'EWC-Intelligence/1.0 (admin@edgbastonwellness.co.uk)';
const PER_PAGE   = 100;
const RATE_DELAY = 350; // ms between paginated requests (~170 req/min, safe under 200 limit)

// Extract ID string from a Cliniko self-link: ".../patients/12345" → "12345"
// Must return string — Cliniko IDs exceed JS float64 precision (parseInt loses last digits)
function idFromLink(link: string): string | undefined {
  const m = link.match(/\/(\d+)$/);
  return m ? m[1] : undefined;
}

// Small delay helper for rate limiting
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// ClinikoClient
// =============================================================================

export class ClinikoClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(apiKey: string, shard = 'uk1') {
    this.baseUrl   = `https://api.${shard}.cliniko.com/v1`;
    // Cliniko Basic auth: api_key as username, empty password
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  }

  // ---------------------------------------------------------------------------
  // Core fetch wrapper
  // ---------------------------------------------------------------------------

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;

    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'User-Agent':    USER_AGENT,
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Cliniko API ${res.status} on ${path}: ${body}`);
    }

    // 204 No Content (e.g. DELETE)
    if (res.status === 204) return {} as T;

    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // Paginator — follows links.next automatically
  // ---------------------------------------------------------------------------

  private async paginate<T>(
    endpoint: string,
    key: string,
    params: Record<string, string> = {},
  ): Promise<T[]> {
    const results: T[] = [];
    const qs = new URLSearchParams({ per_page: String(PER_PAGE), ...params }).toString();
    let url: string | null = `${this.baseUrl}${endpoint}?${qs}`;

    while (url) {
      // eslint-disable-next-line no-await-in-loop
      const resp: Record<string, unknown> = await this.request<Record<string, unknown>>(url);
      const page = (resp[key] as T[]) ?? [];
      results.push(...page);
      url = (resp.links as Record<string, string>)?.next ?? null;
      if (url) await delay(RATE_DELAY);
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // READ — Practitioners
  // ---------------------------------------------------------------------------

  async getPractitioners(): Promise<ClinikoPractitioner[]> {
    return this.paginate<ClinikoPractitioner>('/practitioners', 'practitioners');
  }

  // ---------------------------------------------------------------------------
  // READ — Patients
  // ---------------------------------------------------------------------------

  async getPatients(updatedSince?: string): Promise<ClinikoPatient[]> {
    const params: Record<string, string> = updatedSince ? { updated_since: updatedSince } : {};
    return this.paginate<ClinikoPatient>('/patients', 'patients', params);
  }

  async getPatient(id: number): Promise<ClinikoPatient> {
    return this.request<ClinikoPatient>(`/patients/${id}`);
  }

  // ---------------------------------------------------------------------------
  // READ — Appointments
  // ---------------------------------------------------------------------------

  async getAppointments(updatedSince?: string): Promise<ClinikoAppointment[]> {
    const params: Record<string, string> = updatedSince ? { updated_since: updatedSince } : {};
    const appts = await this.paginate<ClinikoAppointment>(
      '/appointments', 'appointments', params,
    );

    // Enrich with extracted IDs from links
    return appts.map(a => ({
      ...a,
      patient_id:      idFromLink(a.patient?.links?.self ?? ''),
      practitioner_id: idFromLink(a.practitioner?.links?.self ?? ''),
    }));
  }

  async getAppointment(id: number): Promise<ClinikoAppointment> {
    return this.request<ClinikoAppointment>(`/appointments/${id}`);
  }

  // ---------------------------------------------------------------------------
  // READ — Invoices
  // ---------------------------------------------------------------------------

  async getInvoices(updatedSince?: string): Promise<ClinikoInvoice[]> {
    const params: Record<string, string> = updatedSince ? { updated_since: updatedSince } : {};
    const invoices = await this.paginate<ClinikoInvoice>(
      '/invoices', 'invoices', params,
    );

    return invoices.map(inv => ({
      ...inv,
      patient_id:      idFromLink(inv.patient?.links?.self ?? ''),
      practitioner_id: idFromLink(inv.practitioner?.links?.self ?? ''),
      appointment_id:  inv.appointment ? idFromLink(inv.appointment.links?.self ?? '') : null,
    }));
  }

  // ---------------------------------------------------------------------------
  // READ — Appointment Types
  // ---------------------------------------------------------------------------

  async getAppointmentTypes(): Promise<ClinikoAppointmentType[]> {
    return this.paginate<ClinikoAppointmentType>(
      '/appointment_types', 'appointment_types',
    );
  }

  // ---------------------------------------------------------------------------
  // READ — Businesses (to get the business_id for bookings)
  // ---------------------------------------------------------------------------

  async getBusinessId(): Promise<string | null> {
    const res = await this.request<ClinikoBusinessesResponse>('/businesses?per_page=1');
    const first = res.businesses?.[0];
    if (!first) return null;
    return idFromLink(first.links?.self ?? '') ?? null;
  }

  // ---------------------------------------------------------------------------
  // WRITE — Patient (create new patient in Cliniko from EWC lead)
  // ---------------------------------------------------------------------------

  async createPatient(body: ClinikoPatientCreate): Promise<ClinikoPatient> {
    return this.request<ClinikoPatient>('/patients', {
      method: 'POST',
      body:   JSON.stringify(body),
    });
  }

  // ---------------------------------------------------------------------------
  // WRITE — Communication Note (log calls/SMS back to Cliniko patient record)
  // ---------------------------------------------------------------------------

  async createCommunicationNote(
    body: ClinikoCommunicationNoteCreate,
  ): Promise<ClinikoCommunicationNote> {
    return this.request<ClinikoCommunicationNote>('/communication_notes', {
      method: 'POST',
      body:   JSON.stringify({ communication_note: body }),
    });
  }

  // ---------------------------------------------------------------------------
  // WRITE — Individual Appointment (book via EWC → writes to Cliniko)
  // Cliniko v1 uses /individual_appointments for single bookings.
  // IDs must be passed as strings in template literal to preserve float64 precision.
  // ---------------------------------------------------------------------------

  async createAppointment(body: {
    patient_id: string;
    practitioner_id: string;
    appointment_type_id: string;
    business_id: string;
    starts_at: string;   // ISO8601 with timezone e.g. 2026-03-15T10:00:00+00:00
    ends_at: string;     // ISO8601 with timezone
    notes?: string;
  }): Promise<ClinikoAppointment> {
    // Use template string to preserve large integer IDs (avoid JSON.stringify float64 rounding)
    const jsonBody = `{"starts_at":${JSON.stringify(body.starts_at)},"ends_at":${JSON.stringify(body.ends_at)},"practitioner_id":${body.practitioner_id},"appointment_type_id":${body.appointment_type_id},"patient_id":${body.patient_id},"business_id":${body.business_id}${body.notes ? `,"notes":${JSON.stringify(body.notes)}` : ''}}`;
    return this.request<ClinikoAppointment>('/individual_appointments', {
      method: 'POST',
      body:   jsonBody,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST CONNECTION — quick check the API key works
  // ---------------------------------------------------------------------------

  async testConnection(): Promise<{ ok: boolean; practitionerCount: number; error?: string }> {
    try {
      const data = await this.request<ClinikoPractitionersResponse>('/practitioners?per_page=1');
      return { ok: true, practitionerCount: data.total_entries ?? 0 };
    } catch (err) {
      return { ok: false, practitionerCount: 0, error: String(err) };
    }
  }
}

// =============================================================================
// Factory — reads config from DB and returns a ready client
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { ClinikoConfig } from './types';

export async function getClinikoClient(): Promise<ClinikoClient | null> {
  const supabase = createSovereignClient();
  const { data } = await supabase
    .from('cliniko_config')
    .select('api_key_encrypted, shard, is_connected')
    .single();

  if (!data?.api_key_encrypted || !data.is_connected) return null;

  return new ClinikoClient(data.api_key_encrypted, data.shard ?? 'uk1');
}

export async function getClinikoConfig(): Promise<ClinikoConfig | null> {
  const supabase = createSovereignClient();
  const { data } = await supabase
    .from('cliniko_config')
    .select('*')
    .single();
  return data ?? null;
}

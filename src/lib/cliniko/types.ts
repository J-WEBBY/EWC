// =============================================================================
// Cliniko API — Response Types
// UK shard: api.uk1.cliniko.com/v1
// Docs: https://github.com/redguava/cliniko-api
// =============================================================================

// Shared link structure Cliniko uses for related resources
export interface ClinikoLink {
  self: string;
}

export interface ClinikoLinks {
  next?: string;
  self?: string;
}

// =============================================================================
// PRACTITIONER
// =============================================================================

export interface ClinikoPractitioner {
  id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  designation: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  links: { self: string };
}

export interface ClinikoPractitionersResponse {
  practitioners: ClinikoPractitioner[];
  total_entries: number;
  links: ClinikoLinks;
}

// =============================================================================
// PATIENT
// =============================================================================

export interface ClinikoPhoneNumber {
  number: string;
  phone_type: string; // 'Mobile', 'Home', 'Work'
}

export interface ClinikoPatient {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;       // 'YYYY-MM-DD'
  gender_identity: string | null;
  phone_numbers: ClinikoPhoneNumber[];
  address_1: string | null;
  address_2: string | null;
  address_3: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  post_code: string | null;
  notes: string | null;
  referral_source: string | null;
  occupation: string | null;
  emergency_contact: string | null;
  created_at: string;
  updated_at: string;
  links: { self: string };
  // Cliniko may include nested objects
  invoices?: { links: { self: string } };
  appointments?: { links: { self: string } };
}

export interface ClinikoPatientsResponse {
  patients: ClinikoPatient[];
  total_entries: number;
  links: ClinikoLinks;
}

// =============================================================================
// APPOINTMENT
// =============================================================================

export interface ClinikoAppointment {
  id: number;
  starts_at: string;                  // ISO8601
  ends_at: string;                    // ISO8601
  duration_in_minutes: number;
  notes: string | null;
  patient_arrived: boolean;
  did_not_arrive: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancellation_note: string | null;
  email_confirmation_sent: boolean;
  sms_confirmation_sent: boolean;
  online_booking_policy_accepted: boolean | null;
  repeat_rule: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // Related resource links
  patient: { links: ClinikoLink };
  practitioner: { links: ClinikoLink };
  appointment_type: { links: ClinikoLink };
  business: { links: ClinikoLink };
  // Extracted IDs (strings to preserve full precision — Cliniko IDs exceed JS float64)
  patient_id?: string;
  practitioner_id?: string;
  appointment_type_name?: string;
  links: { self: string };
}

export interface ClinikoAppointmentsResponse {
  appointments: ClinikoAppointment[];
  total_entries: number;
  links: ClinikoLinks;
}

// =============================================================================
// APPOINTMENT TYPE
// =============================================================================

export interface ClinikoAppointmentType {
  id: number;
  name: string;
  duration_in_minutes: number;
  color: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// INVOICE
// =============================================================================

export interface ClinikoInvoiceItem {
  id: number;
  name: string;
  quantity: number;
  unit_price: string;
  total_including_tax: string;
  tax_name: string | null;
  tax_rate: string | null;
}

export interface ClinikoInvoice {
  id: number;
  number: string | null;
  issue_date: string | null;         // 'YYYY-MM-DD'
  due_date: string | null;
  status: string | null;             // 'draft', 'issued', 'paid', 'overdue'
  total: string;                     // decimal string e.g. "150.00"
  total_excluding_tax: string;
  tax: string;
  outstanding_amount: string;
  amount_paid: string;
  notes: string | null;
  invoice_to: string | null;
  created_at: string;
  updated_at: string;
  patient: { links: ClinikoLink };
  practitioner: { links: ClinikoLink };
  appointment: { links: ClinikoLink } | null;
  invoice_items: ClinikoInvoiceItem[];
  // Parsed IDs (strings to preserve full precision)
  patient_id?: string;
  practitioner_id?: string;
  appointment_id?: string | null;
  links: { self: string };
}

export interface ClinikoInvoicesResponse {
  invoices: ClinikoInvoice[];
  total_entries: number;
  links: ClinikoLinks;
}

// =============================================================================
// COMMUNICATION NOTE (write-back)
// =============================================================================

export interface ClinikoCommunicationNoteCreate {
  content: string;
  patient_id: number;
  practitioner_id?: number;
}

export interface ClinikoCommunicationNote {
  id: number;
  content: string;
  created_at: string;
  updated_at: string;
  patient: { links: ClinikoLink };
  links: { self: string };
}

// =============================================================================
// CONFIG (stored in cliniko_config table)
// =============================================================================

export interface ClinikoConfig {
  id: string;
  api_key_encrypted: string | null;
  api_url: string;
  shard: string;
  is_connected: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  sync_error: string | null;
  settings: Record<string, unknown>;
}

// =============================================================================
// SYNC RESULT
// =============================================================================

export interface SyncResult {
  success: boolean;
  type: 'patients' | 'appointments' | 'invoices' | 'practitioners' | 'full';
  records_synced: number;
  records_failed: number;
  error?: string;
  duration_ms: number;
}

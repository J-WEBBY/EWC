// =============================================================================
// AUTOMATION REGISTRY — types and predefined workflows
// No 'use server' — this is a shared constants module
// =============================================================================

export type AutomationTriggerType = 'schedule' | 'event' | 'manual';
export type AutomationCategory = 'patient_care' | 'revenue';
export type AutomationStatus = 'success' | 'partial' | 'failed' | null;

export interface AutomationConfig {
  id: string;
  name: string;
  description: string;
  trigger_type: AutomationTriggerType;
  trigger_description: string;
  category: AutomationCategory;
  is_active: boolean;
  icon: string;
  channels: string[];  // e.g. ['WhatsApp', 'SMS', 'Voice']
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  automation_name: string;
  triggered_by: 'system' | 'user' | 'agent';
  triggered_by_label: string;
  started_at: string;
  status: 'success' | 'partial' | 'failed';
  actions_fired: number;
  summary: string;
}

export const AUTOMATION_REGISTRY: AutomationConfig[] = [

  // ── PATIENT CARE ────────────────────────────────────────────────────────────

  {
    id: 'booking_reminder',
    name: 'Booking Reminder',
    description: 'Sends automated appointment reminders to patients 24 hours before and again 2 hours before their scheduled appointment. Personalised with the patient\'s name, treatment, practitioner, and clinic address. Reduces no-shows significantly.',
    trigger_type: 'schedule',
    trigger_description: 'Daily — 24 h and 2 h before each upcoming appointment',
    category: 'patient_care',
    is_active: true,
    icon: 'Bell',
    channels: ['WhatsApp', 'SMS'],
  },
  {
    id: 'booking_confirmation',
    name: 'Booking Confirmation',
    description: 'Instantly sends a personalised confirmation message when a new appointment is booked in Cliniko. Includes appointment date and time, practitioner name, treatment, clinic address, and a calendar invite link.',
    trigger_type: 'event',
    trigger_description: 'When new appointment created in Cliniko',
    category: 'patient_care',
    is_active: true,
    icon: 'CalendarCheck',
    channels: ['WhatsApp', 'SMS'],
  },
  {
    id: 'after_appointment_followup',
    name: 'After Appointment Follow-up',
    description: 'Sends treatment-specific aftercare instructions 24 hours after every appointment, then follows up 72 hours later to check in on results. E.g. Botox: avoid strenuous exercise for 24h. Filler: avoid alcohol and extreme heat for 48h.',
    trigger_type: 'event',
    trigger_description: '24 hours after appointment completed',
    category: 'patient_care',
    is_active: false,
    icon: 'BookOpen',
    channels: ['WhatsApp'],
  },
  {
    id: 'patient_care',
    name: 'Patient Care',
    description: 'Identifies patients overdue for repeat appointments based on their treatment type and average rebooking interval. Sends a personalised check-in message referencing their last specific treatment and recommending their next step.',
    trigger_type: 'schedule',
    trigger_description: 'Daily at 9:00 AM — checks all treatment rebooking windows',
    category: 'patient_care',
    is_active: true,
    icon: 'Heart',
    channels: ['WhatsApp'],
  },
  {
    id: 'no_show_followup',
    name: 'No-show Follow-up',
    description: 'When a patient is marked "Did Not Arrive" in Cliniko, triggers an AI outbound call 2 hours later to rebook. If unanswered after 2 attempts, sends a WhatsApp message with a direct rebooking link.',
    trigger_type: 'event',
    trigger_description: 'When appointment marked Did Not Arrive in Cliniko',
    category: 'patient_care',
    is_active: true,
    icon: 'PhoneOff',
    channels: ['Voice', 'WhatsApp'],
  },
  {
    id: 're_engagement',
    name: 'Re-engagement Sweep',
    description: 'Finds patients who have not booked in 90+ days and sends a personalised message referencing their last specific treatment. Escalates to an AI outbound call after 14 days of no response.',
    trigger_type: 'schedule',
    trigger_description: 'Weekly on Monday at 8:00 AM',
    category: 'patient_care',
    is_active: true,
    icon: 'RotateCcw',
    channels: ['WhatsApp', 'Voice'],
  },

  // ── REVENUE ─────────────────────────────────────────────────────────────────

  {
    id: 'appointment_payment_link',
    name: 'Appointment Payment Link',
    description: 'Sends a Stripe payment link via SMS/WhatsApp within 30 seconds of a new appointment being created in Cliniko. Includes service name, amount due, and deposit terms. Automatically marks invoice as paid on completion.',
    trigger_type: 'event',
    trigger_description: 'When new appointment created in Cliniko',
    category: 'revenue',
    is_active: false,
    icon: 'CreditCard',
    channels: ['SMS', 'WhatsApp'],
  },
  {
    id: 'overdue_payment_reminder',
    name: 'Overdue Payment Reminder',
    description: 'Escalating reminders for unpaid Cliniko invoices: SMS at 3 days overdue, WhatsApp at 7 days, AI outbound call at 14 days. A signal is raised at 21 days for manual review by the team.',
    trigger_type: 'schedule',
    trigger_description: 'Daily — checks invoices overdue by 3, 7, 14, and 21 days',
    category: 'revenue',
    is_active: false,
    icon: 'AlertCircle',
    channels: ['SMS', 'WhatsApp', 'Voice'],
  },
];

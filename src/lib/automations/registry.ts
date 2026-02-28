// =============================================================================
// AUTOMATION REGISTRY — types and predefined workflows
// No 'use server' — this is a shared constants module
// =============================================================================

export type AutomationTriggerType = 'schedule' | 'event' | 'manual';
export type AutomationCategory = 'patient_care' | 'revenue' | 'compliance' | 'sync' | 'voice';
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
    id: 'b12_followup',
    name: 'B12 Follow-up (3 Months)',
    description: 'Identifies patients who received a B12 injection 3 months ago and sends a personalised WhatsApp message: "Time for your next B12 boost — energy and immunity support."',
    trigger_type: 'schedule',
    trigger_description: 'Daily at 9:00 AM — targets patients 90 days post-B12',
    category: 'patient_care',
    is_active: false,
    icon: 'Syringe',
  },
  {
    id: 'botox_followup',
    name: 'Botox Follow-up (4 Months)',
    description: 'Contacts patients who had Botox 4 months ago with a personalised message: "Ready to refresh your look? Your results will be fading around now."',
    trigger_type: 'schedule',
    trigger_description: 'Daily at 9:00 AM — targets patients 120 days post-Botox',
    category: 'patient_care',
    is_active: false,
    icon: 'Sparkles',
  },
  {
    id: 'filler_followup',
    name: 'Filler Follow-up (6 Months)',
    description: 'Reaches out to patients 6 months after their dermal filler treatment with a top-up recommendation and direct booking link.',
    trigger_type: 'schedule',
    trigger_description: 'Daily at 9:00 AM — targets patients 180 days post-filler',
    category: 'patient_care',
    is_active: false,
    icon: 'Droplets',
  },
  {
    id: 'coolsculpting_checkin',
    name: 'CoolSculpting Results Check-in (8 Weeks)',
    description: 'Sends a warm check-in message 8 weeks after a CoolSculpting session: "How are your results looking? We\'d love to hear how you\'re feeling." Opens conversation for a follow-up booking.',
    trigger_type: 'schedule',
    trigger_description: 'Daily at 9:00 AM — targets patients 56 days post-CoolSculpting',
    category: 'patient_care',
    is_active: false,
    icon: 'Snowflake',
  },
  {
    id: 'treatment_reminder',
    name: 'General Treatment Reminder Sweep',
    description: 'Catches all other treatment types not covered by specific follow-up rules. Identifies patients overdue for repeat appointments based on their treatment category and average rebooking interval.',
    trigger_type: 'schedule',
    trigger_description: 'Daily at 9:00 AM',
    category: 'patient_care',
    is_active: true,
    icon: 'Clock',
  },
  {
    id: 'no_show_followup',
    name: 'No-show Follow-up',
    description: 'When a patient is marked "Did Not Arrive" in Cliniko, triggers an AI outbound call 2 hours later to rebook. If unanswered, sends a WhatsApp rebooking link.',
    trigger_type: 'event',
    trigger_description: 'When appointment → Did Not Arrive in Cliniko',
    category: 'patient_care',
    is_active: true,
    icon: 'PhoneOff',
  },
  {
    id: 're_engagement',
    name: 'Re-engagement Sweep',
    description: 'Finds patients who have not booked in 90+ days and sends a personalised message referencing their last specific treatment. Escalates to AI outbound call after 14 days of no response.',
    trigger_type: 'schedule',
    trigger_description: 'Weekly on Monday at 8:00 AM',
    category: 'patient_care',
    is_active: true,
    icon: 'RotateCcw',
  },
  {
    id: 'post_treatment_education',
    name: 'Post-Treatment Care Guide',
    description: 'Sends treatment-specific aftercare instructions 24 hours after every appointment. E.g. Botox: avoid strenuous exercise for 24h. Filler: avoid alcohol and extreme heat for 48h.',
    trigger_type: 'event',
    trigger_description: '24 hours after appointment completed',
    category: 'patient_care',
    is_active: false,
    icon: 'BookOpen',
  },

  // ── REVENUE ─────────────────────────────────────────────────────────────────

  {
    id: 'appointment_payment_link',
    name: 'Appointment Payment Link',
    description: 'Sends a Stripe payment link via SMS/WhatsApp within 30 seconds of a new appointment being created in Cliniko. Includes service name, amount, and deposit terms.',
    trigger_type: 'event',
    trigger_description: 'When new appointment created in Cliniko',
    category: 'revenue',
    is_active: false,
    icon: 'CreditCard',
  },
  {
    id: 'overdue_payment_reminder',
    name: 'Overdue Payment Reminder',
    description: 'Escalating reminders for unpaid Cliniko invoices: SMS at 3 days, WhatsApp at 7 days, AI outbound call at 14 days. Signals created at 21 days for manual review.',
    trigger_type: 'schedule',
    trigger_description: 'Daily — checks for invoices overdue 3, 7, 14, 21 days',
    category: 'revenue',
    is_active: false,
    icon: 'AlertCircle',
  },
  {
    id: 'new_lead_outreach',
    name: 'Missed Call / New Lead Outreach',
    description: 'When a call is missed or a new web enquiry is received, the AI voice receptionist makes an outbound call within 15 minutes. If unanswered, sends WhatsApp with booking link.',
    trigger_type: 'event',
    trigger_description: 'When missed call detected (Vapi) or enquiry form submitted',
    category: 'revenue',
    is_active: false,
    icon: 'Target',
  },
  {
    id: 'referral_credit',
    name: 'Referral Credit Processing',
    description: 'When a referred patient completes their first booking, automatically credits the referrer\'s account and sends a thank-you message with credit confirmation.',
    trigger_type: 'event',
    trigger_description: 'When referred patient completes first appointment',
    category: 'revenue',
    is_active: false,
    icon: 'Gift',
  },

  // ── COMPLIANCE ───────────────────────────────────────────────────────────────

  {
    id: 'compliance_check',
    name: 'Compliance Check Reminder',
    description: 'Creates staff signals for weekly equipment checks, PAT testing status, DBS/certification expiries, and upcoming regulatory submission deadlines.',
    trigger_type: 'schedule',
    trigger_description: 'Weekly on Friday at 4:00 PM',
    category: 'compliance',
    is_active: false,
    icon: 'CheckSquare',
  },

  // ── SYNC ────────────────────────────────────────────────────────────────────

  {
    id: 'cliniko_sync',
    name: 'Cliniko Data Sync',
    description: 'Pulls the latest patients, appointments, and invoices from the Cliniko API into the platform database. Keeps all patient data current for AI analysis and automation triggers.',
    trigger_type: 'schedule',
    trigger_description: 'Every hour',
    category: 'sync',
    is_active: false,
    icon: 'RefreshCw',
  },
];

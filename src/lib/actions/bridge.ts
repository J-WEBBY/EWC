'use server';

import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================

export type ChannelType = 'email' | 'slack' | 'teams' | 'internal' | 'webhook';
export type MessagePriority = 'urgent' | 'high' | 'normal' | 'low';
export type MessageStatus = 'unread' | 'read' | 'archived' | 'snoozed' | 'flagged';
export type MessageCategory = 'action_required' | 'fyi' | 'approval' | 'escalation' | 'update' | 'social';

export interface BridgeMessage {
  id: string;
  channel: ChannelType;
  channel_detail: string;          // e.g. "#alerts-critical", "joe@uoo.co.uk"
  sender_name: string;
  sender_avatar: string | null;    // initials fallback
  subject: string;
  preview: string;
  body: string;
  priority: MessagePriority;
  status: MessageStatus;
  category: MessageCategory;
  department: string | null;
  has_attachments: boolean;
  attachment_count: number;
  thread_count: number;            // number of replies
  is_starred: boolean;
  received_at: string;
  snoozed_until: string | null;
}

export interface ThreadReply {
  id: string;
  message_id: string;
  sender_name: string;
  sender_avatar: string | null;
  content: string;
  channel: ChannelType;
  sent_at: string;
  is_own: boolean;
}

export interface BridgeStats {
  total_unread: number;
  action_required: number;
  awaiting_approval: number;
  snoozed: number;
  by_channel: Record<ChannelType, number>;
  by_priority: Record<MessagePriority, number>;
}

export interface SmartReply {
  id: string;
  text: string;
  tone: 'professional' | 'friendly' | 'brief';
}

// =============================================================================
// SIMULATED MESSAGES
// Week 1: Realistic messages for demo purposes
// Week 2: Replace with real Twilio/email/Slack integration
// =============================================================================

const now = new Date();
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000).toISOString();

const SIMULATED_MESSAGES: BridgeMessage[] = [
  {
    id: 'msg-001',
    channel: 'email',
    channel_detail: 'l.kenning@brindleyplace-legal.co.uk',
    sender_name: 'Laura Kenning',
    sender_avatar: null,
    subject: 'Corporate Wellness Enquiry — Brindleyplace Legal (180 employees)',
    preview: 'We are looking to establish a corporate wellness programme for our Birmingham office...',
    body: `Dear Edgbaston Wellness Clinic,

My name is Laura Kenning, HR Director at Brindleyplace Legal LLP. We have 180 employees based at our Birmingham city centre office and are actively looking to establish a corporate wellness programme for 2026.

We are particularly interested in:
• Quarterly IV therapy sessions
• Annual health screening packages
• GP consultations for senior partners
• Weight management support

We would love to arrange a brief call or visit to your clinic to discuss partnership options. Our budget for this programme is approximately £30,000–£45,000 per annum.

Could you please let me know if this is something Edgbaston Wellness Clinic would be interested in exploring? We are hoping to launch the programme by April 2026.

Kind regards,
Laura Kenning
HR Director, Brindleyplace Legal LLP
T: 0121 234 5678`,
    priority: 'high',
    status: 'unread',
    category: 'action_required',
    department: null,
    has_attachments: false,
    attachment_count: 0,
    thread_count: 0,
    is_starred: true,
    received_at: ago(90),
    snoozed_until: null,
  },
  {
    id: 'msg-002',
    channel: 'internal',
    channel_detail: 'Aria · Signal Alert',
    sender_name: 'Aria (EWC)',
    sender_avatar: null,
    subject: '8 Missed Calls This Week — Revenue Impact: ~£4,800',
    preview: 'I detected 8 unanswered inbound calls between 8–9am and 5–7pm this week...',
    body: `Hi Dr Ganata,

I've identified 8 missed inbound calls this week that went unanswered during peak enquiry windows (8:00–9:00am and 5:00–7:00pm). Based on your average consultation booking rate:

• Estimated missed revenue: £3,200–£6,400
• Most common caller window: Tuesday–Thursday evenings

These enquirers are likely to call competitors if not followed up within 24 hours.

Recommended actions:
1. Enable Vapi.ai voice receptionist to handle out-of-hours calls automatically
2. Review current reception staffing hours
3. Consider a callback campaign to known callers (if call log available)

I've created a signal for this — you can review it in the Signals section.

— Aria`,
    priority: 'high',
    status: 'unread',
    category: 'action_required',
    department: null,
    has_attachments: false,
    attachment_count: 0,
    thread_count: 0,
    is_starred: false,
    received_at: ago(240),
    snoozed_until: null,
  },
  {
    id: 'msg-003',
    channel: 'email',
    channel_detail: 'patient.enquiries@ewclinic.co.uk',
    sender_name: 'Emma Richardson',
    sender_avatar: null,
    subject: 'B12 Injection Prices — Do you offer courses?',
    preview: 'Hello, I came across your clinic online and was wondering about your B12...',
    body: `Hello,

I came across Edgbaston Wellness Clinic on Instagram and I'm very interested in your B12 injections. I've been feeling very fatigued lately and my GP mentioned this might help.

Could you please let me know:
1. What are your prices for a single B12 injection?
2. Do you offer a course of injections at a reduced rate?
3. Is a consultation required first?
4. What is your earliest available appointment?

I'm in the Harborne area so your location would be very convenient.

Many thanks,
Emma Richardson`,
    priority: 'normal',
    status: 'unread',
    category: 'action_required',
    department: null,
    has_attachments: false,
    attachment_count: 0,
    thread_count: 0,
    is_starred: false,
    received_at: ago(180),
    snoozed_until: null,
  },
  {
    id: 'msg-004',
    channel: 'webhook',
    channel_detail: 'Cliniko → Appointment Booked',
    sender_name: 'Cliniko System',
    sender_avatar: null,
    subject: 'New Booking: CoolSculpting Consultation — Sophie Harte',
    preview: 'Appointment confirmed: CoolSculpting Consultation · Mon 24 Feb, 10:30am...',
    body: `New appointment booked via online booking portal:

Patient: Sophie Harte (new patient)
Treatment: CoolSculpting Body Consultation
Date: Monday 24 February 2026, 10:30am
Duration: 45 minutes
Practitioner: Dr Suresh Ganata
Room: Consultation Room 2

Patient notes: Interested in abdomen and flank treatment. Saw Instagram ad.

This appointment has been confirmed and added to the clinic calendar.

— Cliniko`,
    priority: 'low',
    status: 'read',
    category: 'fyi',
    department: null,
    has_attachments: false,
    attachment_count: 0,
    thread_count: 0,
    is_starred: false,
    received_at: ago(20),
    snoozed_until: null,
  },
  {
    id: 'msg-005',
    channel: 'email',
    channel_detail: 'accounts@allergan-aesthetics.co.uk',
    sender_name: 'Allergan Aesthetics',
    sender_avatar: null,
    subject: 'Invoice INV-2026-0218 — Juvederm Restorer Product Order · £1,840',
    preview: 'Please find attached your invoice for recent product order. Payment due...',
    body: `Dear Edgbaston Wellness Clinic,

Please find attached Invoice INV-2026-0218 for your recent product order.

Products supplied:
• Juvederm Ultra 2 (1ml) × 12 units — £780
• Juvederm Ultra 3 (1ml) × 8 units — £680
• Juvederm Voluma (2ml) × 3 units — £380

Total: £1,840 (inc. VAT)
Payment due: 14 March 2026
Account reference: EWC-22891

Payment details are on the attached invoice. Please contact our accounts team if you have any queries.

Kind regards,
Allergan Aesthetics Accounts Team`,
    priority: 'normal',
    status: 'unread',
    category: 'approval',
    department: null,
    has_attachments: true,
    attachment_count: 1,
    thread_count: 0,
    is_starred: false,
    received_at: ago(60 * 3),
    snoozed_until: null,
  },
  {
    id: 'msg-006',
    channel: 'email',
    channel_detail: 'j.thorpe@highfield-hr.co.uk',
    sender_name: 'James Thorpe',
    sender_avatar: null,
    subject: 'RE: Outstanding Invoice #EWC-2025-147 — Response Required',
    preview: 'I wanted to follow up on the outstanding invoice for our October–November...',
    body: `Dear Edgbaston Wellness Clinic,

I am following up regarding your invoice #EWC-2025-147 for £4,200 (October–November corporate wellness package).

I understand there may have been an issue with our accounts processing. Our new accounts manager, Jessica, joined in January and has been working through the backlog.

I have escalated this to Jessica and have asked her to process payment by end of next week (28 Feb 2026). I apologise for the delay.

Please confirm whether you require any additional documentation to process the payment (e.g. updated purchase order reference).

Kind regards,
James Thorpe
Operations Director, Highfield HR Solutions`,
    priority: 'urgent',
    status: 'flagged',
    category: 'action_required',
    department: null,
    has_attachments: false,
    attachment_count: 0,
    thread_count: 2,
    is_starred: true,
    received_at: ago(60 * 5),
    snoozed_until: null,
  },
  {
    id: 'msg-007',
    channel: 'internal',
    channel_detail: 'Aria · Compliance Alert',
    sender_name: 'Aria (EWC)',
    sender_avatar: null,
    subject: 'CQC Inspection: 14 Days — 3 Outstanding Documentation Items',
    preview: 'Your CQC inspection is scheduled for 8 March 2026. I have identified 3 gaps...',
    body: `Dr Ganata,

Your CQC inspection is scheduled for 8 March 2026 — 14 days from today. I have reviewed your compliance documentation and identified 3 outstanding items that require attention before the inspection:

1. CPD Log (Dr Ganata) — Last updated: August 2025. Must be current to within 6 months.
2. Annual Infection Control Audit — Due: December 2025. Not yet filed.
3. Patient Safety Incident Report template — The 2024 template is in use; the 2025 updated format is required.

These are direct requirements under CQC's Key Question 5 (Well-led). Inspectors specifically check CPD evidence and incident reporting frameworks.

I recommend scheduling time this week to address these. I can help draft the documentation if needed — just ask in the chat.

— Aria`,
    priority: 'urgent',
    status: 'unread',
    category: 'action_required',
    department: null,
    has_attachments: false,
    attachment_count: 0,
    thread_count: 0,
    is_starred: false,
    received_at: ago(30),
    snoozed_until: null,
  },
  {
    id: 'msg-008',
    channel: 'email',
    channel_detail: 'review-alerts@google.com',
    sender_name: 'Google Business Profile',
    sender_avatar: null,
    subject: 'New review on your Google Business Profile (3 stars)',
    preview: 'You have a new review from Michael T: "Clinic itself is beautiful and staff very...',
    body: `You have received a new review on your Google Business Profile for Edgbaston Wellness Clinic.

Reviewer: Michael T.
Rating: ★★★☆☆ (3 stars)
Review: "Clinic itself is beautiful and staff very friendly and professional. Docked stars because I waited 25 minutes past my appointment time with no explanation. The treatment itself was excellent and I'd probably return, but the waiting was frustrating."

Responding to reviews — even critical ones — improves your search ranking and shows prospective patients that you care. We recommend responding within 48 hours.

View and respond at: business.google.com/reviews`,
    priority: 'normal',
    status: 'unread',
    category: 'action_required',
    department: null,
    has_attachments: false,
    attachment_count: 0,
    thread_count: 0,
    is_starred: false,
    received_at: ago(60 * 18),
    snoozed_until: null,
  },
  {
    id: 'msg-009',
    channel: 'webhook',
    channel_detail: 'Cliniko → Cancellation',
    sender_name: 'Cliniko System',
    sender_avatar: null,
    subject: 'Appointment Cancelled: Botox Session — Rachel Morrison (Fri 21 Feb)',
    preview: 'Appointment cancelled online: Botox Anti-Wrinkle · Rachel Morrison...',
    body: `Appointment cancellation received via patient portal:

Patient: Rachel Morrison (returning patient)
Treatment: Botox Anti-Wrinkle (forehead + glabella)
Cancelled date: Friday 21 February 2026, 2:00pm
Reason given: "Unable to make it — will rebook"
Notice given: 6 hours

Slot is now available. The gap in the Friday afternoon schedule may be fillable with a same-day patient.

Note: Rachel has cancelled twice in the past 3 months. Aria may be worth flagging this pattern.

— Cliniko`,
    priority: 'low',
    status: 'read',
    category: 'fyi',
    department: null,
    has_attachments: false,
    attachment_count: 0,
    thread_count: 0,
    is_starred: false,
    received_at: ago(60 * 6),
    snoozed_until: null,
  },
  {
    id: 'msg-010',
    channel: 'email',
    channel_detail: 'noreply@ico.org.uk',
    sender_name: 'ICO (Information Commissioner\'s Office)',
    sender_avatar: null,
    subject: 'Annual Data Protection Fee Renewal — Due 15 March 2026',
    preview: 'Your annual data protection fee for Edgbaston Wellness Ltd is due for renewal...',
    body: `Dear Data Controller,

Your annual data protection fee for Edgbaston Wellness Ltd (Registration reference: ZA123456) is due for renewal.

Renewal date: 15 March 2026
Fee due: £60 (Tier 1 — small business)
Payment options: Direct Debit, online, phone

As a healthcare provider processing special category data (health records), ICO registration is a legal requirement under the UK GDPR. Failure to renew may result in a penalty.

Renew online at: ico.org.uk/fees

If you have any queries, contact our fee team on 0303 123 1113.

Information Commissioner's Office`,
    priority: 'high',
    status: 'unread',
    category: 'action_required',
    department: null,
    has_attachments: false,
    attachment_count: 0,
    thread_count: 0,
    is_starred: false,
    received_at: ago(60 * 24 * 2),
    snoozed_until: null,
  },
];

const SIMULATED_THREADS: Record<string, ThreadReply[]> = {
  'msg-006': [
    {
      id: 'r-006-1',
      message_id: 'msg-006',
      sender_name: 'Edgbaston Wellness Clinic',
      sender_avatar: null,
      content: 'Dear James, thank you for your email regarding Invoice #EWC-2025-147. We note your intention to process payment by 28 February. We would appreciate confirmation once this has been processed. Kind regards, Admin Team.',
      channel: 'email',
      sent_at: ago(60 * 4),
      is_own: true,
    },
    {
      id: 'r-006-2',
      message_id: 'msg-006',
      sender_name: 'James Thorpe',
      sender_avatar: null,
      content: 'Confirmed — Jessica will process this by 28 Feb. We apologise again for the inconvenience.',
      channel: 'email',
      sent_at: ago(60 * 3.5),
      is_own: false,
    },
  ],
};

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getMessages(
  _tenantId: string,
  filters?: {
    channel?: ChannelType;
    status?: MessageStatus;
    category?: MessageCategory;
    priority?: MessagePriority;
    search?: string;
  },
): Promise<{ success: boolean; messages?: BridgeMessage[]; error?: string }> {
  let messages = [...SIMULATED_MESSAGES];

  if (filters?.channel) messages = messages.filter(m => m.channel === filters.channel);
  if (filters?.status) messages = messages.filter(m => m.status === filters.status);
  if (filters?.category) messages = messages.filter(m => m.category === filters.category);
  if (filters?.priority) messages = messages.filter(m => m.priority === filters.priority);
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    messages = messages.filter(m =>
      m.subject.toLowerCase().includes(q) ||
      m.sender_name.toLowerCase().includes(q) ||
      m.preview.toLowerCase().includes(q),
    );
  }

  return { success: true, messages };
}

export async function getThread(
  _tenantId: string,
  messageId: string,
): Promise<{ success: boolean; replies?: ThreadReply[]; error?: string }> {
  return { success: true, replies: SIMULATED_THREADS[messageId] || [] };
}

export async function getBridgeStats(
  _tenantId: string,
): Promise<{ success: boolean; stats?: BridgeStats; error?: string }> {
  const msgs = SIMULATED_MESSAGES;
  const unread = msgs.filter(m => m.status === 'unread').length;
  const actionReq = msgs.filter(m => m.category === 'action_required' && m.status !== 'archived').length;
  const approval = msgs.filter(m => m.category === 'approval' && m.status !== 'archived').length;
  const snoozed = msgs.filter(m => m.status === 'snoozed').length;

  const byChannel: Record<ChannelType, number> = { email: 0, slack: 0, teams: 0, internal: 0, webhook: 0 };
  const byPriority: Record<MessagePriority, number> = { urgent: 0, high: 0, normal: 0, low: 0 };

  for (const m of msgs) {
    byChannel[m.channel]++;
    byPriority[m.priority]++;
  }

  return {
    success: true,
    stats: {
      total_unread: unread,
      action_required: actionReq,
      awaiting_approval: approval,
      snoozed,
      by_channel: byChannel,
      by_priority: byPriority,
    },
  };
}

export async function generateSmartReplies(
  _tenantId: string,
  _userId: string,
  messageBody: string,
  aiName: string,
): Promise<{ success: boolean; replies?: SmartReply[]; error?: string }> {
  try {
    const anthropic = getAnthropicClient();
    const msg = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 300,
      temperature: 0.6,
      system: `You are ${aiName}, an AI assistant for Edgbaston Wellness Clinic. Generate exactly 3 smart reply suggestions for the message below. Return valid JSON array: [{"id":"1","text":"...","tone":"professional"},{"id":"2","text":"...","tone":"friendly"},{"id":"3","text":"...","tone":"brief"}]. Each reply should be 1-2 sentences. No markdown.`,
      messages: [{ role: 'user', content: messageBody.slice(0, 500) }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]';
    const parsed = JSON.parse(text) as SmartReply[];
    return { success: true, replies: parsed };
  } catch {
    return {
      success: true,
      replies: [
        { id: '1', text: 'Thank you for your message. We\'ll review and respond shortly.', tone: 'professional' },
        { id: '2', text: 'Thanks for getting in touch — I\'ll look into this and follow up today.', tone: 'friendly' },
        { id: '3', text: 'Acknowledged. Will action.', tone: 'brief' },
      ],
    };
  }
}

export async function markMessageStatus(
  _tenantId: string,
  _messageId: string,
  _status: MessageStatus,
): Promise<{ success: boolean; error?: string }> {
  // Week 2: persist to DB / email API
  return { success: true };
}

export async function toggleStar(
  _tenantId: string,
  _messageId: string,
): Promise<{ success: boolean; error?: string }> {
  // Week 2: persist to DB
  return { success: true };
}

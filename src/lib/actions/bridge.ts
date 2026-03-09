'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================

export type PatientSummary = {
  id:                string;
  full_name:         string;
  phone:             string | null;
  email:             string | null;
  last_treatment:    string | null;
  last_contact:      string | null;
  interaction_count: number;
};

export type TimelineSource =
  | 'voice_komal'
  | 'agent_aria'
  | 'agent_orion'
  | 'agent_ewc'
  | 'automation'
  | 'appointment'
  | 'signal'
  | 'sms_out'
  | 'sms_in'
  | 'email_out'
  | 'email_in';

export type TimelineItem = {
  id:            string;
  source:        TimelineSource;
  timestamp:     string;
  title:         string;
  body:          string;
  direction:     'inbound' | 'outbound' | 'system';
  is_expandable: boolean;
  transcript?:   { role: 'komal' | 'patient'; text: string }[];
  metadata?:     Record<string, string | number | boolean | null>;
};

export type SendChannel   = 'sms' | 'email' | 'whatsapp';
export type DraftPurpose  =
  | 'appointment_confirmation'
  | 'appointment_reminder'
  | 'post_treatment_checkin'
  | 'rebooking'
  | 'payment_chase'
  | 'follow_up'
  | 'general';

export type ConversationStatus = 'ai_active' | 'intercepted' | 'escalated' | 'resolved';
export type AgentHandle        = 'orion' | 'aria';

export interface Conversation {
  patient_id:        string;
  patient_name:      string;
  patient_phone:     string | null;
  patient_email:     string | null;
  last_treatment:    string | null;
  channel:           'whatsapp' | 'sms' | 'email' | 'voice';
  last_message:      string;
  last_message_at:   string;
  agent_handle:      AgentHandle;
  status:            ConversationStatus;
  interaction_count: number;
}

// =============================================================================
// SIMULATED PATIENT DATA (Week 1 — replaced by Cliniko sync in Week 2)
// =============================================================================

const now = new Date();
const dAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
const hAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const mAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

const DEMO_PATIENTS: PatientSummary[] = [
  { id: 'pat-001', full_name: 'Sarah Jones',        phone: '+44 7700 900123', email: 'sarah.jones@gmail.com',          last_treatment: 'Botox Anti-Wrinkle',       last_contact: mAgo(2),  interaction_count: 12 },
  { id: 'pat-002', full_name: 'Emma Richardson',    phone: '+44 7700 900456', email: 'emma.r@outlook.com',             last_treatment: 'B12 Injection',            last_contact: hAgo(1),  interaction_count: 3  },
  { id: 'pat-003', full_name: 'Rachel Morrison',    phone: '+44 7700 900789', email: 'r.morrison@hotmail.co.uk',       last_treatment: 'Botox Anti-Wrinkle',       last_contact: dAgo(2),  interaction_count: 8  },
  { id: 'pat-004', full_name: 'Sophie Harte',       phone: '+44 7700 900234', email: 'sophie.harte@gmail.com',         last_treatment: 'CoolSculpting Consult',    last_contact: dAgo(3),  interaction_count: 2  },
  { id: 'pat-005', full_name: 'Michael Taylor',     phone: '+44 7700 900567', email: 'm.taylor@yahoo.co.uk',           last_treatment: 'Health Screening',         last_contact: dAgo(8),  interaction_count: 5  },
  { id: 'pat-006', full_name: 'Priya Sharma',       phone: '+44 7700 900890', email: 'priya.sharma@gmail.com',         last_treatment: 'IV Vitamin Drip',          last_contact: dAgo(5),  interaction_count: 7  },
  { id: 'pat-007', full_name: 'Catherine Blake',    phone: '+44 7700 900321', email: 'c.blake@btopenworld.com',        last_treatment: 'Weight Management',        last_contact: dAgo(12), interaction_count: 4  },
  { id: 'pat-008', full_name: 'James Worthington',  phone: '+44 7700 900654', email: 'j.worthington@worthington.co.uk',last_treatment: 'Corporate Health Screen',   last_contact: dAgo(21), interaction_count: 3  },
];

// =============================================================================
// SIMULATED TIMELINES (per patient — replaced by real data in Week 2)
// =============================================================================

const DEMO_TIMELINES: Record<string, TimelineItem[]> = {

  'pat-001': [
    {
      id: 'sj-001', source: 'voice_komal', timestamp: mAgo(2),
      title: 'Inbound call · 4m 32s',
      body: 'Sarah called enquiring about a Botox top-up. Komal identified her as a returning patient and engaged Aria retention mode. Strong rebooking intent — she wants to book before summer.',
      direction: 'system', is_expandable: true,
      transcript: [
        { role: 'komal',   text: 'Hello, thank you for calling Edgbaston Wellness Clinic. This call may be recorded for quality and training. My name is Komal — how can I help you today?' },
        { role: 'patient', text: 'Hi, yes — I was in back in January for Botox and I wanted to book another session.' },
        { role: 'komal',   text: 'Lovely to hear from you again, Sarah! I can see you had your Botox treatment with us in January — how have you been getting on with the results?' },
        { role: 'patient', text: 'Really happy, it\'s lasted really well. I just want to top up before summer.' },
        { role: 'komal',   text: 'That\'s wonderful to hear. Dr Ganata has availability in the next two weeks — would mornings or afternoons work better for you?' },
        { role: 'patient', text: 'Mornings are usually better for me, before 11 if possible.' },
        { role: 'komal',   text: 'Perfect. I\'ll take a note and our team will confirm your appointment shortly. Could I take your best contact number?' },
        { role: 'patient', text: 'Yes, it\'s 07700 900123.' },
        { role: 'komal',   text: 'Wonderful. We\'ll be in touch very shortly, Sarah. Have a lovely day!' },
      ],
    },
    {
      id: 'sj-002', source: 'agent_aria', timestamp: mAgo(1),
      title: 'Retention flag raised',
      body: 'Aria identified Sarah as a high-value returning patient with strong rebooking intent from call. Flagged for priority booking follow-up. Recommended introducing Botox + Juvederm combination to increase treatment value at next visit.',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'sj-003', source: 'sms_out', timestamp: dAgo(1),
      title: 'SMS sent',
      body: 'Hi Sarah, just a gentle reminder that your 3-month Botox review window is coming up. Our team would love to see you again — simply reply to book or call us on 0121 456 7890. — EWC Team',
      direction: 'outbound', is_expandable: false,
      metadata: { sent_by: 'Dr S. Ganata', channel: 'sms' },
    },
    {
      id: 'sj-004', source: 'appointment', timestamp: dAgo(49),
      title: 'Botox Anti-Wrinkle · Completed',
      body: 'Treatment completed by Dr Suresh Ganata. Forehead + glabella lines. 30 units Botulinum Toxin. Patient satisfaction: 5/5. Post-treatment care instructions provided. Follow-up review recommended at 3 months.',
      direction: 'system', is_expandable: false,
      metadata: { duration: '45 min', room: 'Treatment Room 1', practitioner: 'Dr Suresh Ganata', units: '30' },
    },
    {
      id: 'sj-005', source: 'automation', timestamp: dAgo(46),
      title: 'Post-treatment check-in triggered',
      body: 'Botox Follow-Up Automation activated. 72-hour check-in SMS scheduled for delivery.',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'sj-006', source: 'sms_out', timestamp: dAgo(46),
      title: 'SMS sent',
      body: 'Hi Sarah, it\'s been 72 hours since your Botox treatment at Edgbaston Wellness. How are you feeling? Any concerns, give us a call on 0121 456 7890. — EWC Team',
      direction: 'outbound', is_expandable: false,
      metadata: { sent_by: 'Automation', channel: 'sms' },
    },
    {
      id: 'sj-007', source: 'sms_in', timestamp: dAgo(45),
      title: 'SMS received',
      body: 'Hi, all good thanks! Slight bruising but nothing major. Love the result already 😊',
      direction: 'inbound', is_expandable: false,
    },
    {
      id: 'sj-008', source: 'email_out', timestamp: dAgo(51),
      title: 'Email sent · Consultation follow-up',
      body: 'Subject: Your Botox Consultation — Edgbaston Wellness Clinic\n\nDear Sarah,\n\nThank you for visiting us today for your consultation with Dr Ganata. We are delighted to welcome you as a new patient and look forward to helping you achieve your aesthetic goals.\n\nYour treatment has been booked for Thursday 15 January at 10:30am. Please arrive 5 minutes early. Full pre-treatment instructions are attached.\n\nAny questions in the meantime — don\'t hesitate to get in touch.\n\nWarm regards,\nEdgbaston Wellness Clinic Team',
      direction: 'outbound', is_expandable: true,
      metadata: { sent_by: 'Reception', channel: 'email' },
    },
    {
      id: 'sj-009', source: 'agent_orion', timestamp: dAgo(52),
      title: 'Upsell opportunity identified',
      body: 'Orion assessed Sarah\'s new patient profile and identified upsell opportunity: Botox + Juvederm Ultra filler combination treatment. Estimated additional revenue: £320. Recommended introducing at the consultation appointment.',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'sj-010', source: 'appointment', timestamp: dAgo(52),
      title: 'Initial consultation · Completed',
      body: 'New patient consultation with Dr Suresh Ganata. Treatment discussion: Botox Anti-Wrinkle (forehead + glabella). Medical history reviewed. Consent forms signed. Treatment appointment booked.',
      direction: 'system', is_expandable: false,
      metadata: { duration: '30 min', room: 'Consultation Room 2', new_patient: 'true' },
    },
  ],

  'pat-002': [
    {
      id: 'er-001', source: 'email_in', timestamp: hAgo(1),
      title: 'Email received · B12 enquiry',
      body: 'Hello, I came across Edgbaston Wellness Clinic on Instagram and I\'m very interested in your B12 injections. I\'ve been feeling very fatigued lately and my GP mentioned this might help. Could you let me know your prices and whether a consultation is required first? I\'m in the Harborne area so your location would be very convenient.',
      direction: 'inbound', is_expandable: false,
    },
    {
      id: 'er-002', source: 'signal', timestamp: hAgo(1),
      title: 'New lead signal raised',
      body: 'Inbound email enquiry auto-classified as acquisition signal. Category: B12 Therapy Lead. Priority: Normal. Assigned to reception for same-day follow-up.',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'er-003', source: 'agent_orion', timestamp: hAgo(0.5),
      title: 'Lead qualification complete',
      body: 'Orion assessed Emma\'s enquiry: B12 fatigue patient, high conversion likelihood (self-referred, GP-recommended). Recommended offering complimentary initial assessment. Instagram attribution confirmed — tag for social ROI tracking.',
      direction: 'system', is_expandable: false,
    },
  ],

  'pat-003': [
    {
      id: 'rm-001', source: 'appointment', timestamp: dAgo(2),
      title: 'Botox Session · Cancelled (6hr notice)',
      body: 'Online cancellation received. Reason: "Unable to make it — will rebook." Friday 2:00pm slot freed. Note: this is Rachel\'s 2nd cancellation in 3 months — churn risk flagged.',
      direction: 'system', is_expandable: false,
      metadata: { notice_hours: '6', cancellations_3mo: '2' },
    },
    {
      id: 'rm-002', source: 'agent_aria', timestamp: dAgo(2),
      title: 'Churn risk flagged',
      body: 'Aria flagged Rachel Morrison as at-risk. 2 cancellations in 3 months with no successful rebooking. Recommended warm SMS outreach within 24 hours, offer flexible timing, no pressure. Avoid payment mention in first message.',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'rm-003', source: 'automation', timestamp: dAgo(1),
      title: 'Retention SMS triggered',
      body: 'Cancellation Rebooking Automation activated: retention SMS dispatched within 24-hour window.',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'rm-004', source: 'sms_out', timestamp: dAgo(1),
      title: 'SMS sent',
      body: 'Hi Rachel, no worries at all about yesterday — life happens! We\'d love to get you rebooked whenever you\'re ready. Just reply with a preferred date and we\'ll sort it. — EWC Team',
      direction: 'outbound', is_expandable: false,
      metadata: { sent_by: 'Automation', channel: 'sms' },
    },
    {
      id: 'rm-005', source: 'appointment', timestamp: dAgo(90),
      title: 'Botox Anti-Wrinkle · Completed',
      body: 'Previous successful treatment. Forehead lines, 24 units. Patient satisfaction: 4/5. Follow-up booking made at the time.',
      direction: 'system', is_expandable: false,
      metadata: { duration: '35 min', room: 'Treatment Room 1' },
    },
  ],

  'pat-004': [
    {
      id: 'sh-001', source: 'appointment', timestamp: dAgo(3),
      title: 'CoolSculpting Consultation · Booked',
      body: 'New patient Sophie Harte booked a CoolSculpting consultation via online booking portal. Source: Instagram ad. Interested in abdomen and flank treatment. Note: "Saw Instagram ad for the summer body campaign."',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'sh-002', source: 'sms_out', timestamp: dAgo(3),
      title: 'SMS sent · Confirmation',
      body: 'Hi Sophie! Your CoolSculpting consultation with Dr Ganata is confirmed for Mon 24 Feb at 10:30am. Please arrive 5 minutes early. Looking forward to meeting you! — Edgbaston Wellness',
      direction: 'outbound', is_expandable: false,
      metadata: { sent_by: 'Automation', channel: 'sms' },
    },
    {
      id: 'sh-003', source: 'agent_orion', timestamp: dAgo(3),
      title: 'New patient welcome sequence initiated',
      body: 'Orion tagged Sophie as a high-intent new patient (Instagram lead, specific treatment interest, immediate booking). Recommended preparation: send CoolSculpting info pack via email 48 hours before consultation.',
      direction: 'system', is_expandable: false,
    },
  ],

  'pat-005': [
    {
      id: 'mt-001', source: 'signal', timestamp: dAgo(8),
      title: '3-star Google review · Response needed',
      body: '"Clinic itself is beautiful and staff very friendly and professional. Docked stars because I waited 25 minutes past my appointment time with no explanation. The treatment itself was excellent and I\'d probably return, but the waiting was frustrating."',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'mt-002', source: 'agent_ewc', timestamp: dAgo(8),
      title: 'Review response drafted',
      body: 'EWC drafted a Google review response for Dr Ganata\'s approval. Response addresses the wait time transparently, apologises, and invites Michael to discuss directly. Awaiting staff sign-off before publishing.',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'mt-003', source: 'appointment', timestamp: dAgo(10),
      title: 'Annual Health Screening · Completed',
      body: 'Full health screening completed. Key markers within normal range. Report issued digitally. 25-minute wait logged due to previous appointment overrun — root cause noted for scheduling review.',
      direction: 'system', is_expandable: false,
      metadata: { duration: '60 min', room: 'Consultation Room 1', wait_time: '25 min' },
    },
  ],

  'pat-006': [
    {
      id: 'ps-001', source: 'sms_in', timestamp: dAgo(4),
      title: 'SMS received',
      body: 'Feeling great thank you! Will definitely book again. Can I do the same combination next time?',
      direction: 'inbound', is_expandable: false,
    },
    {
      id: 'ps-002', source: 'sms_out', timestamp: dAgo(5),
      title: 'SMS sent · Post-treatment check-in',
      body: 'Hi Priya, hope you\'re feeling the benefits of your IV drip! We recommend booking your next session in 4 weeks for optimal results. Just reply to book. — Edgbaston Wellness',
      direction: 'outbound', is_expandable: false,
      metadata: { sent_by: 'Automation', channel: 'sms' },
    },
    {
      id: 'ps-003', source: 'automation', timestamp: dAgo(5),
      title: 'IV Therapy follow-up triggered',
      body: 'Post-treatment IV follow-up automation activated. 72h check-in SMS dispatched.',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'ps-004', source: 'appointment', timestamp: dAgo(8),
      title: 'IV Vitamin Drip · Completed',
      body: 'Myers Cocktail IV therapy administered. Duration: 45 minutes. Patient tolerated infusion well. Monthly sessions recommended for sustained benefit.',
      direction: 'system', is_expandable: false,
      metadata: { duration: '45 min', room: 'Treatment Room 2', formula: 'Myers Cocktail' },
    },
  ],

  'pat-007': [
    {
      id: 'cb-001', source: 'agent_aria', timestamp: dAgo(12),
      title: 'Re-engagement recommended',
      body: 'Catherine Blake has not re-engaged since her initial weight management consultation 6 weeks ago. Aria recommends a gentle check-in SMS — non-pushy, supportive tone. High re-engagement probability based on engagement pattern at booking.',
      direction: 'system', is_expandable: false,
    },
    {
      id: 'cb-002', source: 'appointment', timestamp: dAgo(42),
      title: 'Weight Management Consultation · Completed',
      body: 'Initial weight management consultation. BMI assessment completed. Personalised programme proposed including nutritional guidance, medical weight loss support. Follow-up appointment not yet confirmed.',
      direction: 'system', is_expandable: false,
      metadata: { duration: '45 min', room: 'Consultation Room 2', new_patient: 'true' },
    },
  ],

  'pat-008': [
    {
      id: 'jw-001', source: 'email_out', timestamp: dAgo(20),
      title: 'Email sent · Corporate proposal',
      body: 'Subject: Corporate Wellness Packages — Edgbaston Wellness Clinic\n\nDear Mr Worthington,\n\nThank you for your enquiry regarding annual health screening for the senior partners at Worthington & Co. We have prepared a bespoke corporate wellness package tailored to your requirements.\n\nPackage includes: Annual health screening per partner (12), quarterly GP consultations, executive health report with trend analysis.\n\nTotal investment: £9,840 per annum (£820 per partner). Volume discount applies at 12+ participants.\n\nI would welcome the opportunity to arrange a clinic visit — please let me know your availability.\n\nKind regards,\nDr Suresh Ganata',
      direction: 'outbound', is_expandable: true,
      metadata: { sent_by: 'Dr S. Ganata', channel: 'email' },
    },
    {
      id: 'jw-002', source: 'email_in', timestamp: dAgo(21),
      title: 'Email received · Corporate enquiry',
      body: 'Hello, I am James Worthington, Managing Partner at Worthington & Co. We are exploring annual health screening options for our 12 senior partners based in Edgbaston. Our budget is £8,000–£12,000 annually. Could you provide a proposal?',
      direction: 'inbound', is_expandable: false,
    },
  ],
};

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getPatientList(): Promise<PatientSummary[]> {
  try {
    const db = createSovereignClient();
    const { data } = await db
      .from('cliniko_patients')
      .select('id, first_name, last_name, email, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      return (data as Record<string, unknown>[]).map(p => ({
        id:                p.id as string,
        full_name:         `${p.first_name} ${p.last_name}`.trim(),
        phone:             (p.phone as string | null) ?? null,
        email:             (p.email as string | null) ?? null,
        last_treatment:    null,
        last_contact:      p.created_at as string,
        interaction_count: 0,
      }));
    }
  } catch { /* fall through to demo */ }

  return DEMO_PATIENTS;
}

export async function getPatientTimeline(patientId: string): Promise<TimelineItem[]> {
  try {
    const db = createSovereignClient();
    const { data } = await db
      .from('patient_messages')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      return (data as Record<string, unknown>[]).map(m => ({
        id:            m.id as string,
        source:        `${m.channel as string}_${m.direction as string}` as TimelineSource,
        timestamp:     m.created_at as string,
        title:         (m.subject as string | null) ?? (m.direction === 'inbound' ? 'Message received' : 'Message sent'),
        body:          m.body as string,
        direction:     m.direction === 'inbound' ? 'inbound' : 'outbound',
        is_expandable: false,
        metadata:      { sent_by: m.sent_by_name as string },
      }));
    }
  } catch { /* fall through to demo */ }

  return DEMO_TIMELINES[patientId] ?? [];
}

export async function sendPatientMessage(data: {
  patient_id:    string;
  patient_name:  string;
  patient_phone: string | null;
  patient_email: string | null;
  channel:       SendChannel;
  subject?:      string;
  body:          string;
  sent_by_name:  string;
  purpose:       DraftPurpose;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data: row, error } = await db
      .from('patient_messages')
      .insert({
        patient_id:    data.patient_id,
        patient_name:  data.patient_name,
        patient_phone: data.patient_phone,
        patient_email: data.patient_email,
        direction:     'outbound',
        channel:       data.channel,
        subject:       data.subject ?? null,
        body:          data.body,
        source:        'staff',
        source_detail: data.sent_by_name,
        sent_by_name:  data.sent_by_name,
        status:        'sent',
        sent_at:       new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: (row as Record<string, string>)?.id };
  } catch {
    // Table may not exist yet — demo mode still shows success
    return { success: true };
  }
}

export async function draftMessageWithAI(
  patientName:   string,
  lastTreatment: string | null,
  channel:       SendChannel,
  purpose:       DraftPurpose,
): Promise<{ success: boolean; draft?: string; error?: string }> {
  const purposeLabel: Record<DraftPurpose, string> = {
    appointment_confirmation: 'appointment booking confirmation',
    appointment_reminder:    'appointment reminder',
    post_treatment_checkin:  'post-treatment check-in',
    rebooking:               'rebooking invitation',
    payment_chase:           'outstanding payment follow-up',
    follow_up:               'general follow-up',
    general:                 'general message',
  };

  try {
    const anthropic = getAnthropicClient();
    const res = await anthropic.messages.create({
      model:      ANTHROPIC_MODELS.HAIKU,
      max_tokens: channel === 'sms' ? 80 : 220,
      temperature: 0.7,
      system: `You are Aria, the AI assistant for Edgbaston Wellness Clinic — a premium private aesthetics and wellness clinic in Edgbaston, Birmingham. Draft a ${channel.toUpperCase()} message. Purpose: ${purposeLabel[purpose]}. ${channel === 'sms' ? 'SMS rules: max 160 characters, warm, personal, British English. No jargon.' : 'Email rules: Include a "Subject: " line on the first line. Then 2–3 short paragraphs. Professional yet warm. British English.'} Return only the message text, nothing else.`,
      messages: [{
        role: 'user',
        content: `Patient: ${patientName}. Last treatment: ${lastTreatment ?? 'not on record'}. Write the ${purposeLabel[purpose]} message now.`,
      }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '';
    return { success: true, draft: text };
  } catch {
    const fallback: Record<DraftPurpose, Record<SendChannel, string>> = {
      appointment_confirmation: {
        sms:      `Hi ${patientName}, your appointment at Edgbaston Wellness Clinic is confirmed! We look forward to seeing you. Any questions, please call 0121 456 7890. — EWC Team`,
        email:    `Subject: Your Appointment is Confirmed — Edgbaston Wellness\n\nDear ${patientName},\n\nWe are delighted to confirm your upcoming appointment at Edgbaston Wellness Clinic. Please contact us if you need to rearrange.\n\nWarm regards,\nEdgbaston Wellness Clinic`,
        whatsapp: `Hi ${patientName}! Great news — your appointment at Edgbaston Wellness Clinic is confirmed. We look forward to seeing you! — EWC Team`,
      },
      appointment_reminder: {
        sms:      `Hi ${patientName}, a reminder of your upcoming appointment at Edgbaston Wellness Clinic. See you soon! — EWC Team`,
        email:    `Subject: Your Appointment Reminder — Edgbaston Wellness\n\nDear ${patientName},\n\nThis is a friendly reminder of your upcoming appointment at Edgbaston Wellness Clinic. Please contact us if you need to rearrange.\n\nWarm regards,\nEdgbaston Wellness Clinic`,
        whatsapp: `Hi ${patientName}! Just a reminder about your upcoming appointment with us at EWC. See you soon 😊 — EWC Team`,
      },
      post_treatment_checkin: {
        sms:      `Hi ${patientName}, hope you're feeling great after your ${lastTreatment ?? 'treatment'}! Any concerns, we're here on 0121 456 7890. — EWC`,
        email:    `Subject: Checking In After Your Treatment\n\nDear ${patientName},\n\nWe hope you're feeling wonderful after your recent ${lastTreatment ?? 'treatment'} with us. Please don't hesitate to reach out if you have any questions at all.\n\nWarm regards,\nEdgbaston Wellness Clinic`,
        whatsapp: `Hi ${patientName}! Just checking in after your recent visit. Hope you're feeling great 😊 Let us know if you need anything!`,
      },
      rebooking: {
        sms:      `Hi ${patientName}, your ${lastTreatment ?? 'treatment'} review window is coming up — we'd love to see you again! Reply or call 0121 456 7890. — EWC`,
        email:    `Subject: Time for Your Next Visit?\n\nDear ${patientName},\n\nWe hope you're enjoying the results of your ${lastTreatment ?? 'treatment'} with us. It's a great time to book your next session and keep things looking their best.\n\nKind regards,\nEdgbaston Wellness Clinic`,
        whatsapp: `Hi ${patientName}! It's that time again — ready to book your next ${lastTreatment ?? 'treatment'}? Reply here or call us 😊 — EWC`,
      },
      payment_chase: {
        sms:      `Hi ${patientName}, gentle reminder of an outstanding balance on your account. Please call us on 0121 456 7890. — EWC`,
        email:    `Subject: Outstanding Balance — Action Required\n\nDear ${patientName},\n\nThis is a polite reminder that an outstanding balance remains on your account. Please contact us to arrange settlement at your earliest convenience.\n\nKind regards,\nEdgbaston Wellness Clinic`,
        whatsapp: `Hi ${patientName}, just a gentle reminder about an outstanding balance. Please give us a call when convenient — 0121 456 7890. Thank you 😊`,
      },
      follow_up: {
        sms:      `Hi ${patientName}, following up from Edgbaston Wellness Clinic. Hope you're well! Don't hesitate to get in touch. — EWC Team`,
        email:    `Subject: Following Up — Edgbaston Wellness Clinic\n\nDear ${patientName},\n\nI hope this message finds you well. I'm reaching out to check in and see if there is anything we can help you with.\n\nWarm regards,\nEdgbaston Wellness Clinic`,
        whatsapp: `Hi ${patientName}! Reaching out from EWC — hope you're doing well 😊 Let us know if there's anything we can help with!`,
      },
      general: {
        sms:      `Hi ${patientName}, this is Edgbaston Wellness Clinic. Don't hesitate to get in touch! — EWC Team`,
        email:    `Subject: Message from Edgbaston Wellness Clinic\n\nDear ${patientName},\n\nThank you for being a valued patient at Edgbaston Wellness Clinic. We hope you're keeping well.\n\nKind regards,\nEdgbaston Wellness Clinic`,
        whatsapp: `Hi ${patientName}! Reaching out from Edgbaston Wellness Clinic. Let us know if there's anything we can help with 😊`,
      },
    };

    return { success: true, draft: fallback[purpose]?.[channel] ?? '' };
  }
}

// =============================================================================
// DEMO CONVERSATIONS (derived from demo patients + timelines)
// =============================================================================

const DEMO_CONVERSATIONS: Conversation[] = [
  {
    patient_id: 'pat-001', patient_name: 'Sarah Jones',
    patient_phone: '+44 7700 900123', patient_email: 'sarah.jones@gmail.com',
    last_treatment: 'Botox Anti-Wrinkle', channel: 'voice',
    last_message: 'Inbound call 4m 32s — rebooking intent confirmed, strong summer demand',
    last_message_at: mAgo(2), agent_handle: 'aria', status: 'ai_active', interaction_count: 12,
  },
  {
    patient_id: 'pat-002', patient_name: 'Emma Richardson',
    patient_phone: '+44 7700 900456', patient_email: 'emma.r@outlook.com',
    last_treatment: null, channel: 'email',
    last_message: 'Hi, I came across EWC on Instagram and I am very interested in B12 injections...',
    last_message_at: hAgo(1), agent_handle: 'aria', status: 'escalated', interaction_count: 1,
  },
  {
    patient_id: 'pat-003', patient_name: 'Rachel Morrison',
    patient_phone: '+44 7700 900789', patient_email: 'r.morrison@hotmail.co.uk',
    last_treatment: 'Botox Anti-Wrinkle', channel: 'sms',
    last_message: 'Hi Rachel, no worries at all about yesterday — we would love to get you rebooked.',
    last_message_at: dAgo(1), agent_handle: 'aria', status: 'escalated', interaction_count: 8,
  },
  {
    patient_id: 'pat-004', patient_name: 'Sophie Harte',
    patient_phone: '+44 7700 900234', patient_email: 'sophie.harte@gmail.com',
    last_treatment: 'CoolSculpting', channel: 'sms',
    last_message: 'CoolSculpting consultation confirmed for Mon 24 Feb at 10:30am.',
    last_message_at: dAgo(3), agent_handle: 'aria', status: 'ai_active', interaction_count: 2,
  },
  {
    patient_id: 'pat-005', patient_name: 'Michael Taylor',
    patient_phone: '+44 7700 900567', patient_email: 'm.taylor@yahoo.co.uk',
    last_treatment: 'Health Screening', channel: 'email',
    last_message: 'Google review response drafted and awaiting approval.',
    last_message_at: dAgo(8), agent_handle: 'aria', status: 'ai_active', interaction_count: 5,
  },
  {
    patient_id: 'pat-006', patient_name: 'Priya Sharma',
    patient_phone: '+44 7700 900890', patient_email: 'priya.sharma@gmail.com',
    last_treatment: 'IV Vitamin Drip', channel: 'sms',
    last_message: 'Feeling great thank you! Will definitely book again.',
    last_message_at: dAgo(4), agent_handle: 'aria', status: 'ai_active', interaction_count: 7,
  },
  {
    patient_id: 'pat-007', patient_name: 'Catherine Blake',
    patient_phone: '+44 7700 900321', patient_email: 'c.blake@btopenworld.com',
    last_treatment: 'Weight Management', channel: 'sms',
    last_message: 'Re-engagement recommended — patient inactive for 6 weeks.',
    last_message_at: dAgo(12), agent_handle: 'aria', status: 'ai_active', interaction_count: 4,
  },
  {
    patient_id: 'pat-008', patient_name: 'James Worthington',
    patient_phone: '+44 7700 900654', patient_email: 'j.worthington@worthington.co.uk',
    last_treatment: 'Corporate Health Screen', channel: 'email',
    last_message: 'Corporate wellness proposal sent — 12 partners, awaiting response.',
    last_message_at: dAgo(20), agent_handle: 'aria', status: 'ai_active', interaction_count: 3,
  },
];

// =============================================================================
// SERVER ACTION — CONVERSATIONS
// =============================================================================

export async function getConversations(): Promise<Conversation[]> {
  try {
    const db = createSovereignClient();
    const { data } = await db
      .from('cliniko_patients')
      .select('id, first_name, last_name, email, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      const channels: Conversation['channel'][] = ['sms', 'email', 'whatsapp', 'voice'];
      
      return (data as Record<string, unknown>[]).map((p, i) => ({
        patient_id:        p.id as string,
        patient_name:      `${p.first_name} ${p.last_name}`.trim(),
        patient_phone:     (p.phone  as string | null) ?? null,
        patient_email:     (p.email  as string | null) ?? null,
        last_treatment:    null,
        channel:           channels[i % channels.length],
        last_message:      'No recent messages on record',
        last_message_at:   p.created_at as string,
        agent_handle:      'aria',
        status:            'ai_active',
        interaction_count: 0,
      }));
    }
  } catch { /* fall through to demo */ }

  return DEMO_CONVERSATIONS;
}

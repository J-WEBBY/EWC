-- =============================================================================
-- Migration 020: Active Signal Architecture
-- Adds response_mode, action_log trail, resolved/archived status
-- Seeds 10 realistic EWC signals across all response modes
-- =============================================================================

-- Add active signal architecture columns
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'supervised'
    CHECK (response_mode IN ('auto', 'agentic', 'supervised', 'human_only')),
  ADD COLUMN IF NOT EXISTS action_log       JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS resolved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_action_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_to      TEXT,
  ADD COLUMN IF NOT EXISTS related_signals  JSONB       NOT NULL DEFAULT '[]';

-- Extend status constraint to include resolved and archived
ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_status_check;
ALTER TABLE signals ADD CONSTRAINT signals_status_check CHECK (
  status IN (
    'new', 'pending_approval', 'processing', 'judged',
    'awaiting_decision', 'decided', 'acted',
    'outcome_recorded', 'resolved', 'archived', 'closed'
  )
);

CREATE INDEX IF NOT EXISTS idx_signals_response_mode ON signals(response_mode);
CREATE INDEX IF NOT EXISTS idx_signals_resolved_at   ON signals(resolved_at);

-- =============================================================================
-- Seed 10 realistic EWC signals across all response modes
-- =============================================================================

DO $$
DECLARE
  aria_id   UUID;
  orion_id  UUID;
  arry_id   UUID;
  admin_id  UUID;
BEGIN
  SELECT id INTO aria_id  FROM agents WHERE agent_key = 'primary_agent' LIMIT 1;
  SELECT id INTO orion_id FROM agents WHERE agent_key = 'sales_agent'   LIMIT 1;
  SELECT id INTO arry_id  FROM agents WHERE agent_key = 'crm_agent'     LIMIT 1;
  SELECT id INTO admin_id FROM users  WHERE email = 'admin@edgbastonwellness.co.uk' LIMIT 1;

  INSERT INTO signals (
    signal_type, title, description, priority, status, response_mode,
    category, source_type, source_agent_id, created_by_user_id,
    tags, data, action_log, last_action_at, created_at, updated_at
  ) VALUES

  -- 1. CQC Inspection (CRITICAL / human_only)
  (
    'alert',
    'CQC Inspection Due — 28 March 2026',
    'Routine CQC inspection scheduled. Documentation pack must be compiled and reviewed by Dr Ganata before inspection. Previous rating: Good. 33 days remaining.',
    'critical', 'new', 'human_only', 'governance', 'system', NULL, admin_id,
    ARRAY['cqc', 'compliance', 'regulatory'],
    '{"inspection_date": "2026-03-28", "previous_rating": "Good", "days_remaining": 33, "documents_needed": ["evidence_of_practice", "staff_records", "patient_feedback", "medication_log", "equipment_register"]}'::jsonb,
    '[{"timestamp": "2026-02-20T09:00:00Z", "actor": "system", "action": "signal_created", "note": "Auto-generated 35 days before scheduled CQC inspection date"}, {"timestamp": "2026-02-20T09:00:01Z", "actor": "system", "action": "classified", "note": "Classified as human_only — CQC regulatory requirement, must be actioned by Dr Ganata"}]'::jsonb,
    '2026-02-20T09:00:01Z', '2026-02-20T09:00:00Z', '2026-02-20T09:00:01Z'
  ),

  -- 2. Patient churn risk (HIGH / supervised)
  (
    'alert',
    'Churn Risk: Mrs Aisha Patel — 7 months inactive',
    'High-value patient (LTV £1,840) completed 3 Botox treatments. Last visit July 2025. No booking in 7 months. Aria recommends personal outreach with loyalty offer.',
    'high', 'new', 'supervised', 'welfare', 'agent', arry_id, NULL,
    ARRAY['churn-risk', 'botox', 'high-ltv'],
    '{"patient_name": "Mrs Aisha Patel", "last_visit": "2025-07-12", "treatment_count": 3, "lifetime_value": 1840, "preferred_treatment": "Botox", "last_spend": 380, "recommended_action": "Personal call from Dr Ganata + 10% loyalty discount on next Botox session"}'::jsonb,
    '[{"timestamp": "2026-02-22T08:00:00Z", "actor": "agent:crm_agent", "action": "signal_created", "note": "Aria detected 7-month inactivity during daily retention scan"}, {"timestamp": "2026-02-22T08:00:05Z", "actor": "agent:crm_agent", "action": "recommendation_generated", "note": "Recommend: personal call from Dr Ganata + 10% loyalty discount. High-LTV patient, retention priority."}]'::jsonb,
    '2026-02-22T08:00:05Z', '2026-02-22T08:00:00Z', '2026-02-22T08:00:05Z'
  ),

  -- 3. Overdue invoice escalated (HIGH / supervised — processing)
  (
    'alert',
    'Invoice Overdue — Mr Robert Davies £1,400',
    'Invoice INV-2024-0847 for CoolSculpting. 45 days overdue. Two automated SMS reminders sent, no response. Orion has escalated to supervised — manual intervention required.',
    'high', 'processing', 'supervised', 'finance', 'agent', orion_id, NULL,
    ARRAY['invoice', 'overdue', 'coolsculpting'],
    '{"invoice_ref": "INV-2024-0847", "patient": "Mr Robert Davies", "amount": 1400, "days_overdue": 45, "treatment": "CoolSculpting", "sms_sent": 2, "phone": "+447700900123"}'::jsonb,
    '[{"timestamp": "2026-02-08T09:00:00Z", "actor": "automation:invoice_monitor", "action": "signal_created", "note": "Invoice 30-day overdue threshold reached — automated recovery initiated"}, {"timestamp": "2026-02-08T09:01:00Z", "actor": "agent:sales_agent", "action": "sms_sent", "note": "Payment link SMS sent to +447700900123"}, {"timestamp": "2026-02-15T09:00:00Z", "actor": "agent:sales_agent", "action": "sms_sent", "note": "Second reminder SMS sent — no response received after 7 days"}, {"timestamp": "2026-02-22T10:00:00Z", "actor": "agent:sales_agent", "action": "escalated", "note": "Escalated to supervised — 45 days overdue, automated recovery exhausted. Recommend: personal call within 24h."}]'::jsonb,
    '2026-02-22T10:00:00Z', '2026-02-08T09:00:00Z', '2026-02-22T10:00:00Z'
  ),

  -- 4. Botox follow-up batch (MEDIUM / agentic — processing)
  (
    'task',
    '8 Patients Due Botox 4-Month Review',
    'Aria is contacting 8 patients for standard efficacy review. 3 bookings confirmed, 4 pending reply. No action required unless patients do not respond within 72h.',
    'medium', 'processing', 'agentic', 'operations', 'agent', arry_id, NULL,
    ARRAY['botox', 'follow-up', 'retention'],
    '{"patient_count": 8, "treatment": "Botox", "review_window_days": 14, "bookings_confirmed": 3, "pending_reply": 4, "no_response": 1}'::jsonb,
    '[{"timestamp": "2026-02-21T08:00:00Z", "actor": "automation:retention_schedule", "action": "signal_created", "note": "8 Botox patients at 4-month mark — review window now open"}, {"timestamp": "2026-02-21T08:01:00Z", "actor": "agent:crm_agent", "action": "processing", "note": "Aria sending personalised review SMS to 8 patients"}, {"timestamp": "2026-02-21T08:06:00Z", "actor": "agent:crm_agent", "action": "sms_sent", "note": "8/8 messages delivered. 3 bookings confirmed immediately."}, {"timestamp": "2026-02-22T14:00:00Z", "actor": "agent:crm_agent", "action": "follow_up", "note": "4 still awaiting reply. 1 patient unresponsive. Aria will retry in 48h if no booking."}]'::jsonb,
    '2026-02-22T14:00:00Z', '2026-02-21T08:00:00Z', '2026-02-22T14:00:00Z'
  ),

  -- 5. IPL machine cert expired (CRITICAL / human_only)
  (
    'alert',
    'IPL Machine — Service Certificate Expired',
    'Lynton Lumina IPL machine service certificate expired 14 February 2026. Cannot be used for clinical treatments until re-certified. 3 appointments affected this week.',
    'critical', 'new', 'human_only', 'governance', 'system', NULL, admin_id,
    ARRAY['equipment', 'ipl', 'compliance', 'service'],
    '{"machine": "Lynton Lumina IPL", "cert_expired": "2026-02-14", "affected_appointments": 3, "service_provider": "Lynton Ltd", "service_contact": "0800 123 4567", "last_service": "2025-02-14"}'::jsonb,
    '[{"timestamp": "2026-02-14T00:00:00Z", "actor": "system", "action": "signal_created", "note": "Equipment certificate expiry date reached — annual service overdue"}, {"timestamp": "2026-02-14T08:00:00Z", "actor": "system", "action": "escalated", "note": "Auto-escalated to critical — clinical equipment, patient safety risk until re-certified"}]'::jsonb,
    '2026-02-14T08:00:00Z', '2026-02-14T00:00:00Z', '2026-02-14T08:00:00Z'
  ),

  -- 6. Corporate account enquiry (MEDIUM / supervised)
  (
    'event',
    'Corporate Enquiry — Calthorpe Dental Practice',
    'Dr Miriam Shah (Practice Principal) enquired about corporate wellness packages for 12 staff. Interested in health screenings, IV therapy, weight management. Est. annual value: £8,400.',
    'medium', 'new', 'supervised', 'operations', 'agent', orion_id, NULL,
    ARRAY['corporate', 'new-account', 'high-value'],
    '{"contact": "Dr Miriam Shah", "practice": "Calthorpe Dental", "staff_count": 12, "interests": ["health_screening", "iv_therapy", "weight_management"], "est_annual_value": 8400, "source": "website_enquiry", "contact_email": "m.shah@calthorpedental.co.uk"}'::jsonb,
    '[{"timestamp": "2026-02-22T14:30:00Z", "actor": "agent:sales_agent", "action": "signal_created", "note": "Orion classified inbound enquiry as high-value corporate prospect (confidence 91%)"}, {"timestamp": "2026-02-22T14:30:05Z", "actor": "agent:sales_agent", "action": "recommendation_generated", "note": "Recommend: Dr Ganata personal call within 48h + bespoke package proposal. High conversion likelihood."}]'::jsonb,
    '2026-02-22T14:30:05Z', '2026-02-22T14:30:00Z', '2026-02-22T14:30:05Z'
  ),

  -- 7. Appointment reminders (LOW / auto — resolved)
  (
    'task',
    'Appointment Reminders Sent — 14 Patients',
    '14 appointment reminder SMS messages sent automatically for 23 February 2026. All delivered. No action required.',
    'low', 'resolved', 'auto', 'operations', 'automation', NULL, NULL,
    ARRAY['reminders', 'sms', 'automated'],
    '{"appointment_date": "2026-02-23", "patient_count": 14, "sms_sent": 14, "sms_delivered": 14, "channel": "twilio"}'::jsonb,
    '[{"timestamp": "2026-02-22T18:00:00Z", "actor": "automation:appointment_reminders", "action": "signal_created", "note": "Daily reminder batch initiated — 14 patients scheduled for 23 Feb"}, {"timestamp": "2026-02-22T18:00:28Z", "actor": "automation:appointment_reminders", "action": "sms_sent", "note": "14/14 SMS delivered via Twilio — 100% delivery rate"}, {"timestamp": "2026-02-22T18:00:30Z", "actor": "system", "action": "resolved", "note": "Auto-resolved: all reminders delivered successfully"}]'::jsonb,
    '2026-02-22T18:00:30Z', '2026-02-22T18:00:00Z', '2026-02-22T18:00:30Z'
  ),

  -- 8. Weight management check-in (MEDIUM / agentic — new, about to fire)
  (
    'task',
    'Weight Management — Monthly Check-in Due: 6 Patients',
    'Monthly progress check-in due for 6 active weight management patients. Aria will send personalised check-in messages and log responses.',
    'medium', 'new', 'agentic', 'operations', 'automation', arry_id, NULL,
    ARRAY['weight-management', 'check-in', 'retention'],
    '{"patient_count": 6, "programme": "weight_management", "check_in_type": "monthly", "due_date": "2026-02-25"}'::jsonb,
    '[{"timestamp": "2026-02-23T08:00:00Z", "actor": "automation:retention_schedule", "action": "signal_created", "note": "Monthly check-in cycle triggered — 6 weight management patients due for progress update"}]'::jsonb,
    '2026-02-23T08:00:00Z', '2026-02-23T08:00:00Z', '2026-02-23T08:00:00Z'
  ),

  -- 9. BLS certification expiring (HIGH / human_only)
  (
    'alert',
    'BLS Certification Expiring — 2 Staff Members',
    'Basic Life Support certification expiring within 14 days: Nurse Priya Kapoor (28 Feb) and Receptionist James Wong (6 Mar). CQC mandatory requirement.',
    'high', 'new', 'human_only', 'governance', 'system', NULL, admin_id,
    ARRAY['bls', 'certification', 'cqc', 'staff'],
    '{"staff": [{"name": "Priya Kapoor", "role": "Nurse", "expiry": "2026-02-28", "days_left": 5}, {"name": "James Wong", "role": "Receptionist", "expiry": "2026-03-06", "days_left": 11}], "requirement": "CQC_mandatory", "training_provider": "St John Ambulance"}'::jsonb,
    '[{"timestamp": "2026-02-21T09:00:00Z", "actor": "system", "action": "signal_created", "note": "14-day certification expiry alert — 2 staff members: Priya Kapoor (5 days) and James Wong (11 days)"}, {"timestamp": "2026-02-21T09:00:01Z", "actor": "system", "action": "classified", "note": "Classified as human_only — CQC mandatory requirement, cannot be delegated to agent"}]'::jsonb,
    '2026-02-21T09:00:01Z', '2026-02-21T09:00:00Z', '2026-02-21T09:00:01Z'
  ),

  -- 10. CoolSculpting 8-week reviews (MEDIUM / agentic — processing with good progress)
  (
    'task',
    'CoolSculpting 8-Week Review — 4 Patients',
    'Aria sent results review invitations at 8-week mark. 2 patients submitted photos, 2 have booked in-person reviews. Remaining 2 patients sent follow-up.',
    'medium', 'processing', 'agentic', 'operations', 'agent', arry_id, NULL,
    ARRAY['coolsculpting', '8-week-review', 'retention'],
    '{"patient_count": 4, "treatment": "CoolSculpting", "review_type": "8_week_results", "photos_submitted": 2, "appointments_booked": 2, "pending": 0}'::jsonb,
    '[{"timestamp": "2026-02-20T08:00:00Z", "actor": "automation:retention_schedule", "action": "signal_created", "note": "8-week CoolSculpting review cycle triggered for 4 patients"}, {"timestamp": "2026-02-20T08:01:00Z", "actor": "agent:crm_agent", "action": "sms_sent", "note": "Review invitation + before/after photo submission link sent to 4 patients"}, {"timestamp": "2026-02-21T11:30:00Z", "actor": "patient", "action": "responded", "note": "2 patients submitted photos. 2 booked in-person review appointments."}, {"timestamp": "2026-02-22T09:00:00Z", "actor": "agent:crm_agent", "action": "follow_up", "note": "All 4 patients engaged — signal will auto-resolve once appointments completed"}]'::jsonb,
    '2026-02-22T09:00:00Z', '2026-02-20T08:00:00Z', '2026-02-22T09:00:00Z'
  );

END $$;

-- =============================================================================
-- MIGRATION 019: Seed realistic signals for Edgbaston Wellness Clinic demo
-- Run after 018_staff_accounts.sql
-- All signals use source_type='ai' and reflect the 5-pillar architecture
-- =============================================================================

-- Clear any existing demo signals first (safe to re-run)
DELETE FROM signals WHERE source_type IN ('ai', 'system', 'automation');

-- =============================================================================
-- CRITICAL SIGNALS
-- =============================================================================

-- 1. CQC compliance - critical
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'alert',
  'CQC Inspection Readiness: 3 Outstanding Items',
  'Scheduled CQC inspection in 14 days. Three documentation gaps identified: Dr Ganata''s CPD log is 6 months overdue, the annual infection control audit has not been filed, and Patient Safety Incident reporting template has not been updated to 2025 format.',
  'critical', 'pending_approval', 'compliance', 'ai',
  ARRAY['cqc', 'compliance', 'urgent', 'inspection'],
  '{"inspection_date": "2026-03-08", "gaps": ["CPD log overdue", "Infection control audit missing", "PSIR template outdated"], "responsible": "Dr Suresh Ganata"}',
  NOW() - INTERVAL '2 hours'
);

-- 2. Revenue - critical overdue invoice
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'alert',
  'Overdue Invoice: £4,200 · Highfield Corporate Account · 45 days',
  'Highfield HR Solutions has an outstanding invoice for £4,200 (Oct–Nov corporate wellness package). Payment is 45 days overdue. No response to two email chasers. Escalation recommended before end of Feb.',
  'critical', 'new', 'finance', 'ai',
  ARRAY['invoice', 'overdue', 'corporate', 'revenue'],
  '{"account": "Highfield HR Solutions", "amount": 4200, "days_overdue": 45, "contact": "james.thorpe@highfield-hr.co.uk", "last_chaser": "2026-02-05"}',
  NOW() - INTERVAL '1 day'
);

-- =============================================================================
-- HIGH PRIORITY SIGNALS
-- =============================================================================

-- 3. Patient retention - Botox follow-up overdue
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'alert',
  '23 Botox Patients: 4-Month Follow-Up Window Opens This Week',
  'Aria detected 23 patients who received Botox/anti-wrinkle treatments in early October 2025. Their optimal rebooking window (4 months) opens this week. No follow-up communications scheduled. Recommend automated SMS campaign.',
  'high', 'new', 'operations', 'ai',
  ARRAY['botox', 'retention', 'follow-up', 'patient-care'],
  '{"patient_count": 23, "treatment": "Botox/Anti-Wrinkle", "treatment_date_range": "2025-10-01/2025-10-14", "rebooking_window": "4 months", "recommended_action": "SMS follow-up campaign"}',
  NOW() - INTERVAL '3 hours'
);

-- 4. Missed calls - acquisition signal
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'alert',
  '8 Missed Calls This Week · No Voicemail Left · Potential Lost Revenue',
  'Eight inbound calls went unanswered this week between 8am–9am and 5pm–7pm. Based on conversion rates, this represents approximately £3,200–£6,400 in potential lost revenue. Vapi.ai voice receptionist would handle these automatically.',
  'high', 'new', 'operations', 'ai',
  ARRAY['missed-calls', 'acquisition', 'revenue', 'voice'],
  '{"missed_calls": 8, "time_gaps": ["08:00-09:00", "17:00-19:00"], "estimated_revenue_loss": "£3,200–£6,400", "recommendation": "Enable Vapi.ai voice receptionist"}',
  NOW() - INTERVAL '6 hours'
);

-- 5. Equipment maintenance
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'task',
  'CoolSculpting Machine: Annual Servicing Due in 8 Days',
  'The CoolSculpting Elite unit (Asset #CS-002) is due for its annual manufacturer service on 28 Feb 2026. Last service: 28 Feb 2025. Recommend scheduling a half-day slot. Revenue impact if unit goes offline: approx £2,800/month.',
  'high', 'new', 'compliance', 'ai',
  ARRAY['equipment', 'coolsculpting', 'maintenance', 'compliance'],
  '{"asset_id": "CS-002", "asset_name": "CoolSculpting Elite", "service_due": "2026-02-28", "last_service": "2025-02-28", "revenue_impact": 2800}',
  NOW() - INTERVAL '1 day'
);

-- 6. CoolSculpting retention
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'alert',
  '11 CoolSculpting Patients: 8-Week Review Window Active',
  '11 patients who completed CoolSculpting treatment 8 weeks ago have not had their results review or follow-on consultation booked. This is a key retention touchpoint and upsell opportunity (average follow-on value: £890).',
  'high', 'pending_approval', 'operations', 'ai',
  ARRAY['coolsculpting', 'retention', 'review', 'upsell'],
  '{"patient_count": 11, "treatment_date": "2025-12-15", "review_due": "2026-02-09", "avg_followon_value": 890, "total_opportunity": 9790}',
  NOW() - INTERVAL '4 hours'
);

-- =============================================================================
-- MEDIUM PRIORITY SIGNALS
-- =============================================================================

-- 7. Knowledge base gap
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'insight',
  'Aria: Frequently Asked About B12 Injection Pricing — No KB Article Found',
  'Over the past 7 days, Aria has been asked about B12 injection pricing 14 times across chat and Bridge messages. No knowledge base article exists for this treatment. Current response: "Please call us to discuss." Recommend adding pricing guide.',
  'medium', 'new', 'operations', 'ai',
  ARRAY['knowledge-base', 'b12', 'pricing', 'aria'],
  '{"query_count": 14, "treatment": "B12 Injections", "missing_kb_article": true, "period": "7 days"}',
  NOW() - INTERVAL '2 days'
);

-- 8. Filler retention
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'alert',
  '17 Filler Patients: 6-Month Rebooking Window Active',
  '17 patients who received dermal filler treatments between 2025-08-01 and 2025-08-31 are now in their optimal rebooking window. No automated follow-up sequence has been triggered. Estimated rebooking value: £12,750.',
  'medium', 'new', 'operations', 'ai',
  ARRAY['fillers', 'retention', 'rebooking', 'revenue'],
  '{"patient_count": 17, "treatment": "Dermal Fillers", "treatment_month": "August 2025", "window_start": "2026-02-01", "estimated_value": 12750}',
  NOW() - INTERVAL '5 days'
);

-- 9. IV therapy follow-up
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'task',
  'B12 Injection Patients: 3-Month Follow-Up Campaign Ready to Send',
  '31 patients received B12 injections in November 2025. Their 3-month follow-up window opened on 1 Feb. An automated SMS campaign is ready to send — pending approval. Estimated rebooking rate: 68%. Revenue opportunity: £4,650.',
  'medium', 'pending_approval', 'operations', 'ai',
  ARRAY['b12', 'retention', 'sms', 'automation'],
  '{"patient_count": 31, "treatment": "B12 Injections", "treatment_date": "2025-11", "campaign_ready": true, "estimated_rebooking_rate": 0.68, "revenue_opportunity": 4650}',
  NOW() - INTERVAL '1 day'
);

-- 10. Staff certification
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'task',
  'Nurse Sarah Chen: Advanced Aesthetics Certification Renewal Due March 15',
  'Sarah Chen''s Level 7 Advanced Aesthetics qualification is due for renewal on 15 March 2026. She is approved to perform Botox, filler, and anti-wrinkle treatments. Lapsed certification means treatments cannot be administered legally.',
  'medium', 'new', 'compliance', 'ai',
  ARRAY['staff', 'certification', 'compliance', 'aesthetics'],
  '{"staff_name": "Sarah Chen", "role": "Aesthetic Nurse", "cert_name": "Level 7 Advanced Aesthetics", "expiry_date": "2026-03-15", "treatments_affected": ["Botox", "Dermal Fillers", "Anti-Wrinkle"]}',
  NOW() - INTERVAL '3 days'
);

-- 11. Corporate account opportunity
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'insight',
  'New Corporate Enquiry: Brindleyplace Legal (180 employees) — Wellness Programme',
  'Via Bridge: Received email from Laura Kenning (HR Director, Brindleyplace Legal LLP) enquiring about a corporate wellness programme for their 180 Birmingham employees. They are looking for IV therapy, health screening, and GP services. Estimated annual value: £28,000–£45,000.',
  'medium', 'new', 'finance', 'ai',
  ARRAY['corporate', 'enquiry', 'new-business', 'revenue'],
  '{"company": "Brindleyplace Legal LLP", "contact": "Laura Kenning", "employees": 180, "interests": ["IV Therapy", "Health Screening", "GP Services"], "estimated_annual_value_min": 28000, "estimated_annual_value_max": 45000, "source": "bridge_email"}',
  NOW() - INTERVAL '4 hours'
);

-- 12. Review management
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'task',
  'Google Reviews: 3 Unanswered Reviews This Month (avg 4.2★)',
  'Three Google reviews from the past 30 days have not received a clinic response. One 3-star review mentions wait times; two 5-star reviews await acknowledgement. Response rate affects SEO ranking and patient trust.',
  'medium', 'new', 'operations', 'ai',
  ARRAY['reviews', 'google', 'reputation', 'patient-experience'],
  '{"unanswered_reviews": 3, "avg_rating": 4.2, "three_star_count": 1, "five_star_count": 2, "oldest_unanswered": "2026-02-05"}',
  NOW() - INTERVAL '2 days'
);

-- =============================================================================
-- LOW PRIORITY / INSIGHTS
-- =============================================================================

-- 13. Inventory alert
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'alert',
  'Hyaluronic Acid Filler Stock: Running Low — Reorder Required',
  'Current stock of Juvederm Ultra 2 (1ml) is at 8 units — below the 15-unit reorder threshold. Current usage rate suggests stock will deplete in 11 days. Supplier lead time: 3–5 business days.',
  'low', 'new', 'operations', 'ai',
  ARRAY['inventory', 'stock', 'fillers', 'reorder'],
  '{"product": "Juvederm Ultra 2 1ml", "current_stock": 8, "reorder_threshold": 15, "days_to_depletion": 11, "supplier_lead_time": "3-5 days"}',
  NOW() - INTERVAL '6 hours'
);

-- 14. Weight management retention
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'insight',
  'Semaglutide Programme: 6 Patients at Month 3 — Adherence Check Due',
  '6 patients on the weight management semaglutide programme are reaching their Month 3 milestone. This is the highest dropout risk point. A proactive nurse check-in call should be scheduled to support adherence and prevent programme abandonment.',
  'low', 'new', 'operations', 'ai',
  ARRAY['weight-management', 'semaglutide', 'retention', 'adherence'],
  '{"patient_count": 6, "programme_milestone": "Month 3", "dropout_risk": "high", "recommended_action": "Proactive nurse check-in call"}',
  NOW() - INTERVAL '1 day'
);

-- 15. Objective tracking
INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'objective',
  'February Revenue Target: £42,000 · Current: £41,200 · 98% to Goal',
  'February revenue is tracking at £41,200 against a £42,000 target. With 6 trading days remaining, the £800 gap requires approximately 1.3 additional mid-tier treatments per day. Achievable with proactive follow-up on pending enquiries.',
  'low', 'new', 'finance', 'ai',
  ARRAY['revenue', 'target', 'kpi', 'february'],
  '{"target": 42000, "current": 41200, "gap": 800, "trading_days_remaining": 6, "gap_per_day": 133, "on_track": true}',
  NOW() - INTERVAL '12 hours'
);

-- =============================================================================
-- CLOSED/RESOLVED SIGNALS (for history)
-- =============================================================================

INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'task',
  'Patient Data Backup: Monthly Verification Complete',
  'Automated monthly backup verification completed successfully. All patient records, consent forms, and treatment notes are backed up to encrypted cloud storage. Verification signed off by Dr Ganata.',
  'low', 'closed', 'compliance', 'ai',
  ARRAY['backup', 'data', 'compliance', 'completed'],
  '{"backup_date": "2026-02-01", "records_verified": 312, "status": "passed", "signed_off_by": "Dr Suresh Ganata"}',
  NOW() - INTERVAL '20 days'
);

INSERT INTO signals (signal_type, title, description, priority, status, category, source_type, tags, data, created_at)
VALUES (
  'alert',
  'January Revenue Target: £38,000 · Final: £41,200 · 108% achieved',
  'January closed at £41,200 — 8% above target. Top performers: CoolSculpting (£9,400), Botox (£14,200), Dermal Fillers (£11,800). Strong performance driven by post-New Year aesthetic enquiries.',
  'low', 'closed', 'finance', 'ai',
  ARRAY['revenue', 'january', 'target-met', 'kpi'],
  '{"target": 38000, "actual": 41200, "achievement_pct": 108, "top_treatment": "Botox", "month": "January 2026"}',
  NOW() - INTERVAL '22 days'
);

-- Confirm seeding
DO $$
DECLARE signal_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO signal_count FROM signals;
  RAISE NOTICE 'Signals seeded. Total signals in table: %', signal_count;
END $$;

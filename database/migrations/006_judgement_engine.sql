-- =====================================================
-- JWEBLY SYSTEM - Migration 006: Judgement Engine
-- Core AI decision-making tables + seed signals
-- =====================================================

-- =====================================================
-- 1. SIGNALS — Events that need attention
-- =====================================================

CREATE TABLE signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Source
    source_type VARCHAR(50) NOT NULL DEFAULT 'manual',
    source_agent_id VARCHAR(50),
    source_department_id UUID REFERENCES departments(id),
    created_by_user_id UUID REFERENCES users(id),

    -- Signal content
    signal_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    data JSONB DEFAULT '{}'::jsonb,

    -- Priority & Classification
    priority VARCHAR(20) DEFAULT 'medium',
    category VARCHAR(100),
    tags JSONB DEFAULT '[]'::jsonb,

    -- Cross-signal linkage
    related_signals JSONB DEFAULT '[]'::jsonb,
    related_department_ids JSONB DEFAULT '[]'::jsonb,

    -- Status
    status VARCHAR(50) DEFAULT 'new',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_tenant ON signals(tenant_id);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_type ON signals(signal_type);
CREATE INDEX idx_signals_priority ON signals(priority);
CREATE INDEX idx_signals_agent ON signals(source_agent_id);
CREATE INDEX idx_signals_created ON signals(created_at DESC);

COMMENT ON TABLE signals IS 'Operational events requiring attention or decision';

-- =====================================================
-- 2. JUDGEMENTS — AI-generated recommendations
-- =====================================================

CREATE TABLE judgements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,

    -- AI Assessment
    confidence DECIMAL(5,2) NOT NULL,
    recommendation TEXT NOT NULL,
    reasoning TEXT NOT NULL,

    -- Structured recommendation
    suggested_actions JSONB DEFAULT '[]'::jsonb,
    flags JSONB DEFAULT '[]'::jsonb,
    cross_signals JSONB DEFAULT '[]'::jsonb,

    -- Assignment suggestion
    suggested_assignee_id UUID REFERENCES users(id),
    suggested_priority VARCHAR(20),
    suggested_pathway VARCHAR(200),

    -- AI metadata
    model_used VARCHAR(100),
    context_used JSONB DEFAULT '{}'::jsonb,
    maturity_mode VARCHAR(20) DEFAULT 'bootstrap',
    engine_version VARCHAR(20) DEFAULT '1.0',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_judgements_tenant ON judgements(tenant_id);
CREATE INDEX idx_judgements_signal ON judgements(signal_id);

COMMENT ON TABLE judgements IS 'AI-generated recommendations for signals';

-- =====================================================
-- 3. DECISIONS — Human responses to judgements
-- =====================================================

CREATE TABLE decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    judgement_id UUID NOT NULL REFERENCES judgements(id) ON DELETE CASCADE,
    signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    decided_by_user_id UUID NOT NULL REFERENCES users(id),

    -- Decision
    action VARCHAR(50) NOT NULL,
    modification_notes TEXT,
    rejection_reason TEXT,

    -- What was actually done
    actual_assignee_id UUID REFERENCES users(id),
    actual_priority VARCHAR(20),
    actual_pathway VARCHAR(200),

    decided_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decisions_tenant ON decisions(tenant_id);
CREATE INDEX idx_decisions_signal ON decisions(signal_id);
CREATE INDEX idx_decisions_user ON decisions(decided_by_user_id);

COMMENT ON TABLE decisions IS 'Human accept/modify/reject responses to AI judgements';

-- =====================================================
-- 4. OUTCOMES — What actually happened (learning loop)
-- =====================================================

CREATE TABLE outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,

    -- Outcome
    outcome_status VARCHAR(50) NOT NULL,
    outcome_notes TEXT,
    resolution_time_hours DECIMAL(10,2),

    -- Quality assessment
    was_recommendation_correct BOOLEAN,
    quality_score INTEGER CHECK (quality_score >= 1 AND quality_score <= 5),
    lessons_learned TEXT,

    -- Tracked by
    recorded_by_user_id UUID REFERENCES users(id),

    outcome_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outcomes_tenant ON outcomes(tenant_id);
CREATE INDEX idx_outcomes_signal ON outcomes(signal_id);
CREATE INDEX idx_outcomes_decision ON outcomes(decision_id);

COMMENT ON TABLE outcomes IS 'Tracked outcomes for engine learning loop';

-- =====================================================
-- 5. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE judgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON signals FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON judgements FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON decisions FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON outcomes FOR ALL TO service_role USING (true);

CREATE POLICY tenant_isolation_signals ON signals
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_judgements ON judgements
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_decisions ON decisions
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_outcomes ON outcomes
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

-- =====================================================
-- 6. UPDATE TRIGGERS
-- =====================================================

CREATE TRIGGER update_signals_updated_at BEFORE UPDATE ON signals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. SEED SIGNALS — 30 realistic scenarios for the Guild
-- =====================================================

DO $$
DECLARE
    t_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;
    dept_welfare UUID;
    dept_activities UUID;
    dept_finance UUID;
    dept_marketing UUID;
    dept_commercial UUID;
    dept_operations UUID;
    dept_leadership UUID;
BEGIN
    -- Look up department IDs
    SELECT id INTO dept_welfare FROM departments WHERE tenant_id = t_id AND name = 'Welfare & Support';
    SELECT id INTO dept_activities FROM departments WHERE tenant_id = t_id AND name = 'Student Activities';
    SELECT id INTO dept_finance FROM departments WHERE tenant_id = t_id AND name = 'Finance & Administration';
    SELECT id INTO dept_marketing FROM departments WHERE tenant_id = t_id AND name = 'Marketing & Communications';
    SELECT id INTO dept_commercial FROM departments WHERE tenant_id = t_id AND name = 'Commercial Services';
    SELECT id INTO dept_operations FROM departments WHERE tenant_id = t_id AND name = 'Operations & Facilities';
    SELECT id INTO dept_leadership FROM departments WHERE tenant_id = t_id AND name = 'Leadership';

    -- ============================================================
    -- WELFARE & SUPPORT (8 signals)
    -- ============================================================

    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    -- 1. Financial hardship
    (t_id, 'manual', 'co_welfare', dept_welfare, 'welfare_case',
     'Financial Hardship: Student unable to pay rent',
     'Second-year Engineering student reports inability to pay February rent. Savings exhausted, parental support unavailable due to family circumstances. Student at risk of eviction within 14 days.',
     'high', 'welfare',
     '["financial", "housing", "urgent"]'::jsonb,
     '{"student_ref": "STU-2024-4521", "case_type": "financial_hardship", "accommodation": "University Hall B, Room 308", "monthly_rent": 550, "arrears_amount": 550, "eviction_risk": true, "eviction_deadline": "2026-02-23", "contact_method": "drop_in", "previous_cases": 0, "course": "BEng Mechanical Engineering", "year_of_study": 2}'::jsonb,
     'new', NOW() - INTERVAL '2 hours'),

    -- 2. Academic appeal
    (t_id, 'manual', 'co_welfare', dept_welfare, 'academic_appeal',
     'Academic Appeal: Failed Module — Extenuating Circumstances',
     'Third-year Nursing student requesting appeal for failed Clinical Practice module. Claims extenuating circumstances (bereavement) were not considered. Deadline for appeal submission is in 5 days.',
     'high', 'academic',
     '["appeal", "academic", "deadline"]'::jsonb,
     '{"student_ref": "STU-2023-2890", "module": "NUR3042 Clinical Practice", "grade_received": "F", "extenuating_type": "bereavement", "appeal_deadline": "2026-02-14", "previous_attempts": 0, "course": "BSc Nursing", "year_of_study": 3, "impact": "Cannot progress to placement without passing"}'::jsonb,
     'new', NOW() - INTERVAL '6 hours'),

    -- 3. Housing dispute
    (t_id, 'manual', 'co_welfare', dept_welfare, 'housing_dispute',
     'Housing Dispute: Landlord withholding deposit',
     'Group of 4 students from same house report landlord is withholding £2,400 deposit (£600 each) claiming damage that pre-existed their tenancy. Students have photographic evidence from move-in.',
     'medium', 'housing',
     '["housing", "legal", "deposit"]'::jsonb,
     '{"student_refs": ["STU-2023-1102", "STU-2023-1456", "STU-2023-0987", "STU-2023-1234"], "landlord": "Midlands Property Group Ltd", "property_address": "42 Wellington Road, Oldbury", "deposit_total": 2400, "deposit_scheme": "DPS", "move_out_date": "2026-01-15", "evidence_available": true, "previous_complaints_against_landlord": 2}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    -- 4. Mental health referral
    (t_id, 'agent', 'co_welfare', dept_welfare, 'welfare_case',
     'Mental Health: Tutor flagged student welfare concern',
     'Personal tutor referred student after noticing declining attendance (from 95% to 40% over 6 weeks) and withdrawal from group activities. Student consented to guild support contact.',
     'high', 'wellbeing',
     '["mental_health", "attendance", "referral"]'::jsonb,
     '{"student_ref": "STU-2024-3345", "referral_source": "personal_tutor", "tutor_name": "Dr. K. Sharma", "attendance_current": 40, "attendance_previous": 95, "decline_period_weeks": 6, "student_consented": true, "course": "BA Psychology", "year_of_study": 1, "flags": ["first_year", "rapid_decline"]}'::jsonb,
     'new', NOW() - INTERVAL '4 hours'),

    -- 5. Safeguarding concern
    (t_id, 'manual', 'co_welfare', dept_welfare, 'safeguarding',
     'SAFEGUARDING: Student disclosed domestic situation',
     'During advice appointment, student disclosed controlling behaviour from partner. Student lives off-campus with partner. Advisor assessed as medium risk pending further information. Student has agreed to follow-up.',
     'critical', 'safeguarding',
     '["safeguarding", "domestic", "confidential"]'::jsonb,
     '{"student_ref": "STU-2022-5567", "disclosure_type": "domestic_abuse", "risk_level": "medium", "living_situation": "off_campus_with_partner", "student_consented_followup": true, "advisor_name": "Sophie Lee", "immediate_danger": false, "support_services_discussed": ["national_helpline", "university_counselling", "local_refuge"], "course": "MSc Data Science", "year_of_study": 1}'::jsonb,
     'new', NOW() - INTERVAL '1 hour'),

    -- 6-8. Three financial hardship cases from Maple Court (cross-signal seed)
    (t_id, 'manual', 'co_welfare', dept_welfare, 'welfare_case',
     'Financial Hardship: Maple Court resident — heating costs',
     'First-year student in Maple Court reports inability to afford electricity top-up for heating. Room temperature measured at 14°C. Student using library as warm space.',
     'high', 'welfare',
     '["financial", "housing", "maple_court", "heating"]'::jsonb,
     '{"student_ref": "STU-2025-0112", "case_type": "financial_hardship", "accommodation": "Maple Court, Flat 3B", "specific_issue": "heating_costs", "monthly_electricity": 85, "room_temperature_celsius": 14, "contact_method": "email", "course": "BA English Literature", "year_of_study": 1}'::jsonb,
     'new', NOW() - INTERVAL '3 days'),

    (t_id, 'manual', 'co_welfare', dept_welfare, 'welfare_case',
     'Financial Hardship: Maple Court resident — rent increase',
     'Second-year student received mid-term rent increase notification from Maple Court management. Increase of £45/month not in original contract. Student cannot afford new amount.',
     'medium', 'welfare',
     '["financial", "housing", "maple_court", "rent"]'::jsonb,
     '{"student_ref": "STU-2024-0834", "case_type": "financial_hardship", "accommodation": "Maple Court, Flat 7A", "specific_issue": "rent_increase", "original_rent": 520, "new_rent": 565, "increase_notice_date": "2026-01-28", "contract_end_date": "2026-06-30", "course": "BSc Computer Science", "year_of_study": 2}'::jsonb,
     'new', NOW() - INTERVAL '5 days'),

    (t_id, 'manual', 'co_welfare', dept_welfare, 'welfare_case',
     'Financial Hardship: Maple Court resident — maintenance failures',
     'Student in Maple Court reports mould in bedroom and bathroom, reported to management 6 weeks ago with no action. Student experiencing respiratory issues. Requesting guild intervention.',
     'high', 'welfare',
     '["health", "housing", "maple_court", "maintenance"]'::jsonb,
     '{"student_ref": "STU-2025-0298", "case_type": "housing_conditions", "accommodation": "Maple Court, Flat 5C", "specific_issue": "mould_damp", "reported_to_landlord": true, "first_reported_date": "2025-12-28", "health_impact": true, "health_details": "respiratory_issues", "photographic_evidence": true, "course": "BEd Primary Education", "year_of_study": 1}'::jsonb,
     'new', NOW() - INTERVAL '2 days');

    -- ============================================================
    -- STUDENT ACTIVITIES (8 signals)
    -- ============================================================

    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    -- 9. Event proposal needing risk assessment
    (t_id, 'manual', 'co_events', dept_activities, 'event_request',
     'Event Proposal: Gaming Society Pub Crawl',
     'Gaming Society submitted event proposal for city centre pub crawl on Feb 21. 45 expected attendees, alcohol involved, off-campus venues. Risk assessment not yet submitted.',
     'high', 'events',
     '["event", "alcohol", "off_campus", "risk_assessment"]'::jsonb,
     '{"society_name": "Gaming Society", "society_id": "SOC-042", "event_name": "Spring Pub Crawl", "event_date": "2026-02-21", "event_time": "19:00", "expected_attendance": 45, "venue_type": "off_campus", "venues": ["The Crown", "Ye Olde Tavern", "The Student Bar"], "budget_requested": 120, "alcohol_involved": true, "risk_assessment_submitted": false, "organizer": "Tom Reeves (President)", "previous_events": 8, "previous_incidents": 1}'::jsonb,
     'new', NOW() - INTERVAL '8 hours'),

    -- 10. Large event budget request
    (t_id, 'manual', 'co_events', dept_activities, 'budget_request',
     'Budget Request: Freshers'' Fair Mega Stall — £2,400',
     'Activities team requesting £2,400 for enhanced Freshers'' Fair stall including custom banner, merchandise giveaways, and interactive photo booth. Previous year budget was £1,600.',
     'medium', 'budget',
     '["budget", "freshers", "events"]'::jsonb,
     '{"requested_by": "Laura Martinez", "department": "Student Activities", "event": "Freshers'' Fair 2026", "amount_requested": 2400, "previous_year_budget": 1600, "increase_percentage": 50, "breakdown": {"custom_banner": 450, "merchandise": 800, "photo_booth_hire": 650, "promotional_materials": 350, "contingency": 150}, "justification": "50% increase in society sign-ups targeted. Photo booth showed 3x engagement at NUS conference.", "approval_needed_by": "2026-03-01"}'::jsonb,
     'new', NOW() - INTERVAL '2 days'),

    -- 11. Society grant application
    (t_id, 'manual', 'co_events', dept_activities, 'budget_request',
     'Grant Application: Photography Society — £350',
     'Photography Society applying for equipment grant to purchase 2 tripods and lighting kit for studio sessions. Currently borrowing from Media department.',
     'low', 'budget',
     '["grant", "equipment", "society"]'::jsonb,
     '{"society_name": "Photography Society", "society_id": "SOC-078", "amount_requested": 350, "grant_type": "equipment", "items": [{"item": "Manfrotto Tripod x2", "cost": 180}, {"item": "Godox Lighting Kit", "cost": 170}], "current_membership": 34, "active_members": 22, "events_this_term": 6, "previous_grants": [{"amount": 200, "date": "2025-10-15", "purpose": "Camera bags"}], "budget_remaining_for_societies": 4200}'::jsonb,
     'new', NOW() - INTERVAL '3 days'),

    -- 12. Room booking conflict
    (t_id, 'agent', 'co_events', dept_activities, 'room_conflict',
     'Booking Conflict: Room G.04 — Debate Society vs Film Society',
     'Double booking detected for Room G.04 on Wednesday 12 Feb, 18:00-20:00. Debate Society (weekly session, 30 members) and Film Society (screening, 50 members) both have confirmed bookings.',
     'high', 'logistics',
     '["booking", "conflict", "room"]'::jsonb,
     '{"room": "G.04 (Lecture Theatre)", "date": "2026-02-12", "time_slot": "18:00-20:00", "booking_1": {"society": "Debate Society", "type": "weekly_session", "expected": 30, "booked_by": "Priya Kapoor", "booked_at": "2026-01-20"}, "booking_2": {"society": "Film Society", "type": "film_screening", "expected": 50, "booked_by": "Jake Morrison", "booked_at": "2026-01-25"}, "alternative_rooms": ["H.01 (45 cap)", "A.LT2 (80 cap, AV equipped)"], "priority_rules": "Weekly recurring bookings take precedence unless <50% attendance"}'::jsonb,
     'new', NOW() - INTERVAL '10 hours'),

    -- 13. Society dormancy alert
    (t_id, 'agent', 'ind_engagement', dept_activities, 'society_dormancy',
     'Dormancy Alert: Robotics Society — 90 days inactive',
     'Robotics Society has had no logged activity (events, meetings, or communications) for 90 days. Last known activity was November AGM. Committee members have not responded to check-in emails.',
     'medium', 'engagement',
     '["dormancy", "society", "inactive"]'::jsonb,
     '{"society_name": "Robotics Society", "society_id": "SOC-023", "days_inactive": 90, "last_activity_date": "2025-11-10", "last_activity_type": "AGM", "committee_size": 5, "committee_responded": 0, "check_in_emails_sent": 2, "total_membership": 18, "previous_year_events": 12, "budget_allocated": 800, "budget_spent": 200, "risk": "deregistration_eligible"}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    -- 14. Risk assessment overdue
    (t_id, 'agent', 'co_events', dept_activities, 'risk_assessment_overdue',
     'OVERDUE: Risk Assessment — Climbing Society Peak District Trip',
     'Climbing Society has an approved trip to Peak District on Feb 15 but risk assessment is 5 days overdue. Trip involves outdoor climbing, transport, and overnight camping. Cannot proceed without RA.',
     'critical', 'compliance',
     '["risk_assessment", "overdue", "outdoor", "safety"]'::jsonb,
     '{"society_name": "Climbing Society", "society_id": "SOC-015", "event": "Peak District Climbing Weekend", "event_date": "2026-02-15", "risk_assessment_due": "2026-02-03", "days_overdue": 5, "activities": ["outdoor_climbing", "camping", "minibus_transport"], "participants": 16, "instructor_booked": true, "insurance_valid": true, "previous_incidents": 0, "society_risk_rating": "high_activity", "organizer": "Sam Fletcher (Activities Officer)"}'::jsonb,
     'new', NOW() - INTERVAL '5 hours'),

    -- 15. Low attendance event
    (t_id, 'agent', 'ind_engagement', dept_activities, 'attendance_low',
     'Low Attendance Alert: Film Night — 3 attendees (expected 40)',
     'Wednesday Film Night attracted only 3 attendees against 40 expected. This is the third consecutive session with under 10 attendees. Room booking costs £35/session.',
     'low', 'engagement',
     '["attendance", "declining", "cost_efficiency"]'::jsonb,
     '{"event_name": "Film Night", "society": "Film Society", "date": "2026-02-05", "actual_attendance": 3, "expected_attendance": 40, "room_cost": 35, "consecutive_low_sessions": 3, "attendance_trend": [42, 28, 15, 8, 3], "cost_per_attendee": 11.67, "suggested_actions": ["survey_members", "change_time_slot", "merge_with_social"]}'::jsonb,
     'new', NOW() - INTERVAL '4 days'),

    -- 16. Society handover incomplete
    (t_id, 'agent', 'ind_engagement', dept_activities, 'handover_incomplete',
     'Handover Alert: Drama Society — new committee, no bank access',
     'Drama Society elected new committee in January AGM but outgoing treasurer has not transferred bank account signatory access. Society has £1,200 in account and upcoming production costs due.',
     'high', 'governance',
     '["handover", "finance", "governance"]'::jsonb,
     '{"society_name": "Drama Society", "society_id": "SOC-008", "agm_date": "2026-01-22", "outgoing_treasurer": "Maria Chen", "incoming_treasurer": "Dan Phillips", "bank_balance": 1200, "upcoming_costs": 850, "costs_description": "Spring production set materials and costume hire", "payment_due_date": "2026-02-20", "outgoing_treasurer_contactable": false, "days_since_agm": 18}'::jsonb,
     'new', NOW() - INTERVAL '12 hours');

    -- ============================================================
    -- FINANCE & ADMINISTRATION (5 signals)
    -- ============================================================

    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    -- 17. Budget reallocation
    (t_id, 'manual', NULL, dept_finance, 'budget_request',
     'Budget Reallocation: Marketing → Activities (£1,200)',
     'Marketing department has £1,200 underspend on Q3 digital advertising. Activities requesting reallocation for additional society grants following higher-than-expected applications.',
     'medium', 'budget',
     '["reallocation", "budget", "cross_department"]'::jsonb,
     '{"from_department": "Marketing & Communications", "to_department": "Student Activities", "amount": 1200, "reason": "Marketing Q3 underspend on digital ads; Activities society grant fund oversubscribed", "marketing_budget_total": 8500, "marketing_spent": 5100, "marketing_remaining": 3400, "activities_grant_budget": 6000, "activities_grant_spent": 5800, "pending_grant_applications": 4, "pending_total": 1850, "requested_by": "Rachel Williams", "supported_by": "Jennifer Davis"}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    -- 18. Spend threshold breach
    (t_id, 'agent', NULL, dept_finance, 'threshold_breach',
     'ALERT: Commercial Services at 87% of annual budget (Q3)',
     'Commercial Services department has spent 87% of annual budget with one quarter remaining. Primary driver: unplanned equipment replacement in bar (glass washer and refrigeration unit).',
     'high', 'budget',
     '["threshold", "overspend", "alert"]'::jsonb,
     '{"department": "Commercial Services", "annual_budget": 45000, "spent_to_date": 39150, "remaining": 5850, "percentage_spent": 87, "period_remaining": "Q4 (3 months)", "expected_q4_spend": 11250, "projected_overspend": 5400, "primary_drivers": [{"item": "Glass washer replacement", "cost": 3200, "planned": false}, {"item": "Refrigeration unit repair", "cost": 1800, "planned": false}], "mitigation_options": ["defer non-essential purchases", "reduce casual staff hours", "request supplementary budget"]}'::jsonb,
     'new', NOW() - INTERVAL '2 days'),

    -- 19. Invoice approval
    (t_id, 'manual', NULL, dept_finance, 'invoice_approval',
     'Invoice Approval: Catering supplier — £890',
     'Invoice from Midlands Catering Co for January events catering. Covers 3 events. Matches purchase order within 5% tolerance.',
     'low', 'finance',
     '["invoice", "approval", "catering"]'::jsonb,
     '{"supplier": "Midlands Catering Co", "invoice_number": "MCC-2026-0142", "amount": 890, "purchase_order": "PO-2026-0089", "po_amount": 850, "variance_percentage": 4.7, "events_covered": [{"event": "January Welcome Back Social", "date": "2026-01-15", "amount": 320}, {"event": "Societies Fair Refreshments", "date": "2026-01-22", "amount": 280}, {"event": "Staff Training Lunch", "date": "2026-01-29", "amount": 290}], "payment_terms": "30 days", "due_date": "2026-02-28"}'::jsonb,
     'new', NOW() - INTERVAL '3 days'),

    -- 20. Gift Aid deadline
    (t_id, 'agent', NULL, dept_finance, 'compliance_alert',
     'Deadline: Gift Aid Claim — submission due in 12 days',
     'Annual Gift Aid claim for qualifying donations needs submission to HMRC by Feb 21. Finance team has identified £8,400 in eligible donations. Estimated claim value: £2,100.',
     'medium', 'compliance',
     '["gift_aid", "hmrc", "deadline", "charity"]'::jsonb,
     '{"claim_type": "gift_aid", "submission_deadline": "2026-02-21", "days_remaining": 12, "eligible_donations": 8400, "estimated_claim_value": 2100, "declarations_collected": 142, "declarations_pending_verification": 8, "previous_year_claim": 1850, "assigned_to": "Peter Green", "status": "in_preparation"}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    -- 21. Audit prep
    (t_id, 'agent', NULL, dept_finance, 'compliance_alert',
     'Annual Audit Prep: 6 weeks to external audit date',
     'External audit scheduled for March 23. Finance team needs to prepare: bank reconciliations, society account summaries, grant expenditure reports, and trustee expense claims.',
     'medium', 'compliance',
     '["audit", "preparation", "annual"]'::jsonb,
     '{"audit_date": "2026-03-23", "weeks_remaining": 6, "auditor": "Smith & Partners LLP", "documents_required": [{"document": "Bank reconciliations (12 months)", "status": "in_progress", "assigned_to": "Peter Green"}, {"document": "Society account summaries", "status": "not_started", "count": 120}, {"document": "Grant expenditure reports", "status": "not_started", "count": 8}, {"document": "Trustee expense claims", "status": "complete", "count": 12}, {"document": "Payroll summary", "status": "complete"}, {"document": "Gift Aid records", "status": "in_progress"}], "previous_audit_findings": 2, "findings_resolved": true}'::jsonb,
     'new', NOW() - INTERVAL '4 days');

    -- ============================================================
    -- MARKETING & COMMUNICATIONS (4 signals)
    -- ============================================================

    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    -- 22. Social media sentiment drop
    (t_id, 'agent', 'co_comms', dept_marketing, 'sentiment_drop',
     'Instagram Engagement Down 40% — 2 week trend',
     'Guild Instagram engagement rate dropped from 5.2% to 3.1% over the past 2 weeks. Reach also declining. Coincides with end of Freshers'' campaign content.',
     'medium', 'communications',
     '["social_media", "engagement", "declining"]'::jsonb,
     '{"platform": "instagram", "metric": "engagement_rate", "current_value": 3.1, "previous_value": 5.2, "change_percentage": -40.4, "period": "14_days", "followers": 8200, "posts_in_period": 12, "best_performing": {"post": "Volunteering Fair announcement", "engagement": 7.8}, "worst_performing": {"post": "Committee meeting minutes link", "engagement": 0.9}, "competitor_benchmark": 4.5, "suggested_analysis": "Content mix shifted from student stories to administrative posts"}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    -- 23. Newsletter anomaly
    (t_id, 'agent', 'co_comms', dept_marketing, 'newsletter_anomaly',
     'Newsletter Open Rate Anomaly: 12% vs 35% average',
     'This week''s Guild Newsletter had a 12% open rate, significantly below the 35% average. Subject line was "Guild Committee Minutes — January Update". Previous newsletters with event content averaged 38%.',
     'low', 'communications',
     '["newsletter", "email", "open_rate"]'::jsonb,
     '{"newsletter_date": "2026-02-03", "open_rate": 12, "average_open_rate": 35, "click_rate": 2.1, "average_click_rate": 8.5, "subject_line": "Guild Committee Minutes — January Update", "recipients": 8400, "previous_subjects": [{"subject": "Your Freshers'' Week Guide!", "open_rate": 42}, {"subject": "New Societies Fair This Wednesday", "open_rate": 38}, {"subject": "Vote Now: Guild Elections Open", "open_rate": 45}], "unsubscribes": 23, "average_unsubscribes": 3}'::jsonb,
     'new', NOW() - INTERVAL '6 days'),

    -- 24. Traffic spike
    (t_id, 'agent', 'co_comms', dept_marketing, 'traffic_spike',
     'Website Traffic Spike: 340% increase from unknown source',
     'Guild website received 12,000 page views yesterday vs. 2,800 daily average. Traffic concentrated on "/elections" page. Source appears to be a Reddit thread discussing student union elections nationally.',
     'low', 'communications',
     '["website", "traffic", "viral"]'::jsonb,
     '{"date": "2026-02-07", "page_views": 12000, "daily_average": 2800, "increase_percentage": 340, "top_page": "/elections", "traffic_source": "reddit.com/r/UniUK", "unique_visitors": 8900, "bounce_rate": 72, "average_session_duration": "1m 42s", "server_performance": "normal", "follow_up_actions": ["prepare_election_comms", "check_page_accuracy", "monitor_social_mentions"]}'::jsonb,
     'new', NOW() - INTERVAL '2 days'),

    -- 25. Campaign review due
    (t_id, 'agent', 'co_comms', dept_marketing, 'campaign_review',
     'Campaign Review Due: Freshers'' Welcome Campaign',
     'Freshers'' Welcome Campaign ended 3 weeks ago. Post-campaign analysis due. Campaign ran across Instagram, TikTok, email, and on-campus posters with £1,800 budget.',
     'low', 'communications',
     '["campaign", "review", "freshers"]'::jsonb,
     '{"campaign_name": "Freshers'' Welcome 2026", "campaign_dates": {"start": "2026-01-13", "end": "2026-01-24"}, "budget": 1800, "budget_spent": 1720, "channels": ["instagram", "tiktok", "email", "print"], "kpis": {"new_followers": {"target": 500, "actual": 680}, "event_sign_ups": {"target": 1200, "actual": 1450}, "society_fair_attendance": {"target": 2000, "actual": 2300}, "app_downloads": {"target": 300, "actual": 185}}, "review_deadline": "2026-02-14", "assigned_to": "Alex Wilson"}'::jsonb,
     'new', NOW() - INTERVAL '5 days');

    -- ============================================================
    -- COMMERCIAL SERVICES (3 signals)
    -- ============================================================

    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    -- 26. Stock reorder alert
    (t_id, 'agent', NULL, dept_commercial, 'threshold_breach',
     'Stock Alert: Bar lager kegs at 15% — reorder needed',
     'Lager keg stock has dropped to 15% (3 kegs remaining). Average weekly consumption is 5 kegs. Next delivery slot available is Thursday. Will run out by Wednesday evening at current rate.',
     'high', 'commercial',
     '["stock", "reorder", "bar", "urgent"]'::jsonb,
     '{"item": "Lager Kegs (Carling)", "current_stock": 3, "reorder_threshold": 5, "percentage_remaining": 15, "weekly_consumption": 5, "estimated_stockout": "2026-02-11", "next_delivery_slot": "2026-02-12", "supplier": "Molson Coors", "unit_cost": 95, "reorder_quantity": 10, "total_cost": 950, "alternative": "Can switch to bottled temporarily from emergency stock"}'::jsonb,
     'new', NOW() - INTERVAL '6 hours'),

    -- 27. Scheduling gap
    (t_id, 'agent', NULL, dept_commercial, 'scheduling_gap',
     'Staff Gap: Friday evening — 2 shifts unfilled',
     'Friday 14 Feb (Valentine''s Day) bar shift has 2 unfilled positions out of 6 required. Expected to be busiest Friday of term. 3 student staff called in unavailable (exams).',
     'high', 'commercial',
     '["scheduling", "staffing", "bar", "valentine"]'::jsonb,
     '{"date": "2026-02-14", "shift": "17:00-23:00", "positions_required": 6, "positions_filled": 4, "positions_unfilled": 2, "reason": "3 student staff unavailable (exams), 1 replacement found", "expected_footfall": "high (Valentine''s + Friday)", "previous_friday_revenue": 2200, "contingency_options": ["agency_staff", "manager_cover", "reduced_service"], "agency_staff_cost_per_hour": 14.50, "deadline_to_resolve": "2026-02-12"}'::jsonb,
     'new', NOW() - INTERVAL '3 days'),

    -- 28. Venue hire inquiry
    (t_id, 'manual', NULL, dept_commercial, 'venue_inquiry',
     'Venue Hire Inquiry: Corporate training day — March 5',
     'External inquiry from Oldbury Chamber of Commerce for full-day hire of Main Hall for corporate training event. 80 attendees, AV requirements, catering requested. Potential revenue: £1,200.',
     'medium', 'commercial',
     '["venue_hire", "external", "revenue"]'::jsonb,
     '{"inquiry_from": "Oldbury Chamber of Commerce", "contact": "Margaret Thompson", "contact_email": "m.thompson@oldburychamber.co.uk", "date_requested": "2026-03-05", "duration": "09:00-17:00", "venue": "Main Hall", "attendees": 80, "requirements": ["projector", "PA_system", "wifi", "flipcharts"], "catering_requested": true, "catering_type": "lunch_and_refreshments", "estimated_revenue": {"venue_hire": 800, "catering": 400, "total": 1200}, "availability": "tentatively_available", "response_deadline": "2026-02-12"}'::jsonb,
     'new', NOW() - INTERVAL '2 days');

    -- ============================================================
    -- CROSS-SIGNAL PATTERNS (2 signals)
    -- ============================================================

    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, related_department_ids, status, created_at) VALUES

    -- 29. Maple Court cross-signal
    (t_id, 'agent', 'co_welfare', dept_welfare, 'cross_signal',
     'PATTERN: 3 welfare cases from Maple Court this month',
     'AI detected pattern: 3 separate welfare cases involving Maple Court residents in the past 14 days. Issues span heating costs, rent increases, and maintenance failures. Suggests systemic accommodation provider issue rather than isolated incidents.',
     'high', 'pattern',
     '["cross_signal", "maple_court", "housing", "pattern"]'::jsonb,
     '{"pattern_type": "location_cluster", "location": "Maple Court", "signal_count": 3, "time_window_days": 14, "issues": ["heating_costs", "rent_increase", "maintenance_failure"], "accommodation_provider": "Maple Court Management Ltd", "students_affected": 3, "recommended_actions": ["contact_accommodation_provider", "check_university_accommodation_register", "issue_student_advisory", "log_with_local_authority_housing"], "previous_complaints_on_record": 0, "escalation_level": "department_head"}'::jsonb,
     ('["' || dept_welfare::text || '", "' || dept_operations::text || '"]')::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    -- 30. Engagement decline cross-signal
    (t_id, 'agent', 'ind_engagement', dept_activities, 'cross_signal',
     'PATTERN: Society engagement down 20% since mid-term',
     'AI detected trend: Overall society event attendance is down 20% compared to same period last term. 8 societies show declining attendance trends. Correlates with mid-term assessment period but decline exceeds normal seasonal pattern by 12%.',
     'medium', 'pattern',
     '["cross_signal", "engagement", "trend", "societies"]'::jsonb,
     '{"pattern_type": "trend_decline", "metric": "society_event_attendance", "decline_percentage": 20, "normal_seasonal_decline": 8, "excess_decline": 12, "affected_societies": 8, "total_societies_active": 95, "comparison_period": "same_period_last_term", "possible_causes": ["assessment_period", "weather", "freshers_effect_wearing_off", "competing_university_events"], "societies_most_affected": [{"name": "Film Society", "decline": 45}, {"name": "Book Club", "decline": 38}, {"name": "Yoga Society", "decline": 35}], "recommended_actions": ["survey_affected_societies", "review_event_timing", "boost_promotion", "consider_merged_events"]}'::jsonb,
     ('["' || dept_activities::text || '", "' || dept_marketing::text || '"]')::jsonb,
     'new', NOW() - INTERVAL '3 days');

END $$;

-- =====================================================
-- COMPLETE
-- =====================================================
-- Judgement Engine schema created with 30 seed signals
-- Tables: signals, judgements, decisions, outcomes
-- All tables have RLS + service_role bypass
-- Seed data covers 5 departments + 2 cross-signal patterns

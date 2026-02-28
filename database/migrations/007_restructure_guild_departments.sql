-- =====================================================
-- JWEBLY SYSTEM - Migration 007: Restructure Guild Departments
-- Trimmed to realistic University of Oldbury Students' Guild
-- =====================================================
-- New structure:
--   Leadership          — Sarah Mitchell (General Manager)
--   Elected Officers    — 3 sabbatical officers (Education, Equality, Social)
--   Advice & Welfare    — welfare and advice staff
--   Communications & Social Media — 2 comms staff
--   Student Activities & Engagement — activities/events staff
-- =====================================================

DO $$
DECLARE
    t_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;

    -- New department IDs (fixed for referencing)
    dept_leadership UUID := 'dd000001-0000-0000-0000-000000000001'::uuid;
    dept_officers UUID   := 'dd000001-0000-0000-0000-000000000002'::uuid;
    dept_welfare UUID    := 'dd000001-0000-0000-0000-000000000003'::uuid;
    dept_comms UUID      := 'dd000001-0000-0000-0000-000000000004'::uuid;
    dept_activities UUID := 'dd000001-0000-0000-0000-000000000005'::uuid;

    -- Role IDs
    role_owner UUID;
    role_admin UUID;
    role_manager UUID;
    role_coordinator UUID;
    role_staff UUID;
    role_elected UUID;

    -- User references
    user_sarah UUID;
BEGIN
    -- ================================================================
    -- STEP 1: Delete existing users (cascade will handle FK refs)
    -- ================================================================
    DELETE FROM outcomes WHERE tenant_id = t_id;
    DELETE FROM decisions WHERE tenant_id = t_id;
    DELETE FROM judgements WHERE tenant_id = t_id;
    DELETE FROM signals WHERE tenant_id = t_id;
    DELETE FROM users WHERE tenant_id = t_id;

    -- ================================================================
    -- STEP 2: Delete old departments and insert new ones
    -- ================================================================
    DELETE FROM departments WHERE tenant_id = t_id;

    INSERT INTO departments (id, tenant_id, name, description, display_order, is_active) VALUES
    (dept_leadership, t_id, 'Leadership',
     'General Manager and senior permanent staff. Strategic oversight and day-to-day management of the Guild.',
     1, true),
    (dept_officers, t_id, 'Elected Officers',
     'Sabbatical officers elected annually by the student body. Education, Equality, and Social portfolios.',
     2, true),
    (dept_welfare, t_id, 'Advice & Welfare',
     'Student advice centre, welfare casework, financial hardship support, housing disputes, and safeguarding.',
     3, true),
    (dept_comms, t_id, 'Communications & Social Media',
     'Brand management, social media content, email newsletters, website, and campaign planning.',
     4, true),
    (dept_activities, t_id, 'Student Activities & Engagement',
     'Societies, sports clubs, events, volunteering, and student engagement programmes.',
     5, true);

    -- ================================================================
    -- STEP 3: Get role IDs
    -- ================================================================
    SELECT id INTO role_owner FROM roles WHERE tenant_id = t_id AND slug = 'owner';
    SELECT id INTO role_admin FROM roles WHERE tenant_id = t_id AND slug = 'admin';
    SELECT id INTO role_manager FROM roles WHERE tenant_id = t_id AND slug = 'manager';
    SELECT id INTO role_coordinator FROM roles WHERE tenant_id = t_id AND slug = 'coordinator';
    SELECT id INTO role_staff FROM roles WHERE tenant_id = t_id AND slug = 'staff';
    SELECT id INTO role_elected FROM roles WHERE tenant_id = t_id AND slug = 'elected_officer';

    -- ================================================================
    -- STEP 4: Create new staff members (10 total, trimmed from 19)
    -- ================================================================

    -- ── Leadership (1) ──
    INSERT INTO users (tenant_id, department_id, role_id, email, first_name, last_name, job_title, is_admin, is_owner, status, metadata) VALUES
    (t_id, dept_leadership, role_admin,
     's.mitchell@guild.uoo.ac.uk', 'Sarah', 'Mitchell', 'General Manager',
     true, false, 'invited',
     '{"notes": "Permanent staff. 8 years at the Guild. Institutional memory. Primary system administrator and key decision maker."}'::jsonb);

    SELECT id INTO user_sarah FROM users WHERE tenant_id = t_id AND email = 's.mitchell@guild.uoo.ac.uk';

    -- ── Elected Officers (3) ──
    INSERT INTO users (tenant_id, department_id, role_id, email, first_name, last_name, job_title, is_admin, is_owner, status, metadata) VALUES
    (t_id, dept_officers, role_elected,
     'j.okonkwo@uoo.ac.uk', 'James', 'Okonkwo', 'Education Officer',
     false, false, 'invited',
     '{"notes": "Sabbatical officer. Final year Law. Leads academic representation, course reps, and NSS response. Term ends July 2026."}'::jsonb),
    (t_id, dept_officers, role_elected,
     'a.begum@uoo.ac.uk', 'Amira', 'Begum', 'Equality Officer',
     false, false, 'invited',
     '{"notes": "Sabbatical officer. Final year Sociology. Leads liberation campaigns, accessibility, and EDI policy. Term ends July 2026."}'::jsonb),
    (t_id, dept_officers, role_elected,
     'm.jones@uoo.ac.uk', 'Marcus', 'Jones', 'Social Officer',
     false, false, 'invited',
     '{"notes": "Sabbatical officer. Final year Sports Science. Leads events, nightlife, freshers week, and social calendar. Term ends July 2026."}'::jsonb);

    -- ── Advice & Welfare (2) ──
    INSERT INTO users (tenant_id, department_id, role_id, email, first_name, last_name, job_title, is_admin, is_owner, status, metadata) VALUES
    (t_id, dept_welfare, role_manager,
     'm.scott@guild.uoo.ac.uk', 'Michael', 'Scott', 'Advice & Welfare Manager',
     false, false, 'invited',
     '{"notes": "Permanent staff. Manages the advice centre, welfare casework, safeguarding lead. 5 years at Guild."}'::jsonb),
    (t_id, dept_welfare, role_coordinator,
     's.lee@guild.uoo.ac.uk', 'Sophie', 'Lee', 'Welfare Advisor',
     false, false, 'invited',
     '{"notes": "Permanent staff. Handles academic appeals, housing disputes, financial hardship cases. 3 years at Guild."}'::jsonb);

    -- ── Communications & Social Media (2) ──
    INSERT INTO users (tenant_id, department_id, role_id, email, first_name, last_name, job_title, is_admin, is_owner, status, metadata) VALUES
    (t_id, dept_comms, role_manager,
     'j.davis@guild.uoo.ac.uk', 'Jennifer', 'Davis', 'Communications Manager',
     false, false, 'invited',
     '{"notes": "Permanent staff. Brand management, campaign strategy, analytics. 4 years at Guild."}'::jsonb),
    (t_id, dept_comms, role_staff,
     'a.wilson@guild.uoo.ac.uk', 'Alex', 'Wilson', 'Social Media & Content Officer',
     false, false, 'invited',
     '{"notes": "Permanent staff. Instagram, TikTok, website updates, newsletters. 2 years at Guild."}'::jsonb);

    -- ── Student Activities & Engagement (2) ──
    INSERT INTO users (tenant_id, department_id, role_id, email, first_name, last_name, job_title, is_admin, is_owner, status, metadata) VALUES
    (t_id, dept_activities, role_manager,
     'l.martinez@guild.uoo.ac.uk', 'Laura', 'Martinez', 'Activities & Engagement Manager',
     false, false, 'invited',
     '{"notes": "Permanent staff. Oversees 120 societies, 15 sports clubs, events programme. 6 years at Guild."}'::jsonb),
    (t_id, dept_activities, role_coordinator,
     'r.singh@guild.uoo.ac.uk', 'Raj', 'Singh', 'Societies & Events Coordinator',
     false, false, 'invited',
     '{"notes": "Permanent staff. Day-to-day society support, event approvals, room bookings. 2 years at Guild."}'::jsonb);

    -- ================================================================
    -- STEP 5: Set department heads
    -- ================================================================
    UPDATE departments SET head_user_id = user_sarah
        WHERE id = dept_leadership;
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE tenant_id = t_id AND email = 'j.okonkwo@uoo.ac.uk')
        WHERE id = dept_officers;
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE tenant_id = t_id AND email = 'm.scott@guild.uoo.ac.uk')
        WHERE id = dept_welfare;
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE tenant_id = t_id AND email = 'j.davis@guild.uoo.ac.uk')
        WHERE id = dept_comms;
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE tenant_id = t_id AND email = 'l.martinez@guild.uoo.ac.uk')
        WHERE id = dept_activities;

    -- ================================================================
    -- STEP 6: Re-seed signals with correct department references
    -- ================================================================

    -- ── ADVICE & WELFARE (8 signals) ──
    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    (t_id, 'manual', 'co_welfare', dept_welfare, 'welfare_case',
     'Financial Hardship: Student unable to pay rent',
     'Second-year Engineering student reports inability to pay February rent. Savings exhausted, parental support unavailable. At risk of eviction within 14 days.',
     'high', 'welfare',
     '["financial", "housing", "urgent"]'::jsonb,
     '{"student_ref": "STU-2024-4521", "case_type": "financial_hardship", "accommodation": "University Hall B, Room 308", "monthly_rent": 550, "arrears_amount": 550, "eviction_risk": true, "eviction_deadline": "2026-02-23"}'::jsonb,
     'new', NOW() - INTERVAL '2 hours'),

    (t_id, 'manual', 'co_welfare', dept_welfare, 'academic_appeal',
     'Academic Appeal: Failed Module — Extenuating Circumstances',
     'Third-year Nursing student requesting appeal for failed Clinical Practice module. Bereavement not considered. Deadline in 5 days.',
     'high', 'academic',
     '["appeal", "academic", "deadline"]'::jsonb,
     '{"student_ref": "STU-2023-2890", "module": "NUR3042 Clinical Practice", "grade_received": "F", "extenuating_type": "bereavement", "appeal_deadline": "2026-02-14"}'::jsonb,
     'new', NOW() - INTERVAL '6 hours'),

    (t_id, 'manual', 'co_welfare', dept_welfare, 'housing_dispute',
     'Housing Dispute: Landlord withholding £2,400 deposit',
     '4 students report landlord withholding deposit claiming pre-existing damage. Students have photographic evidence from move-in.',
     'medium', 'housing',
     '["housing", "legal", "deposit"]'::jsonb,
     '{"student_refs": ["STU-2023-1102", "STU-2023-1456", "STU-2023-0987", "STU-2023-1234"], "landlord": "Midlands Property Group Ltd", "deposit_total": 2400, "deposit_scheme": "DPS"}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    (t_id, 'agent', 'co_welfare', dept_welfare, 'welfare_case',
     'Mental Health: Tutor flagged student welfare concern',
     'Personal tutor referred student after attendance dropped from 95% to 40% over 6 weeks. Student consented to guild support.',
     'high', 'wellbeing',
     '["mental_health", "attendance", "referral"]'::jsonb,
     '{"student_ref": "STU-2024-3345", "referral_source": "personal_tutor", "attendance_current": 40, "attendance_previous": 95, "decline_period_weeks": 6}'::jsonb,
     'new', NOW() - INTERVAL '4 hours'),

    (t_id, 'manual', 'co_welfare', dept_welfare, 'safeguarding',
     'SAFEGUARDING: Student disclosed domestic situation',
     'During advice appointment, student disclosed controlling behaviour from partner. Medium risk. Student agreed to follow-up.',
     'critical', 'safeguarding',
     '["safeguarding", "domestic", "confidential"]'::jsonb,
     '{"student_ref": "STU-2022-5567", "disclosure_type": "domestic_abuse", "risk_level": "medium", "living_situation": "off_campus_with_partner", "immediate_danger": false}'::jsonb,
     'new', NOW() - INTERVAL '1 hour'),

    (t_id, 'manual', 'co_welfare', dept_welfare, 'welfare_case',
     'Financial Hardship: Maple Court resident — heating costs',
     'First-year student in Maple Court cannot afford electricity top-up. Room at 14°C. Using library as warm space.',
     'high', 'welfare',
     '["financial", "housing", "maple_court", "heating"]'::jsonb,
     '{"student_ref": "STU-2025-0112", "accommodation": "Maple Court, Flat 3B", "specific_issue": "heating_costs", "room_temperature_celsius": 14}'::jsonb,
     'new', NOW() - INTERVAL '3 days'),

    (t_id, 'manual', 'co_welfare', dept_welfare, 'welfare_case',
     'Financial Hardship: Maple Court resident — rent increase',
     'Student received mid-term rent increase of £45/month not in original contract. Cannot afford new amount.',
     'medium', 'welfare',
     '["financial", "housing", "maple_court", "rent"]'::jsonb,
     '{"student_ref": "STU-2024-0834", "accommodation": "Maple Court, Flat 7A", "original_rent": 520, "new_rent": 565}'::jsonb,
     'new', NOW() - INTERVAL '5 days'),

    (t_id, 'manual', 'co_welfare', dept_welfare, 'welfare_case',
     'Financial Hardship: Maple Court resident — mould and maintenance',
     'Student reports mould in bedroom and bathroom, reported 6 weeks ago with no action. Experiencing respiratory issues.',
     'high', 'welfare',
     '["health", "housing", "maple_court", "maintenance"]'::jsonb,
     '{"student_ref": "STU-2025-0298", "accommodation": "Maple Court, Flat 5C", "specific_issue": "mould_damp", "health_impact": true}'::jsonb,
     'new', NOW() - INTERVAL '2 days');

    -- ── STUDENT ACTIVITIES & ENGAGEMENT (8 signals) ──
    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    (t_id, 'manual', 'co_events', dept_activities, 'event_request',
     'Event Proposal: Gaming Society Pub Crawl',
     'Gaming Society submitted event proposal for city centre pub crawl. 45 attendees, alcohol, off-campus. Risk assessment not submitted.',
     'high', 'events',
     '["event", "alcohol", "off_campus", "risk_assessment"]'::jsonb,
     '{"society_name": "Gaming Society", "event_date": "2026-02-21", "expected_attendance": 45, "alcohol_involved": true, "risk_assessment_submitted": false}'::jsonb,
     'new', NOW() - INTERVAL '8 hours'),

    (t_id, 'manual', 'co_events', dept_activities, 'budget_request',
     'Budget Request: Freshers'' Fair Mega Stall — £2,400',
     'Activities requesting £2,400 for enhanced Freshers'' Fair stall. Previous year was £1,600. Includes banner, merch, photo booth.',
     'medium', 'budget',
     '["budget", "freshers", "events"]'::jsonb,
     '{"amount_requested": 2400, "previous_year_budget": 1600, "increase_percentage": 50, "approval_needed_by": "2026-03-01"}'::jsonb,
     'new', NOW() - INTERVAL '2 days'),

    (t_id, 'manual', 'co_events', dept_activities, 'budget_request',
     'Grant Application: Photography Society — £350',
     'Photography Society applying for equipment grant. 2 tripods and lighting kit. Currently borrowing from Media department.',
     'low', 'budget',
     '["grant", "equipment", "society"]'::jsonb,
     '{"society_name": "Photography Society", "amount_requested": 350, "current_membership": 34, "active_members": 22}'::jsonb,
     'new', NOW() - INTERVAL '3 days'),

    (t_id, 'agent', 'co_events', dept_activities, 'room_conflict',
     'Booking Conflict: Room G.04 — Debate Society vs Film Society',
     'Double booking for Room G.04 on Wednesday 12 Feb, 18:00-20:00. Debate (30 members) and Film (50 members) both confirmed.',
     'high', 'logistics',
     '["booking", "conflict", "room"]'::jsonb,
     '{"room": "G.04", "date": "2026-02-12", "time_slot": "18:00-20:00", "booking_1": {"society": "Debate Society", "expected": 30}, "booking_2": {"society": "Film Society", "expected": 50}}'::jsonb,
     'new', NOW() - INTERVAL '10 hours'),

    (t_id, 'agent', 'ind_engagement', dept_activities, 'society_dormancy',
     'Dormancy Alert: Robotics Society — 90 days inactive',
     'No logged activity for 90 days. Committee not responding to check-ins. Eligible for deregistration.',
     'medium', 'engagement',
     '["dormancy", "society", "inactive"]'::jsonb,
     '{"society_name": "Robotics Society", "days_inactive": 90, "committee_size": 5, "committee_responded": 0, "total_membership": 18}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    (t_id, 'agent', 'co_events', dept_activities, 'risk_assessment_overdue',
     'OVERDUE: Risk Assessment — Climbing Society Peak District Trip',
     'Approved trip to Peak District on Feb 15 but risk assessment is 5 days overdue. Outdoor climbing, transport, camping. Cannot proceed without RA.',
     'critical', 'compliance',
     '["risk_assessment", "overdue", "outdoor", "safety"]'::jsonb,
     '{"society_name": "Climbing Society", "event_date": "2026-02-15", "days_overdue": 5, "participants": 16, "activities": ["outdoor_climbing", "camping", "minibus_transport"]}'::jsonb,
     'new', NOW() - INTERVAL '5 hours'),

    (t_id, 'agent', 'ind_engagement', dept_activities, 'attendance_low',
     'Low Attendance Alert: Film Night — 3 attendees (expected 40)',
     'Third consecutive session under 10 attendees. Room costs £35/session. Cost per attendee now £11.67.',
     'low', 'engagement',
     '["attendance", "declining", "cost_efficiency"]'::jsonb,
     '{"event_name": "Film Night", "society": "Film Society", "actual_attendance": 3, "expected_attendance": 40, "consecutive_low_sessions": 3}'::jsonb,
     'new', NOW() - INTERVAL '4 days'),

    (t_id, 'agent', 'ind_engagement', dept_activities, 'handover_incomplete',
     'Handover Alert: Drama Society — new committee, no bank access',
     'New committee elected in January but outgoing treasurer has not transferred bank signatory access. £1,200 in account, production costs due.',
     'high', 'governance',
     '["handover", "finance", "governance"]'::jsonb,
     '{"society_name": "Drama Society", "bank_balance": 1200, "upcoming_costs": 850, "days_since_agm": 18}'::jsonb,
     'new', NOW() - INTERVAL '12 hours');

    -- ── COMMUNICATIONS & SOCIAL MEDIA (4 signals) ──
    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    (t_id, 'agent', 'co_comms', dept_comms, 'sentiment_drop',
     'Instagram Engagement Down 40% — 2 week trend',
     'Engagement rate dropped from 5.2% to 3.1%. Coincides with shift from student stories to administrative content.',
     'medium', 'communications',
     '["social_media", "engagement", "declining"]'::jsonb,
     '{"platform": "instagram", "current_value": 3.1, "previous_value": 5.2, "change_percentage": -40.4, "followers": 8200}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    (t_id, 'agent', 'co_comms', dept_comms, 'newsletter_anomaly',
     'Newsletter Open Rate Anomaly: 12% vs 35% average',
     'Subject line "Guild Committee Minutes — January Update" drove 12% opens vs 35% average. 23 unsubscribes vs 3 normal.',
     'low', 'communications',
     '["newsletter", "email", "open_rate"]'::jsonb,
     '{"open_rate": 12, "average_open_rate": 35, "subject_line": "Guild Committee Minutes — January Update", "unsubscribes": 23}'::jsonb,
     'new', NOW() - INTERVAL '6 days'),

    (t_id, 'agent', 'co_comms', dept_comms, 'traffic_spike',
     'Website Traffic Spike: 340% increase from Reddit',
     '12,000 page views vs 2,800 average. Concentrated on /elections page. Source: r/UniUK thread on student union elections.',
     'low', 'communications',
     '["website", "traffic", "viral"]'::jsonb,
     '{"page_views": 12000, "daily_average": 2800, "increase_percentage": 340, "top_page": "/elections", "traffic_source": "reddit.com/r/UniUK"}'::jsonb,
     'new', NOW() - INTERVAL '2 days'),

    (t_id, 'agent', 'co_comms', dept_comms, 'campaign_review',
     'Campaign Review Due: Freshers'' Welcome Campaign',
     'Campaign ended 3 weeks ago. Post-campaign analysis due by Feb 14. £1,800 budget across Instagram, TikTok, email, print.',
     'low', 'communications',
     '["campaign", "review", "freshers"]'::jsonb,
     '{"campaign_name": "Freshers'' Welcome 2026", "budget": 1800, "review_deadline": "2026-02-14", "assigned_to": "Alex Wilson"}'::jsonb,
     'new', NOW() - INTERVAL '5 days');

    -- ── BUDGET & FINANCE — co_finance (5 signals) ──
    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    (t_id, 'manual', 'co_finance', dept_leadership, 'budget_reallocation',
     'Budget Reallocation: Comms → Activities (£1,200)',
     'Comms has £1,200 underspend on digital ads. Activities requesting reallocation for society grants — fund oversubscribed.',
     'medium', 'budget',
     '["reallocation", "budget", "cross_department"]'::jsonb,
     '{"from_department": "Communications & Social Media", "to_department": "Student Activities & Engagement", "amount": 1200}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    (t_id, 'agent', 'co_finance', dept_leadership, 'budget_threshold',
     'ALERT: Bar operations at 87% of annual budget (Q3)',
     'Bar operations spent 87% of annual budget with one quarter remaining. Unplanned equipment replacements drove overspend.',
     'high', 'budget',
     '["threshold", "overspend", "alert"]'::jsonb,
     '{"annual_budget": 45000, "spent_to_date": 39150, "percentage_spent": 87, "projected_overspend": 5400}'::jsonb,
     'new', NOW() - INTERVAL '2 days'),

    (t_id, 'manual', 'co_finance', dept_leadership, 'invoice_approval',
     'Invoice Approval: Catering supplier — £890',
     'Invoice from Midlands Catering Co for January events. 3 events covered. Within 5% of purchase order.',
     'low', 'finance',
     '["invoice", "approval", "catering"]'::jsonb,
     '{"supplier": "Midlands Catering Co", "amount": 890, "purchase_order_amount": 850, "due_date": "2026-02-28"}'::jsonb,
     'new', NOW() - INTERVAL '3 days'),

    (t_id, 'agent', 'co_finance', dept_leadership, 'gift_aid_deadline',
     'Deadline: Gift Aid Claim — submission due in 12 days',
     'Annual Gift Aid claim needs HMRC submission by Feb 21. £8,400 eligible donations. Estimated claim: £2,100.',
     'medium', 'compliance',
     '["gift_aid", "hmrc", "deadline", "charity"]'::jsonb,
     '{"submission_deadline": "2026-02-21", "eligible_donations": 8400, "estimated_claim_value": 2100, "days_remaining": 12}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    (t_id, 'agent', 'co_finance', dept_leadership, 'spend_anomaly',
     'Spend Anomaly: Activities Dept — 3x normal supplier spend',
     'Activities department supplier invoices total £4,200 this month vs £1,400 monthly average. Driven by multiple one-off equipment purchases.',
     'medium', 'finance',
     '["spend", "anomaly", "activities"]'::jsonb,
     '{"department": "Student Activities & Engagement", "current_month_spend": 4200, "monthly_average": 1400, "multiplier": 3.0}'::jsonb,
     'new', NOW() - INTERVAL '2 days');

    -- ── COMPLIANCE & GOVERNANCE — ind_governance (5 signals) ──
    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    (t_id, 'agent', 'ind_governance', dept_leadership, 'audit_reminder',
     'Annual Audit Prep: 6 weeks to external audit date',
     'External audit March 23. Need bank reconciliations, society account summaries, grant reports, trustee expenses.',
     'medium', 'compliance',
     '["audit", "preparation", "annual"]'::jsonb,
     '{"audit_date": "2026-03-23", "weeks_remaining": 6, "auditor": "Smith & Partners LLP"}'::jsonb,
     'new', NOW() - INTERVAL '4 days'),

    (t_id, 'agent', 'ind_governance', dept_leadership, 'policy_review_due',
     'Policy Review Due: Safeguarding Policy — last updated 14 months ago',
     'Guild Safeguarding & Vulnerable Adults Policy last reviewed Dec 2024. Charity Commission recommends annual review. Must be board-approved.',
     'high', 'governance',
     '["policy", "safeguarding", "overdue", "review"]'::jsonb,
     '{"policy_name": "Safeguarding & Vulnerable Adults Policy", "last_reviewed": "2024-12-01", "months_since_review": 14, "review_standard": "annual", "requires_board_approval": true}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    (t_id, 'agent', 'ind_governance', dept_leadership, 'governance_deadline',
     'Trustee Board Meeting: Papers due in 5 days',
     'Quarterly Board of Trustees meeting Feb 24. Management accounts, officer reports, and risk register must be circulated 5 days prior.',
     'high', 'governance',
     '["trustees", "board", "deadline", "papers"]'::jsonb,
     '{"meeting_date": "2026-02-24", "papers_deadline": "2026-02-19", "required_papers": ["management_accounts", "officer_reports", "risk_register", "membership_data"]}'::jsonb,
     'new', NOW() - INTERVAL '6 hours'),

    (t_id, 'agent', 'ind_governance', dept_leadership, 'compliance_alert',
     'Charity Commission: Annual Return due March 31',
     'UOOSG annual return to Charity Commission. Requires income/expenditure, trustee details, activities summary. Penalty for late submission.',
     'medium', 'compliance',
     '["charity_commission", "annual_return", "deadline"]'::jsonb,
     '{"deadline": "2026-03-31", "charity_number": "1087654", "financial_year_end": "2025-07-31", "penalty_risk": true}'::jsonb,
     'new', NOW() - INTERVAL '3 days'),

    (t_id, 'agent', 'ind_governance', dept_leadership, 'safeguarding_overdue',
     'OVERDUE: Staff safeguarding training renewal — 3 staff expired',
     'DBS enhanced checks and safeguarding Level 2 training expired for 3 staff members. Must be renewed before next student-facing work.',
     'critical', 'safeguarding',
     '["safeguarding", "training", "overdue", "compliance"]'::jsonb,
     '{"expired_staff_count": 3, "training_type": "Safeguarding Level 2", "dbs_type": "Enhanced", "affected_departments": ["Advice & Welfare", "Student Activities & Engagement"]}'::jsonb,
     'new', NOW() - INTERVAL '2 hours');

    -- ── OPERATIONS HUB — co_ops (5 signals) ──
    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, status, created_at) VALUES

    (t_id, 'agent', 'co_ops', dept_activities, 'scheduling_gap',
     'Staffing Gap: Friday evening bar shift — 2 positions unfilled',
     'Student bar staff rota for Friday 14 Feb has 2 unfilled shifts (18:00-23:00). Valentines event expected to be busy. Need coverage.',
     'high', 'operations',
     '["scheduling", "staffing", "bar", "urgent"]'::jsonb,
     '{"date": "2026-02-14", "shift_time": "18:00-23:00", "positions_needed": 2, "event": "Valentines Night", "expected_footfall": 350}'::jsonb,
     'new', NOW() - INTERVAL '8 hours'),

    (t_id, 'manual', 'co_ops', dept_leadership, 'venue_inquiry',
     'External Venue Hire: Corporate training day request',
     'Local company Midlands Tech requesting Main Hall for all-day training session March 5. Revenue opportunity: £600. Need to check society bookings.',
     'low', 'operations',
     '["venue", "hire", "external", "revenue"]'::jsonb,
     '{"enquirer": "Midlands Tech Ltd", "venue": "Main Hall", "date": "2026-03-05", "duration_hours": 8, "proposed_fee": 600, "catering_required": true}'::jsonb,
     'new', NOW() - INTERVAL '2 days'),

    (t_id, 'agent', 'co_ops', dept_leadership, 'maintenance_alert',
     'Maintenance: Meeting Room B projector failure reported',
     'Projector in Meeting Room B not powering on. 3 society meetings and 1 staff training scheduled this week in that room.',
     'medium', 'facilities',
     '["maintenance", "projector", "room", "urgent"]'::jsonb,
     '{"room": "Meeting Room B", "equipment": "Ceiling Projector", "reported_by": "Raj Singh", "bookings_affected": 4, "replacement_cost_estimate": 450}'::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    (t_id, 'agent', 'co_ops', dept_leadership, 'resource_conflict',
     'Resource Conflict: PA system double-booked Feb 15',
     'Portable PA system booked by both Climbing Society (departure briefing, 09:00) and Drama Society (rehearsal, 10:00). Only 1 unit available.',
     'medium', 'operations',
     '["resource", "conflict", "equipment", "booking"]'::jsonb,
     '{"resource": "Portable PA System", "date": "2026-02-15", "booking_1": {"group": "Climbing Society", "time": "09:00", "purpose": "departure_briefing"}, "booking_2": {"group": "Drama Society", "time": "10:00", "purpose": "rehearsal"}, "units_available": 1}'::jsonb,
     'new', NOW() - INTERVAL '10 hours'),

    (t_id, 'agent', 'co_ops', dept_leadership, 'staff_shortage',
     'Staff Absence: Welfare Advisor out — 3 appointments need cover',
     'Sophie Lee called in sick. 3 pre-booked welfare appointments today (09:30, 11:00, 14:00). One is a safeguarding follow-up.',
     'critical', 'operations',
     '["staff", "absence", "cover", "welfare"]'::jsonb,
     '{"absent_staff": "Sophie Lee", "department": "Advice & Welfare", "appointments_affected": 3, "includes_safeguarding": true, "date": "2026-02-10"}'::jsonb,
     'new', NOW() - INTERVAL '30 minutes');

    -- ── CROSS-SIGNAL PATTERNS (2 signals) ──
    INSERT INTO signals (tenant_id, source_type, source_agent_id, source_department_id, signal_type, title, description, priority, category, tags, data, related_department_ids, status, created_at) VALUES

    (t_id, 'agent', 'co_welfare', dept_welfare, 'cross_signal',
     'PATTERN: 3 welfare cases from Maple Court this month',
     'AI detected pattern: 3 separate welfare cases involving Maple Court residents in 14 days. Heating, rent, maintenance — suggests systemic provider issue.',
     'high', 'pattern',
     '["cross_signal", "maple_court", "housing", "pattern"]'::jsonb,
     '{"pattern_type": "location_cluster", "location": "Maple Court", "signal_count": 3, "time_window_days": 14}'::jsonb,
     ('["' || dept_welfare::text || '"]')::jsonb,
     'new', NOW() - INTERVAL '1 day'),

    (t_id, 'agent', 'ind_engagement', dept_activities, 'cross_signal',
     'PATTERN: Society engagement down 20% since mid-term',
     'Overall society event attendance down 20% vs same period last term. 8 societies declining. Exceeds normal seasonal pattern by 12%.',
     'medium', 'pattern',
     '["cross_signal", "engagement", "trend", "societies"]'::jsonb,
     '{"pattern_type": "trend_decline", "decline_percentage": 20, "normal_seasonal_decline": 8, "affected_societies": 8}'::jsonb,
     ('["' || dept_activities::text || '", "' || dept_comms::text || '"]')::jsonb,
     'new', NOW() - INTERVAL '3 days');

    -- ================================================================
    -- STEP 7: Update discovery audit contact to Sarah Mitchell
    -- ================================================================
    UPDATE discovery_audits
    SET decision_maker_name = 'Sarah Mitchell',
        decision_maker_role = 'General Manager',
        decision_maker_email = 's.mitchell@guild.uoo.ac.uk'
    WHERE tenant_id = t_id;

END $$;

-- =====================================================
-- COMPLETE
-- =====================================================
-- Restructured Guild departments:
--   5 departments (was 6)
--   10 staff members (was 19)
--   37 signals across 8 agents:
--     co_welfare (8), co_events (8), co_comms (4), co_finance (5),
--     ind_governance (5), co_ops (5), cross-signal (2)
--   Sarah Mitchell is now General Manager (admin)
-- =====================================================

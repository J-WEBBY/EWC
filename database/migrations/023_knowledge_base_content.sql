-- =============================================================================
-- Migration 023 — Knowledge Base Content Seed
-- Real clinic content across all 6 categories for Aria to reference
-- Run in Supabase SQL editor AFTER 014_wellness_seed.sql
-- =============================================================================

DO $$
DECLARE
  -- Category IDs
  cat_protocols   uuid;
  cat_policies    uuid;
  cat_pricing     uuid;
  cat_handbook    uuid;
  cat_marketing   uuid;
  cat_compliance  uuid;

  -- Document IDs
  doc_pricing     uuid;
  doc_protocols   uuid;
  doc_policies    uuid;
  doc_handbook    uuid;
  doc_marketing   uuid;
  doc_compliance  uuid;

BEGIN

  -- Resolve category IDs
  SELECT id INTO cat_protocols  FROM knowledge_categories WHERE slug = 'clinical-protocols';
  SELECT id INTO cat_policies   FROM knowledge_categories WHERE slug = 'patient-policies';
  SELECT id INTO cat_pricing    FROM knowledge_categories WHERE slug = 'pricing-packages';
  SELECT id INTO cat_handbook   FROM knowledge_categories WHERE slug = 'staff-handbook';
  SELECT id INTO cat_marketing  FROM knowledge_categories WHERE slug = 'marketing-brand';
  SELECT id INTO cat_compliance FROM knowledge_categories WHERE slug = 'compliance-legal';

  IF cat_pricing IS NULL THEN
    RAISE EXCEPTION 'knowledge_categories not seeded — run 014_wellness_seed.sql first';
  END IF;

  -- Skip if already seeded
  IF (SELECT COUNT(*) FROM knowledge_documents) > 0 THEN
    RAISE NOTICE 'Knowledge documents already seeded — skipping 023';
    RETURN;
  END IF;

  -- ============================================================
  -- DOCUMENT 1: Treatment Price Guide
  -- ============================================================
  INSERT INTO knowledge_documents
    (category_id, file_name, file_type, title, description, tags, processing_status, chunk_count, visibility)
  VALUES
    (cat_pricing, 'treatment-price-guide-2024.txt', 'text/plain',
     'Treatment Price Guide 2024',
     'Full pricing for all aesthetic, wellness and medical treatments including packages and finance options.',
     '["pricing","treatments","botox","fillers","coolsculpting","iv-therapy","packages"]',
     'completed', 12, 'internal')
  RETURNING id INTO doc_pricing;

  INSERT INTO knowledge_chunks (document_id, chunk_index, section_title, content) VALUES
  (doc_pricing, 0, 'Anti-Wrinkle Injections (Botox)',
   'Anti-Wrinkle Injections (Botox): 1 area £249, 2 areas £299, 3 areas £349. A 3-week review appointment is included in the price. Common areas treated include forehead lines, frown lines (glabella), and crow''s feet. Top-up treatments within 3 weeks of initial appointment charged at £50. Results last 3–4 months on average.'),

  (doc_pricing, 1, 'Dermal Fillers',
   'Dermal Fillers: Lip enhancement from £349, cheek augmentation from £499, jawline contouring from £549, chin projection from £399, tear trough (under-eye) from £449, nasolabial folds from £349, full-face rejuvenation package from £999. All filler treatments include a 2-week review. Hyaluronic acid fillers only — premium brands (Juvederm, Restylane).'),

  (doc_pricing, 2, 'Skin Rejuvenation Treatments',
   'Profhilo bioremodelling: £399 per session, recommended course of 2 sessions 4 weeks apart (£749 for both). Skin Boosters (Juvederm Volite): £299 per session. Chemical Peels: superficial peel £149, medium peel £249. Microneedling (Dermapen): single session £199, course of 3 £499. LED light therapy: single session £99, course of 6 £499.'),

  (doc_pricing, 3, 'Body Contouring',
   'CoolSculpting fat freezing: single applicator from £799, dual applicators from £1,299, full treatment packages from £1,499 (2 areas). Results visible at 4–8 weeks, full results at 3 months. HIFU (High-Intensity Focused Ultrasound): face and neck lift from £899, body tightening per area from £499. Pressotherapy lymphatic drainage: single session £79, course of 6 £399.'),

  (doc_pricing, 4, 'IV Therapy & Wellness Injections',
   'IV Vitamin C (immune boost): £149. Myers Cocktail (energy, immunity, hydration): £199. Glutathione (antioxidant, skin brightening): £179. NAD+ Therapy (cellular energy, anti-ageing): 500mg £399, 1000mg £699. B12 Injection (energy boost): £35 per injection, course of 4 £119. Biotin Injection (hair and skin): £45. Iron Infusion (medical, requires blood test): from £299.'),

  (doc_pricing, 5, 'Weight Management Programme',
   'Weight Management: Initial consultation with medical assessment £150 (deducted from programme cost). Medically supervised programme from £299 per month includes monthly reviews, prescription medication where appropriate, dietary guidance, and body composition monitoring. GLP-1 medication programme (Semaglutide/Wegovy): from £199 per month. Hormone optimisation therapy: initial assessment £200, ongoing management from £250 per month.'),

  (doc_pricing, 6, 'Medical Services',
   'GP Consultation: £150 for 20-minute appointment. Health Screening (MOT): Essential £299, Comprehensive £499, Executive £899. Blood tests: standard panel from £89, full hormone panel £199, thyroid function £79, vitamin D £59, STI screen from £149. Travel vaccinations from £45 per jab. Fit-to-fly and medical letters: £75.'),

  (doc_pricing, 7, 'Voice & Aesthetic Packages',
   'Aesthetic Refresh Package: Botox 2 areas + Lip Filler = £599 (save £49). Glow Package: 3x Skin Boosters + 1x Medium Peel = £799 (save £98). Anti-Ageing Starter: Botox 3 areas + Profhilo 1 session = £699 (save £49). Transform Package: CoolSculpting 2 areas + Profhilo 2 sessions = £2,099 (save £199). Wellness Bundle: 4x B12 + Myers Cocktail = £239 (save £35).'),

  (doc_pricing, 8, 'Finance & Payment Options',
   'Finance available through Payl8r for treatments over £300: 0% interest for 3 months, low-rate options over 6–24 months (subject to credit check). We accept all major credit and debit cards, bank transfer, and cash. Deposits: £50 required to secure all appointment bookings, deducted from treatment cost on the day. Corporate accounts available for companies booking for employees — contact clinic manager.'),

  (doc_pricing, 9, 'Membership & Loyalty',
   'VIP Membership: £99/month includes 10% off all treatments, priority booking, one free B12 injection per month, and annual health review at no extra charge. Refer a Friend: both patient and referral receive £25 credit when referral completes first treatment worth £150+. Loyalty points: 1 point per £1 spent, 100 points = £5 credit. Corporate wellness packages available on request.'),

  (doc_pricing, 10, 'Cancellation & Deposit Policy',
   'All treatment deposits are non-refundable with less than 48 hours notice. Cancellations with more than 48 hours notice: deposit transferred to new appointment. Same-day cancellations: deposit forfeited. No-shows: deposit forfeited and future bookings require full payment upfront. Rescheduling within 48 hours: treated as cancellation.'),

  (doc_pricing, 11, 'Consultation Fees',
   'All new patients require a consultation before aesthetic treatment. Consultation fee: £50 (fully redeemable against first treatment). Consultations for medical services: £150 (GP-level assessment). Consultations are conducted with a qualified clinician — not a sales consultation. We do not carry out treatments on the same day as consultation for new patients (safety protocol).');

  -- ============================================================
  -- DOCUMENT 2: Clinical Protocols
  -- ============================================================
  INSERT INTO knowledge_documents
    (category_id, file_name, file_type, title, description, tags, processing_status, chunk_count, visibility)
  VALUES
    (cat_protocols, 'post-treatment-care-guidelines.txt', 'text/plain',
     'Post-Treatment Care Guidelines',
     'Aftercare instructions and contraindications for all clinic treatments.',
     '["aftercare","botox","fillers","coolsculpting","contraindications","protocols"]',
     'completed', 9, 'internal')
  RETURNING id INTO doc_protocols;

  INSERT INTO knowledge_chunks (document_id, chunk_index, section_title, content) VALUES
  (doc_protocols, 0, 'Post-Botox Aftercare (First 24–48 Hours)',
   'Post-Botox Care: Do not rub, touch, or massage treated areas for 24 hours. Remain upright — do not lie flat for 4 hours after treatment. Avoid strenuous exercise, saunas, steam rooms, and sunbeds for 24 hours. Avoid alcohol for 24 hours. Do not use facial massage tools or have facials for 2 weeks. Avoid ibuprofen and aspirin for 24 hours (paracetamol is fine). Do not apply pressure to face (e.g. sleeping face-down) for 24 hours. Results appear within 3–14 days; full effect visible at 2 weeks.'),

  (doc_protocols, 1, 'Post-Filler Aftercare (First 48–72 Hours)',
   'Post-Filler Care: Mild swelling, bruising and tenderness are normal for 2–7 days — this is not a sign of complications. Apply a cold compress (wrapped in cloth) to reduce swelling for first 24 hours. Avoid dental work for 2 weeks (risk of bacterial spread). Avoid vigorous exercise and extreme heat (saunas, hot yoga) for 48 hours. Avoid alcohol for 24 hours. Avoid direct sun exposure for 2 weeks — use SPF 50+ daily. Sleep on a slightly elevated pillow for first 2 nights. Full results settle in 2–4 weeks.'),

  (doc_protocols, 2, 'Post-CoolSculpting Aftercare',
   'Post-CoolSculpting Care: Treated area will feel numb, tender, swollen or bruised for 1–4 weeks — this is normal and expected. You may feel a strange "frozen" sensation for several weeks. Redness and firmness in the treated area: normal for up to 2 weeks. Massage the treated area for 2 minutes twice daily from Day 2 (aids fat cell elimination). Wear loose, comfortable clothing over treated areas initially. Avoid extreme heat or cold to treated area for 1 week. Results start to appear at 4–8 weeks, full results at 3 months. Multiple sessions are sometimes needed for optimal results.'),

  (doc_protocols, 3, 'Post-IV Therapy Aftercare',
   'Post-IV Therapy Care: Stay well hydrated — aim for 2–3 litres of water over the next 24 hours. You may feel tired immediately after NAD+ therapy; arrange transport home. Vitamin C: urine may appear bright yellow — this is normal (riboflavin excretion). Avoid vigorous exercise for 6 hours. If insertion site is sore, apply a warm compress after 24 hours. Call the clinic immediately if any signs of infection appear at the IV site (redness, swelling, heat, discharge).'),

  (doc_protocols, 4, 'Contraindications — Botox',
   'Botox Contraindications (DO NOT TREAT): Pregnancy or breastfeeding. Neuromuscular disorders including myasthenia gravis, Eaton-Lambert syndrome, ALS/motor neuron disease. Known allergy or hypersensitivity to botulinum toxin or any excipient. Active skin infection, cold sore, or open wound at injection site. Aminoglycoside antibiotics (e.g. gentamicin) — must be disclosed. Blood thinning medication: discuss with prescriber; caution advised. Relative contraindications: ptosis, previous overcorrection, unrealistic expectations.'),

  (doc_protocols, 5, 'Contraindications — Dermal Fillers',
   'Filler Contraindications (DO NOT TREAT): Pregnancy or breastfeeding. Known allergy to hyaluronic acid or lidocaine. Active skin infection, cold sore, or inflammatory skin condition at treatment site. Autoimmune conditions (SLE, scleroderma) — seek medical clearance first. Blood-thinning medication — bruising risk high; patient to make informed decision. Dental work planned within 2 weeks. History of cold sores (HSV) in lip area — prophylactic antiviral recommended. Previously permanent fillers in area — carry risk of late granuloma formation.'),

  (doc_protocols, 6, 'Contraindications — CoolSculpting',
   'CoolSculpting Contraindications (DO NOT TREAT): Cryoglobulinemia (cold-triggered blood protein clumping). Cold agglutinin disease. Paroxysmal cold hemoglobinuria. Raynaud''s disease or phenomenon. Impaired skin sensation in treatment area. Open wounds or active skin lesions. Recent surgery in treatment area (last 3 months). Hernia or abdominal muscle separation (diastasis recti) for abdominal treatment. Poor skin laxity — may worsen appearance; assess carefully.'),

  (doc_protocols, 7, 'Contraindications — IV Therapy',
   'IV Therapy Contraindications: Kidney disease (adjust dose and content — seek GP guidance). G6PD deficiency (cannot tolerate high-dose Vitamin C — causes haemolysis). Active cardiac arrhythmia — NAD+ caution. Pregnancy: review each ingredient individually — most IV therapy is contraindicated. Known allergy to any IV component. Active infection or sepsis. No IV therapy without valid clinical assessment. All IV treatments prescribed and supervised by registered medical practitioner.'),

  (doc_protocols, 8, 'Emergency Procedures',
   'Emergency Procedures: Anaphylaxis — call 999 immediately, administer EpiPen (location: treatment room emergency kit), lay patient flat with legs elevated, initiate BLS if required. Vascular occlusion (filler) — immediate recognition is critical: blanching/mottling, severe pain, tissue necrosis risk. Dissolve immediately with hyaluronidase (Hyalase) — stock held on premises. Call 999 if no improvement in 20 minutes. Vasovagal (fainting) — lay flat, elevate legs, cold compress to face, monitor. All clinical staff must hold current BLS certification. Emergency folder location: reception desk, behind monitor.');

  -- ============================================================
  -- DOCUMENT 3: Patient Policies
  -- ============================================================
  INSERT INTO knowledge_documents
    (category_id, file_name, file_type, title, description, tags, processing_status, chunk_count, visibility)
  VALUES
    (cat_policies, 'patient-policies-booking-terms.txt', 'text/plain',
     'Patient Policies & Booking Terms',
     'All patient-facing policies: booking, consent, cancellation, GDPR, and confidentiality.',
     '["policies","booking","cancellation","consent","gdpr","confidentiality"]',
     'completed', 6, 'internal')
  RETURNING id INTO doc_policies;

  INSERT INTO knowledge_chunks (document_id, chunk_index, section_title, content) VALUES
  (doc_policies, 0, 'Booking & Deposit Policy',
   'Booking Policy: All appointments must be booked online at ewellnessclinic.co.uk/book or by calling the clinic. A £50 deposit is required to secure all bookings (deducted from treatment cost on the day). Deposits are transferred to a rescheduled appointment if 48+ hours notice is given. Deposits are forfeited on same-day cancellation or no-show. Repeat no-shows: future bookings require full payment upfront. Consultation appointments require a £50 fee (redeemable against first treatment). New patients: consultations and treatments cannot be performed on the same day.'),

  (doc_policies, 1, 'Cancellation & Rescheduling',
   'Cancellation Policy: More than 48 hours notice — deposit transferred to new appointment, no charge. Less than 48 hours notice — deposit forfeited. Same-day cancellation — deposit forfeited. No-show — deposit forfeited; note added to patient record. To cancel or reschedule: online booking portal, telephone during clinic hours, or email info@edgbastonwellness.co.uk. We do not accept cancellations by social media message. Force majeure (genuine emergency): clinic manager discretion — provide documentation.'),

  (doc_policies, 2, 'Consent & Patient Safety',
   'Consent Policy: Written informed consent is required before all treatments. Consent forms are completed digitally via the patient portal. Patients have a 7-day cooling-off period after consultation before treatment proceeds (aesthetic treatments). Medical history form must be completed and verified before first appointment — incomplete forms will result in appointment cancellation. Under-18s: parent or legal guardian must provide written consent and be present during treatment. The clinic reserves the right to refuse treatment where clinical assessment determines it inappropriate or unsafe.'),

  (doc_policies, 3, 'Confidentiality & Medical Records',
   'Confidentiality: All patient information is strictly confidential and held in accordance with GDPR. Patient medical records are retained for 7 years post last treatment (NHS guidance for private clinics). Records will only be shared with other healthcare providers with explicit written patient consent, or where required by law. Patients may request a copy of their records under a Subject Access Request (SAR) — allow 30 days. Records are stored securely using encrypted, UK-based servers (Supabase/AWS EU).'),

  (doc_policies, 4, 'Complaints Procedure',
   'Complaints: We take all feedback seriously. To make a complaint: speak with the Clinic Manager on the day, email complaints@edgbastonwellness.co.uk, or write to the clinic address. Complaints are acknowledged within 2 working days. Target resolution: 20 working days. Escalation: if unresolved, patients may contact the Care Quality Commission (CQC) or the relevant professional regulator (GMC, NMC). If you experienced an adverse clinical outcome, you may also be entitled to seek independent clinical review.'),

  (doc_policies, 5, 'Finance & Payment Terms',
   'Payment Policy: Payment is due on the day of treatment. We accept all major credit and debit cards (Visa, Mastercard, Amex), bank transfer, and cash. Finance plans via Payl8r: available for treatments £300+, subject to credit approval. Corporate accounts: invoiced monthly, 30-day payment terms. No personal cheques accepted. Gift vouchers: valid for 12 months from purchase date, non-refundable, non-transferable for cash. Vouchers may be applied to any treatment.');

  -- ============================================================
  -- DOCUMENT 4: Staff Handbook
  -- ============================================================
  INSERT INTO knowledge_documents
    (category_id, file_name, file_type, title, description, tags, processing_status, chunk_count, visibility)
  VALUES
    (cat_handbook, 'clinic-operations-manual.txt', 'text/plain',
     'Clinic Operations Manual',
     'Staff procedures, escalation paths, emergency contacts, and daily operations guide.',
     '["staff","operations","escalation","emergency","protocols","hr"]',
     'completed', 6, 'internal')
  RETURNING id INTO doc_handbook;

  INSERT INTO knowledge_chunks (document_id, chunk_index, section_title, content) VALUES
  (doc_handbook, 0, 'Clinic Hours & Key Contacts',
   'Clinic Hours: Monday–Friday 9am–7pm, Saturday 9am–5pm, Sunday closed. Bank holidays: closed. Emergency out-of-hours advice line for existing patients: leave voicemail and a clinician will respond within 4 hours for urgent queries. Key Contacts: Dr Suresh Ganata (Medical Director) — mobile in emergency folder. Clinic Manager — internal extension 101. Reception — internal extension 100. IT/System Support: Jwebly Ltd (Joseph Enemuwe) — joseph@jwebly.co.uk. Supabase emergency access: credentials in secure ops folder.'),

  (doc_handbook, 1, 'Escalation Procedures',
   'Escalation Path: Clinical complaint → Clinic Manager → Medical Director (Dr Ganata). Clinical incident or adverse outcome → immediately notify Medical Director. CQC-reportable incidents (e.g. death, serious injury) → Dr Ganata notifies CQC within 10 days. Safeguarding concern (adult or child) → Safeguarding Lead (Dr Ganata) → relevant local authority / police if immediate risk. Data breach: notify DPO within 24 hours, assess whether ICO notification required within 72 hours, notify affected individuals if high risk. Staff disciplinary: Clinic Manager initiates, Medical Director adjudicates.'),

  (doc_handbook, 2, 'Emergency Protocols',
   'On-Site Emergencies: Call 999 first — do not delay for internal escalation. Anaphylaxis: EpiPen in treatment room emergency kit (check expiry monthly). AED defibrillator: mounted in main corridor. All clinical staff: current BLS certification mandatory, refreshed annually. Vascular occlusion (filler): Hyaluronidase (Hyalase) stocked in treatment room fridge — do not use for anything else. Fire: assembly point is the car park at the rear of the building. First aid kit: reception desk (restocked quarterly). Incident book: record all clinical events — in reception drawer, red cover.'),

  (doc_handbook, 3, 'Opening & Closing Checklist',
   'Opening (first staff member): Disable alarm (code in ops folder). Switch on reception screens and booking system. Check appointment list — flag any missing consultation forms. Check emergency kit and medication fridge temperatures (log in temperature book). Check messages: voicemail, email, online booking queries. Brief first clinician on the day''s patient list. Closing (last staff member): Ensure all patients have left. Lock medication fridge and cabinet. Set alarm. Log closing in ops diary. Bank any cash. Send end-of-day summary to Clinic Manager.'),

  (doc_handbook, 4, 'Stock & Medication Management',
   'Controlled Drugs & Prescription Medicines: Stored in locked cabinet in treatment room — access limited to registered prescribers. Temperature-sensitive stock (fillers, Hyalase, Botox) stored in designated fridge — temperature logged daily (2–8°C). Stock ordered weekly by Clinic Manager. Low-stock alert: notify Clinic Manager when less than 2 weeks of any item remains. Botox (Allergan Botox / Ipsen Dysport) — prescription only, ordered via licensed pharmacy. Hyaluronidase: 2 vials always stocked. Emergency medications: adrenaline (EpiPen x2), chlorphenamine, hydrocortisone.'),

  (doc_handbook, 5, 'Staff Certification Requirements',
   'Mandatory Certifications (all clinical staff): Basic Life Support (BLS) — renewed annually. Safeguarding Level 2 — renewed every 3 years. GDPR awareness — annual refresher. DBS check — at hire, renewed every 3 years. Botox and filler practitioners: Level 7 qualification or equivalent, plus mentored log of 100+ cases. GP / medical staff: current GMC registration. Nurses: current NMC registration. CPD: all clinical staff complete minimum 40 hours per year, logged in HR system. Non-clinical staff: customer service and GDPR training within first month.');

  -- ============================================================
  -- DOCUMENT 5: Objection Handling & Brand Voice
  -- ============================================================
  INSERT INTO knowledge_documents
    (category_id, file_name, file_type, title, description, tags, processing_status, chunk_count, visibility)
  VALUES
    (cat_marketing, 'objection-handling-brand-voice.txt', 'text/plain',
     'Objection Handling Scripts & Brand Voice Guide',
     'How to respond to common patient objections, and the EWC tone of voice and key messages.',
     '["objections","brand","voice","sales","communication","scripts"]',
     'completed', 8, 'internal')
  RETURNING id INTO doc_marketing;

  INSERT INTO knowledge_chunks (document_id, chunk_index, section_title, content) VALUES
  (doc_marketing, 0, 'Brand Voice Principles',
   'EWC Brand Voice: Confident, warm and professional — never salesy or pushy. We are a medically-directed aesthetic and wellness clinic, not a beauty salon. Key language rules: say "treatment" not "procedure"; say "results" not "effects"; say "investment" not "cost"; say "most patients experience" not "you will get"; say "clinician" not "injector". Always acknowledge individual variation — never guarantee outcomes. Tone is like a trusted friend who happens to be a doctor: honest, clear, and caring. Avoid jargon unless explaining it. Never dismiss a concern — always validate first.'),

  (doc_marketing, 1, 'Objection: Price / Cost',
   'Objection: "It''s too expensive / I can''t afford it." Acknowledge: "I completely understand — it''s a meaningful investment." Reframe: "Our prices reflect CQC-regulated, medically-supervised care. We''re not a beauty salon — your safety and results are our priority." Options: Finance available from approximately £X/month via Payl8r (for treatments over £300). Package deals can reduce cost by up to 20%. Trial offer: "Why not start with a B12 injection at £35 to experience the clinic before committing to anything larger?" Remind: complications from cheap treatments can cost thousands to correct.'),

  (doc_marketing, 2, 'Objection: Fear of Pain / Needles',
   'Objection: "I''m scared of needles" or "Will it hurt?" Validate: "That''s a really common concern and completely understandable." Reassure: "We use the finest gauge needles available. For lip fillers and some areas, we apply a premium topical anaesthetic cream for 20–30 minutes beforehand, so most patients feel very little." Normalise: "Most of our patients describe it as a mild pinch — and many are surprised by how comfortable it is. Some even fall asleep during treatment!" Empower: "You are always in control — we can pause or stop at any time. Your comfort is our absolute priority."'),

  (doc_marketing, 3, 'Objection: How Long Does It Last?',
   'Objection: "How long will it last?" Response by treatment: Anti-wrinkle injections (Botox): typically 3–4 months. First-time patients sometimes notice it fading slightly earlier as the muscle adapts. With regular treatment, many patients find it lasts longer. Dermal fillers: 9–18 months depending on area, product and individual metabolism. Lip fillers: 6–12 months. Cheeks and jawline: 12–18 months. CoolSculpting: results are permanent — the fat cells are destroyed and removed by the body permanently. Maintaining a stable weight preserves results. IV therapy benefits: acute effects 1–3 days; wellness benefits with regular programmes.'),

  (doc_marketing, 4, 'Objection: Is It Safe?',
   'Objection: "Is it safe?" or "I''ve read bad things online." Acknowledge: "It''s really wise to ask — and you''re right to research this." Reassure: "We are CQC-registered, which means we are inspected and regulated in the same way as a GP surgery or hospital." Dr Ganata: "Our Medical Director, Dr Suresh Ganata, has over 15 years of experience and leads all clinical protocols." Products: "We only use prescription-grade, CE-marked products — the same brands used in Harley Street clinics." Pathway: "Every patient goes through a full clinical consultation before treatment, and we have emergency protocols and equipment on site."'),

  (doc_marketing, 5, 'Objection: I Need To Think About It',
   'Objection: "I need to think about it" or "I''ll book another time." Don''t push — this is a red flag if they feel pressured. Response: "Of course — this is a considered decision and there''s absolutely no rush." Offer: "Can I send you our treatment information pack? It covers everything we discussed today so you can review it in your own time." Keep door open: "We offer a complimentary 15-minute phone consultation if any other questions come up." Follow-up: with patient''s permission, send a follow-up message at 5–7 days (not before). Never badger — one follow-up maximum.'),

  (doc_marketing, 6, 'Key Clinic Differentiators',
   'EWC Key Differentiators: 1. Medical Director-led: Dr Ganata provides clinical oversight of all treatments — not just a name on a wall. 2. CQC registered: Inspected and accountable to the same regulator as GP surgeries. 3. Only prescription-grade products: Allergan Botox, Juvederm/Restylane fillers — same brands as top London clinics. 4. No-treatment consultation: We assess suitability honestly and will decline treatment if inappropriate. 5. Emergency-ready: BLS-certified staff, Hyalase on premises for filler emergency dissolution, AED on site. 6. Discreet and private: 100% private rooms, no high-street-facing shopfront. 7. Finance available: No-one should compromise on safety for cost.'),

  (doc_marketing, 7, 'Treatment Follow-Up Scripts',
   'Post-Treatment Follow-Up (3 days after): "Hi [name], just checking in after your [treatment] last [day]. How are you feeling? Any questions about your aftercare?" Botox Review Reminder (at 10 days): "Your Botox is settling in nicely by now — your 3-week review is coming up on [date]. Any concerns in the meantime?" Rebooking Prompt (Botox at 3 months): "It''s been about 3 months since your anti-wrinkle treatment. Many patients find this is around the time they start thinking about their next appointment — shall I check what''s available?" Filler check (at 6 months): "Just checking in — how are you enjoying your results? [Name], you''re due a complimentary review if you''d like to pop in."');

  -- ============================================================
  -- DOCUMENT 6: CQC Compliance Framework
  -- ============================================================
  INSERT INTO knowledge_documents
    (category_id, file_name, file_type, title, description, tags, processing_status, chunk_count, visibility)
  VALUES
    (cat_compliance, 'cqc-compliance-framework.txt', 'text/plain',
     'CQC Compliance Framework',
     'CQC 5 key questions framework, GDPR obligations, equipment register policy, and audit requirements.',
     '["cqc","compliance","gdpr","audit","regulation","safe","effective","caring","responsive","well-led"]',
     'completed', 7, 'internal')
  RETURNING id INTO doc_compliance;

  INSERT INTO knowledge_chunks (document_id, chunk_index, section_title, content) VALUES
  (doc_compliance, 0, 'CQC 5 Key Questions — Safe',
   'CQC Key Question 1 — SAFE: Are patients protected from harm? Safeguarding lead: Dr Suresh Ganata. DBS checks: all staff at hire, renewed every 3 years. Medicines: prescription-only items in locked, temperature-controlled storage. Equipment: all devices logged in equipment register with PAT testing records. Incident log: maintained, reviewed monthly by Medical Director. Infection control: single-use needles and cannulas only, sterile draping, clinical waste collection weekly. Emergency equipment: AED, EpiPens, Hyalase all on site and within expiry date. BLS certification: all clinical staff, refreshed annually.'),

  (doc_compliance, 1, 'CQC Key Questions — Effective & Caring',
   'CQC Key Question 2 — EFFECTIVE: Are treatments delivering good outcomes? Clinical protocols based on BCAM (British College of Aesthetic Medicine) guidelines. Clinical audits: quarterly outcome reviews led by Medical Director. Staff competency assessed at hire and annually. CPD: minimum 40 hours per clinical staff member per year. Patient outcome tracking: post-treatment survey at 2–4 weeks via QR code. CQC Key Question 3 — CARING: Are patients treated with compassion and dignity? All consultations in private rooms. Patient satisfaction scores reviewed monthly. Complaints: acknowledged within 2 working days, target resolution 20 days. Reasonable adjustments available for patients with disabilities.'),

  (doc_compliance, 2, 'CQC Key Questions — Responsive & Well-Led',
   'CQC Key Question 4 — RESPONSIVE: Does the clinic respond to people''s needs? Booking: online and telephone. Same-week appointment availability target. Waiting time target: <15 minutes past appointment time. Accessible premises: ground floor, accessible parking, hearing loop. CQC Key Question 5 — WELL-LED: Is the clinic well-governed? Registered Manager: Dr Suresh Ganata (GMC registered). Governance meetings: monthly (Medical Director + Clinic Manager). Staff meetings: fortnightly. CQC registration: current, no outstanding actions or conditions. Policy review: all clinical policies reviewed and re-approved annually.'),

  (doc_compliance, 3, 'Equipment Register Policy',
   'Equipment Register: All clinical equipment must be logged at point of purchase and maintained in the Equipment Register (shared drive: /compliance/equipment-register.xlsx). Required fields: equipment name, serial number, purchase date, supplier, last service date, next service due, PAT test date, notes. Servicing schedule: Cryomed CoolSculpting machine — annually by approved engineer. Dermapen microneedling device — cartridges single-use, device sterilised between patients. LED panel — PAT tested annually. AED defibrillator — pads checked monthly, device serviced annually. Autoclave (if applicable) — monthly spore test, annual engineer service.'),

  (doc_compliance, 4, 'GDPR & Data Protection',
   'GDPR Obligations: Data Controller: Edgbaston Wellness Clinic Ltd (Dr Suresh Ganata, Registered Manager). ICO registration: maintained and renewed annually (registration number in compliance folder). Data retention: patient medical records 7 years post last treatment; staff records 6 years post employment end; CCTV 30 days. Data subject rights: Subject Access Requests responded to within 30 days (no charge). Right to erasure: assessed case by case — medical records may be exempt under legitimate medical basis. Data breach: report to DPO within 24 hours; assess ICO notification requirement within 72 hours.'),

  (doc_compliance, 5, 'Consent and Record-Keeping Standards',
   'Consent Standards: Written informed consent obtained before every treatment. Consent includes: nature of treatment, expected outcomes, realistic risks and complications, aftercare requirements, and patient''s right to withdraw. Consent forms archived in patient record permanently (not subject to 7-year deletion). Photographic consent: separate consent required for before/after photography. Photos stored securely, only used for patient''s own records unless specific marketing consent given. Medical history forms reviewed and signed by clinician before treatment. Any changes to medical history: new consent form required.'),

  (doc_compliance, 6, 'Notifiable Events & Incident Reporting',
   'CQC Notifiable Events (must be reported to CQC): Death of a patient in connection with care. Unexpected or unexplained death. Serious injury to a patient. Abuse or allegation of abuse. Events listed in the Health and Social Care Act 2008 (Regulated Activities) Regulations 2014, Regulation 18. Reporting timeline: notify CQC as soon as reasonably practicable, and no later than 10 days after the event. Internal incident reporting: all clinical incidents logged in the Incident Book (red cover, reception desk) and reviewed at monthly governance meetings. Near misses are also recorded — these are used for learning, not blame.');

  RAISE NOTICE '✓ Migration 023 complete';
  RAISE NOTICE '✓ 6 knowledge documents seeded';
  RAISE NOTICE '✓ 48 knowledge chunks inserted';
  RAISE NOTICE '✓ Categories: Pricing, Protocols, Policies, Staff Handbook, Marketing, Compliance';

END $$;

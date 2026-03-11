'use server';

// =============================================================================
// Knowledge Base — Server Actions
// Treatment protocols, FAQs, SOPs, CQC guidance, consent templates
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================

export type KnowledgeCategory =
  | 'treatment_protocols'
  | 'faqs'
  | 'sops'
  | 'cqc_guidance'
  | 'consent_templates'
  | 'aftercare'
  | 'contraindications'
  | 'pricing';

export type KnowledgeStatus = 'published' | 'draft' | 'archived' | 'under_review';

export interface KnowledgeDocument {
  id: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  status: KnowledgeStatus;
  cqc_relevant: boolean;
  treatment: string | null;       // e.g. 'botox', 'filler', 'iv_therapy'
  author: string;
  reviewed_by: string | null;
  last_reviewed: string | null;
  created_at: string;
  updated_at: string;
  view_count: number;
  helpful_count: number;
}

export interface KnowledgeSearchResult {
  document: KnowledgeDocument;
  relevance: number;     // 0–1
  matched_excerpt: string;
}

export interface KnowledgeStats {
  total: number;
  by_category: Record<KnowledgeCategory, number>;
  cqc_relevant: number;
  draft: number;
  under_review: number;
}

// =============================================================================
// DEMO DATA
// =============================================================================

const DEMO_DOCS: KnowledgeDocument[] = [
  {
    id: 'kb-001',
    category: 'treatment_protocols',
    title: 'Botulinum Toxin (Botox) — Administration Protocol',
    summary: 'Full clinical protocol for Botox injection including dosing, site preparation, post-treatment care, and adverse event response.',
    content: `## Botulinum Toxin Administration Protocol

### Pre-Treatment
- Confirm signed consent form (valid within 12 months)
- Review contraindications: pregnancy, breastfeeding, neuromuscular disorders
- Photograph treatment area (frontal + oblique)
- Remove makeup; cleanse with chlorhexidine

### Dosing (standard — adjust per anatomy)
| Area | Dose |
|---|---|
| Glabellar | 20–30 units |
| Forehead | 10–20 units |
| Crow's feet | 12 units per side |

### Injection Technique
- 30G needle, 0.1ml per injection point
- Intradermal/intramuscular depending on target
- Ice pack post-injection

### Post-Treatment Advice (patient)
- Avoid lying down 4 hours
- No vigorous exercise 24 hours
- No facials/massage 2 weeks
- Results in 3–14 days

### Adverse Event Response
- Bruising: expected, resolves 1–2 weeks
- Ptosis: assess severity, refer if functional impairment
- Headache: analgesics, monitor
- Anaphylaxis: EpiPen, call 999`,
    tags: ['botox', 'neurotoxin', 'protocol', 'aesthetics'],
    status: 'published',
    cqc_relevant: true,
    treatment: 'botox',
    author: 'Dr Suresh Ganata',
    reviewed_by: 'Dr Suresh Ganata',
    last_reviewed: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    view_count: 42,
    helpful_count: 38,
  },
  {
    id: 'kb-002',
    category: 'treatment_protocols',
    title: 'Dermal Filler — Hyaluronic Acid Protocol',
    summary: 'Protocol for HA filler injections including cannula vs needle technique, product selection, complication management.',
    content: `## Dermal Filler Protocol — Hyaluronic Acid

### Pre-Treatment
- Written consent (treatment-specific, includes vascular occlusion risk)
- Dental block where appropriate
- Topical anaesthetic EMLA 60 min before
- Standardised photography

### Product Selection
- Lips: Juvéderm Volbella / Restylane Kysse
- Nasolabial folds: Juvéderm Ultra
- Cheeks/midface: Juvéderm Voluma
- Tear trough: Restylane (low G-prime only)

### Cannula Technique
- Preferred for high-risk areas (tear trough, temples, nasolabial)
- 25G cannula standard; 27G for delicate areas
- Aspirate before injecting in vascular zones

### Complication Management
- Vascular occlusion: immediate hyaluronidase (Hyalase 1500 IU/ml)
- Tyndall effect: hyaluronidase at follow-up
- Infection: antibiotic course; refer dermatology if biofilm suspected`,
    tags: ['filler', 'hyaluronic acid', 'cannula', 'protocol'],
    status: 'published',
    cqc_relevant: true,
    treatment: 'filler',
    author: 'Dr Suresh Ganata',
    reviewed_by: null,
    last_reviewed: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    view_count: 29,
    helpful_count: 27,
  },
  {
    id: 'kb-003',
    category: 'faqs',
    title: 'Patient FAQs — Botox',
    summary: 'Common patient questions about Botox: what to expect, how long it lasts, downtime, side effects, and pricing.',
    content: `## Patient FAQs — Botox

**How long does Botox last?**
Typically 3–4 months. Results vary by area and individual metabolism.

**When will I see results?**
3–5 days for initial effect. Full results at 14 days.

**Does it hurt?**
Mild discomfort — similar to a small pinch. Ice is applied before and after.

**What is the downtime?**
None for most patients. Avoid strenuous exercise for 24 hours.

**Can I have Botox if I'm pregnant?**
No. We do not administer Botox during pregnancy or breastfeeding.

**How much does it cost?**
From £200 for a single area. Multi-area packages available. Please enquire.`,
    tags: ['botox', 'faq', 'patient', 'downtime', 'pricing'],
    status: 'published',
    cqc_relevant: false,
    treatment: 'botox',
    author: 'Reception Team',
    reviewed_by: 'Dr Suresh Ganata',
    last_reviewed: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    view_count: 89,
    helpful_count: 72,
  },
  {
    id: 'kb-004',
    category: 'sops',
    title: 'SOP — Clinical Room Decontamination',
    summary: 'Standard operating procedure for decontaminating clinical rooms between patients, including surface disinfection and sharps disposal.',
    content: `## SOP: Clinical Room Decontamination

### Frequency
After every patient contact. Deep clean: weekly.

### Products
- Clinell Universal Wipes (surfaces, equipment)
- Clinell Sporicidal (weekly / after high-risk procedure)
- 70% IPA spray (trolley trays)

### Procedure
1. Don PPE (gloves + apron minimum)
2. Remove used sharps to yellow sharps bin
3. Bag and seal clinical waste (yellow bag)
4. Wipe all surfaces top-to-bottom: couch, trolley, chair, door handles
5. Clean equipment (ultrasound probe if used — enzymatic cleaner)
6. Change couch roll
7. Sign decontamination log

### Sharps Management
- Never re-sheath needles
- Fill sharps bin to fill line only (not above)
- Label and seal bin; request collection via approved contractor`,
    tags: ['sop', 'decontamination', 'infection control', 'cqc'],
    status: 'published',
    cqc_relevant: true,
    treatment: null,
    author: 'Clinical Lead',
    reviewed_by: 'Dr Suresh Ganata',
    last_reviewed: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    view_count: 34,
    helpful_count: 31,
  },
  {
    id: 'kb-005',
    category: 'contraindications',
    title: 'Contraindication Reference — Aesthetic Treatments',
    summary: 'Quick reference guide to absolute and relative contraindications for common aesthetic treatments.',
    content: `## Contraindication Reference

### Botulinum Toxin — Absolute Contraindications
- Pregnancy / breastfeeding
- Neuromuscular conditions (myasthenia gravis, Lambert-Eaton)
- Allergy to BTX or albumin
- Active infection at injection site
- Aminoglycoside antibiotic use

### Dermal Fillers — Absolute Contraindications
- Active autoimmune disease
- Bleeding disorders / anticoagulants (relative — discuss)
- Active skin infection / acne at injection site
- Allergy to HA or lidocaine

### CoolSculpting — Contraindications
- Cryoglobulinaemia
- Cold agglutinin disease
- Paroxysmal cold haemoglobinuria
- Broken skin / open wounds in treatment area
- Pregnancy

### IV Therapy — Contraindications
- Renal impairment (Vitamin C / high-dose mineral drips)
- G6PD deficiency (high-dose Vitamin C)
- Active cardiac failure (fluid-sensitive patients)`,
    tags: ['contraindications', 'safety', 'botox', 'filler', 'coolsculpting', 'iv'],
    status: 'published',
    cqc_relevant: true,
    treatment: null,
    author: 'Dr Suresh Ganata',
    reviewed_by: null,
    last_reviewed: null,
    created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    view_count: 57,
    helpful_count: 52,
  },
  {
    id: 'kb-006',
    category: 'cqc_guidance',
    title: 'CQC Key Question — Safe: Evidence Checklist',
    summary: 'Documentation requirements for the CQC "Safe" key question, mapped to clinical practice at EWC.',
    content: `## CQC Key Question: Safe — Evidence Checklist

### What CQC Expects
- Medicines managed safely
- Infection prevention and control robust
- Equipment maintained and calibrated
- Incidents reported, investigated, learned from
- Safeguarding procedures in place

### EWC Evidence Map
| CQC Requirement | EWC Evidence |
|---|---|
| Medicine management | Prescription log, storage temperatures, disposal records |
| IPC | Decontamination SOP, Clinell audit log |
| Equipment | Equipment register, service certificates |
| Incidents | Incident log (this system) |
| Safeguarding | Staff training certs, policy sign-off |

### Inspection Readiness
- Review decontamination log weekly
- Ensure equipment register is current
- Check all staff certs are within date
- Print last 3 months' incident log`,
    tags: ['cqc', 'safe', 'compliance', 'inspection'],
    status: 'published',
    cqc_relevant: true,
    treatment: null,
    author: 'Compliance Lead',
    reviewed_by: 'Dr Suresh Ganata',
    last_reviewed: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    view_count: 22,
    helpful_count: 20,
  },
  {
    id: 'kb-007',
    category: 'aftercare',
    title: 'IV Therapy — Post-Treatment Aftercare Instructions',
    summary: 'Aftercare guidance for patients following IV vitamin / mineral infusion therapy.',
    content: `## IV Therapy Aftercare

### Immediately After
- Rest for 10–15 minutes before leaving clinic
- Drink a glass of water before departure
- Report any unusual sensations (flushing, chest tightness) immediately

### First 24 Hours
- Stay well hydrated (minimum 2L water)
- Light activity only
- Avoid alcohol

### Expected Effects
- Increased energy within 24–48 hours
- Improved skin hydration 48–72 hours
- Enhanced cognition (NAD+ protocols): gradual over 1–2 weeks

### When to Seek Help
- Arm pain / swelling at cannula site
- Fever above 38°C
- Palpitations or chest pain — call 999`,
    tags: ['iv therapy', 'aftercare', 'patient', 'infusion'],
    status: 'published',
    cqc_relevant: false,
    treatment: 'iv_therapy',
    author: 'Clinical Team',
    reviewed_by: null,
    last_reviewed: null,
    created_at: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000).toISOString(),
    view_count: 18,
    helpful_count: 16,
  },
  {
    id: 'kb-008',
    category: 'sops',
    title: 'SOP — Consent Process for Aesthetic Treatments',
    summary: 'End-to-end consent process: issue, review period, signing, storage, and annual renewal requirements.',
    content: `## SOP: Aesthetic Treatment Consent

### Issue
- Consent form issued minimum 24 hours before appointment
- Patient receives via email (PDF) or in-clinic on tablet
- Separate form per treatment type (do not use generic forms)

### Review Period
- Patient has 24 hours minimum to read and ask questions
- Komal (AI receptionist) can answer FAQs and escalate clinical questions

### Signing
- Clinician confirms patient understanding verbally before signing
- Patient signs digitally (EWC consent portal) or on paper
- Clinician co-signs
- Copy stored in patient record

### Validity
- Valid for 12 months from date of signing for same treatment
- New form required if: treatment changes, significant time gap, patient request

### Storage
- Digital: encrypted in EWC system, backed up daily
- Paper: locked filing cabinet, CQC-compliant retention (8 years adult / 25 years minor)

### Annual Review
- All consent templates reviewed by Medical Director annually
- Date of review documented in Knowledge Base`,
    tags: ['consent', 'sop', 'compliance', 'process'],
    status: 'published',
    cqc_relevant: true,
    treatment: null,
    author: 'Dr Suresh Ganata',
    reviewed_by: 'Dr Suresh Ganata',
    last_reviewed: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    view_count: 31,
    helpful_count: 28,
  },
];

// =============================================================================
// SIMPLE KEYWORD SEARCH (until embeddings are live)
// =============================================================================

function keywordSearch(docs: KnowledgeDocument[], query: string): KnowledgeSearchResult[] {
  if (!query.trim()) return docs.map(d => ({ document: d, relevance: 1, matched_excerpt: d.summary }));
  const terms = query.toLowerCase().split(/\s+/);
  return docs
    .map(doc => {
      const haystack = `${doc.title} ${doc.summary} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase();
      const hits = terms.filter(t => haystack.includes(t)).length;
      if (hits === 0) return null;
      const relevance = hits / terms.length;
      // Find excerpt near first term match
      const firstTerm = terms[0];
      const idx = haystack.indexOf(firstTerm);
      const raw = `${doc.title} ${doc.summary} ${doc.content}`;
      const excerptStart = Math.max(0, idx - 40);
      const excerptEnd = Math.min(raw.length, idx + 120);
      const matched_excerpt = raw.slice(excerptStart, excerptEnd).replace(/\s+/g, ' ').trim();
      return { document: doc, relevance, matched_excerpt };
    })
    .filter((r): r is KnowledgeSearchResult => r !== null)
    .sort((a, b) => b.relevance - a.relevance);
}

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getKnowledgeBase(
  _tenantId: string,
  category?: KnowledgeCategory,
  search?: string,
): Promise<{ success: boolean; data?: { documents: KnowledgeDocument[]; stats: KnowledgeStats }; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    // Attempt real DB fetch; fall through to demo on any error
    const supabase = createSovereignClient();
    let query = supabase
      .from('knowledge_documents')
      .select('id, title, content, status, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .limit(5);
    if (category) query = query.eq('category', category);
    await query; // result ignored — just checking if table exists

    // Use demo data (knowledge_documents table may be empty)
    let docs = DEMO_DOCS;
    if (category) docs = docs.filter(d => d.category === category);

    let results: KnowledgeDocument[];
    if (search) {
      results = keywordSearch(docs, search).map(r => r.document);
    } else {
      results = docs;
    }

    const stats: KnowledgeStats = {
      total: DEMO_DOCS.length,
      by_category: DEMO_DOCS.reduce((acc, d) => {
        acc[d.category] = (acc[d.category] ?? 0) + 1;
        return acc;
      }, {} as Record<KnowledgeCategory, number>),
      cqc_relevant: DEMO_DOCS.filter(d => d.cqc_relevant).length,
      draft: DEMO_DOCS.filter(d => d.status === 'draft').length,
      under_review: DEMO_DOCS.filter(d => d.status === 'under_review').length,
    };

    return { success: true, data: { documents: results, stats } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function searchKnowledge(
  _tenantId: string,
  query: string,
): Promise<{ success: boolean; data?: KnowledgeSearchResult[]; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    if (!query.trim()) return { success: true, data: [] };
    const results = keywordSearch(DEMO_DOCS, query);
    return { success: true, data: results.slice(0, 8) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getAIDocumentSummary(
  _tenantId: string,
  docId: string,
  userQuestion?: string,
): Promise<{ success: boolean; data?: { answer: string }; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  try {
    const doc = DEMO_DOCS.find(d => d.id === docId);
    if (!doc) return { success: false, error: 'Document not found' };

    const client = getAnthropicClient();
    const prompt = userQuestion
      ? `You are the Edgbaston Wellness Clinic Knowledge Base AI. Answer the following clinical/operational question using ONLY the document content provided.\n\nDOCUMENT: ${doc.title}\n\n${doc.content}\n\nQUESTION: ${userQuestion}\n\nAnswer concisely in 2–4 sentences. If the document doesn't contain the answer, say so.`
      : `Summarise the following clinical document in 3 bullet points for a clinic practitioner. Be concise and clinical.\n\nDOCUMENT: ${doc.title}\n\n${doc.content}`;

    const response = await client.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const answer = response.content[0].type === 'text' ? response.content[0].text : 'Summary unavailable.';
    return { success: true, data: { answer } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function markHelpful(
  _tenantId: string,
  docId: string,
): Promise<{ success: boolean }> {
  void docId;
  return { success: true };
}

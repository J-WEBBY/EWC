'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, ChevronRight, Loader2,
  Building2, MapPin, Phone, User, Stethoscope, AlertCircle, Edit2,
} from 'lucide-react';
import type { ClinicProfile } from '@/lib/actions/platform/activate';
import { savePhase1, type Phase1Data } from '@/lib/actions/platform/onboard';
import { JweblyIcon } from '@/components/jwebly-logo';
import { BRAND } from '@/lib/config/brand';

// ─── Design tokens (light theme for phase pages) ───────────────────────────
const BG   = '#F7F6F3';
const INK  = '#18181B';
const SEC  = '#4A5568';
const MUT  = '#A1A1AA';
const BDR  = '#E4E4E7';
const C    = BRAND.accent;
const CL   = BRAND.accentLight;
const GRN  = BRAND.green;
const RED  = BRAND.red;

// ─── Phases strip (top stepper) ────────────────────────────────────────────
const PHASE_STEPS = [
  { n: 1, label: 'Clinic profile' },
  { n: 2, label: 'Brand'          },
  { n: 3, label: 'Team'           },
  { n: 4, label: 'Credentials'    },
  { n: 5, label: 'Integrations'   },
  { n: 6, label: 'Go live'        },
];

// ─── Section definitions ───────────────────────────────────────────────────
const SECTIONS = [
  { n: 1, label: 'Clinic identity', Icon: Building2,   summary: (d: FormData) => d.clinicName || 'Not set' },
  { n: 2, label: 'Location',        Icon: MapPin,       summary: (d: FormData) => [d.city, d.postcode].filter(Boolean).join(', ') || 'Not set' },
  { n: 3, label: 'Contact',         Icon: Phone,        summary: (d: FormData) => d.phone || d.email || 'Not set' },
  { n: 4, label: 'Medical director',Icon: User,         summary: (d: FormData) => d.directorName || 'Not set' },
  { n: 5, label: 'Regulatory',      Icon: Stethoscope,  summary: (d: FormData) => d.cqcNumber ? `CQC: ${d.cqcNumber}` : d.foundedYear ? `Est. ${d.foundedYear}` : 'Optional fields' },
] as const;

// ─── Shared field types ────────────────────────────────────────────────────
interface FormData {
  clinicName:    string;
  clinicType:    string[];
  tagline:       string;
  addr1:         string;
  addr2:         string;
  city:          string;
  postcode:      string;
  phone:         string;
  email:         string;
  website:       string;
  cqcNumber:     string;
  foundedYear:   string;
  directorName:  string;
  directorTitle: string;
}

// ─── Input ──────────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, type = 'text', hint, span,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string; span?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: span ? '1 / -1' : undefined }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: MUT, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            display: 'block', width: '100%', height: 46, borderRadius: 10,
            border: `1.5px solid ${focused ? C : BDR}`,
            padding: '0 14px', fontSize: 13, color: INK,
            background: focused ? '#FEFEFE' : '#FAFAF9',
            outline: 'none', boxSizing: 'border-box',
            boxShadow: focused ? `0 0 0 3px ${C}12` : 'none',
            transition: 'all 0.18s',
          }}
        />
      </div>
      {hint && <p style={{ fontSize: 10, color: MUT, margin: 0 }}>{hint}</p>}
    </div>
  );
}

// ─── Type pill ─────────────────────────────────────────────────────────────
function TypePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      style={{
        height: 36, padding: '0 16px', borderRadius: 8,
        border: `1.5px solid ${active ? C : BDR}`,
        background: active ? `${C}0e` : 'transparent',
        color: active ? C : SEC, cursor: 'pointer',
        fontSize: 12, fontWeight: active ? 700 : 400,
        display: 'flex', alignItems: 'center', gap: 6,
        transition: 'all 0.15s',
      }}
    >
      <AnimatePresence>
        {active && (
          <motion.span
            key="check"
            initial={{ scale: 0, width: 0 }}
            animate={{ scale: 1, width: 'auto' }}
            exit={{ scale: 0, width: 0 }}
          >
            <Check size={11} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
      {label}
    </motion.button>
  );
}

// ─── Section shell: completed strip ───────────────────────────────────────
function CompletedStrip({
  n, label, Icon, summary, onEdit,
}: {
  n: number; label: string; Icon: React.ElementType; summary: string; onEdit: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      style={{
        borderRadius: 12, border: `1px solid ${GRN}30`,
        background: `${GRN}06`, overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '12px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: `${GRN}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={13} strokeWidth={2.5} style={{ color: GRN }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: INK, lineHeight: 1.2 }}>{label}</div>
            <div style={{ fontSize: 10, color: MUT, marginTop: 1 }}>{summary}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          style={{
            height: 28, padding: '0 10px', borderRadius: 7, border: `1px solid ${BDR}`,
            background: 'transparent', color: MUT, fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C; (e.currentTarget as HTMLButtonElement).style.color = C; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = BDR; (e.currentTarget as HTMLButtonElement).style.color = MUT; }}
        >
          <Edit2 size={10} /> Edit
        </button>
      </div>
    </motion.div>
  );
}

// ─── Active section card ───────────────────────────────────────────────────
function ActiveSection({
  n, label, Icon, children, onNext, onNextLabel, loading, isLast,
}: {
  n: number; label: string; Icon: React.ElementType;
  children: React.ReactNode;
  onNext: () => void; onNextLabel?: string;
  loading?: boolean; isLast?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll this section into view after a brief delay
    const t = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ borderRadius: 16, border: `1.5px solid ${C}40`, background: '#FFFFFF', overflow: 'hidden' }}
    >
      {/* Top accent */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${CL}, ${C})` }} />

      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${BDR}`,
        display: 'flex', alignItems: 'center', gap: 10,
        background: `${C}04`,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: `${C}14`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} style={{ color: C }} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C, lineHeight: 1 }}>
            Section {n} of {SECTIONS.length}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{label}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>

      {/* Footer */}
      <div style={{
        padding: '14px 20px', borderTop: `1px solid ${BDR}`,
        display: 'flex', justifyContent: 'flex-end', gap: 10, background: BG,
      }}>
        <motion.button
          type="button"
          onClick={onNext}
          disabled={loading}
          whileHover={!loading ? { y: -1 } : {}}
          whileTap={!loading ? { scale: 0.985 } : {}}
          style={{
            height: 44, padding: '0 22px', borderRadius: 10, border: 'none',
            background: isLast ? `linear-gradient(135deg, ${CL} 0%, ${C} 100%)` : INK,
            color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
            cursor: loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
            boxShadow: isLast ? `0 4px 18px ${C}40` : '0 2px 12px rgba(0,0,0,0.14)',
            transition: 'all 0.2s',
          }}
        >
          {loading
            ? <><Loader2 size={14} className="animate-spin" /> Saving&hellip;</>
            : isLast
            ? <><Check size={14} strokeWidth={2.5} /> {onNextLabel ?? 'Confirm & continue'}</>
            : <>{onNextLabel ?? 'Next'} <ChevronRight size={14} /></>
          }
        </motion.button>
      </div>
      <div ref={bottomRef} />
    </motion.div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function Phase1Client({
  sessionId, tenantName, profile, completedPhases,
}: {
  sessionId: string; tenantName: string;
  profile: ClinicProfile; completedPhases: number[];
}) {
  const router = useRouter();

  // ── Form state — pre-filled from DB ───────────────────────────────────
  const [form, setForm] = useState<FormData>({
    clinicName:    profile.clinic_name  ?? '',
    clinicType:    profile.clinic_type  ?? [],
    tagline:       profile.tagline      ?? '',
    addr1:         profile.address_line1 ?? '',
    addr2:         profile.address_line2 ?? '',
    city:          profile.city          ?? '',
    postcode:      profile.postcode      ?? '',
    phone:         profile.phone         ?? '',
    email:         profile.email         ?? '',
    website:       profile.website       ?? '',
    cqcNumber:     profile.cqc_number    ?? '',
    foundedYear:   profile.founded_year ? String(profile.founded_year) : '',
    directorName:  profile.director_name  ?? '',
    directorTitle: profile.director_title ?? '',
  });
  const set = useCallback((key: keyof FormData) => (v: string) => setForm(f => ({ ...f, [key]: v })), []);
  const toggleType = useCallback((v: string) => {
    setForm(f => ({
      ...f,
      clinicType: f.clinicType.includes(v) ? f.clinicType.filter(t => t !== v) : [...f.clinicType, v],
    }));
  }, []);

  // ── Section navigation ─────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState(1);
  const [confirmed, setConfirmed]         = useState<Set<number>>(new Set());
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');

  function confirmSection(n: number) {
    setConfirmed(prev => { const s = new Set(prev); s.add(n); return s; });
    setActiveSection(n + 1);
    setError('');
  }

  function editSection(n: number) {
    setActiveSection(n);
  }

  async function handleSubmit() {
    if (!form.clinicName.trim()) { setError('Clinic name is required.'); return; }
    if (!form.clinicType.length)  { setError('Select at least one clinic type.'); return; }
    setError(''); setSaving(true);

    const data: Phase1Data = {
      clinic_name:    form.clinicName.trim(),
      clinic_type:    form.clinicType,
      tagline:        form.tagline.trim(),
      address_line1:  form.addr1.trim(),
      address_line2:  form.addr2.trim(),
      city:           form.city.trim(),
      postcode:       form.postcode.trim(),
      phone:          form.phone.trim(),
      email:          form.email.trim(),
      website:        form.website.trim(),
      cqc_number:     form.cqcNumber.trim(),
      founded_year:   form.foundedYear ? parseInt(form.foundedYear) : null,
      director_name:  form.directorName.trim(),
      director_title: form.directorTitle.trim(),
    };

    const result = await savePhase1(data);
    setSaving(false);
    if (!result.success) { setError(result.error ?? 'Failed to save.'); return; }
    router.push('/onboard/2');
  }

  const sectionSummary = (n: number) =>
    SECTIONS.find(s => s.n === n)?.summary(form) ?? '';

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Dot grid */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
        <defs>
          <pattern id="p1dot" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(120,113,108,0.18)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#p1dot)" />
      </svg>
      {/* Ambient bloom — top-left */}
      <div style={{ position: 'fixed', top: '-15%', left: '-10%', width: '55vw', height: '55vw', borderRadius: '50%', zIndex: 0, background: 'radial-gradient(circle, rgba(8,145,178,0.08) 0%, transparent 68%)', filter: 'blur(50px)', pointerEvents: 'none' }} />
      {/* Ambient bloom — bottom-right */}
      <div style={{ position: 'fixed', bottom: '-18%', right: '-12%', width: '45vw', height: '45vw', borderRadius: '50%', zIndex: 0, background: 'radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 65%)', filter: 'blur(55px)', pointerEvents: 'none' }} />

      {/* ── Top bar ── */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', borderBottom: `1px solid ${BDR}`,
        position: 'sticky', top: 0, zIndex: 20, backdropFilter: 'blur(10px)',
        background: `${BG}F0`,
      }}>
        {/* Logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <JweblyIcon size={24} uid="p1-nav" />
          <span style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>
            {BRAND.platform}
          </span>
        </div>

        {/* Phase stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {PHASE_STEPS.map((p, i) => {
            const done    = completedPhases.includes(p.n);
            const current = p.n === 1;
            return (
              <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    background: done ? GRN : current ? INK : 'transparent',
                    border: `1.5px solid ${done ? GRN : current ? INK : BDR}`,
                  }}>
                    {done
                      ? <Check size={11} strokeWidth={3} style={{ color: '#fff' }} />
                      : <span style={{ fontSize: 9, fontWeight: 700, color: current ? '#fff' : MUT }}>{p.n}</span>
                    }
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: current ? 600 : 400,
                    color: current ? INK : done ? SEC : MUT,
                    display: typeof window !== 'undefined' && window.innerWidth > 900 ? 'inline' : 'none',
                  }}>
                    {p.label}
                  </span>
                </div>
                {i < PHASE_STEPS.length - 1 && (
                  <ChevronRight size={11} style={{ color: BDR, flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>

        <div style={{ width: 120 }} />
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '48px 24px 100px', position: 'relative', zIndex: 1 }}>
        <div style={{ width: '100%', maxWidth: 600 }}>

          {/* Phase header */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginBottom: 32 }}
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: `${C}0c`, border: `1px solid ${C}22`,
              borderRadius: 20, padding: '4px 12px', marginBottom: 12,
            }}>
              <Building2 size={11} style={{ color: C }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C }}>
                Phase 1 of 6
              </span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: INK, margin: '0 0 8px' }}>
              Clinic profile
            </h1>
            <p style={{ fontSize: 13, color: SEC, margin: '0 0 20px', lineHeight: 1.7 }}>
              Review and confirm your clinic&apos;s details across 5 sections. Pre-filled from your onboarding brief.
            </p>

            {/* Section progress bar */}
            <div style={{ display: 'flex', gap: 4 }}>
              {SECTIONS.map(s => (
                <div
                  key={s.n}
                  style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: confirmed.has(s.n) ? GRN : s.n === activeSection ? C : BDR,
                    transition: 'background 0.3s',
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 10, color: MUT, marginTop: 6 }}>
              {confirmed.size} of {SECTIONS.length} sections confirmed
            </div>
          </motion.div>

          {/* ── Sections ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* ── Render each section ── */}
            {SECTIONS.map(({ n, label, Icon }) => {
              const isConfirmed = confirmed.has(n);
              const isActive    = activeSection === n;
              const isLocked    = !isConfirmed && !isActive;

              if (isConfirmed && activeSection !== n) {
                return (
                  <CompletedStrip
                    key={n}
                    n={n} label={label} Icon={Icon}
                    summary={sectionSummary(n)}
                    onEdit={() => editSection(n)}
                  />
                );
              }

              if (isActive) {
                return (
                  <ActiveSection
                    key={n}
                    n={n} label={label} Icon={Icon}
                    onNext={n === SECTIONS.length ? handleSubmit : () => confirmSection(n)}
                    onNextLabel={n === SECTIONS.length ? 'Save & continue' : undefined}
                    loading={n === SECTIONS.length ? saving : false}
                    isLast={n === SECTIONS.length}
                  >

                    {/* ── Section 1: Clinic identity ── */}
                    {n === 1 && (
                      <>
                        <Field label="Clinic name *" value={form.clinicName} onChange={set('clinicName')} placeholder="Edgbaston Wellness Clinic" />
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 700, color: MUT, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                            Clinic type *
                          </label>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {['Aesthetics', 'Wellness', 'Medical', 'Dental'].map(t => (
                              <TypePill
                                key={t}
                                label={t}
                                active={form.clinicType.includes(t.toLowerCase())}
                                onClick={() => toggleType(t.toLowerCase())}
                              />
                            ))}
                          </div>
                        </div>
                        <Field
                          label="Tagline"
                          value={form.tagline}
                          onChange={set('tagline')}
                          placeholder="Premium aesthetics & wellness in Birmingham"
                          hint="Optional — shown in platform header"
                        />
                      </>
                    )}

                    {/* ── Section 2: Location ── */}
                    {n === 2 && (
                      <>
                        <Field label="Address line 1" value={form.addr1} onChange={set('addr1')} placeholder="11 Greenfield Crescent" />
                        <Field label="Address line 2" value={form.addr2} onChange={set('addr2')} placeholder="Suite / Floor (optional)" />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <Field label="City" value={form.city} onChange={set('city')} placeholder="Birmingham" />
                          <Field label="Postcode" value={form.postcode} onChange={set('postcode')} placeholder="B15 3AU" />
                        </div>
                      </>
                    )}

                    {/* ── Section 3: Contact ── */}
                    {n === 3 && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <Field label="Phone" value={form.phone} onChange={set('phone')} type="tel" placeholder="0121 454 8633" />
                          <Field label="Email" value={form.email} onChange={set('email')} type="email" placeholder="info@clinic.co.uk" />
                        </div>
                        <Field label="Website" value={form.website} onChange={set('website')} placeholder="https://edgbastonwellness.co.uk" hint="Optional" />
                      </>
                    )}

                    {/* ── Section 4: Medical director ── */}
                    {n === 4 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="Full name" value={form.directorName} onChange={set('directorName')} placeholder="Dr Suresh Ganta" />
                        <Field label="Title / Role" value={form.directorTitle} onChange={set('directorTitle')} placeholder="Medical Director" />
                      </div>
                    )}

                    {/* ── Section 5: Regulatory ── */}
                    {n === 5 && (
                      <>
                        <div style={{
                          padding: '12px 14px', borderRadius: 10,
                          background: `${C}08`, border: `1px solid ${C}20`,
                          fontSize: 12, color: SEC, lineHeight: 1.6,
                        }}>
                          Both fields are optional. You can add them later via Settings.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <Field label="CQC registration number" value={form.cqcNumber} onChange={set('cqcNumber')} placeholder="Optional" />
                          <Field label="Year founded" value={form.foundedYear} onChange={set('foundedYear')} type="number" placeholder="e.g. 2019" />
                        </div>
                      </>
                    )}

                  </ActiveSection>
                );
              }

              // Locked — not yet reached
              if (isLocked) {
                return (
                  <motion.div
                    key={n}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      borderRadius: 12, border: `1px solid ${BDR}`,
                      padding: '12px 18px', opacity: 0.38,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      border: `1.5px solid ${BDR}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: MUT }}>{n}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: SEC }}>{label}</div>
                      <div style={{ fontSize: 10, color: MUT }}>Complete section {n - 1} first</div>
                    </div>
                  </motion.div>
                );
              }

              return null;
            })}

          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 10,
                  background: `${RED}08`, border: `1px solid ${RED}25`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <AlertCircle size={13} style={{ color: RED, flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: RED, margin: 0 }}>{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}

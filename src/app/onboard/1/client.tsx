'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Loader2, Building2, MapPin, Phone, Mail, Globe, User, Stethoscope, AlertCircle } from 'lucide-react';
import type { ClinicProfile } from '@/lib/actions/platform/activate';
import { savePhase1, type Phase1Data } from '@/lib/actions/platform/onboard';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const BG    = '#FAF8F5';
const NAVY  = '#1A1F2E';
const CYAN  = '#0891B2';
const SEC   = '#4A5568';
const MUT   = '#94A3B8';
const BDR   = '#E2E8F0';
const GREEN = '#059669';
const RED   = '#DC2626';

// ─── Phase stepper ────────────────────────────────────────────────────────────
const PHASES = [
  { n: 1, label: 'Clinic overview' },
  { n: 2, label: 'Your brand'      },
  { n: 3, label: 'Your team'       },
  { n: 4, label: 'Credentials'     },
  { n: 5, label: 'Integrations'    },
  { n: 6, label: 'Launch'          },
];

const CLINIC_TYPES = [
  { value: 'aesthetics', label: 'Aesthetics' },
  { value: 'wellness',   label: 'Wellness'   },
  { value: 'medical',    label: 'Medical'    },
  { value: 'dental',     label: 'Dental'     },
];

// ─── Shared input ─────────────────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, type = 'text', hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: MUT, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          height: 44, borderRadius: 10,
          border: `1.5px solid ${focused ? CYAN : BDR}`,
          padding: '0 14px', fontSize: 13, color: NAVY,
          background: '#FAFAF9', outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${CYAN}14` : 'none',
          transition: 'all 0.18s',
        }}
      />
      {hint && <p style={{ fontSize: 10, color: MUT, margin: 0 }}>{hint}</p>}
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────
export default function Phase1Client({
  sessionId, tenantName, profile, completedPhases,
}: {
  sessionId: string;
  tenantName: string;
  profile: ClinicProfile;
  completedPhases: number[];
}) {
  const router = useRouter();
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [saved, setSaved]     = useState(false);

  // ── Form state — pre-filled from DB ──────────────────────────────────────
  const [clinicName,   setClinicName]   = useState(profile.clinic_name  ?? '');
  const [clinicType,   setClinicType]   = useState<string[]>(profile.clinic_type ?? []);
  const [tagline,      setTagline]      = useState(profile.tagline       ?? '');
  const [addr1,        setAddr1]        = useState(profile.address_line1 ?? '');
  const [addr2,        setAddr2]        = useState(profile.address_line2 ?? '');
  const [city,         setCity]         = useState(profile.city          ?? '');
  const [postcode,     setPostcode]     = useState(profile.postcode      ?? '');
  const [phone,        setPhone]        = useState(profile.phone         ?? '');
  const [email,        setEmail]        = useState(profile.email         ?? '');
  const [website,      setWebsite]      = useState(profile.website       ?? '');
  const [cqcNumber,    setCqcNumber]    = useState(profile.cqc_number    ?? '');
  const [foundedYear,  setFoundedYear]  = useState(profile.founded_year ? String(profile.founded_year) : '');
  const [directorName, setDirectorName] = useState(profile.director_name  ?? '');
  const [directorTitle,setDirectorTitle]= useState(profile.director_title ?? '');

  const toggleType = useCallback((v: string) => {
    setClinicType(prev =>
      prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v]
    );
  }, []);

  const handleSave = useCallback(async () => {
    if (!clinicName.trim()) { setError('Clinic name is required.'); return; }
    if (clinicType.length === 0) { setError('Select at least one clinic type.'); return; }
    setError(''); setSaving(true);

    const data: Phase1Data = {
      clinic_name:   clinicName.trim(),
      clinic_type:   clinicType,
      tagline:       tagline.trim(),
      address_line1: addr1.trim(),
      address_line2: addr2.trim(),
      city:          city.trim(),
      postcode:      postcode.trim(),
      phone:         phone.trim(),
      email:         email.trim(),
      website:       website.trim(),
      cqc_number:    cqcNumber.trim(),
      founded_year:  foundedYear ? parseInt(foundedYear) : null,
      director_name:  directorName.trim(),
      director_title: directorTitle.trim(),
    };

    const result = await savePhase1(data);
    setSaving(false);

    if (!result.success) { setError(result.error ?? 'Failed to save.'); return; }

    setSaved(true);
    setTimeout(() => router.push('/onboard/2'), 900);
  }, [clinicName, clinicType, tagline, addr1, addr2, city, postcode, phone, email, website, cqcNumber, foundedYear, directorName, directorTitle, router]);

  return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column' }}>

      {/* ── Top nav ── */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', borderBottom: `1px solid ${BDR}`, background: BG,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `radial-gradient(circle at 33% 30%, #22D3EE, ${CYAN})`,
            boxShadow: `0 2px 8px ${CYAN}40`,
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, letterSpacing: '-0.02em' }}>
            Jwebly Health
          </span>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {PHASES.map((p, i) => {
            const done    = completedPhases.includes(p.n);
            const current = p.n === 1;
            return (
              <div key={p.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? GREEN : current ? NAVY : 'transparent',
                    border: `1.5px solid ${done ? GREEN : current ? NAVY : BDR}`,
                    flexShrink: 0,
                  }}>
                    {done
                      ? <Check size={10} strokeWidth={3} style={{ color: '#fff' }} />
                      : <span style={{ fontSize: 9, fontWeight: 700, color: current ? '#fff' : MUT }}>{p.n}</span>
                    }
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: current ? 600 : 400,
                    color: current ? NAVY : done ? SEC : MUT,
                    display: window?.innerWidth > 900 ? 'block' : 'none',
                  }}>
                    {p.label}
                  </span>
                </div>
                {i < PHASES.length - 1 && (
                  <ChevronRight size={12} style={{ color: BDR, flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>

        <div style={{ width: 120 }} />
      </div>

      {/* ── Body ── */}
      <div style={{
        flex: 1, display: 'flex', justifyContent: 'center',
        padding: '48px 24px 80px',
      }}>
        <div style={{ width: '100%', maxWidth: 640 }}>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginBottom: 36 }}
          >
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: `${CYAN}0c`, border: `1px solid ${CYAN}22`,
              borderRadius: 20, padding: '4px 10px', marginBottom: 12,
            }}>
              <Building2 size={11} style={{ color: CYAN }} />
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: CYAN }}>
                Phase 1 of 6
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.035em', color: NAVY, margin: '0 0 8px' }}>
              Clinic overview
            </h1>
            <p style={{ fontSize: 13, color: SEC, margin: 0, lineHeight: 1.7 }}>
              We&apos;ve pre-filled this from your onboarding brief. Review everything carefully — this is how your system will identify your clinic.
            </p>
          </motion.div>

          {/* ── Sections ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* Clinic identity */}
            <Section icon={<Building2 size={14} style={{ color: CYAN }} />} title="Clinic identity">
              <Field label="Clinic name" value={clinicName} onChange={setClinicName} placeholder="Edgbaston Wellness Clinic" />
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: MUT, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                  Clinic type
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CLINIC_TYPES.map(t => {
                    const active = clinicType.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => toggleType(t.value)}
                        style={{
                          height: 34, padding: '0 14px', borderRadius: 8,
                          border: `1.5px solid ${active ? CYAN : BDR}`,
                          background: active ? `${CYAN}0e` : 'transparent',
                          color: active ? CYAN : SEC,
                          fontSize: 12, fontWeight: active ? 600 : 400,
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {active && <Check size={11} strokeWidth={3} />}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Tagline" value={tagline} onChange={setTagline} placeholder="Premium aesthetics & wellness in Birmingham" hint="Optional — shown in system header" />
            </Section>

            {/* Address */}
            <Section icon={<MapPin size={14} style={{ color: CYAN }} />} title="Address">
              <Field label="Address line 1" value={addr1} onChange={setAddr1} placeholder="11 Greenfield Crescent" />
              <Field label="Address line 2" value={addr2} onChange={setAddr2} placeholder="Suite / Floor (optional)" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="City" value={city} onChange={setCity} placeholder="Birmingham" />
                <Field label="Postcode" value={postcode} onChange={setPostcode} placeholder="B15 3AU" />
              </div>
            </Section>

            {/* Contact */}
            <Section icon={<Phone size={14} style={{ color: CYAN }} />} title="Contact">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Phone" value={phone} onChange={setPhone} type="tel" placeholder="0121 454 8633" />
                <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="info@edgbastonwellness.co.uk" />
              </div>
              <Field label="Website" value={website} onChange={setWebsite} placeholder="https://edgbastonwellness.co.uk" hint="Optional" />
            </Section>

            {/* Director */}
            <Section icon={<User size={14} style={{ color: CYAN }} />} title="Medical director">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Full name" value={directorName} onChange={setDirectorName} placeholder="Dr Suresh Ganta" />
                <Field label="Title / Role" value={directorTitle} onChange={setDirectorTitle} placeholder="Medical Director" />
              </div>
            </Section>

            {/* Regulatory */}
            <Section icon={<Stethoscope size={14} style={{ color: CYAN }} />} title="Regulatory">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="CQC registration number" value={cqcNumber} onChange={setCqcNumber} placeholder="Optional" />
                <Field label="Year founded" value={foundedYear} onChange={setFoundedYear} type="number" placeholder="e.g. 2019" />
              </div>
            </Section>

          </div>

          {/* ── Error ── */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{
                  marginTop: 20, padding: '10px 14px', borderRadius: 10,
                  background: `${RED}08`, border: `1px solid ${RED}25`,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <AlertCircle size={13} style={{ color: RED, flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: RED, margin: 0 }}>{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── CTA ── */}
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
            <motion.button
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              whileHover={!saving && !saved ? { y: -1 } : {}}
              whileTap={!saving && !saved ? { scale: 0.985 } : {}}
              style={{
                height: 48, padding: '0 28px', borderRadius: 12, border: 'none',
                cursor: saving || saved ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
                color: '#FAF8F5',
                background: saved ? GREEN : NAVY,
                boxShadow: saved
                  ? `0 4px 16px ${GREEN}35`
                  : '0 4px 16px rgba(26,31,46,0.22)',
                transition: 'background 0.25s, box-shadow 0.25s',
              }}
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Saving&hellip;</>
                : saved
                ? <><Check size={14} strokeWidth={3} /> Confirmed</>
                : <>Confirm &amp; continue <ChevronRight size={14} /></>
              }
            </motion.button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  icon, title, children,
}: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        borderRadius: 16, border: `1px solid ${BDR}`,
        overflow: 'hidden', background: '#FFFFFF',
      }}
    >
      {/* Section header */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${BDR}`,
        display: 'flex', alignItems: 'center', gap: 8,
        background: `${BG}`,
      }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, letterSpacing: '-0.01em' }}>
          {title}
        </span>
      </div>
      {/* Section body */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </motion.div>
  );
}

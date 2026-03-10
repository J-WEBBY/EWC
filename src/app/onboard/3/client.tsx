'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { JweblyIcon } from '@/components/jwebly-logo';
import { BRAND } from '@/lib/config/brand';
import { savePhase3, type TeamMember } from '@/lib/actions/platform/onboard';
import {
  UserPlus, Trash2, Check, ChevronRight,
  Mail, AtSign, Shield, ChevronDown, Users,
} from 'lucide-react';

const BG     = '#F7F6F3';
const INK    = '#18181B';
const SEC    = '#4A5568';
const MUTED  = '#A1A1AA';
const BORDER = '#E4E4E7';
const GRN    = '#059669';

const ROLES = [
  { value: 'admin',        label: 'Admin',            desc: 'Full system access' },
  { value: 'practitioner', label: 'Practitioner',     desc: 'Clinical + patient data' },
  { value: 'receptionist', label: 'Receptionist',     desc: 'Bookings & front desk' },
  { value: 'manager',      label: 'Practice Manager', desc: 'Operations & reports' },
];

function generateUsername(fullName: string): string {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '';
  if (parts.length === 1) return parts[0].replace(/[^a-z0-9]/g, '');
  // first initial + last name, e.g. "jsmith"
  return (parts[0][0] + parts[parts.length - 1]).replace(/[^a-z0-9]/g, '');
}

interface MemberDraft {
  id: string;
  full_name: string;
  email: string;
  role: string;
  username: string;
  login_method: 'email_otp' | 'username';
  usernameEdited: boolean;
  showRoleMenu: boolean;
}

function blankMember(): MemberDraft {
  return {
    id: Math.random().toString(36).slice(2),
    full_name: '',
    email: '',
    role: 'practitioner',
    username: '',
    login_method: 'email_otp',
    usernameEdited: false,
    showRoleMenu: false,
  };
}

interface Props {
  sessionId: string;
  tenantName: string;
  completedPhases: number[];
}

export default function TeamOnboardClient({ tenantName, completedPhases }: Props) {
  const router = useRouter();
  const [members, setMembers] = useState<MemberDraft[]>([blankMember()]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (id: string, patch: Partial<MemberDraft>) => {
    setMembers(prev => prev.map(m => {
      if (m.id !== id) return m;
      const next = { ...m, ...patch };
      // Auto-generate username from name unless user has manually edited it
      if ('full_name' in patch && !next.usernameEdited) {
        next.username = generateUsername(next.full_name);
      }
      return next;
    }));
  };

  const addMember = () => setMembers(prev => [...prev, blankMember()]);

  const removeMember = (id: string) => {
    if (members.length === 1) return;
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    members.forEach(m => {
      if (!m.full_name.trim()) errs[`${m.id}-name`] = 'Name required';
      if (!m.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email))
        errs[`${m.id}-email`] = 'Valid email required';
      if (!m.username.trim()) errs[`${m.id}-user`] = 'Username required';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload: TeamMember[] = members.map(m => ({
      full_name: m.full_name.trim(),
      email: m.email.trim().toLowerCase(),
      role: m.role,
      username: m.username.trim().toLowerCase(),
      login_method: m.login_method,
    }));
    const res = await savePhase3({ members: payload });
    if (!res.success) { setSaving(false); return; }
    setDone(true);
    setTimeout(() => router.push('/onboard/4'), 2600);
  };

  const roleLabel = (v: string) => ROLES.find(r => r.value === v)?.label ?? v;

  return (
    <div style={{ background: BG, minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Dot grid */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.35 }}>
        <defs>
          <pattern id="tm-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#A1A1AA" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tm-dots)" />
      </svg>

      {/* Ambient blooms */}
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, #22D3EE18 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-15%', left: '-8%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, #0058E618 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Top bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, borderBottom: `1px solid ${BORDER}`, backdropFilter: 'blur(12px)', background: `${BG}F0`, padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <JweblyIcon size={28} uid="tm3-nav" />
          <span style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{BRAND.platform}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} style={{
              width: n === 3 ? 24 : 8, height: 8, borderRadius: 4,
              background: completedPhases.includes(n) ? GRN : n === 3 ? BRAND.accent : BORDER,
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '100px 24px 80px' }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', marginBottom: 48 }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${BRAND.accentLight}18`, border: `1px solid ${BRAND.accentLight}40`, borderRadius: 20, padding: '6px 14px', marginBottom: 20 }}>
            <Users size={12} color={BRAND.accent} />
            <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.accent, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Phase 3 — Your Team</span>
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: INK, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 0 12px' }}>
            Add your staff
          </h1>
          <p style={{ fontSize: 15, color: MUTED, maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
            Each team member gets a login. They can sign in with email + one-time password, or use their auto-generated username.
          </p>
        </motion.div>

        {/* Members */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <AnimatePresence initial={false}>
            {members.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                style={{
                  background: '#FFFFFF',
                  border: `1.5px solid ${BORDER}`,
                  borderRadius: 16,
                  padding: '20px 24px',
                  position: 'relative',
                }}
              >
                {/* Member header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${BRAND.accent}14`, border: `1px solid ${BRAND.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: BRAND.accent }}>{i + 1}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: SEC, letterSpacing: '-0.01em' }}>
                      {m.full_name.trim() || `Team member ${i + 1}`}
                    </span>
                  </div>
                  {members.length > 1 && (
                    <button onClick={() => removeMember(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: MUTED, display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Fields grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Full name */}
                  <InputField
                    label="Full name"
                    value={m.full_name}
                    placeholder="Dr Sarah Ahmed"
                    error={errors[`${m.id}-name`]}
                    onChange={v => update(m.id, { full_name: v })}
                  />

                  {/* Role selector */}
                  <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Role</label>
                    <button
                      onClick={() => update(m.id, { showRoleMenu: !m.showRoleMenu })}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', borderRadius: 8,
                        border: `1.5px solid ${BORDER}`, background: BG,
                        fontSize: 13, color: INK, fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={12} color={BRAND.accent} />
                        {roleLabel(m.role)}
                      </div>
                      <ChevronDown size={12} color={MUTED} />
                    </button>
                    <AnimatePresence>
                      {m.showRoleMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.97 }}
                          transition={{ duration: 0.12 }}
                          style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                            background: '#FFFFFF', border: `1.5px solid ${BORDER}`,
                            borderRadius: 10, marginTop: 4, overflow: 'hidden',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                          }}
                        >
                          {ROLES.map(r => (
                            <button
                              key={r.value}
                              onClick={() => update(m.id, { role: r.value, showRoleMenu: false })}
                              style={{
                                width: '100%', textAlign: 'left', padding: '10px 14px',
                                background: m.role === r.value ? `${BRAND.accent}0a` : 'transparent',
                                border: 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              }}
                            >
                              <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>{r.label}</span>
                              <span style={{ fontSize: 11, color: MUTED }}>{r.desc}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Email */}
                  <div>
                    <InputField
                      label="Email"
                      value={m.email}
                      placeholder="sarah@edgbastonwellness.co.uk"
                      type="email"
                      error={errors[`${m.id}-email`]}
                      icon={<Mail size={12} color={MUTED} />}
                      onChange={v => update(m.id, { email: v })}
                    />
                  </div>

                  {/* Username */}
                  <div>
                    <InputField
                      label="Username (auto-generated)"
                      value={m.username}
                      placeholder="sahmed"
                      error={errors[`${m.id}-user`]}
                      icon={<AtSign size={12} color={MUTED} />}
                      hint="Used for quick sign-in. Edit if needed."
                      onChange={v => update(m.id, { username: v, usernameEdited: true })}
                    />
                  </div>
                </div>

                {/* Login method toggle */}
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Login via:</span>
                  {(['email_otp', 'username'] as const).map(method => (
                    <button
                      key={method}
                      onClick={() => update(m.id, { login_method: method })}
                      style={{
                        padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.15s',
                        border: `1.5px solid ${m.login_method === method ? BRAND.accent : BORDER}`,
                        background: m.login_method === method ? `${BRAND.accent}12` : 'transparent',
                        color: m.login_method === method ? BRAND.accent : MUTED,
                      }}
                    >
                      {method === 'email_otp' ? 'Email + one-time code' : 'Username + password'}
                    </button>
                  ))}
                </div>

                {/* OTP note */}
                <AnimatePresence>
                  {m.login_method === 'email_otp' && (
                    <motion.p
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, overflow: 'hidden' }}
                    >
                      A one-time code will be sent to their email each time they sign in — no password to remember.
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Add member */}
        <motion.button
          onClick={addMember}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.987 }}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            border: `1.5px dashed ${BORDER}`, background: 'transparent',
            fontSize: 13, fontWeight: 600, color: MUTED, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 32, transition: 'all 0.2s',
          }}
        >
          <UserPlus size={15} />
          Add another team member
        </motion.button>

        {/* CTA */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', background: '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 2 }}>
              {members.length} team member{members.length !== 1 ? 's' : ''} added
            </div>
            <div style={{ fontSize: 11, color: MUTED }}>Invites will be sent once the clinic goes live</div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: INK, color: BG, border: 'none', borderRadius: 10,
              padding: '12px 24px', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              letterSpacing: '-0.01em', transition: 'opacity 0.2s',
            }}
          >
            {saving ? 'Saving…' : 'Save & continue'}
            {!saving && <ChevronRight size={15} />}
          </button>
        </div>
      </div>

      {/* Phase complete overlay */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: BG, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: '#05966918', border: '2px solid #05966940',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Check size={32} color={GRN} strokeWidth={2.5} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: INK, letterSpacing: '-0.03em', marginBottom: 6 }}>Phase 3 complete</div>
              <div style={{ fontSize: 14, color: MUTED }}>Team accounts saved</div>
              <div style={{ fontSize: 13, color: BRAND.accent, marginTop: 6, fontWeight: 600 }}>Next up: connect Cliniko</div>
            </motion.div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} style={{ width: n <= 3 ? 20 : 8, height: 8, borderRadius: 4, background: n <= 3 ? GRN : BORDER, transition: 'all 0.3s' }} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Reusable field ────────────────────────────────────────────────────────────
function InputField({
  label, value, onChange, placeholder, type = 'text', hint, error, icon,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string; error?: string; icon?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        {icon && (
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: icon ? '10px 12px 10px 30px' : '10px 12px',
            borderRadius: 8, fontSize: 13, color: INK,
            border: `1.5px solid ${error ? '#DC2626' : focused ? BRAND.accent : BORDER}`,
            background: BG, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
            fontFamily: 'inherit',
          }}
        />
      </div>
      {error && <span style={{ fontSize: 10, color: '#DC2626', fontWeight: 600 }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 10, color: MUTED }}>{hint}</span>}
    </div>
  );
}


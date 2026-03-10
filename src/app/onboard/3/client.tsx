'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { JweblyIcon } from '@/components/jwebly-logo';
import { BRAND } from '@/lib/config/brand';
import { savePhase3, type TeamMember } from '@/lib/actions/platform/onboard';
import {
  UserPlus, Trash2, Check, ChevronRight, Mail, AtSign, Shield,
  ChevronDown, Users, Layers, Building2, Plus, X, Info,
} from 'lucide-react';

// ─── Tokens ─────────────────────────────────────────────────────────────────
const BG     = '#F7F6F3';
const INK    = '#18181B';
const SEC    = '#4A5568';
const MUTED  = '#A1A1AA';
const BORDER = '#E4E4E7';
const GRN    = '#059669';

// ─── Roles ───────────────────────────────────────────────────────────────────
const ROLES = [
  { value: 'admin',        label: 'Admin',            desc: 'Full system access' },
  { value: 'practitioner', label: 'Practitioner',     desc: 'Clinical + patient data' },
  { value: 'receptionist', label: 'Receptionist',     desc: 'Bookings & front desk' },
  { value: 'manager',      label: 'Practice Manager', desc: 'Operations & reports' },
  { value: 'nurse',        label: 'Nurse / Therapist', desc: 'Clinical care support' },
];

// ─── Suggested departments ────────────────────────────────────────────────────
const SUGGESTED_DEPTS = [
  { name: 'Clinical',       color: '#0058E6' },
  { name: 'Administration', color: '#D8A600' },
  { name: 'Reception',      color: '#00A693' },
  { name: 'Management',     color: '#7C3AED' },
  { name: 'Marketing',      color: '#0891B2' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 9); }

function generateUsername(fullName: string): string {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (!parts[0]) return '';
  if (parts.length === 1) return parts[0].replace(/[^a-z0-9]/g, '');
  return (parts[0][0] + parts[parts.length - 1]).replace(/[^a-z0-9]/g, '');
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MemberDraft {
  id: string;
  full_name: string;
  email: string;
  role: string;
  username: string;
  usernameEdited: boolean;
  showRoleMenu: boolean;
  showUsernameField: boolean;
  department?: string;
}

interface DeptDraft {
  id: string;
  name: string;
  color: string;
  customName: string;
}

function blankMember(department?: string): MemberDraft {
  return {
    id: uid(), full_name: '', email: '', role: 'practitioner',
    username: '', usernameEdited: false, showRoleMenu: false,
    showUsernameField: false, department,
  };
}

interface Props {
  sessionId: string;
  tenantName: string;
  completedPhases: number[];
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TeamOnboardClient({ completedPhases }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'single' | 'departments' | null>(null);

  // Single-team state
  const [members, setMembers] = useState<MemberDraft[]>([blankMember()]);

  // Department state
  const [depts, setDepts] = useState<DeptDraft[]>([]);
  const [deptMembers, setDeptMembers] = useState<Record<string, MemberDraft[]>>({});
  const [customDeptName, setCustomDeptName] = useState('');
  const [showCustomDept, setShowCustomDept] = useState(false);

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Member mutations ────────────────────────────────────────────────────────
  const updateMember = (list: MemberDraft[], setList: (fn: (p: MemberDraft[]) => MemberDraft[]) => void, id: string, patch: Partial<MemberDraft>) => {
    setList(prev => prev.map(m => {
      if (m.id !== id) return m;
      const next = { ...m, ...patch };
      if ('full_name' in patch && !next.usernameEdited)
        next.username = generateUsername(next.full_name);
      return next;
    }));
  };

  const updateFlat = (id: string, patch: Partial<MemberDraft>) =>
    updateMember(members, setMembers, id, patch);

  const updateDeptMember = (deptId: string, id: string, patch: Partial<MemberDraft>) =>
    setDeptMembers(prev => ({
      ...prev,
      [deptId]: (prev[deptId] ?? []).map(m => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };
        if ('full_name' in patch && !next.usernameEdited)
          next.username = generateUsername(next.full_name);
        return next;
      }),
    }));

  const removeDeptMember = (deptId: string, id: string) =>
    setDeptMembers(prev => ({
      ...prev,
      [deptId]: (prev[deptId] ?? []).filter(m => m.id !== id),
    }));

  // ── Department mutations ────────────────────────────────────────────────────
  const addSuggestedDept = (s: typeof SUGGESTED_DEPTS[0]) => {
    if (depts.some(d => d.name === s.name)) return;
    const d: DeptDraft = { id: uid(), name: s.name, color: s.color, customName: '' };
    setDepts(prev => [...prev, d]);
    setDeptMembers(prev => ({ ...prev, [d.id]: [blankMember(d.name)] }));
  };

  const addCustomDept = () => {
    const name = customDeptName.trim();
    if (!name) return;
    const d: DeptDraft = { id: uid(), name, color: BRAND.accent, customName: name };
    setDepts(prev => [...prev, d]);
    setDeptMembers(prev => ({ ...prev, [d.id]: [blankMember(d.name)] }));
    setCustomDeptName('');
    setShowCustomDept(false);
  };

  const removeDept = (deptId: string) => {
    setDepts(prev => prev.filter(d => d.id !== deptId));
    setDeptMembers(prev => { const n = { ...prev }; delete n[deptId]; return n; });
  };

  // ── Validation ──────────────────────────────────────────────────────────────
  const allMembers = (): MemberDraft[] =>
    mode === 'departments'
      ? depts.flatMap(d => deptMembers[d.id] ?? [])
      : members;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    allMembers().forEach(m => {
      if (!m.full_name.trim()) errs[`${m.id}-name`] = 'Name required';
      if (!m.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email))
        errs[`${m.id}-email`] = 'Valid email required';
      if (m.showUsernameField && !m.username.trim())
        errs[`${m.id}-user`] = 'Username required if custom set';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const payload: TeamMember[] = allMembers().map(m => ({
      full_name: m.full_name.trim(),
      email: m.email.trim().toLowerCase(),
      role: m.role,
      username: m.username.trim().toLowerCase() || generateUsername(m.full_name),
      login_method: 'email_otp',
      department: m.department,
    }));
    const res = await savePhase3({ members: payload });
    if (!res.success) { setSaving(false); return; }
    setDone(true);
    setTimeout(() => router.push('/onboard/4'), 2600);
  };

  const totalCount = allMembers().length;

  // ─── Render ─────────────────────────────────────────────────────────────────
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
            <div key={n} style={{ width: n === 3 ? 24 : 8, height: 8, borderRadius: 4, background: completedPhases.includes(n) ? GRN : n === 3 ? BRAND.accent : BORDER, transition: 'all 0.3s' }} />
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '100px 24px 80px' }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${BRAND.accentLight}18`, border: `1px solid ${BRAND.accentLight}40`, borderRadius: 20, padding: '6px 14px', marginBottom: 20 }}>
            <Users size={12} color={BRAND.accent} />
            <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.accent, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Phase 3 — Your Team</span>
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: INK, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 0 12px' }}>Build your team</h1>
          <p style={{ fontSize: 15, color: MUTED, maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            Add staff accounts. Everyone can sign in with their email or username — both always work.
          </p>
        </motion.div>

        {/* Login info banner */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: `${BRAND.accent}08`, border: `1px solid ${BRAND.accent}25`, borderRadius: 12, padding: '12px 16px', marginBottom: 28 }}>
          <Info size={14} color={BRAND.accent} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: SEC, margin: 0, lineHeight: 1.6 }}>
            <strong style={{ color: INK }}>Two ways to log in, always enabled:</strong> staff can use their email address + a one-time code, <em>or</em> their username + password. Credentials are sent to them on go-live.
          </p>
        </motion.div>

        {/* Mode selector (shown until a mode is chosen) */}
        <AnimatePresence>
          {!mode && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.25 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>How is your clinic structured?</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
                {[
                  { key: 'single' as const, Icon: Users, title: 'Single team', desc: 'Everyone in one list — ideal for smaller clinics or flat structures.' },
                  { key: 'departments' as const, Icon: Layers, title: 'By departments', desc: 'Group staff into Clinical, Admin, Reception etc. for larger teams.' },
                ].map(opt => (
                  <motion.button
                    key={opt.key}
                    onClick={() => setMode(opt.key)}
                    whileHover={{ y: -2, boxShadow: `0 6px 24px ${BRAND.accent}18` }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      padding: '24px 20px', borderRadius: 16, border: `1.5px solid ${BORDER}`,
                      background: '#FFFFFF', cursor: 'pointer', textAlign: 'left',
                      display: 'flex', flexDirection: 'column', gap: 10,
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${BRAND.accent}12`, border: `1px solid ${BRAND.accent}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <opt.Icon size={18} color={BRAND.accent} strokeWidth={1.8} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: INK, letterSpacing: '-0.02em', marginBottom: 4 }}>{opt.title}</div>
                      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{opt.desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: BRAND.accent }}>
                      Choose this <ChevronRight size={11} />
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SINGLE TEAM MODE ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {mode === 'single' && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Users size={14} color={BRAND.accent} />
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>Single team</span>
                <button onClick={() => setMode(null)} style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <X size={11} /> Change
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <AnimatePresence initial={false}>
                  {members.map((m, i) => (
                    <MemberCard
                      key={m.id}
                      member={m}
                      index={i}
                      showRemove={members.length > 1}
                      errors={errors}
                      onUpdate={patch => updateFlat(m.id, patch)}
                      onRemove={() => setMembers(p => p.filter(x => x.id !== m.id))}
                    />
                  ))}
                </AnimatePresence>
              </div>

              <AddMemberButton onClick={() => setMembers(p => [...p, blankMember()])} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── DEPARTMENTS MODE ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {mode === 'departments' && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Layers size={14} color={BRAND.accent} />
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>By departments</span>
                <button onClick={() => setMode(null)} style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <X size={11} /> Change
                </button>
              </div>

              {/* Suggested departments */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Quick-add departments</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SUGGESTED_DEPTS.map(s => {
                    const active = depts.some(d => d.name === s.name);
                    return (
                      <button key={s.name} onClick={() => addSuggestedDept(s)}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: active ? 'default' : 'pointer',
                          border: `1.5px solid ${active ? s.color + '60' : BORDER}`,
                          background: active ? s.color + '12' : 'transparent',
                          color: active ? s.color : MUTED, transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {active && <Check size={10} />}
                        {s.name}
                      </button>
                    );
                  })}
                  <button onClick={() => setShowCustomDept(v => !v)}
                    style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1.5px dashed ${BORDER}`, background: 'transparent', color: MUTED, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Plus size={10} /> Custom
                  </button>
                </div>
                <AnimatePresence>
                  {showCustomDept && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden', marginTop: 10, display: 'flex', gap: 8 }}>
                      <input
                        value={customDeptName}
                        onChange={e => setCustomDeptName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addCustomDept(); }}
                        placeholder="Department name…"
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${BORDER}`, background: BG, fontSize: 13, color: INK, outline: 'none', fontFamily: 'inherit' }}
                      />
                      <button onClick={addCustomDept}
                        style={{ padding: '8px 16px', borderRadius: 8, background: INK, color: BG, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Add
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Department cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>
                <AnimatePresence initial={false}>
                  {depts.map(dept => (
                    <motion.div key={dept.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                      style={{ background: '#FFFFFF', border: `1.5px solid ${dept.color}30`, borderRadius: 16, overflow: 'hidden' }}>
                      {/* Dept header */}
                      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: dept.color, flexShrink: 0 }} />
                        <Building2 size={13} color={dept.color} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: INK, flex: 1 }}>{dept.name}</span>
                        <span style={{ fontSize: 11, color: MUTED }}>{(deptMembers[dept.id] ?? []).length} member{(deptMembers[dept.id] ?? []).length !== 1 ? 's' : ''}</span>
                        <button onClick={() => removeDept(dept.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4, display: 'flex' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {/* Members in dept */}
                      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <AnimatePresence initial={false}>
                          {(deptMembers[dept.id] ?? []).map((m, i) => (
                            <MemberCard
                              key={m.id}
                              member={m}
                              index={i}
                              showRemove={(deptMembers[dept.id] ?? []).length > 1}
                              errors={errors}
                              onUpdate={patch => updateDeptMember(dept.id, m.id, patch)}
                              onRemove={() => removeDeptMember(dept.id, m.id)}
                              compact
                            />
                          ))}
                        </AnimatePresence>
                        <button
                          onClick={() => setDeptMembers(prev => ({ ...prev, [dept.id]: [...(prev[dept.id] ?? []), blankMember(dept.name)] }))}
                          style={{ padding: '8px', borderRadius: 8, border: `1.5px dashed ${dept.color}40`, background: 'transparent', fontSize: 12, fontWeight: 600, color: dept.color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <UserPlus size={12} /> Add to {dept.name}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {depts.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: MUTED, fontSize: 13 }}>
                  Select departments above to start adding staff
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA — only show once mode is chosen */}
        <AnimatePresence>
          {mode && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', background: '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 16, marginTop: 24 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 2 }}>
                  {totalCount} team member{totalCount !== 1 ? 's' : ''} added
                </div>
                <div style={{ fontSize: 11, color: MUTED }}>Credentials sent to each staff member on go-live</div>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Phase complete overlay */}
      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              style={{ width: 72, height: 72, borderRadius: '50%', background: '#05966918', border: '2px solid #05966940', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

// ─── Member card ──────────────────────────────────────────────────────────────
function MemberCard({ member: m, index: i, showRemove, errors, onUpdate, onRemove, compact = false }:
  { member: MemberDraft; index: number; showRemove: boolean; errors: Record<string, string>; onUpdate: (p: Partial<MemberDraft>) => void; onRemove: () => void; compact?: boolean }) {

  const roleLabel = (v: string) => ROLES.find(r => r.value === v)?.label ?? v;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      style={{ background: compact ? BG : '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: compact ? '14px 16px' : '18px 20px' }}
    >
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: `${BRAND.accent}14`, border: `1px solid ${BRAND.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: BRAND.accent }}>{i + 1}</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: SEC }}>
            {m.full_name.trim() || `Staff member ${i + 1}`}
          </span>
        </div>
        {showRemove && (
          <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: MUTED, display: 'flex' }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <InputField label="Full name" value={m.full_name} placeholder="Dr Sarah Ahmed" error={errors[`${m.id}-name`]} onChange={v => onUpdate({ full_name: v })} />

        {/* Role */}
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>Role</label>
          <button onClick={() => onUpdate({ showRoleMenu: !m.showRoleMenu })}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${BORDER}`, background: BG, fontSize: 12, color: INK, fontWeight: 500, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Shield size={11} color={BRAND.accent} />{roleLabel(m.role)}</div>
            <ChevronDown size={11} color={MUTED} />
          </button>
          <AnimatePresence>
            {m.showRoleMenu && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
                style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#FFFFFF', border: `1.5px solid ${BORDER}`, borderRadius: 10, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
                {ROLES.map(r => (
                  <button key={r.value} onClick={() => onUpdate({ role: r.value, showRoleMenu: false })}
                    style={{ width: '100%', textAlign: 'left', padding: '9px 12px', background: m.role === r.value ? `${BRAND.accent}0a` : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>{r.label}</span>
                    <span style={{ fontSize: 10, color: MUTED }}>{r.desc}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <InputField label="Email address" value={m.email} placeholder="sarah@clinic.co.uk" type="email" error={errors[`${m.id}-email`]} icon={<Mail size={11} color={MUTED} />} onChange={v => onUpdate({ email: v })} />

        {/* Username */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Username</label>
            <button onClick={() => onUpdate({ showUsernameField: !m.showUsernameField })}
              style={{ fontSize: 10, color: BRAND.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              {m.showUsernameField ? 'Use auto' : 'Customise'}
            </button>
          </div>
          <AnimatePresence mode="wait">
            {m.showUsernameField ? (
              <motion.div key="custom" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <InputField label="" value={m.username} placeholder={generateUsername(m.full_name) || 'username'} error={errors[`${m.id}-user`]} icon={<AtSign size={11} color={MUTED} />}
                  onChange={v => onUpdate({ username: v, usernameEdited: true })} />
              </motion.div>
            ) : (
              <motion.div key="auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ padding: '9px 11px', borderRadius: 8, border: `1.5px solid ${BORDER}`, background: `${MUTED}08`, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AtSign size={11} color={MUTED} />
                <span style={{ fontSize: 13, color: m.full_name ? SEC : MUTED, fontWeight: m.full_name ? 600 : 400 }}>
                  {m.full_name ? generateUsername(m.full_name) || '…' : 'auto-generated from name'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Add member button ────────────────────────────────────────────────────────
function AddMemberButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button onClick={onClick} whileHover={{ y: -1 }} whileTap={{ scale: 0.987 }}
      style={{ width: '100%', padding: '12px', borderRadius: 10, border: `1.5px dashed ${BORDER}`, background: 'transparent', fontSize: 12, fontWeight: 600, color: MUTED, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
      <UserPlus size={13} /> Add another staff member
    </motion.button>
  );
}

// ─── Input field ──────────────────────────────────────────────────────────────
function InputField({ label, value, onChange, placeholder, type = 'text', hint, error, icon }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string; error?: string; icon?: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {icon && <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>{icon}</div>}
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder={placeholder}
          style={{ width: '100%', padding: icon ? '9px 11px 9px 28px' : '9px 11px', borderRadius: 8, fontSize: 12, color: INK, border: `1.5px solid ${error ? '#DC2626' : focused ? BRAND.accent : BORDER}`, background: BG, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s', fontFamily: 'inherit' }} />
      </div>
      {error && <span style={{ fontSize: 10, color: '#DC2626', fontWeight: 600 }}>{error}</span>}
      {hint && !error && <span style={{ fontSize: 10, color: MUTED }}>{hint}</span>}
    </div>
  );
}

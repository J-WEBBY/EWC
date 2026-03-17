'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Loader2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getGovernanceLog, createGovernanceEntry,
  getActiveUsers,
  type GovernanceEntry, type ActiveUser,
} from '@/lib/actions/compliance';
import {
  getStaffProfile, getCurrentUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

// ─── Meeting types for this page ──────────────────────────────────────────────
const MEETING_TYPES = [
  'Clinical Governance Meeting',
  'Staff Meeting',
  'Medicines Management Meeting',
  'Safeguarding Case Discussion',
];

// ─── Team definitions ─────────────────────────────────────────────────────────
type TeamDef = {
  key: string;
  label: string;
  roles: string[];
};

const TEAM_DEFINITIONS: TeamDef[] = [
  { key: 'all',        label: 'All Staff',         roles: [] },
  { key: 'clinical',   label: 'Clinical Team',      roles: ['Nurse', 'Doctor', 'Practitioner', 'GP', 'Therapist'] },
  { key: 'admin',      label: 'Admin & Reception',  roles: ['Receptionist', 'Admin', 'Coordinator'] },
  { key: 'management', label: 'Management',         roles: ['Manager', 'Director', 'Lead', 'Head'] },
];

function userMatchesTeam(user: ActiveUser, team: TeamDef): boolean {
  if (team.key === 'all') return true;
  const role = user.role_name ?? '';
  return team.roles.some(r => role.toLowerCase().includes(r.toLowerCase()));
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseList(val: string | null): string[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return val.split('\n').filter(Boolean); }
}

// ─── INP style ────────────────────────────────────────────────────────────────
const INP: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  color: NAVY,
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12,
  width: '100%',
  outline: 'none',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 9,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.22em',
      fontWeight: 700,
      color: MUTED,
      display: 'block',
      marginBottom: 6,
    }}>
      {children}
    </label>
  );
}

// ─── Meeting history item ──────────────────────────────────────────────────────
function MeetingItem({ entry }: { entry: GovernanceEntry }) {
  const [expanded, setExpanded] = useState(false);
  const attendees = parseList(entry.attendees);
  const actions   = parseList(entry.actions_arising);
  const agenda    = parseList(entry.agenda_items);

  return (
    <div className="rounded-xl mb-2 overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
      <button
        className="w-full flex items-center gap-4 px-4 py-3 text-left transition-all"
        style={{ background: 'transparent' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}05`; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        onClick={() => setExpanded(v => !v)}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, minWidth: 90 }}>{fmt(entry.event_date)}</span>
        <span className="rounded-full px-2 py-0.5" style={{ fontSize: 9, fontWeight: 700, background: `${BLUE}14`, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {entry.type}
        </span>
        {attendees.length > 0 && (
          <span style={{ fontSize: 11, color: TER }}>{attendees.length} attendee{attendees.length !== 1 ? 's' : ''}</span>
        )}
        {actions.length > 0 && (
          <span style={{ fontSize: 11, color: ORANGE }}>{actions.length} action{actions.length !== 1 ? 's' : ''}</span>
        )}
        <div className="flex-1" />
        {expanded ? <ChevronUp size={13} color={MUTED} /> : <ChevronDown size={13} color={MUTED} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', borderTop: `1px solid ${BORDER}` }}
          >
            <div className="px-4 py-3 grid grid-cols-3 gap-4">
              <div>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 6 }}>Agenda</p>
                {agenda.length > 0
                  ? agenda.map((a, i) => <p key={i} style={{ fontSize: 11, color: SEC }}>• {a}</p>)
                  : entry.agenda_items
                    ? <p style={{ fontSize: 11, color: SEC }}>{entry.agenda_items}</p>
                    : <p style={{ fontSize: 11, color: MUTED }}>—</p>
                }
              </div>
              <div>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 6 }}>Attendees</p>
                {attendees.length > 0
                  ? attendees.map((a, i) => <p key={i} style={{ fontSize: 11, color: SEC }}>• {a}</p>)
                  : <p style={{ fontSize: 11, color: MUTED }}>None recorded</p>}
              </div>
              <div>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, marginBottom: 6 }}>Actions</p>
                {actions.length > 0
                  ? actions.map((a, i) => <p key={i} style={{ fontSize: 11, color: ORANGE }}>• {a}</p>)
                  : <p style={{ fontSize: 11, color: MUTED }}>No actions</p>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Meeting Wizard ────────────────────────────────────────────────────────────
type AgendaItem = { item: string; notes: string };
type ActionRow  = { text: string; assignee: string; due_date: string };

type WizardState = {
  type: string;
  date: string;
  chairId: string;
  attendees: string[]; // names
  agendaItems: AgendaItem[];
  actions: ActionRow[];
};

function defaultWizard(teamMembers: ActiveUser[]): WizardState {
  return {
    type: 'Clinical Governance Meeting',
    date: '',
    chairId: teamMembers[0]?.id ?? '',
    attendees: teamMembers.map(m => m.full_name),
    agendaItems: [{ item: '', notes: '' }],
    actions: [{ text: '', assignee: '', due_date: '' }],
  };
}

interface MeetingWizardProps {
  users: ActiveUser[];
  teamMembers: ActiveUser[];
  onClose: () => void;
  onSaved: () => void;
}

const STEPS = ['Setup', 'Agenda', 'Discussion', 'Actions', 'Review'];

function MeetingWizard({ users, teamMembers, onClose, onSaved }: MeetingWizardProps) {
  const [step, setStep] = useState(0);
  const [wizard, setWizard] = useState<WizardState>(() => defaultWizard(teamMembers));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState(1);

  function go(newStep: number) {
    setDirection(newStep > step ? 1 : -1);
    setStep(newStep);
  }

  function next() { go(step + 1); }
  function back() { go(step - 1); }

  async function handleSubmit() {
    if (!wizard.date) { setError('Date is required'); return; }
    setSaving(true);

    const agendaPayload = JSON.stringify(
      wizard.agendaItems.filter(a => a.item.trim()).map(a => ({ item: a.item, notes: a.notes }))
    );
    const actionsPayload = JSON.stringify(
      wizard.actions.filter(a => a.text.trim()).map(a => ({
        text: a.text,
        assignee: a.assignee,
        due_date: a.due_date,
      }))
    );
    const chair = users.find(u => u.id === wizard.chairId);

    const res = await createGovernanceEntry({
      type: wizard.type,
      event_date: wizard.date,
      agenda_items: agendaPayload,
      attendees: JSON.stringify(wizard.attendees),
      actions_arising: actionsPayload,
      owner_id: wizard.chairId || undefined,
      status: 'completed',
      minutes_uploaded: true,
    });

    setSaving(false);
    if (res.success) {
      onSaved();
    } else {
      setError(res.error ?? 'Failed to save meeting');
    }
    // suppress unused variable warning
    void chair;
  }

  const validAgenda = wizard.agendaItems.filter(a => a.item.trim());
  const validActions = wizard.actions.filter(a => a.text.trim());

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Dark overlay — left 40% */}
      <div className="flex-[4] cursor-pointer" style={{ background: 'rgba(24,29,35,0.6)' }} onClick={onClose} />

      {/* Slide-in panel — right 60% */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
        className="flex-[6] flex flex-col overflow-hidden"
        style={{ background: BG, borderLeft: `1px solid ${BORDER}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 700, color: MUTED, marginBottom: 4 }}>
              Meeting Session
            </p>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: NAVY, lineHeight: 1 }}>Start a Meeting</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X size={18} color={MUTED} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-8 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className="flex items-center justify-center rounded-full text-[11px] font-bold transition-all"
                style={{
                  width: 28,
                  height: 28,
                  background: i < step ? GREEN : i === step ? NAVY : `${BORDER}`,
                  color: i <= step ? BG : MUTED,
                  fontSize: i < step ? 10 : 11,
                }}
              >
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: i === step ? 700 : 500,
                color: i === step ? NAVY : MUTED,
                marginLeft: 6,
                marginRight: 4,
              }}>{s}</span>
              {i < STEPS.length - 1 && (
                <div style={{ width: 24, height: 1, background: i < step ? GREEN : BORDER, marginRight: 4 }} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.22 }}
            >
              {/* ── Step 0: Setup ─────────────────────────────────────────── */}
              {step === 0 && (
                <div className="space-y-5">
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>Meeting Setup</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Meeting Type</Label>
                      <select style={INP} value={wizard.type} onChange={e => setWizard(w => ({ ...w, type: e.target.value }))}>
                        {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Date *</Label>
                      <input type="date" style={INP} value={wizard.date} onChange={e => setWizard(w => ({ ...w, date: e.target.value }))} />
                    </div>
                  </div>

                  <div>
                    <Label>Chairperson</Label>
                    <select style={INP} value={wizard.chairId} onChange={e => setWizard(w => ({ ...w, chairId: e.target.value }))}>
                      <option value="">Select chairperson...</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name} — {u.role_name}</option>)}
                    </select>
                  </div>

                  <div>
                    <Label>Attendees</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {wizard.attendees.map(name => (
                        <span
                          key={name}
                          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]"
                          style={{ background: `${BLUE}12`, color: BLUE, fontWeight: 600 }}
                        >
                          {name}
                          <button
                            onClick={() => setWizard(w => ({ ...w, attendees: w.attendees.filter(a => a !== name) }))}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                          >
                            <X size={9} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <select
                      style={INP}
                      value=""
                      onChange={e => {
                        const name = users.find(u => u.id === e.target.value)?.full_name;
                        if (name && !wizard.attendees.includes(name))
                          setWizard(w => ({ ...w, attendees: [...w.attendees, name] }));
                      }}
                    >
                      <option value="">Add attendee...</option>
                      {users.filter(u => !wizard.attendees.includes(u.full_name)).map(u => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* ── Step 1: Agenda ────────────────────────────────────────── */}
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 4 }}>What are we covering today?</h3>
                    <p style={{ fontSize: 12, color: TER }}>Add the agenda items for this meeting.</p>
                  </div>

                  <div className="space-y-3">
                    {wizard.agendaItems.map((ai, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div
                          className="flex items-center justify-center rounded-full shrink-0 text-[11px] font-bold"
                          style={{ width: 24, height: 24, background: `${NAVY}14`, color: NAVY }}
                        >
                          {i + 1}
                        </div>
                        <input
                          style={{ ...INP, flex: 1 }}
                          value={ai.item}
                          placeholder={`Agenda item ${i + 1}...`}
                          onChange={e => setWizard(w => ({
                            ...w,
                            agendaItems: w.agendaItems.map((a, j) => j === i ? { ...a, item: e.target.value } : a),
                          }))}
                        />
                        {wizard.agendaItems.length > 1 && (
                          <button
                            onClick={() => setWizard(w => ({ ...w, agendaItems: w.agendaItems.filter((_, j) => j !== i) }))}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                          >
                            <X size={13} color={MUTED} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setWizard(w => ({ ...w, agendaItems: [...w.agendaItems, { item: '', notes: '' }] }))}
                    style={{ fontSize: 12, color: BLUE, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + Add agenda item
                  </button>
                </div>
              )}

              {/* ── Step 2: Discussion ───────────────────────────────────── */}
              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Discussion Notes</h3>
                    <p style={{ fontSize: 12, color: TER }}>
                      Capture minutes for each agenda item.
                    </p>
                  </div>

                  {wizard.agendaItems.filter(a => a.item.trim()).length === 0 ? (
                    <p style={{ fontSize: 12, color: MUTED }}>No agenda items — go back and add some.</p>
                  ) : (
                    wizard.agendaItems.filter(a => a.item.trim()).map((ai, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="flex items-center justify-center rounded-full shrink-0 text-[10px] font-bold"
                            style={{ width: 20, height: 20, background: NAVY, color: BG }}
                          >
                            {i + 1}
                          </div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{ai.item}</p>
                          <span style={{ fontSize: 10, color: MUTED, marginLeft: 'auto' }}>
                            Item {i + 1} of {wizard.agendaItems.filter(a => a.item.trim()).length}
                          </span>
                        </div>
                        <textarea
                          rows={3}
                          style={{ ...INP, resize: 'vertical' }}
                          value={wizard.agendaItems.findIndex(a => a.item === ai.item) >= 0
                            ? wizard.agendaItems[wizard.agendaItems.findIndex(a => a.item === ai.item)].notes
                            : ''}
                          placeholder="Meeting notes / minutes for this item..."
                          onChange={e => {
                            const realIndex = wizard.agendaItems.findIndex(a => a.item === ai.item);
                            if (realIndex < 0) return;
                            setWizard(w => ({
                              ...w,
                              agendaItems: w.agendaItems.map((a, j) =>
                                j === realIndex ? { ...a, notes: e.target.value } : a
                              ),
                            }));
                          }}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Step 3: Actions ──────────────────────────────────────── */}
              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Actions Arising</h3>
                    <p style={{ fontSize: 12, color: TER }}>What actions came out of this meeting?</p>
                  </div>

                  <div className="space-y-3">
                    {wizard.actions.map((action, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          style={{ ...INP, flex: 2 }}
                          value={action.text}
                          placeholder="Action description..."
                          onChange={e => setWizard(w => ({
                            ...w,
                            actions: w.actions.map((a, j) => j === i ? { ...a, text: e.target.value } : a),
                          }))}
                        />
                        <input
                          style={{ ...INP, flex: 1 }}
                          value={action.assignee}
                          placeholder="Assignee..."
                          onChange={e => setWizard(w => ({
                            ...w,
                            actions: w.actions.map((a, j) => j === i ? { ...a, assignee: e.target.value } : a),
                          }))}
                        />
                        <input
                          type="date"
                          style={{ ...INP, flex: 1 }}
                          value={action.due_date}
                          onChange={e => setWizard(w => ({
                            ...w,
                            actions: w.actions.map((a, j) => j === i ? { ...a, due_date: e.target.value } : a),
                          }))}
                        />
                        <button
                          onClick={() => setWizard(w => ({ ...w, actions: w.actions.filter((_, j) => j !== i) }))}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          <X size={13} color={MUTED} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setWizard(w => ({ ...w, actions: [...w.actions, { text: '', assignee: '', due_date: '' }] }))}
                    style={{ fontSize: 12, color: BLUE, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + Add action
                  </button>
                </div>
              )}

              {/* ── Step 4: Review ───────────────────────────────────────── */}
              {step === 4 && (
                <div className="space-y-5">
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Review &amp; Submit</h3>
                    <p style={{ fontSize: 12, color: TER }}>Review the meeting summary before saving.</p>
                  </div>

                  {error && (
                    <p className="p-3 rounded-xl text-[11px]" style={{ background: `${RED}14`, color: RED }}>
                      {error}
                    </p>
                  )}

                  <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                    {[
                      { label: 'Type',          value: wizard.type },
                      { label: 'Date',          value: fmt(wizard.date) },
                      { label: 'Chairperson',   value: users.find(u => u.id === wizard.chairId)?.full_name ?? '—' },
                      { label: 'Attendees',     value: `${wizard.attendees.length} person${wizard.attendees.length !== 1 ? 's' : ''}` },
                      { label: 'Agenda items',  value: `${validAgenda.length} item${validAgenda.length !== 1 ? 's' : ''}` },
                      { label: 'Action items',  value: `${validActions.length} action${validActions.length !== 1 ? 's' : ''}` },
                    ].map((row, i) => (
                      <div
                        key={row.label}
                        className="flex items-center px-5 py-3"
                        style={{ borderBottom: i < 5 ? `1px solid ${BORDER}` : 'none' }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.15em', minWidth: 110 }}>
                          {row.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-3"
                    style={{
                      background: NAVY,
                      color: BG,
                      fontSize: 13,
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    Submit &amp; Save Meeting
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        {step < 4 && (
          <div className="flex items-center justify-between px-8 py-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <button
              onClick={back}
              disabled={step === 0}
              className="rounded-xl px-4 py-2 text-[12px] font-semibold transition-all"
              style={{
                background: 'transparent',
                border: `1px solid ${BORDER}`,
                color: step === 0 ? MUTED : NAVY,
                cursor: step === 0 ? 'default' : 'pointer',
                opacity: step === 0 ? 0.4 : 1,
              }}
            >
              Back
            </button>
            <button
              onClick={next}
              className="rounded-xl px-5 py-2 text-[12px] font-semibold"
              style={{ background: NAVY, color: BG, border: 'none', cursor: 'pointer' }}
            >
              {step === 3 ? 'Review' : 'Next'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TeamsPage() {
  const [loading,  setLoading]  = useState(true);
  const [profile,  setProfile]  = useState<StaffProfile | null>(null);
  const [userId,   setUserId]   = useState('');
  const [users,    setUsers]    = useState<ActiveUser[]>([]);
  const [meetings, setMeetings] = useState<GovernanceEntry[]>([]);
  const [activeTeam, setActiveTeam] = useState<string>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [toast, setToast] = useState<string>('');

  const loadData = useCallback(async () => {
    const [cu, usersRes, govRes] = await Promise.all([
      getCurrentUser(),
      getActiveUsers(),
      getGovernanceLog(),
    ]);
    const uid = cu?.userId ?? '';
    setUserId(uid);
    if (uid) {
      const p = await getStaffProfile('clinic', uid);
      if (p.success && p.data) setProfile(p.data.profile);
    }
    setUsers(usersRes);
    setMeetings(govRes.filter(e => MEETING_TYPES.includes(e.type)));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function showT(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const currentTeam = TEAM_DEFINITIONS.find(t => t.key === activeTeam) ?? TEAM_DEFINITIONS[0];

  // Filter members for current team
  const teamMembers: ActiveUser[] = users.filter(u => userMatchesTeam(u, currentTeam));

  // For meeting history: filter by team members participation (rough match)
  const teamMemberNames = new Set(teamMembers.map(m => m.full_name));
  const teamMeetings = meetings.filter(entry => {
    if (activeTeam === 'all') return true;
    const attendees = parseList(entry.attendees);
    return attendees.some(a => teamMemberNames.has(a));
  });

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh' }}>
        {profile && <StaffNav profile={profile} userId={userId} brandColor={BLUE} currentPath="Teams" />}
        <div className="pl-[240px] flex items-center justify-center" style={{ minHeight: '100vh' }}>
          <OrbLoader />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={BLUE} currentPath="Teams" />}

      <div className="pl-[240px] flex" style={{ minHeight: '100vh' }}>
        {/* ── Left panel: team list ──────────────────────────────────────── */}
        <div
          className="shrink-0 flex flex-col"
          style={{
            width: 260,
            borderRight: `1px solid ${BORDER}`,
            padding: '32px 0',
          }}
        >
          <p style={{
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.28em',
            fontWeight: 700,
            color: MUTED,
            padding: '0 20px',
            marginBottom: 12,
          }}>
            Teams
          </p>

          {TEAM_DEFINITIONS.map(team => {
            const count = users.filter(u => userMatchesTeam(u, team)).length;
            const isActive = activeTeam === team.key;
            return (
              <button
                key={team.key}
                onClick={() => setActiveTeam(team.key)}
                className="flex items-center justify-between w-full text-left px-5 py-3 transition-all"
                style={{
                  borderLeft: isActive ? `2px solid ${BLUE}` : '2px solid transparent',
                  background: isActive ? `${BLUE}06` : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = `${BLUE}04`; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ borderLeft: isActive ? `2px solid ${BLUE}` : '2px solid transparent', paddingLeft: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: isActive ? NAVY : SEC }}>{team.label}</p>
                  <p style={{ fontSize: 11, color: MUTED }}>{count} member{count !== 1 ? 's' : ''}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Right panel: team detail ───────────────────────────────────── */}
        <div className="flex-1 px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 20 }}>
            <div className="flex items-center gap-3">
              <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, letterSpacing: '-0.025em' }}>
                {currentTeam.label}
              </h1>
              <span
                className="rounded-full px-3 py-1"
                style={{ fontSize: 11, fontWeight: 700, background: `${NAVY}0d`, color: NAVY }}
              >
                {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
              </span>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5"
              style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}
            >
              <Plus size={13} />Start Meeting
            </button>
          </div>

          {/* Members grid */}
          <div className="mb-8">
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 700, color: MUTED, marginBottom: 14 }}>
              Members
            </p>
            {teamMembers.length === 0 ? (
              <p style={{ fontSize: 13, color: MUTED }}>No members in this team.</p>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {teamMembers.map(member => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl px-4 py-4 flex flex-col items-center text-center transition-all"
                    style={{ border: `1px solid ${BORDER}` }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}05`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {/* Avatar */}
                    <div className="relative mb-3">
                      <div
                        className="flex items-center justify-center rounded-full text-[13px] font-bold"
                        style={{ width: 40, height: 40, background: NAVY, color: BG }}
                      >
                        {initials(member.full_name)}
                      </div>
                      {/* Active dot */}
                      <div
                        className="absolute rounded-full"
                        style={{
                          width: 9,
                          height: 9,
                          background: GREEN,
                          border: `2px solid ${BG}`,
                          bottom: 0,
                          right: 0,
                        }}
                      />
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 2 }}>{member.full_name}</p>
                    <p style={{ fontSize: 11, color: MUTED }}>{member.role_name}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Meeting history */}
          <div>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 700, color: MUTED, marginBottom: 14 }}>
              Meeting History
            </p>
            {teamMeetings.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={{ border: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>No meetings recorded for this team yet.</p>
                <p style={{ fontSize: 11, color: MUTED }}>Click &quot;Start Meeting&quot; to log your first meeting.</p>
              </div>
            ) : (
              <div>
                {teamMeetings.map(entry => (
                  <MeetingItem key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Meeting wizard overlay */}
      <AnimatePresence>
        {showWizard && (
          <MeetingWizard
            users={users}
            teamMembers={teamMembers}
            onClose={() => setShowWizard(false)}
            onSaved={() => {
              setShowWizard(false);
              showT('Meeting saved successfully');
              loadData();
            }}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 rounded-xl px-4 py-3 z-[100]"
            style={{ background: GREEN, color: BG, fontSize: 13, fontWeight: 600 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

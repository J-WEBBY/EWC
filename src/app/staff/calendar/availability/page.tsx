'use client';

// =============================================================================
// Availability Manager — /staff/calendar/availability
//
// Comprehensive personal availability management with EWC AI assistant.
// Sections:
//   1. EWC AI Chat  — natural language schedule setup + delegation requests
//   2. Schedule Editor — working hours per day (editable, save to DB)
//   3. 14-Day Capacity — open slots per practitioner per day
//   4. Team Coverage  — weekly grid showing who works which days
//   5. Request Coverage — delegate a day to a colleague
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Clock, Check, Save, Send, Bot,
  Calendar, Users, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { StaffNav } from '@/components/staff-nav';
import { getCurrentUser, getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { getPractitioners, type PractitionerRow } from '@/lib/actions/appointments';
import {
  getWorkingHours, upsertWorkingHours,
  type WorkingHours as WorkingHoursRow,
} from '@/lib/actions/booking-pipeline';
import {
  parseAvailabilityText, type ParsedSchedule,
} from '@/lib/actions/availability-ai';
import { createSignal } from '@/lib/actions/signals';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const C = {
  bg:     '#FAF7F2',
  navy:   '#1A1035',
  sec:    '#524D66',
  ter:    '#6E6688',
  muted:  '#8B84A0',
  border: '#EBE5FF',
  bdAcc:  '#D5CCFF',
  ewc:    '#6D28D9',
};

const DAY_NAMES  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_S    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate()+n); return r;
}
function isToday(d: Date): boolean {
  const n = new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
}

const panel = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: 'transparent',
  border:     `1px solid ${C.border}`,
  borderRadius: 16,
  ...extra,
});

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.28em', fontWeight: 600, color: C.muted, marginBottom: 6 }}>{children}</div>
);

// =============================================================================
// CHAT TYPES
// =============================================================================

type ChatMsg = {
  id:      string;
  role:    'user' | 'ewc';
  text:    string;
  pending?: boolean;
};

function ewcId() { return `m-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; }

// =============================================================================
// PAGE
// =============================================================================

export default function AvailabilityPage() {
  const [profile,        setProfile]        = useState<StaffProfile | null>(null);
  const [userId,         setUserId]         = useState('');
  const [accentColor,    setAccentColor]    = useState(C.ewc);
  const [practitioners,  setPractitioners]  = useState<PractitionerRow[]>([]);
  const [workingHours,   setWorkingHours]   = useState<WorkingHoursRow[]>([]);

  // ── My Schedule ──
  const [myPractId,      setMyPractId]      = useState<string>('');
  const [whEdits,        setWhEdits]        = useState<Record<number, { start: string; end: string; slots: number; active: boolean }>>({});
  const [whSaving,       setWhSaving]       = useState(false);
  const [whSaved,        setWhSaved]        = useState(false);

  // ── EWC Chat ──
  const [chatMsgs,       setChatMsgs]       = useState<ChatMsg[]>([
    {
      id:   'intro',
      role: 'ewc',
      text: `Hi! I'm EWC — your AI scheduling assistant. I can help you set up your working hours using natural language.\n\nJust tell me when you work, for example:\n• "I work Monday to Friday 9am to 6pm with 30 min slots"\n• "Tuesday and Thursday 10-4, Wednesday 9-1 only"\n• "Day off on Fridays, everything else 9 to 5"\n\nI can also help you request coverage for specific days.`,
    },
  ]);
  const [chatInput,      setChatInput]      = useState('');
  const [chatLoading,    setChatLoading]    = useState(false);
  const chatEndRef                           = useRef<HTMLDivElement>(null);

  // ── Coverage Request ──
  const [coverDate,      setCoverDate]      = useState('');
  const [coverNote,      setCoverNote]      = useState('');
  const [coverSending,   setCoverSending]   = useState(false);
  const [coverSent,      setCoverSent]      = useState(false);

  // ── Auth + data load ──
  useEffect(() => {
    getCurrentUser().then(r => {
      const uid = r.userId ?? '';
      setUserId(uid);
      if (!uid) return;
      getStaffProfile('clinic', uid).then(res => {
        if (res.success && res.data?.profile) {
          const p = res.data.profile;
          setProfile(p);
          setAccentColor(p.brandColor || C.ewc);
        }
      });
    });
    getPractitioners().then(practs => {
      setPractitioners(practs);
      if (practs.length > 0) setMyPractId(id => id || practs[0].cliniko_id);
    });
    getWorkingHours().then(setWorkingHours);
  }, []);

  // ── Load edits when practitioner changes ──
  useEffect(() => {
    if (!myPractId) return;
    const pRows = workingHours.filter(w => w.practitioner_id === myPractId);
    const edits: Record<number, { start: string; end: string; slots: number; active: boolean }> = {};
    for (let d = 0; d < 7; d++) {
      const row = pRows.find(r => r.day_of_week === d);
      edits[d] = { start: row?.start_time ?? '09:00', end: row?.end_time ?? '17:00', slots: row?.slot_duration_min ?? 30, active: row?.is_active ?? false };
    }
    setWhEdits(edits);
  }, [myPractId, workingHours]);

  // ── Scroll chat to bottom ──
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  // ── 14-day capacity ──
  const next14Days = Array.from({ length: 14 }, (_, i) => {
    const d    = addDays(new Date(), i);
    const dStr = fmtDate(d);
    const dow  = d.getDay();
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const practData = practitioners.map(p => {
      const wh = workingHours.find(w => w.practitioner_id === p.cliniko_id && w.day_of_week === dow && w.is_active);
      if (!wh) return { id: p.cliniko_id, name: p.name, color: p.color, initials: p.initials, totalSlots: 0, openSlots: 0, isWorking: false };
      const startMins   = parseInt(wh.start_time.split(':')[0]) * 60 + parseInt(wh.start_time.split(':')[1]);
      const endMins     = parseInt(wh.end_time.split(':')[0])   * 60 + parseInt(wh.end_time.split(':')[1]);
      const totalSlots  = Math.max(0, Math.floor((endMins - startMins) / wh.slot_duration_min));
      // No live booked count here (would need appointment data); show capacity
      return { id: p.cliniko_id, name: p.name, color: p.color, initials: p.initials, totalSlots, openSlots: totalSlots, isWorking: true };
    });
    return { date: dStr, label, dow, practData };
  });

  // ── Handlers ──
  const handleSave = async () => {
    if (!myPractId) return;
    setWhSaving(true); setWhSaved(false);
    const practName = practitioners.find(p => p.cliniko_id === myPractId)?.name ?? '';
    const rows = ([0,1,2,3,4,5,6] as const).map(d => ({
      practitioner_id:   myPractId,
      practitioner_name: practName,
      day_of_week:       d,
      start_time:        whEdits[d]?.start ?? '09:00',
      end_time:          whEdits[d]?.end   ?? '17:00',
      slot_duration_min: whEdits[d]?.slots ?? 30,
      is_active:         whEdits[d]?.active ?? false,
    }));
    await upsertWorkingHours(rows);
    const refreshed = await getWorkingHours();
    setWorkingHours(refreshed);
    setWhSaving(false); setWhSaved(true);
    setTimeout(() => setWhSaved(false), 2500);
  };

  const handleCoverage = async () => {
    if (!coverDate) return;
    setCoverSending(true);
    const practName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'A staff member';
    const dateLabel = new Date(coverDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    await createSignal('clinic', {
      signalType:      'task',
      title:           `Coverage requested: ${practName} — ${dateLabel}`,
      description:     coverNote
        ? `${practName} is requesting coverage.\nDate: ${coverDate}\nNote: ${coverNote}`
        : `${practName} is requesting coverage on ${coverDate}.`,
      priority:        'medium',
      status:          'new',
      category:        'Operations',
      responseMode:    'supervised',
      sourceType:      'manual',
      createdByUserId: userId || null,
    });
    setCoverSending(false);
    setCoverSent(true);
    setCoverDate('');
    setCoverNote('');
    setTimeout(() => setCoverSent(false), 3500);
  };

  const handleChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    const userMsg: ChatMsg = { id: ewcId(), role: 'user', text };
    const pendingId = ewcId();
    const pending:  ChatMsg = { id: pendingId, role: 'ewc', text: '...', pending: true };
    setChatMsgs(prev => [...prev, userMsg, pending]);
    setChatLoading(true);

    // Build current schedule for context
    const currentSchedule: ParsedSchedule[] = ([0,1,2,3,4,5,6] as const).map(d => ({
      day_of_week:       d,
      start_time:        whEdits[d]?.start ?? '09:00',
      end_time:          whEdits[d]?.end   ?? '17:00',
      slot_duration_min: whEdits[d]?.slots ?? 30,
      is_active:         whEdits[d]?.active ?? false,
    }));

    const result = await parseAvailabilityText(text, currentSchedule);
    setChatLoading(false);

    if (result.success && result.schedule) {
      // Apply parsed schedule to editor
      const newEdits: Record<number, { start: string; end: string; slots: number; active: boolean }> = {};
      for (const row of result.schedule) {
        newEdits[row.day_of_week] = {
          start:  row.start_time,
          end:    row.end_time,
          slots:  row.slot_duration_min,
          active: row.is_active,
        };
      }
      setWhEdits(newEdits);

      const activeDays = result.schedule.filter(r => r.is_active).map(r => DAY_SHORT[r.day_of_week]).join(', ');
      const ewcMsg: ChatMsg = {
        id:   pendingId,
        role: 'ewc',
        text: `${result.message ?? 'Schedule updated.'}\n\nI've filled in your schedule editor — you can still tweak it manually, then hit **Save Schedule** when you're happy.${activeDays ? `\n\nWorking days: ${activeDays}` : ''}`,
      };
      setChatMsgs(prev => prev.map(m => m.id === pendingId ? ewcMsg : m));
    } else {
      // Fallback: respond conversationally
      let fallback = result.error ?? "I couldn't quite parse that. Try something like: *I work Monday to Friday, 9am to 6pm, 30 minute slots.*";

      // Check for delegation/coverage requests in the text
      if (/cover|delegate|off|leave|holiday|sick/i.test(text)) {
        fallback = `It sounds like you need coverage or want to take a day off. Use the **Request Coverage** section below to send a request to the team — just pick the date and add any notes.`;
      }

      setChatMsgs(prev => prev.map(m => m.id === pendingId ? { ...m, text: fallback, pending: false } : m));
    }
  }, [chatInput, chatLoading, whEdits]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); }
  };

  const todayStr = fmtDate(new Date());

  // ── Computed: my week summary ──
  const myActiveDays = ([1,2,3,4,5,6,0] as const).filter(d => whEdits[d]?.active);
  const myHours      = myActiveDays.length > 0 ? `${whEdits[myActiveDays[0]]?.start ?? '09:00'} – ${whEdits[myActiveDays[0]]?.end ?? '17:00'}` : null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', 'SF Pro Display', sans-serif" }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={accentColor} currentPath="Calendar" />}
      <div style={{ paddingLeft: 'var(--nav-w, 240px)', transition: 'padding-left 0.32s cubic-bezier(0.4,0,0.2,1)' }}>
        <div style={{ maxWidth: 1440, padding: '0 32px' }}>

          {/* ── Header ── */}
          <div style={{ padding: '32px 0 24px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Link href="/staff/calendar" style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.muted, fontSize: 11, textDecoration: 'none', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = accentColor}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.muted}>
                <ChevronLeft size={14} /> Calendar
              </Link>
              <span style={{ color: C.muted, fontSize: 11 }}>/</span>
              <span style={{ fontSize: 11, color: C.sec, fontWeight: 600 }}>Availability Manager</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.28em', fontWeight: 600, color: C.muted, marginBottom: 6 }}>Personal Availability</div>
                <h1 style={{ fontSize: 32, fontWeight: 900, color: C.navy, letterSpacing: '-0.03em', margin: 0 }}>
                  {profile ? `${profile.firstName}'s Schedule` : 'Availability Manager'}
                </h1>
                {myActiveDays.length > 0 && (
                  <p style={{ fontSize: 12, color: C.sec, marginTop: 6 }}>
                    Working {myActiveDays.length} day{myActiveDays.length > 1 ? 's' : ''} per week
                    {myHours ? ` · ${myHours}` : ''}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: `${accentColor}10`, border: `1px solid ${accentColor}30` }}>
                  <Bot size={14} color={accentColor} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: accentColor }}>EWC AI Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Body — 2-column layout ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24, padding: '28px 0 64px', alignItems: 'start' }}>

            {/* ═══════════════════════════════════════════
                LEFT: EWC AI Chat + Request Coverage
            ════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16, position: 'sticky', top: 24 }}>

              {/* EWC Chat */}
              <div style={panel({ padding: 0, overflow: 'hidden' })}>
                {/* Chat header */}
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: `${accentColor}06`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${accentColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bot size={16} color={accentColor} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.navy }}>EWC Scheduling Assistant</div>
                    <div style={{ fontSize: 10, color: C.ter }}>Natural language availability setup</div>
                  </div>
                  <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: '#059669', boxShadow: '0 0 0 2px #ECFDF5' }} />
                </div>

                {/* Messages */}
                <div style={{ height: 320, overflowY: 'auto' as const, padding: '16px 20px', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                  <AnimatePresence initial={false}>
                    {chatMsgs.map(msg => (
                      <motion.div key={msg.id}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
                        style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        {msg.role === 'ewc' && (
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${accentColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2 }}>
                            <Bot size={11} color={accentColor} />
                          </div>
                        )}
                        <div style={{
                          maxWidth: '80%',
                          padding: '9px 12px',
                          borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                          background: msg.role === 'user' ? accentColor : `${C.border}60`,
                          color:      msg.role === 'user' ? '#fff' : C.navy,
                          fontSize:   12,
                          lineHeight: 1.55,
                          fontStyle:  msg.pending ? 'italic' as const : 'normal' as const,
                          opacity:    msg.pending ? 0.7 : 1,
                          whiteSpace: 'pre-line' as const,
                        }}>
                          {msg.text.replace(/\*\*(.*?)\*\*/g, '$1')}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    placeholder="Tell EWC your schedule… e.g. 'Mon–Fri 9am–6pm, 30min slots'"
                    style={{
                      flex: 1,
                      border: `1px solid ${C.border}`,
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontSize: 11,
                      color: C.navy,
                      background: 'transparent',
                      outline: 'none',
                      resize: 'none' as const,
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                    }}
                  />
                  <button onClick={handleChat} disabled={!chatInput.trim() || chatLoading}
                    style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: chatInput.trim() && !chatLoading ? accentColor : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                    {chatLoading ? <RefreshCw size={14} color="#fff" style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} color="#fff" />}
                  </button>
                </div>

                {/* Quick prompts */}
                <div style={{ padding: '8px 16px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                  {[
                    'Mon-Fri 9-6, 30min slots',
                    'Tue & Thu only, 10-4',
                    'Day off on Fridays',
                    'Half day Wednesdays',
                  ].map(p => (
                    <button key={p} onClick={() => setChatInput(p)}
                      style={{ fontSize: 9, padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.ter, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' as const }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${accentColor}0c`; (e.currentTarget as HTMLElement).style.borderColor = accentColor; (e.currentTarget as HTMLElement).style.color = accentColor; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.ter; }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Request Coverage */}
              <div style={panel({ padding: 20 })}>
                <Lbl>Request Coverage / Delegation</Lbl>
                <p style={{ fontSize: 11, color: C.ter, marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>
                  Need a colleague to cover for you? Send a request to the team — it raises a task for the receptionist and Dr Ganata to arrange cover.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: C.muted, fontWeight: 600, marginBottom: 5 }}>Date needed</div>
                    <input type="date" value={coverDate} onChange={e => setCoverDate(e.target.value)} min={todayStr}
                      style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 11, color: C.navy, background: 'transparent', outline: 'none', boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: C.muted, fontWeight: 600, marginBottom: 5 }}>Note (optional)</div>
                    <textarea value={coverNote} onChange={e => setCoverNote(e.target.value)} rows={2}
                      placeholder="Reason or any context for the team..."
                      style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 11, color: C.navy, background: 'transparent', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
                  </div>
                  <AnimatePresence>
                    {coverSent && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 8, background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                        <Check size={13} color="#059669" />
                        <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>Coverage request sent to the team</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <button onClick={handleCoverage} disabled={!coverDate || coverSending}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: !coverDate ? C.border : accentColor, color: !coverDate ? C.muted : '#fff', fontSize: 11, fontWeight: 700, cursor: !coverDate ? 'not-allowed' : 'pointer', transition: 'background 0.15s' }}>
                    {coverSending ? 'Sending...' : 'Send Coverage Request'}
                  </button>
                </div>
              </div>

            </div>

            {/* ═══════════════════════════════════════════
                RIGHT: Schedule Editor + Team + 14-Day
            ════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>

              {/* ── Working Hours Editor ── */}
              <div style={panel({ padding: 0 })}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Lbl>Working hours</Lbl>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>My Weekly Schedule</div>
                  </div>
                  {/* Practitioner selector */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                    {practitioners.map(p => (
                      <button key={p.cliniko_id} onClick={() => setMyPractId(p.cliniko_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 9, border: `1px solid ${myPractId === p.cliniko_id ? p.color : C.border}`, background: myPractId === p.cliniko_id ? `${p.color}14` : 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: myPractId === p.cliniko_id ? p.color : C.ter }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 96px 96px 82px', padding: '9px 20px', borderBottom: `1px solid ${C.border}`, background: `${accentColor}04` }}>
                  {['Day', 'On', 'From', 'To', 'Slot'].map(h => (
                    <span key={h} style={{ fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.2em', fontWeight: 600, color: C.muted }}>{h}</span>
                  ))}
                </div>

                {/* Day rows — Mon first, Sun last */}
                {([1,2,3,4,5,6,0] as const).map((dow, i) => {
                  const edit = whEdits[dow] ?? { start: '09:00', end: '17:00', slots: 30, active: false };
                  return (
                    <div key={dow} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 96px 96px 82px', padding: '10px 20px', borderBottom: i < 6 ? `1px solid ${C.border}` : 'none', alignItems: 'center', background: edit.active ? `${accentColor}03` : 'transparent', transition: 'background 0.15s' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: edit.active ? C.navy : C.muted }}>{DAY_NAMES[dow]}</span>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={edit.active}
                          onChange={e => setWhEdits(prev => ({ ...prev, [dow]: { ...(prev[dow] ?? { start: '09:00', end: '17:00', slots: 30, active: false }), active: e.target.checked } }))}
                          style={{ width: 15, height: 15, accentColor: accentColor, cursor: 'pointer' }} />
                      </label>
                      {edit.active ? (
                        <>
                          <input type="time" value={edit.start}
                            onChange={e => setWhEdits(prev => ({ ...prev, [dow]: { ...prev[dow], start: e.target.value } }))}
                            style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 8px', fontSize: 11, color: C.navy, background: 'transparent', outline: 'none', width: 80 }} />
                          <input type="time" value={edit.end}
                            onChange={e => setWhEdits(prev => ({ ...prev, [dow]: { ...prev[dow], end: e.target.value } }))}
                            style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 8px', fontSize: 11, color: C.navy, background: 'transparent', outline: 'none', width: 80 }} />
                          <select value={edit.slots}
                            onChange={e => setWhEdits(prev => ({ ...prev, [dow]: { ...prev[dow], slots: parseInt(e.target.value) } }))}
                            style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: '5px 8px', fontSize: 11, color: C.navy, background: 'white', outline: 'none', width: 75 }}>
                            {[15,20,30,45,60].map(s => <option key={s} value={s}>{s} min</option>)}
                          </select>
                        </>
                      ) : (
                        <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' as const, gridColumn: '3 / span 3' }}>Day off</span>
                      )}
                    </div>
                  );
                })}

                {/* Footer */}
                <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {myActiveDays.length > 0
                      ? `${myActiveDays.length} active day${myActiveDays.length > 1 ? 's' : ''}: ${myActiveDays.map(d => DAY_SHORT[d]).join(', ')}`
                      : 'No active days configured'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {whSaved && (
                      <span style={{ fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Check size={13} /> Saved
                      </span>
                    )}
                    <button onClick={handleSave} disabled={whSaving || !myPractId}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 10, border: 'none', background: whSaving ? C.muted : accentColor, color: '#fff', fontSize: 11, fontWeight: 700, cursor: whSaving ? 'not-allowed' : 'pointer' }}>
                      <Save size={13} /> {whSaving ? 'Saving...' : 'Save Schedule'}
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Team Coverage Grid ── */}
              <div style={panel({ padding: 0 })}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
                  <Lbl>Team coverage</Lbl>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Weekly Schedule — All Practitioners</div>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '160px repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
                    <div />
                    {(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const).map(d => (
                      <div key={d} style={{ textAlign: 'center' as const, fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.15em', fontWeight: 600, color: C.muted }}>{d}</div>
                    ))}
                  </div>
                  {practitioners.map(p => {
                    const pRows = workingHours.filter(w => w.practitioner_id === p.cliniko_id);
                    return (
                      <div key={p.cliniko_id} style={{ display: 'grid', gridTemplateColumns: '160px repeat(7, 1fr)', gap: 4, marginBottom: 6, alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: `${p.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: p.color, flexShrink: 0 }}>{p.initials}</div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                        </div>
                        {([1,2,3,4,5,6,0] as const).map(dow => {
                          const wh = pRows.find(w => w.day_of_week === dow && w.is_active);
                          return (
                            <div key={dow} title={wh ? `${wh.start_time.slice(0,5)}–${wh.end_time.slice(0,5)}, ${wh.slot_duration_min}min` : 'Day off'}
                              style={{ height: 30, borderRadius: 6, background: wh ? `${p.color}18` : `${C.border}40`, border: `1px solid ${wh ? `${p.color}30` : `${C.border}60`}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {wh && <span style={{ fontSize: 7, fontWeight: 700, color: p.color }}>{wh.start_time.slice(0,5)}</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── 14-Day Capacity Preview ── */}
              <div style={panel({ padding: 0 })}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
                  <Lbl>Capacity forecast</Lbl>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>14-Day Availability</div>
                  <div style={{ fontSize: 10, color: C.ter, marginTop: 2 }}>Slot capacity based on configured working hours</div>
                </div>
                <div style={{ padding: '4px 0' }}>
                  {next14Days.map((day, di) => {
                    const totalSlots  = day.practData.reduce((s, p) => s + p.totalSlots, 0);
                    const isWeekend   = day.dow === 0 || day.dow === 6;
                    const workingPracts = day.practData.filter(p => p.isWorking);
                    return (
                      <div key={day.date} style={{ padding: '9px 20px', borderBottom: di < 13 ? `1px solid ${C.border}` : 'none', background: isWeekend ? `${C.border}25` : 'transparent', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 110, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: isToday(new Date(day.date + 'T12:00:00')) ? 800 : 600, color: isToday(new Date(day.date + 'T12:00:00')) ? accentColor : C.navy }}>{day.label}</span>
                          {isWeekend && <span style={{ fontSize: 8, color: C.muted, marginLeft: 5 }}>Wknd</span>}
                        </div>
                        {totalSlots === 0 ? (
                          <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' as const }}>No schedule</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
                            {workingPracts.map(p => (
                              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: `${p.color}12`, border: `1px solid ${p.color}25` }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: p.color }}>{p.initials}</span>
                                <span style={{ fontSize: 9, color: C.ter }}>{p.totalSlots} slots</span>
                              </div>
                            ))}
                            <span style={{ fontSize: 9, color: C.muted }}>{totalSlots} total</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

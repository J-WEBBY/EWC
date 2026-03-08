'use client';

// =============================================================================
// Smart Organisational Calendar — Edgbaston Wellness Clinic
// 4 views: Month · Week · Day · Agenda
// Sources: Cliniko appointments, custom events, compliance tasks, signals
// =============================================================================

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Plus, X, Clock, User, ArrowUpRight,
  Check, Trash2, AlertCircle, Shield, Briefcase, Edit3,
  CalendarDays, BookOpen, Ban, type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import { getCurrentUser, getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getMonthAppointments, getPractitioners, getPendingBookings, updateAppointmentStatus,
  type AppointmentRow, type PractitionerRow,
} from '@/lib/actions/appointments';
import {
  getCalendarData, createCalendarEvent, deleteCalendarEvent, markEventComplete,
  type CalendarEvent, type ComplianceCalItem, type CalendarUser,
} from '@/lib/actions/calendar';
import { createSignal } from '@/lib/actions/signals';

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG      = '#FAF7F2';
const NAVY    = '#1A1035';
const SEC     = '#524D66';
const TER     = '#6E6688';
const MUTED   = '#8B84A0';
const BORDER  = '#EBE5FF';
const BLUE    = '#0058E6';
const PURPLE  = '#7C3AED';
const GOLD    = '#D8A600';
const EMERALD = '#00A693';
const RED     = '#DC2626';
const ORANGE  = '#EA580C';
const GREEN   = '#059669';

// ─── Event type config ────────────────────────────────────────────────────────
type UIEventType = 'meeting' | 'training' | 'leave' | 'blocked' | 'deadline' | 'note' | 'inspection';

const EVENT_CFG: Record<UIEventType, { color: string; bg: string; label: string; dbType: string }> = {
  meeting:    { color: PURPLE,  bg: `${PURPLE}14`,  label: 'Meeting',    dbType: 'meeting'    },
  training:   { color: EMERALD, bg: `${EMERALD}14`, label: 'Training',   dbType: 'training'   },
  leave:      { color: GOLD,    bg: `${GOLD}14`,    label: 'Leave',      dbType: 'blocked'    },
  blocked:    { color: MUTED,   bg: `${MUTED}14`,   label: 'Blocked',    dbType: 'blocked'    },
  deadline:   { color: RED,     bg: `${RED}14`,     label: 'Deadline',   dbType: 'deadline'   },
  note:       { color: TER,     bg: `${TER}14`,     label: 'Note',       dbType: 'note'       },
  inspection: { color: ORANGE,  bg: `${ORANGE}14`,  label: 'Inspection', dbType: 'inspection' },
};

function getEventColor(e: CalendarEvent): { color: string; bg: string; label: string } {
  if (e.color) return { color: e.color, bg: e.color + '18', label: e.event_type };
  return EVENT_CFG[e.event_type as UIEventType] ?? EVENT_CFG.meeting;
}

const APPT_STATUS: Record<string, { color: string; bg: string; label: string }> = {
  booked:         { color: BLUE,   bg: `${BLUE}12`,   label: 'Booked'    },
  arrived:        { color: GREEN,  bg: `${GREEN}12`,  label: 'Arrived'   },
  did_not_arrive: { color: ORANGE, bg: `${ORANGE}12`, label: 'DNA'       },
  pending:        { color: ORANGE, bg: `${ORANGE}12`, label: 'Pending'   },
  cancelled:      { color: RED,    bg: `${RED}12`,    label: 'Cancelled' },
};
const getApptSt = (s: string) => APPT_STATUS[s?.toLowerCase()] ?? APPT_STATUS.booked;

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_SHORT   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_FULL    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const HOURS       = [7,8,9,10,11,12,13,14,15,16,17,18,19,20];
const HOUR_H      = 52;
const HEADER_H    = 46;
const LEAVE_TYPES = ['Annual Leave','Sick Leave','Maternity Leave','Paternity Leave','Compassionate Leave','TOIL','Study Leave','Unpaid Leave'];
const BLOCK_TYPES = ['Clinic Closure','Admin Time','Equipment Maintenance','Deep Clean','Staff Meeting','Other'];

const FALLBACK: StaffProfile = {
  userId: '', firstName: '—', lastName: '', email: '', jobTitle: null,
  departmentName: null, departmentId: null, roleName: null, isAdmin: false,
  isOwner: false, companyName: '', aiName: 'Aria', brandColor: '#0058E6',
  logoUrl: null, industry: null, reportsTo: null, teamSize: 0,
};

// ─── Types ────────────────────────────────────────────────────────────────────
type CalView  = 'month' | 'week' | 'day' | 'agenda';
type LayerKey = 'appointments' | 'events' | 'compliance' | 'signals';
type CalItem  = { kind: 'appt'; data: AppointmentRow } | { kind: 'event'; data: CalendarEvent } | { kind: 'compliance'; data: ComplianceCalItem };

type AddForm = {
  event_type: UIEventType;
  title: string; description: string;
  start_date: string; end_date: string;
  start_time: string; end_time: string;
  all_day: boolean; assigned_to: string; sub_type: string;
};

function mkForm(date?: Date | null): AddForm {
  const ds = date ? dKey(date) : dKey(new Date());
  return { event_type: 'meeting', title: '', description: '', start_date: ds, end_date: ds, start_time: '09:00', end_time: '10:00', all_day: false, assigned_to: '', sub_type: '' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function sameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

function buildGrid(year: number, month: number): (Date|null)[][] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month+1, 0);
  const start = (first.getDay()+6)%7;
  const cells: (Date|null)[] = [];
  for (let i=0;i<start;i++) cells.push(null);
  for (let d=1;d<=last.getDate();d++) cells.push(new Date(year,month,d));
  while (cells.length%7!==0) cells.push(null);
  const rows:(Date|null)[][]=[];
  for (let i=0;i<cells.length;i+=7) rows.push(cells.slice(i,i+7));
  return rows;
}

function weekDays(anchor: Date): Date[] {
  const dow=(anchor.getDay()+6)%7;
  const mon=new Date(anchor); mon.setDate(anchor.getDate()-dow);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
}

function fmtT(iso:string|null|undefined){ if(!iso) return ''; return new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}); }
function fmtTs(t:string|null|undefined){ if(!t) return ''; const [h,m]=t.split(':'); const hr=parseInt(h??'0'); return `${hr>12?hr-12:hr===0?12:hr}:${m??'00'}${hr>=12?'pm':'am'}`; }
function fmtDMed(d:Date){ return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}); }
function isoMins(iso:string|null|undefined){ if(!iso) return 0; const d=new Date(iso); return d.getHours()*60+d.getMinutes(); }
function tMins(t:string|null|undefined){ if(!t) return 0; const[h,m]=t.split(':').map(Number); return (h??0)*60+(m??0); }

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const router = useRouter();
  const today  = new Date();

  const [profile,    setProfile]    = useState<StaffProfile|null>(null);
  const [userId,     setUserId]     = useState('');
  const [brandColor, setBrandColor] = useState('#0058E6');

  const [view,       setView]       = useState<CalView>('month');
  const [year,       setYear]       = useState(today.getFullYear());
  const [month,      setMonth]      = useState(today.getMonth());
  const [anchor,     setAnchor]     = useState<Date>(today);

  const [selDay,     setSelDay]     = useState<Date|null>(null);
  const [selItem,    setSelItem]    = useState<CalItem|null>(null);

  const [layers,     setLayers]     = useState<Record<LayerKey,boolean>>({ appointments:true, events:true, compliance:true, signals:true });
  const [practFilt,  setPractFilt]  = useState<string|null>(null);

  const [allAppts,   setAllAppts]   = useState<AppointmentRow[]>([]);
  const [calEvts,    setCalEvts]    = useState<CalendarEvent[]>([]);
  const [compItems,  setCompItems]  = useState<ComplianceCalItem[]>([]);
  const [sigDayMap,  setSigDayMap]  = useState<Record<string,number>>({});
  const [calUsers,   setCalUsers]   = useState<CalendarUser[]>([]);
  const [todayAppts, setTodayAppts] = useState<AppointmentRow[]>([]);
  const [pendCnt,    setPendCnt]    = useState(0);
  const [practs,     PractsFn]      = useState<PractitionerRow[]>([]);

  const [loading,    setLoading]    = useState(true);
const [showAdd,    setShowAdd]    = useState(false);
  const [addForm,    setAddForm]    = useState<AddForm>(mkForm());
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState<{ok:boolean;msg:string}|null>(null);
  const [apptUpd,    setApptUpd]    = useState<string|null>(null);
  const [delId,      setDelId]      = useState<string|null>(null);

  // ── Data loaders ─────────────────────────────────────────────────────────────
  const loadRange = useCallback(async (y:number, m:number) => {
    const from = `${y}-${String(m+1).padStart(2,'0')}-01`;
    const ld   = new Date(y, m+1, 0).getDate();
    const to   = `${y}-${String(m+1).padStart(2,'0')}-${String(ld).padStart(2,'0')}`;
    try {
      const [apptRes, orgData] = await Promise.all([
        getMonthAppointments(y, m),
        getCalendarData(from, to),
      ]);
      setAllAppts(apptRes.appointments);
      const tk = dKey(today);
      if (y===today.getFullYear() && m===today.getMonth())
        setTodayAppts(apptRes.appointments.filter(a=>a.starts_at.startsWith(tk)));
      setCalEvts(orgData.events);
      setCompItems(orgData.compliance);
      setCalUsers(orgData.users);
      const sdm:Record<string,number>={};
      for (const s of orgData.signals) { const k=s.created_at.slice(0,10); sdm[k]=(sdm[k]??0)+1; }
      setSigDayMap(sdm);
    } catch(e){ console.error('[Calendar]',e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    (async()=>{
      try {
        const u = await getCurrentUser();
        if (!u.success||!u.userId){ router.push('/login'); return; }
        setUserId(u.userId);
        try { const p=await getStaffProfile('clinic',u.userId); if(p.success&&p.data){ const prof=(p.data as {profile:StaffProfile}).profile; setProfile(prof); if(prof?.brandColor) setBrandColor(prof.brandColor); } } catch{/**/}
        try { const ps=await getPractitioners(); PractsFn(ps); } catch{/**/}
        try { const pb=await getPendingBookings(); setPendCnt(pb.bookings.length); } catch{/**/}
      } catch(e){ console.error(e); } finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{ loadRange(year,month); },[year,month,loadRange]);

  // ── Maps ─────────────────────────────────────────────────────────────────────
  const apptMap: Record<string,AppointmentRow[]> = {};
  for (const a of allAppts) { const k=a.starts_at.slice(0,10); if(!apptMap[k]) apptMap[k]=[]; apptMap[k].push(a); }
  const evtMap: Record<string,CalendarEvent[]> = {};
  for (const e of calEvts) { if(!evtMap[e.start_date]) evtMap[e.start_date]=[]; evtMap[e.start_date].push(e); }
  const compMap: Record<string,ComplianceCalItem[]> = {};
  for (const c of compItems) { if (!c.next_due_date) continue; const k=c.next_due_date.slice(0,10); if(!compMap[k]) compMap[k]=[]; compMap[k].push(c); }

  // ── Navigation ───────────────────────────────────────────────────────────────
  function prevP() {
    if (view==='month') { if(month===0){setYear(y=>y-1);setMonth(11);}else setMonth(m=>m-1); setSelDay(null); }
    else if (view==='week') { const d=new Date(anchor); d.setDate(d.getDate()-7); setAnchor(d); }
    else if (view==='day')  { const d=new Date(anchor); d.setDate(d.getDate()-1); setAnchor(d); setSelDay(d); }
    else { const d=new Date(anchor); d.setDate(d.getDate()-30); setAnchor(d); }
  }
  function nextP() {
    if (view==='month') { if(month===11){setYear(y=>y+1);setMonth(0);}else setMonth(m=>m+1); setSelDay(null); }
    else if (view==='week') { const d=new Date(anchor); d.setDate(d.getDate()+7); setAnchor(d); }
    else if (view==='day')  { const d=new Date(anchor); d.setDate(d.getDate()+1); setAnchor(d); setSelDay(d); }
    else { const d=new Date(anchor); d.setDate(d.getDate()+30); setAnchor(d); }
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()); setAnchor(today); setSelDay(today); }
  function switchView(v:CalView) {
    setView(v);
    if (v==='day')   { setAnchor(selDay??today); setSelDay(selDay??today); }
    if (v==='week')  { setAnchor(selDay??today); }
    if (v==='month') { const d=selDay??today; setYear(d.getFullYear()); setMonth(d.getMonth()); }
  }

  function periodLabel() {
    if (view==='month') return `${MONTH_NAMES[month]} ${year}`;
    if (view==='week')  { const d=weekDays(anchor); const s=d[0],e=d[6]; return s.getMonth()===e.getMonth() ? `${s.getDate()}–${e.getDate()} ${MONTH_NAMES[s.getMonth()]} ${s.getFullYear()}` : `${s.getDate()} ${MONTH_NAMES[s.getMonth()]} – ${e.getDate()} ${MONTH_NAMES[e.getMonth()]}`; }
    if (view==='day')   return fmtDMed(anchor);
    return `Next 30 days from ${anchor.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function showT(ok:boolean,msg:string){ setToast({ok,msg}); setTimeout(()=>setToast(null),3200); }

async function handleApptStatus(id:string, status:'arrived'|'cancelled') {
    setApptUpd(id);
    try {
      const res = await updateAppointmentStatus(id, status);
      if (res.success) {
        setAllAppts(p=>p.map(a=>a.id===id?{...a,status}:a));
        if (selItem?.kind==='appt'&&selItem.data.id===id) setSelItem({kind:'appt',data:{...selItem.data,status}});
        showT(true,`Marked ${status}`);
      } else showT(false,'Update failed');
    } finally { setApptUpd(null); }
  }

  async function handleDelEvt(id:string) {
    setDelId(id);
    try {
      const res=await deleteCalendarEvent(id);
      if(res.success){ setCalEvts(p=>p.filter(e=>e.id!==id)); if(selItem?.kind==='event'&&selItem.data.id===id) setSelItem(null); showT(true,'Event deleted'); }
      else showT(false,res.error??'Delete failed');
    } finally { setDelId(null); }
  }

  async function handleCompleteEvt(id:string) {
    const res=await markEventComplete(id);
    if(res.success){ setCalEvts(p=>p.map(e=>e.id===id?{...e,status:'completed'}:e)); showT(true,'Marked complete'); }
    else showT(false,res.error??'Failed');
  }

  async function handleSaveEvent() {
    if(!addForm.title.trim()){ showT(false,'Title required'); return; }
    setSaving(true);
    try {
      const isLeave   = addForm.event_type==='leave';
      const isBlocked = addForm.event_type==='blocked';
      const dbType    = (isLeave||isBlocked) ? 'blocked' : (addForm.event_type as string);
      const color     = isLeave ? GOLD : undefined;
      const title     = (isLeave||isBlocked)&&addForm.sub_type ? `[${addForm.sub_type}] ${addForm.title}` : addForm.title;
      const res=await createCalendarEvent({
        title, description:addForm.description||undefined, event_type:dbType,
        start_date:addForm.start_date, end_date:addForm.end_date||undefined,
        start_time:addForm.all_day?undefined:addForm.start_time||undefined,
        end_time:addForm.all_day?undefined:addForm.end_time||undefined,
        all_day:addForm.all_day, color, assigned_to:addForm.assigned_to||null, created_by:userId||undefined,
      });
      if(!res.success){ showT(false,res.error??'Save failed'); return; }
      if(isLeave) {
        const assignee=calUsers.find(u=>u.id===addForm.assigned_to);
        await createSignal('clinic',{
          signalType:'task',
          title:`Staff Leave: ${assignee?.full_name??addForm.title} — ${addForm.sub_type||'Leave'}`,
          description:`${addForm.sub_type||'Leave'} from ${addForm.start_date}${addForm.end_date&&addForm.end_date!==addForm.start_date?` to ${addForm.end_date}`:''}`,
          priority:'low', sourceType:'manual', createdByUserId:userId,
          data:{leave_type:addForm.sub_type,start_date:addForm.start_date,end_date:addForm.end_date,assigned_to:addForm.assigned_to},
          tags:['leave','staff','manual'], category:'operational',
        });
      }
      setShowAdd(false); setAddForm(mkForm(selDay)); await loadRange(year,month); showT(true,'Event created');
    } finally { setSaving(false); }
  }

  function openAdd(date?:Date|null){ setAddForm(mkForm(date??selDay)); setShowAdd(true); }

  // ── Panel items ───────────────────────────────────────────────────────────────
  const panelAppts  = selDay ? (apptMap[dKey(selDay)]??[]).filter(a=>!practFilt||a.practitioner_name===practFilt).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)) : [];
  const panelEvts   = selDay ? (evtMap[dKey(selDay)]??[]).sort((a,b)=>(a.start_time??'').localeCompare(b.start_time??'')) : [];
  const panelComp   = selDay ? (compMap[dKey(selDay)]??[]) : [];

  if (loading) return <OrbLoader />;
  const grid = buildGrid(year, month);
  const wkDays = weekDays(anchor);

  return (
    <div className="min-h-screen nav-offset" style={{ background: BG }}>
      <StaffNav profile={profile??FALLBACK} userId={userId} brandColor={brandColor} currentPath="Calendar" />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            className="fixed top-4 right-5 z-[300] px-4 py-3 rounded-xl text-[12px] font-semibold shadow-lg"
            style={{backgroundColor:toast.ok?GREEN:RED,color:BG,minWidth:200}}>
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex" style={{height:'calc(100vh - 52px)',overflow:'hidden'}}>

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
        <aside className="flex flex-col shrink-0 overflow-y-auto scrollbar-none border-r" style={{width:220,borderColor:BORDER,background:BG}}>

          {/* Header */}
          <div className="px-4 pt-6 pb-4" style={{borderBottom:`1px solid ${BORDER}`}}>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{color:MUTED}}>Calendar</p>
            <h1 className="text-[19px] font-black tracking-tight leading-tight" style={{color:NAVY}}>{periodLabel()}</h1>
          </div>

          {/* New event + pending */}
          <div className="px-4 pt-4 pb-3 space-y-2">
            <button onClick={()=>openAdd()}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-[12px] font-semibold transition-all"
              style={{border:`1px solid ${BORDER}`,background:'transparent',color:NAVY}}>
              <Plus size={13} /> New event
            </button>
            {pendCnt>0&&(
              <button onClick={()=>router.push('/staff/appointments')}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-[11px] transition-all"
                style={{background:`${ORANGE}12`,border:`1px solid ${ORANGE}30`,color:ORANGE}}>
                <span>{pendCnt} pending booking{pendCnt!==1?'s':''}</span>
                <ArrowUpRight size={12} />
              </button>
            )}
          </div>

          {/* Layer toggles */}
          <div className="px-4 pt-3 pb-3" style={{borderTop:`1px solid ${BORDER}`}}>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2.5 mt-1" style={{color:MUTED}}>Show layers</p>
            <div className="flex flex-col gap-1">
              {([
                {key:'appointments' as LayerKey, label:'Appointments', color:BLUE},
                {key:'events'       as LayerKey, label:'Events',       color:PURPLE},
                {key:'compliance'   as LayerKey, label:'Compliance',   color:ORANGE},
                {key:'signals'      as LayerKey, label:'Signals',      color:RED},
              ]).map(({key,label,color})=>(
                <button key={key} onClick={()=>setLayers(p=>({...p,[key]:!p[key]}))}
                  className="flex items-center gap-2 text-left text-[11px] font-medium px-2 py-1 rounded-lg transition-all"
                  style={{color:layers[key]?NAVY:MUTED}}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:layers[key]?color:MUTED+'80'}} />
                  {label}
                  {layers[key]&&<Check size={10} className="ml-auto" style={{color}} />}
                </button>
              ))}
            </div>
          </div>

          {/* Today's schedule */}
          <div className="px-4 pt-2 pb-3" style={{borderTop:`1px solid ${BORDER}`}}>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2.5 mt-2" style={{color:MUTED}}>Today</p>
            {todayAppts.length===0
              ? <p className="text-[11px]" style={{color:MUTED}}>No appointments today</p>
              : <div className="flex flex-col gap-1.5">
                  {todayAppts.slice(0,5).map(a=>{
                    const st=getApptSt(a.status);
                    return (
                      <button key={a.id}
                        onClick={()=>{setSelDay(today);setYear(today.getFullYear());setMonth(today.getMonth());switchView('month');}}
                        className="flex items-start gap-2 text-left w-full rounded-lg px-2 py-1.5" style={{background:`${BLUE}06`}}>
                        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{background:st.color}} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[11px] font-semibold truncate" style={{color:NAVY}}>{a.patient_name}</span>
                          <span className="block text-[10px]" style={{color:TER}}>{fmtT(a.starts_at)}</span>
                        </span>
                      </button>
                    );
                  })}
                  {todayAppts.length>5&&<p className="text-[10px] pl-4" style={{color:MUTED}}>+{todayAppts.length-5} more</p>}
                </div>
            }
          </div>

          {/* Practitioners */}
          {practs.length>0&&(
            <div className="px-4 pt-2 pb-6" style={{borderTop:`1px solid ${BORDER}`}}>
              <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2.5 mt-2" style={{color:MUTED}}>Practitioners</p>
              <div className="flex flex-col gap-0.5">
                <button onClick={()=>setPractFilt(null)}
                  className="text-left text-[11px] font-medium px-2 py-1.5 rounded-lg transition-all"
                  style={{background:!practFilt?`${BLUE}12`:'transparent',color:!practFilt?BLUE:TER,border:!practFilt?`1px solid ${BLUE}30`:'1px solid transparent'}}>
                  All practitioners
                </button>
                {practs.map(p=>(
                  <button key={p.id} onClick={()=>setPractFilt(practFilt===p.name?null:p.name)}
                    className="text-left text-[11px] font-medium px-2 py-1.5 rounded-lg transition-all"
                    style={{background:practFilt===p.name?`${BLUE}12`:'transparent',color:practFilt===p.name?BLUE:TER,border:practFilt===p.name?`1px solid ${BLUE}30`:'1px solid transparent'}}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── MAIN AREA ──────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{borderBottom:`1px solid ${BORDER}`}}>
            <div className="flex items-center gap-2">
              <button onClick={goToday} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                style={{background:`${BLUE}12`,border:`1px solid ${BLUE}30`,color:NAVY}}>Today</button>
              <div className="flex gap-0.5">
                <button onClick={prevP} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#EBE5FF] transition-all" style={{color:TER}}><ChevronLeft size={14}/></button>
                <button onClick={nextP} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#EBE5FF] transition-all" style={{color:TER}}><ChevronRight size={14}/></button>
              </div>
              <span className="text-[15px] font-bold" style={{color:NAVY}}>{periodLabel()}</span>
            </div>
            <div className="flex items-center gap-2">
              {/* View switcher */}
              <div className="flex rounded-lg overflow-hidden" style={{border:`1px solid ${BORDER}`}}>
                {(['month','week','day','agenda'] as CalView[]).map(v=>(
                  <button key={v} onClick={()=>switchView(v)}
                    className="px-3 py-1.5 text-[11px] font-semibold transition-all capitalize"
                    style={{background:view===v?NAVY:'transparent',color:view===v?BG:TER}}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* View content */}
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 overflow-y-auto scrollbar-none">

              {view==='month'&&(
                <MonthView grid={grid} today={today} selDay={selDay}
                  apptMap={apptMap} evtMap={evtMap} compMap={compMap} sigMap={sigDayMap}
                  practFilt={practFilt} layers={layers}
                  onSelect={(d)=>{setSelDay(selDay&&sameDay(d,selDay)?null:d); setSelItem(null);}}
                />
              )}
              {view==='week'&&(
                <WeekView wkDays={wkDays} today={today}
                  apptMap={apptMap} evtMap={evtMap} compMap={compMap}
                  practFilt={practFilt} layers={layers}
                  onSelect={(item,day)=>{setSelItem(item);setSelDay(day);}}
                />
              )}
              {view==='day'&&(
                <DayView day={anchor} today={today}
                  appts={layers.appointments?(apptMap[dKey(anchor)]??[]).filter(a=>!practFilt||a.practitioner_name===practFilt):[]}
                  evts={layers.events?(evtMap[dKey(anchor)]??[]):[]}
                  comp={layers.compliance?(compMap[dKey(anchor)]??[]):[]}
                  onSelect={(item)=>{setSelItem(item);setSelDay(anchor);}}
                />
              )}
              {view==='agenda'&&(
                <AgendaView anchor={anchor} apptMap={apptMap} evtMap={evtMap} compMap={compMap}
                  practFilt={practFilt} layers={layers}
                  onSelect={(item,day)=>{setSelItem(item);setSelDay(day);}}
                />
              )}

            </div>

            {/* ── DAY PANEL ──────────────────────────────────────────────── */}
            <AnimatePresence>
              {selDay&&(
                <motion.aside key="panel"
                  initial={{x:320,opacity:0}} animate={{x:0,opacity:1}} exit={{x:320,opacity:0}}
                  transition={{type:'spring',stiffness:320,damping:32}}
                  className="flex flex-col shrink-0 overflow-y-auto scrollbar-none"
                  style={{width:320,borderLeft:`1px solid ${BORDER}`,background:BG}}>

                  {/* Header */}
                  <div className="flex items-start justify-between px-5 pt-5 pb-4 shrink-0" style={{borderBottom:`1px solid ${BORDER}`}}>
                    <div>
                      <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{color:MUTED}}>{DAY_FULL[(selDay.getDay()+6)%7]}</p>
                      <p className="text-[26px] font-black tracking-tight leading-none mt-0.5" style={{color:NAVY}}>{selDay.getDate()}</p>
                      <p className="text-[11px] mt-0.5" style={{color:TER}}>{MONTH_NAMES[selDay.getMonth()]} {selDay.getFullYear()}</p>
                    </div>
                    <button onClick={()=>{setSelDay(null);setSelItem(null);}}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#EBE5FF] transition-all" style={{color:TER}}>
                      <X size={14}/>
                    </button>
                  </div>

                  {/* Add button */}
                  <div className="px-5 pt-3 pb-3" style={{borderBottom:`1px solid ${BORDER}`}}>
                    <button onClick={()=>openAdd(selDay)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-2 text-[11px] font-semibold transition-all"
                      style={{border:`1px solid ${BORDER}`,background:'transparent',color:NAVY}}>
                      <Plus size={12}/> Add event for this day
                    </button>
                  </div>

                  <div className="flex-1 px-5 pt-4 pb-6 space-y-5">

                    {/* Appointments */}
                    {layers.appointments&&(
                      <div>
                        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2.5" style={{color:MUTED}}>
                          Appointments · {panelAppts.length}
                        </p>
                        {panelAppts.length===0
                          ? <p className="text-[11px]" style={{color:MUTED}}>No appointments</p>
                          : <div className="space-y-2.5">
                              {panelAppts.map(a=>{
                                const st=getApptSt(a.status);
                                return (
                                  <motion.div key={a.id} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                                    className="rounded-2xl p-3.5" style={{border:`1px solid ${BORDER}`}}>
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-1.5">
                                        <Clock size={10} style={{color:TER}}/>
                                        <span className="text-[11px] font-semibold" style={{color:NAVY}}>{fmtT(a.starts_at)}</span>
                                        {a.ends_at&&<span className="text-[10px]" style={{color:MUTED}}>– {fmtT(a.ends_at)}</span>}
                                      </div>
                                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{background:st.bg,color:st.color}}>{st.label}</span>
                                    </div>
                                    <a href={a.patient_db_id?`/staff/patients/${a.patient_db_id}`:'#'}
                                      className="text-[12px] font-semibold hover:underline block mb-1" style={{color:NAVY}}>{a.patient_name}</a>
                                    {a.appointment_type&&<p className="text-[11px] mb-1" style={{color:TER}}>{a.appointment_type}</p>}
                                    {a.practitioner_name&&(
                                      <div className="flex items-center gap-1.5 mb-2.5">
                                        <User size={10} style={{color:MUTED}}/>
                                        <span className="text-[10px]" style={{color:MUTED}}>{a.practitioner_name}</span>
                                      </div>
                                    )}
                                    {a.status!=='arrived'&&a.status!=='cancelled'&&(
                                      <div className="flex gap-1.5 mt-1">
                                        <button onClick={()=>handleApptStatus(a.id,'arrived')} disabled={apptUpd===a.id}
                                          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide transition-all disabled:opacity-50"
                                          style={{backgroundColor:`${GREEN}14`,border:`1px solid ${GREEN}30`,color:GREEN}}>
                                          <Check size={9}/> Arrived
                                        </button>
                                        <button onClick={()=>handleApptStatus(a.id,'cancelled')} disabled={apptUpd===a.id}
                                          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide transition-all disabled:opacity-50"
                                          style={{backgroundColor:`${RED}14`,border:`1px solid ${RED}30`,color:RED}}>
                                          <X size={9}/> Cancel
                                        </button>
                                      </div>
                                    )}
                                  </motion.div>
                                );
                              })}
                            </div>
                        }
                      </div>
                    )}

                    {/* Events */}
                    {layers.events&&(
                      <div>
                        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2.5" style={{color:MUTED}}>Events · {panelEvts.length}</p>
                        {panelEvts.length===0
                          ? <p className="text-[11px]" style={{color:MUTED}}>No events</p>
                          : <div className="space-y-2">
                              {panelEvts.map(e=>{
                                const ec=getEventColor(e);
                                return (
                                  <motion.div key={e.id} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                                    className="rounded-xl p-3" style={{border:`1px solid ${BORDER}`,background:ec.bg+'50'}}>
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                          <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{backgroundColor:ec.bg,color:ec.color}}>{ec.label}</span>
                                          {e.status==='completed'&&<Check size={10} style={{color:GREEN}}/>}
                                        </div>
                                        <p className="text-[12px] font-semibold" style={{color:NAVY}}>{e.title}</p>
                                        {!e.all_day&&e.start_time&&<p className="text-[10px] mt-0.5" style={{color:TER}}>{fmtTs(e.start_time)}{e.end_time?` – ${fmtTs(e.end_time)}`:''}</p>}
                                        {e.assigned_name&&<p className="text-[10px] mt-0.5" style={{color:MUTED}}>{e.assigned_name}</p>}
                                        {e.description&&<p className="text-[10px] mt-1" style={{color:SEC}}>{e.description}</p>}
                                      </div>
                                      <div className="flex gap-1 shrink-0">
                                        {e.status!=='completed'&&(
                                          <button onClick={()=>handleCompleteEvt(e.id)}
                                            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[#EBE5FF] transition-all" style={{color:GREEN}}>
                                            <Check size={12}/>
                                          </button>
                                        )}
                                        <button onClick={()=>handleDelEvt(e.id)} disabled={delId===e.id}
                                          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[#EBE5FF] transition-all disabled:opacity-50" style={{color:RED}}>
                                          <Trash2 size={12}/>
                                        </button>
                                      </div>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                        }
                      </div>
                    )}

                    {/* Compliance */}
                    {layers.compliance&&panelComp.length>0&&(
                      <div>
                        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-2.5" style={{color:MUTED}}>Compliance due · {panelComp.length}</p>
                        <div className="space-y-2">
                          {panelComp.map(c=>(
                            <div key={c.id} className="rounded-xl p-3" style={{backgroundColor:`${ORANGE}08`,border:`1px solid ${ORANGE}25`}}>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Shield size={10} style={{color:ORANGE}}/>
                                <span className="text-[9px] font-bold uppercase tracking-wide" style={{color:ORANGE}}>{c.frequency}</span>
                              </div>
                              <p className="text-[12px] font-semibold" style={{color:NAVY}}>{c.task_name}</p>
                              {c.responsible_name&&<p className="text-[10px] mt-0.5" style={{color:MUTED}}>{c.responsible_name}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Empty */}
                    {panelAppts.length===0&&panelEvts.length===0&&panelComp.length===0&&(
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{background:`${BLUE}10`}}>
                          <CalendarDays size={16} style={{color:BLUE}}/>
                        </div>
                        <p className="text-[12px] font-semibold" style={{color:NAVY}}>Nothing scheduled</p>
                        <p className="text-[11px] mt-1" style={{color:MUTED}}>Add an event for this day</p>
                      </div>
                    )}
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* ── ADD EVENT MODAL ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAdd&&(
          <AddEventModal
            form={addForm} setForm={setAddForm} users={calUsers}
            saving={saving} onClose={()=>setShowAdd(false)} onSave={handleSaveEvent}
            onGoAppts={(date)=>router.push(`/staff/appointments?date=${date}`)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// MONTH VIEW
// =============================================================================
function MonthView({ grid, today, selDay, apptMap, evtMap, compMap, sigMap, practFilt, layers, onSelect }:{
  grid:(Date|null)[][]; today:Date; selDay:Date|null;
  apptMap:Record<string,AppointmentRow[]>; evtMap:Record<string,CalendarEvent[]>;
  compMap:Record<string,ComplianceCalItem[]>; sigMap:Record<string,number>;
  practFilt:string|null; layers:Record<LayerKey,boolean>;
  onSelect:(d:Date)=>void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 shrink-0" style={{borderBottom:`1px solid ${BORDER}`}}>
        {DAY_SHORT.map(d=>(
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-widest" style={{color:MUTED}}>{d}</div>
        ))}
      </div>
      <div className="flex-1">
        {grid.map((row,ri)=>(
          <div key={ri} className="grid grid-cols-7" style={{borderBottom:ri<grid.length-1?`1px solid ${BORDER}`:undefined,minHeight:100}}>
            {row.map((day,di)=>{
              if(!day) return <div key={`e-${ri}-${di}`} style={{borderRight:di<6?`1px solid ${BORDER}`:undefined,background:'#F5F2EB'}}/>;
              const key   = dKey(day);
              const appts = layers.appointments?(apptMap[key]??[]).filter(a=>!practFilt||a.practitioner_name===practFilt):[];
              const evts  = layers.events?(evtMap[key]??[]):[];
              const cCnt  = layers.compliance?(compMap[key]??[]).length:0;
              const sCnt  = layers.signals?(sigMap[key]??0):0;
              const isTd  = sameDay(day,today);
              const isSel = selDay?sameDay(day,selDay):false;
              const isPast= day<today&&!isTd;
              const pills = [...appts.slice(0,2).map(a=>({t:'a',i:a})),...evts.slice(0,Math.max(0,3-Math.min(2,appts.length))).map(e=>({t:'e',i:e}))].slice(0,3);
              const over  = Math.max(0,(appts.length+evts.length)-3);
              return (
                <motion.div key={key} onClick={()=>onSelect(day)}
                  whileHover={{backgroundColor:`${BLUE}06`}}
                  className="flex flex-col p-2 cursor-pointer transition-colors"
                  style={{borderRight:di<6?`1px solid ${BORDER}`:undefined,background:isSel?`${BLUE}08`:undefined}}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex gap-0.5 items-center">
                      {cCnt>0&&<span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:ORANGE}}/>}
                      {sCnt>0&&<span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:RED}}/>}
                    </div>
                    <span className="w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-semibold"
                      style={isTd?{background:BLUE,color:BG}:{color:isPast?MUTED:NAVY}}>
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {pills.map((p,i)=>{
                      if(p.t==='a'){
                        const a=p.i as AppointmentRow; const st=APPT_STATUS[a.status?.toLowerCase()]??APPT_STATUS.booked;
                        return <div key={`a${i}`} className="rounded px-1.5 py-0.5 text-[9px] font-medium truncate" style={{background:st.bg,color:st.color}}>{new Date(a.starts_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false})} {a.patient_name.split(' ')[0]}</div>;
                      } else {
                        const e=p.i as CalendarEvent; const ec=getEventColor(e);
                        return <div key={`e${i}`} className="rounded px-1.5 py-0.5 text-[9px] font-medium truncate" style={{background:ec.bg,color:ec.color}}>{e.title}</div>;
                      }
                    })}
                    {over>0&&<div className="rounded px-1.5 py-0.5 text-[9px]" style={{color:MUTED}}>+{over} more</div>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// WEEK VIEW
// =============================================================================
function WeekView({ wkDays, today, apptMap, evtMap, compMap, practFilt, layers, onSelect }:{
  wkDays:Date[]; today:Date;
  apptMap:Record<string,AppointmentRow[]>; evtMap:Record<string,CalendarEvent[]>; compMap:Record<string,ComplianceCalItem[]>;
  practFilt:string|null; layers:Record<LayerKey,boolean>;
  onSelect:(item:CalItem,day:Date)=>void;
}) {
  const totalH = HOURS.length*HOUR_H;
  const aTop = (a:AppointmentRow)=>Math.max(0,(isoMins(a.starts_at)-420)/60*HOUR_H);
  const aH   = (a:AppointmentRow)=>Math.max(22,((a.duration_minutes??30)/60)*HOUR_H);
  const eTop = (e:CalendarEvent)=>Math.max(0,(tMins(e.start_time)-420)/60*HOUR_H);
  const eH   = (e:CalendarEvent)=>Math.max(22,((tMins(e.end_time)-tMins(e.start_time))/60)*HOUR_H);
  return (
    <div className="flex" style={{height:'100%'}}>
      {/* Time gutter */}
      <div className="shrink-0" style={{width:52,paddingTop:HEADER_H}}>
        {HOURS.map(h=>(
          <div key={h} className="flex items-start justify-end pr-2" style={{height:HOUR_H}}>
            <span className="text-[9px] font-medium -mt-2" style={{color:MUTED}}>{h}:00</span>
          </div>
        ))}
      </div>
      {/* Day columns */}
      <div className="flex flex-1 overflow-x-auto">
        {wkDays.map(day=>{
          const key  = dKey(day);
          const appts= layers.appointments?(apptMap[key]??[]).filter(a=>!practFilt||a.practitioner_name===practFilt):[];
          const tevts= layers.events?(evtMap[key]??[]).filter(e=>!e.all_day&&!!e.start_time):[];
          const adevts=layers.events?(evtMap[key]??[]).filter(e=>e.all_day):[];
          const comps= layers.compliance?(compMap[key]??[]):[];
          const isTd = sameDay(day,today);
          return (
            <div key={key} className="flex-1 min-w-[90px] border-l" style={{borderColor:BORDER}}>
              {/* Day header */}
              <div className="flex flex-col items-center justify-center py-1.5 sticky top-0 z-10"
                style={{height:HEADER_H,background:isTd?`${BLUE}06`:BG,borderBottom:`1px solid ${BORDER}`}}>
                <span className="text-[9px] font-semibold uppercase tracking-widest" style={{color:MUTED}}>{DAY_SHORT[(day.getDay()+6)%7]}</span>
                <span className="text-[15px] font-black" style={{color:isTd?BLUE:NAVY}}>{day.getDate()}</span>
              </div>
              {/* All-day + compliance banner */}
              {(adevts.length>0||comps.length>0)&&(
                <div className="px-1 py-1 space-y-0.5" style={{borderBottom:`1px solid ${BORDER}`}}>
                  {adevts.map(e=>{const ec=getEventColor(e);return <div key={e.id} onClick={()=>onSelect({kind:'event',data:e},day)} className="rounded px-1.5 py-0.5 text-[9px] font-medium cursor-pointer truncate" style={{background:ec.bg,color:ec.color}}>{e.title}</div>;})}
                  {comps.slice(0,1).map(c=><div key={c.id} className="rounded px-1.5 py-0.5 text-[9px] font-medium truncate" style={{background:`${ORANGE}14`,color:ORANGE}}>{c.task_name}</div>)}
                </div>
              )}
              {/* Time grid */}
              <div style={{position:'relative',height:totalH}}>
                {HOURS.map((_,hi)=><div key={hi} style={{position:'absolute',top:hi*HOUR_H,left:0,right:0,height:1,background:BORDER}}/>)}
                {appts.map(a=>{
                  const st=APPT_STATUS[a.status?.toLowerCase()]??APPT_STATUS.booked;
                  return <div key={a.id} onClick={()=>onSelect({kind:'appt',data:a},day)}
                    className="absolute left-0.5 right-0.5 rounded px-1 cursor-pointer overflow-hidden"
                    style={{top:aTop(a),height:aH(a),background:st.bg,borderLeft:`2px solid ${st.color}`}}>
                    <p className="text-[9px] font-semibold truncate leading-tight" style={{color:st.color}}>{new Date(a.starts_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false})} {a.patient_name.split(' ')[0]}</p>
                    {aH(a)>30&&<p className="text-[8px] truncate" style={{color:st.color+'CC'}}>{a.appointment_type??''}</p>}
                  </div>;
                })}
                {tevts.map(e=>{
                  const ec=getEventColor(e);
                  return <div key={e.id} onClick={()=>onSelect({kind:'event',data:e},day)}
                    className="absolute left-0.5 right-0.5 rounded px-1 cursor-pointer overflow-hidden"
                    style={{top:eTop(e),height:eH(e),background:ec.bg,borderLeft:`2px solid ${ec.color}`}}>
                    <p className="text-[9px] font-semibold truncate leading-tight" style={{color:ec.color}}>{e.title}</p>
                  </div>;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// DAY VIEW
// =============================================================================
function DayView({ day, today, appts, evts, comp, onSelect }:{
  day:Date; today:Date; appts:AppointmentRow[]; evts:CalendarEvent[]; comp:ComplianceCalItem[];
  onSelect:(item:CalItem)=>void;
}) {
  const isTd    = sameDay(day,today);
  const tEvts   = evts.filter(e=>!e.all_day&&!!e.start_time);
  const adEvts  = evts.filter(e=>e.all_day);
  const totalH  = HOURS.length*HOUR_H;
  const aTop=(a:AppointmentRow)=>Math.max(0,(isoMins(a.starts_at)-420)/60*HOUR_H);
  const aH=(a:AppointmentRow)=>Math.max(40,((a.duration_minutes??30)/60)*HOUR_H);
  const eTop=(e:CalendarEvent)=>Math.max(0,(tMins(e.start_time)-420)/60*HOUR_H);
  const eH=(e:CalendarEvent)=>Math.max(40,((tMins(e.end_time)-tMins(e.start_time))/60)*HOUR_H);
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 shrink-0" style={{borderBottom:`1px solid ${BORDER}`}}>
        <p className="text-[9px] uppercase tracking-[0.24em] font-semibold" style={{color:MUTED}}>{DAY_FULL[(day.getDay()+6)%7]}</p>
        <p className="text-[26px] font-black tracking-tight" style={{color:isTd?BLUE:NAVY}}>{day.getDate()} {MONTH_NAMES[day.getMonth()]} {day.getFullYear()}</p>
        <p className="text-[12px]" style={{color:TER}}>{appts.length+tEvts.length} scheduled{comp.length>0?` · ${comp.length} compliance due`:''}</p>
      </div>
      {(adEvts.length>0||comp.length>0)&&(
        <div className="px-6 py-3 flex gap-2 flex-wrap" style={{borderBottom:`1px solid ${BORDER}`}}>
          {adEvts.map(e=>{const ec=getEventColor(e);return <div key={e.id} onClick={()=>onSelect({kind:'event',data:e})} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer" style={{background:ec.bg,color:ec.color}}>{e.title}</div>;})}
          {comp.map(c=><div key={c.id} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold" style={{background:`${ORANGE}14`,color:ORANGE}}><Shield size={10} className="inline mr-1"/>{c.task_name}</div>)}
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        <div className="flex">
          <div className="shrink-0" style={{width:60}}>
            {HOURS.map(h=>(
              <div key={h} className="flex items-start justify-end pr-3" style={{height:HOUR_H}}>
                <span className="text-[10px] font-medium -mt-2" style={{color:MUTED}}>{h}:00</span>
              </div>
            ))}
          </div>
          <div className="flex-1" style={{position:'relative',height:totalH}}>
            {HOURS.map((_,hi)=><div key={hi} style={{position:'absolute',top:hi*HOUR_H,left:0,right:0,height:1,background:BORDER}}/>)}
            {appts.map(a=>{
              const st=APPT_STATUS[a.status?.toLowerCase()]??APPT_STATUS.booked;
              return <div key={a.id} onClick={()=>onSelect({kind:'appt',data:a})}
                className="absolute left-2 right-6 rounded-xl px-3 py-2 cursor-pointer"
                style={{top:aTop(a),height:aH(a),background:st.bg,borderLeft:`3px solid ${st.color}`}}>
                <p className="text-[11px] font-bold" style={{color:st.color}}>{new Date(a.starts_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false})}{a.ends_at?` – ${fmtT(a.ends_at)}`:''}</p>
                <p className="text-[12px] font-semibold mt-0.5" style={{color:NAVY}}>{a.patient_name}</p>
                {a.appointment_type&&<p className="text-[11px] mt-0.5" style={{color:TER}}>{a.appointment_type}</p>}
                {a.practitioner_name&&<p className="text-[10px] mt-0.5" style={{color:MUTED}}>{a.practitioner_name}</p>}
              </div>;
            })}
            {tEvts.map(e=>{
              const ec=getEventColor(e);
              return <div key={e.id} onClick={()=>onSelect({kind:'event',data:e})}
                className="absolute right-2 rounded-xl px-3 py-2 cursor-pointer"
                style={{left:'52%',top:eTop(e),height:eH(e),background:ec.bg,borderLeft:`3px solid ${ec.color}`}}>
                <p className="text-[10px] font-bold" style={{color:ec.color}}>{fmtTs(e.start_time)}{e.end_time?` – ${fmtTs(e.end_time)}`:''}</p>
                <p className="text-[11px] font-semibold mt-0.5" style={{color:NAVY}}>{e.title}</p>
                {e.assigned_name&&<p className="text-[10px] mt-0.5" style={{color:MUTED}}>{e.assigned_name}</p>}
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// AGENDA VIEW
// =============================================================================
function AgendaView({ anchor, apptMap, evtMap, compMap, practFilt, layers, onSelect }:{
  anchor:Date; apptMap:Record<string,AppointmentRow[]>; evtMap:Record<string,CalendarEvent[]>; compMap:Record<string,ComplianceCalItem[]>;
  practFilt:string|null; layers:Record<LayerKey,boolean>;
  onSelect:(item:CalItem,day:Date)=>void;
}) {
  const days=Array.from({length:30},(_,i)=>{ const d=new Date(anchor); d.setDate(d.getDate()+i); return d; });
  return (
    <div className="px-6 py-5 space-y-5">
      {days.map(day=>{
        const key  = dKey(day);
        const appts= layers.appointments?(apptMap[key]??[]).filter(a=>!practFilt||a.practitioner_name===practFilt).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)):[];
        const evts = layers.events?(evtMap[key]??[]).sort((a,b)=>(a.start_time??'').localeCompare(b.start_time??'')):[];
        const comp = layers.compliance?(compMap[key]??[]):[];
        if(!appts.length&&!evts.length&&!comp.length) return null;
        const isTd=sameDay(day,new Date());
        return (
          <div key={key}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-black uppercase tracking-[0.12em]" style={{color:isTd?BLUE:NAVY}}>{fmtDMed(day)}</span>
              {isTd&&<span className="text-[8px] font-bold px-2 py-0.5 rounded-full uppercase" style={{backgroundColor:`${BLUE}14`,color:BLUE}}>Today</span>}
              <div className="flex-1 h-px" style={{background:BORDER}}/>
            </div>
            <div className="space-y-2 pl-2">
              {appts.map(a=>{
                const st=APPT_STATUS[a.status?.toLowerCase()]??APPT_STATUS.booked;
                return (
                  <div key={a.id} onClick={()=>onSelect({kind:'appt',data:a},day)}
                    className="flex items-start gap-3 rounded-xl p-3 cursor-pointer transition-all hover:opacity-80"
                    style={{background:st.bg+'80',border:`1px solid ${st.color}20`}}>
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{background:st.color}}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold" style={{color:NAVY}}>{a.patient_name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{backgroundColor:st.bg,color:st.color}}>{st.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px]" style={{color:TER}}>{fmtT(a.starts_at)}</span>
                        {a.appointment_type&&<span className="text-[10px]" style={{color:MUTED}}>{a.appointment_type}</span>}
                        {a.practitioner_name&&<span className="text-[10px]" style={{color:MUTED}}>{a.practitioner_name}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {evts.map(e=>{
                const ec=getEventColor(e);
                return (
                  <div key={e.id} onClick={()=>onSelect({kind:'event',data:e},day)}
                    className="flex items-start gap-3 rounded-xl p-3 cursor-pointer transition-all hover:opacity-80"
                    style={{background:ec.bg+'80',border:`1px solid ${ec.color}20`}}>
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{background:ec.color}}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{backgroundColor:ec.bg,color:ec.color}}>{ec.label}</span>
                        <span className="text-[11px] font-semibold" style={{color:NAVY}}>{e.title}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {e.all_day?<span className="text-[10px]" style={{color:MUTED}}>All day</span>:e.start_time&&<span className="text-[10px]" style={{color:TER}}>{fmtTs(e.start_time)}{e.end_time?` – ${fmtTs(e.end_time)}`:''}</span>}
                        {e.assigned_name&&<span className="text-[10px]" style={{color:MUTED}}>{e.assigned_name}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {comp.map(c=>(
                <div key={c.id} className="flex items-start gap-3 rounded-xl p-3" style={{background:`${ORANGE}08`,border:`1px solid ${ORANGE}20`}}>
                  <Shield size={12} style={{color:ORANGE,marginTop:2,flexShrink:0}}/>
                  <div>
                    <span className="text-[11px] font-semibold" style={{color:NAVY}}>{c.task_name}</span>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[9px] font-bold uppercase" style={{color:ORANGE}}>Compliance · {c.frequency}</span>
                      {c.responsible_name&&<span className="text-[10px]" style={{color:MUTED}}>{c.responsible_name}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// ADD EVENT MODAL
// =============================================================================
function AddEventModal({ form, setForm, users, saving, onClose, onSave, onGoAppts }:{
  form:AddForm; setForm:Dispatch<SetStateAction<AddForm>>; users:CalendarUser[];
  saving:boolean; onClose:()=>void; onSave:()=>void; onGoAppts:(date:string)=>void;
}) {
  const [step, setStep] = useState<'type'|'form'>('type');

  const TYPES: Array<{id:UIEventType|'appointment'; label:string; color:string; desc:string; Icon:LucideIcon}> = [
    {id:'appointment', label:'Appointment', color:BLUE,    desc:'Patient appointment',         Icon:CalendarDays},
    {id:'meeting',     label:'Meeting',     color:PURPLE,  desc:'Team or external meeting',    Icon:Briefcase},
    {id:'training',    label:'Training',    color:EMERALD, desc:'CPD or staff training',       Icon:BookOpen},
    {id:'leave',       label:'Leave',       color:GOLD,    desc:'Annual, sick, maternity...',  Icon:User},
    {id:'blocked',     label:'Block Time',  color:MUTED,   desc:'Clinic closure, admin...',    Icon:Ban},
    {id:'deadline',    label:'Deadline',    color:RED,     desc:'Compliance or project due',   Icon:AlertCircle},
    {id:'inspection',  label:'Inspection',  color:ORANGE,  desc:'CQC, audit, or review',      Icon:Shield},
    {id:'note',        label:'Note',        color:TER,     desc:'Calendar note or reminder',   Icon:Edit3},
  ];

  function selType(t:UIEventType|'appointment') {
    if(t==='appointment'){ onClose(); onGoAppts(form.start_date); return; }
    setForm(f=>({...f,event_type:t})); setStep('form');
  }

  const f=form;
  const isLeave  =f.event_type==='leave';
  const isBlocked=f.event_type==='blocked';
  const isDeadline=f.event_type==='deadline';
  const isNote   =f.event_type==='note';
  const showTime =!isLeave&&!isBlocked&&!isDeadline&&!isNote;
  const inputSt  ={backgroundColor:'#F5F3FF',border:`1px solid ${BORDER}`,color:NAVY} as React.CSSProperties;

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{backgroundColor:'rgba(26,16,53,0.55)',backdropFilter:'blur(4px)'}}
      onClick={(e)=>{if(e.target===e.currentTarget) onClose();}}>
      <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}
        className="w-full rounded-2xl shadow-2xl overflow-hidden"
        style={{maxWidth:step==='type'?520:460,backgroundColor:BG,border:`1px solid ${BORDER}`}}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:`1px solid ${BORDER}`}}>
          <div>
            {step==='form'&&(
              <button onClick={()=>setStep('type')} className="flex items-center gap-1 text-[10px] font-semibold mb-1" style={{color:MUTED}}>
                <ChevronLeft size={10}/> Back
              </button>
            )}
            <p className="text-[15px] font-black" style={{color:NAVY}}>
              {step==='type'?'Add to Calendar':`New ${EVENT_CFG[f.event_type]?.label??'Event'}`}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#EBE5FF] transition-all" style={{color:TER}}><X size={14}/></button>
        </div>

        {/* Type grid */}
        {step==='type'&&(
          <div className="p-5 grid grid-cols-4 gap-2">
            {TYPES.map(et=>(
              <button key={et.id} onClick={()=>selType(et.id)}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl text-center transition-all hover:opacity-80"
                style={{backgroundColor:et.color+'12',border:`1px solid ${et.color}25`}}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{backgroundColor:et.color+'20'}}>
                  <et.Icon size={14} style={{color:et.color}}/>
                </div>
                <div>
                  <p className="text-[11px] font-bold leading-tight" style={{color:NAVY}}>{et.label}</p>
                  <p className="text-[9px] mt-0.5 leading-tight" style={{color:MUTED}}>{et.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Form */}
        {step==='form'&&(
          <div className="p-5 space-y-3">

            {/* Title */}
            <div>
              <label className="text-[8px] uppercase tracking-[0.24em] font-semibold block mb-1" style={{color:MUTED}}>
                {isLeave?'Who is on leave?':isBlocked?'Block title':'Title'} *
              </label>
              <input value={f.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}
                placeholder={isLeave?'e.g. Dr Smith':isBlocked?'e.g. Admin morning':'Event title'}
                className="w-full px-3 py-2 rounded-lg text-[12px] outline-none" style={inputSt}/>
            </div>

            {/* Sub-type */}
            {(isLeave||isBlocked)&&(
              <div>
                <label className="text-[8px] uppercase tracking-[0.24em] font-semibold block mb-1" style={{color:MUTED}}>{isLeave?'Leave type':'Block type'}</label>
                <select value={f.sub_type} onChange={e=>setForm(p=>({...p,sub_type:e.target.value}))}
                  className="w-full px-3 py-2 rounded-lg text-[12px] outline-none" style={inputSt}>
                  <option value="">Select...</option>
                  {(isLeave?LEAVE_TYPES:BLOCK_TYPES).map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[8px] uppercase tracking-[0.24em] font-semibold block mb-1" style={{color:MUTED}}>{isDeadline?'Due date':'Start date'} *</label>
                <input type="date" value={f.start_date} onChange={e=>setForm(p=>({...p,start_date:e.target.value}))}
                  className="w-full px-3 py-2 rounded-lg text-[12px] outline-none" style={inputSt}/>
              </div>
              {!isDeadline&&!isNote&&(
                <div>
                  <label className="text-[8px] uppercase tracking-[0.24em] font-semibold block mb-1" style={{color:MUTED}}>End date</label>
                  <input type="date" value={f.end_date} onChange={e=>setForm(p=>({...p,end_date:e.target.value}))}
                    className="w-full px-3 py-2 rounded-lg text-[12px] outline-none" style={inputSt}/>
                </div>
              )}
            </div>

            {/* Times */}
            {showTime&&!f.all_day&&(
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[8px] uppercase tracking-[0.24em] font-semibold block mb-1" style={{color:MUTED}}>Start time</label>
                  <input type="time" value={f.start_time} onChange={e=>setForm(p=>({...p,start_time:e.target.value}))}
                    className="w-full px-3 py-2 rounded-lg text-[12px] outline-none" style={inputSt}/>
                </div>
                <div>
                  <label className="text-[8px] uppercase tracking-[0.24em] font-semibold block mb-1" style={{color:MUTED}}>End time</label>
                  <input type="time" value={f.end_time} onChange={e=>setForm(p=>({...p,end_time:e.target.value}))}
                    className="w-full px-3 py-2 rounded-lg text-[12px] outline-none" style={inputSt}/>
                </div>
              </div>
            )}
            {showTime&&(
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={f.all_day} onChange={e=>setForm(p=>({...p,all_day:e.target.checked}))} className="rounded"/>
                <span className="text-[11px] font-medium" style={{color:SEC}}>All day</span>
              </label>
            )}

            {/* Assigned to */}
            {!isNote&&users.length>0&&(
              <div>
                <label className="text-[8px] uppercase tracking-[0.24em] font-semibold block mb-1" style={{color:MUTED}}>{isLeave?'Staff member':'Assign to'}</label>
                <select value={f.assigned_to} onChange={e=>setForm(p=>({...p,assigned_to:e.target.value}))}
                  className="w-full px-3 py-2 rounded-lg text-[12px] outline-none" style={inputSt}>
                  <option value="">— Not assigned —</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.full_name} · {u.role_name}</option>)}
                </select>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-[8px] uppercase tracking-[0.24em] font-semibold block mb-1" style={{color:MUTED}}>Notes</label>
              <textarea value={f.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))}
                rows={2} placeholder="Optional context..."
                className="w-full px-3 py-2 rounded-lg text-[12px] outline-none resize-none" style={inputSt}/>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={onClose}
                className="flex-1 py-2 rounded-xl text-[11px] font-semibold"
                style={{backgroundColor:'transparent',border:`1px solid ${BORDER}`,color:SEC}}>Cancel</button>
              <button onClick={onSave} disabled={!f.title.trim()||saving}
                className="flex-1 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50"
                style={{backgroundColor:`${BLUE}18`,border:`1px solid ${BLUE}40`,color:NAVY}}>
                {saving?'Saving…':'Create event'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Activity, ChevronRight, RefreshCw,
  Users, Search, X, Phone, Mail,
  Calendar, Clock, UserCircle2, ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import {
  getStaffProfile, getLatestTenantAndUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getPatients, getPatientDetail, getPatientStats,
  type PatientSummary, type PatientAppointment, type Patient,
} from '@/lib/actions/patients';

// =============================================================================
// TYPES
// =============================================================================

// =============================================================================
// HELPERS
// =============================================================================

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function relativeDate(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function appointmentStatusLabel(status: string | null): string {
  if (!status) return 'Booked';
  return status;
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({ label, value, icon: Icon, sub }: {
  label: string; value: number | string; icon: LucideIcon; sub?: string;
}) {
  return (
    <div className="bg-white border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">{label}</span>
        <Icon size={14} className="text-[#6E6688]" />
      </div>
      <div>
        <p className="text-[28px] font-semibold tracking-tight text-[#1A1035] leading-none">{value}</p>
        {sub && <p className="text-[11px] text-[#6E6688] mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// =============================================================================
// APPOINTMENT ROW
// =============================================================================

function AppointmentRow({ appt, isUpcoming = false }: {
  appt: PatientAppointment; isUpcoming?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-[#F0ECFF] border border-[#EBE5FF] rounded-lg">
      <div className="w-1 h-1 rounded-full bg-[#F0EDE5] mt-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#1A1035] truncate">
          {appt.appointment_type || 'Appointment'}
        </p>
        <p className="text-[11px] text-[#6E6688] mt-0.5">
          {formatDateTime(appt.starts_at)}
          {appt.practitioner_name && ` · ${appt.practitioner_name}`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#6E6688]">
          {appointmentStatusLabel(appt.status)}
        </span>
        {appt.invoice_status && (
          <span className="text-[10px] text-[#6E6688]">{appt.invoice_status}</span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// PATIENT DETAIL PANEL
// =============================================================================

function PatientDetailPanel({ patient, appointments, userId, onClose }: {
  patient: Patient;
  appointments: PatientAppointment[];
  userId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const now = new Date().toISOString();
  const past = appointments.filter(a => !a.starts_at || a.starts_at < now);
  const upcoming = appointments.filter(a => a.starts_at && a.starts_at >= now);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#FAF7F2]/60" onClick={onClose} />
      <motion.div
        initial={{ x: 480 }}
        animate={{ x: 0 }}
        exit={{ x: 480 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="fixed right-0 top-0 h-full z-50 w-[480px] flex flex-col overflow-hidden bg-[#FAF7F2] border-l border-[#EBE5FF]"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-[#EBE5FF]">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center text-[16px] font-semibold text-[#524D66] flex-shrink-0">
                {initials(patient.first_name, patient.last_name)}
              </div>
              <div>
                <h2 className="text-[17px] font-semibold text-[#1A1035]">
                  {patient.first_name} {patient.last_name}
                </h2>
                <p className="text-[12px] text-[#6E6688] mt-0.5">
                  Patient #{patient.cliniko_id}
                  {patient.gender && ` · ${patient.gender}`}
                  {patient.date_of_birth && ` · DOB ${formatDate(patient.date_of_birth)}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6E6688] hover:text-[#524D66] hover:bg-[#FAF7F2] transition-all flex-shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          {/* Contact */}
          <div className="flex flex-wrap gap-2">
            {patient.email && (
              <a
                href={`mailto:${patient.email}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] bg-[#FAF9F5] border border-[#EBE5FF] text-[#524D66] hover:text-[#524D66] transition-colors"
              >
                <Mail size={11} className="text-[#6E6688]" />
                {patient.email}
              </a>
            )}
            {patient.phone && (
              <a
                href={`tel:${patient.phone}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] bg-[#FAF9F5] border border-[#EBE5FF] text-[#524D66] hover:text-[#524D66] transition-colors"
              >
                <Phone size={11} className="text-[#6E6688]" />
                {patient.phone}
              </a>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 border-b border-[#EBE5FF]">
          {[
            { label: 'Total Visits', value: past.length },
            { label: 'Upcoming', value: upcoming.length },
            { label: 'No-shows', value: past.filter(a => a.status === 'Did Not Arrive').length },
          ].map(s => (
            <div key={s.label} className="px-5 py-4 text-center border-r border-[#EBE5FF] last:border-0">
              <p className="text-[20px] font-semibold text-[#1A1035]">{s.value}</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#6E6688] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Appointment history */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {upcoming.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-3">Upcoming</h3>
              <div className="space-y-2">
                {upcoming.map(a => <AppointmentRow key={a.id} appt={a} isUpcoming />)}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-3">History</h3>
            {past.length === 0 ? (
              <div className="py-8 text-center">
                <Calendar size={20} className="mx-auto mb-3 text-[#8B84A0]" />
                <p className="text-[13px] text-[#6E6688]">No past appointments</p>
              </div>
            ) : (
              <div className="space-y-2">
                {past.map(a => <AppointmentRow key={a.id} appt={a} />)}
              </div>
            )}
          </div>

          {patient.notes && (
            <div className="mt-6">
              <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-2">Notes</h3>
              <p className="text-[13px] text-[#6E6688] leading-relaxed bg-[#F0ECFF] border border-[#EBE5FF] rounded-lg px-4 py-3">
                {patient.notes}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#EBE5FF]">
          <button
            onClick={() => router.push(`/staff/chat?userId=${userId}&context=patient_${patient.cliniko_id}`)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium bg-[#8A6CFF] text-[#1A1035] hover:bg-[#8A6CFF]/10 transition-colors"
          >
            <MessageSquare size={13} />
            Ask Aria about this patient
          </button>
        </div>
      </motion.div>
    </>
  );
}

// =============================================================================
// PATIENT ROW
// =============================================================================

function PatientRow({ summary, onSelect }: {
  summary: PatientSummary;
  onSelect: () => void;
}) {
  const { patient, appointment_count, last_appointment_at, next_appointment_at, latest_treatment } = summary;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onSelect}
      className="w-full flex items-center gap-4 px-5 py-4 bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl hover:bg-[#FAF9F5] hover:border-[#D5CCFF] transition-all text-left group"
    >
      <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-[12px] font-medium text-[#524D66] flex-shrink-0">
        {initials(patient.first_name, patient.last_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#1A1035] truncate">
          {patient.first_name} {patient.last_name}
        </p>
        <p className="text-[11px] text-[#6E6688] truncate mt-0.5">
          {latest_treatment || 'No treatment recorded'}
        </p>
      </div>
      <div className="hidden md:block min-w-[180px]">
        <p className="text-[12px] text-[#6E6688] truncate">{patient.email || '—'}</p>
        <p className="text-[11px] text-[#6E6688] truncate mt-0.5">{patient.phone || '—'}</p>
      </div>
      <div className="hidden lg:block min-w-[100px] text-right">
        <p className="text-[12px] text-[#6E6688]">{relativeDate(last_appointment_at)}</p>
        <p className="text-[11px] text-[#6E6688] mt-0.5">{appointment_count} visit{appointment_count !== 1 ? 's' : ''}</p>
      </div>
      <div className="hidden xl:block min-w-[110px] text-right">
        {next_appointment_at ? (
          <>
            <p className="text-[12px] text-[#524D66]">{relativeDate(next_appointment_at)}</p>
            <p className="text-[11px] text-[#6E6688] mt-0.5">{formatDate(next_appointment_at)}</p>
          </>
        ) : (
          <p className="text-[12px] text-[#6E6688]">No upcoming</p>
        )}
      </div>
      <ChevronRight size={14} className="flex-shrink-0 text-[#8B84A0] group-hover:text-[#6E6688] transition-colors ml-1" />
    </motion.button>
  );
}

// =============================================================================

// =============================================================================
// EMPTY STATE
// =============================================================================

function EmptyState({ userId }: { userId: string }) {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-[#FAF9F5] border border-[#EBE5FF] flex items-center justify-center mb-6">
        <Users size={24} className="text-[#6E6688]" />
      </div>
      <h2 className="text-[18px] font-semibold text-[#524D66] mb-2">No patients synced yet</h2>
      <p className="text-[13px] text-[#6E6688] max-w-sm leading-relaxed mb-8">
        Connect your Cliniko account and your full patient list — appointment history, treatment records, and invoices — will appear here automatically.
      </p>
      <button
        onClick={() => router.push(`/staff/integrations?userId=${userId}`)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-medium bg-[#8A6CFF] text-[#1A1035] hover:bg-[#8A6CFF]/10 transition-colors"
      >
        <ExternalLink size={13} />
        Connect Cliniko
      </button>
      <p className="text-[11px] text-[#6E6688] mt-3">Syncs automatically every hour once connected</p>

      {/* Ghost preview */}
      <div className="mt-14 w-full max-w-2xl space-y-2 opacity-[0.06] pointer-events-none select-none">
        {['Sarah Mitchell', 'James Okonkwo', 'Priya Sharma', 'Thomas Reid'].map((name) => (
          <div key={name} className="flex items-center gap-4 px-5 py-4 bg-white border border-[#EBE5FF] rounded-xl">
            <div className="w-9 h-9 rounded-lg bg-[#F0EDE5] flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-[#F0EDE5] rounded w-32" />
              <div className="h-2.5 bg-[#F0EDE5] rounded w-20" />
            </div>
            <div className="hidden md:block w-28 space-y-1.5">
              <div className="h-2.5 bg-[#F0EDE5] rounded w-full" />
              <div className="h-2 bg-[#F0EDE5] rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function PatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId] = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [stats, setStats] = useState<{ total: number; active_this_month: number; no_show_count: number; upcoming_today: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedAppointments, setSelectedAppointments] = useState<PatientAppointment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brandColor = profile?.brandColor || '#8A6CFF';

  const loadData = useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [profileRes, patientsRes, statsRes] = await Promise.all([
      getStaffProfile('clinic', uid),
      getPatients(),
      getPatientStats(),
    ]);

    if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
    if (patientsRes.success && patientsRes.patients) setPatients(patientsRes.patients);
    if (statsRes.success && statsRes.stats) setStats(statsRes.stats);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fallback = await getLatestTenantAndUser();
        if (fallback.success && fallback.userId) uid = fallback.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);
      await loadData(uid);
    })();
  }, [urlUserId, router, loadData]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const res = await getPatients(val || undefined);
      if (res.success && res.patients) setPatients(res.patients);
      setSearching(false);
    }, 350);
  };

  const openPatient = async (summary: PatientSummary) => {
    setDetailLoading(true);
    const res = await getPatientDetail(summary.patient.cliniko_id);
    if (res.success && res.patient) {
      setSelectedPatient(res.patient);
      setSelectedAppointments(res.appointments || []);
    }
    setDetailLoading(false);
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-[#F0EDE5]"
        />
      </div>
    );
  }

  const isEmpty = patients.length === 0 && !search;

  const statCards = [
    { label: 'Total Patients', value: stats?.total ?? 0, icon: Users, sub: 'in Cliniko' },
    { label: 'Active This Month', value: stats?.active_this_month ?? 0, icon: Activity, sub: 'with appointments' },
    { label: "Today's Schedule", value: stats?.upcoming_today ?? 0, icon: Calendar, sub: 'upcoming appointments' },
    { label: 'No-shows (30d)', value: stats?.no_show_count ?? 0, icon: Clock, sub: 'missed appointments' },
  ];

  return (
    <div className="min-h-screen pl-[240px]">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Patients" />

      <div className="min-h-screen">
        <main className="px-8 py-10 max-w-5xl mx-auto">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start justify-between mb-8"
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] mb-2">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <h1 className="text-[26px] font-semibold tracking-tight text-[#1A1035]">Patient Records</h1>
              <p className="text-[13px] text-[#6E6688] mt-1">
                {stats?.total ?? 0} patients · {profile.companyName}
              </p>
            </div>
            <button
              onClick={() => userId && loadData(userId, true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] text-[#6E6688] bg-[#FAF9F5] border border-[#EBE5FF] hover:bg-white/[0.07] transition-colors"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </motion.div>

          {/* Stat cards */}
          {!isEmpty && (
            <div className="grid grid-cols-4 gap-3 mb-8">
              {statCards.map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <StatCard label={s.label} value={s.value} icon={s.icon} sub={s.sub} />
                </motion.div>
              ))}
            </div>
          )}

          {/* Search */}
          {!isEmpty && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="relative mb-6"
            >
              <Search
                size={13}
                className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${searching ? 'text-[#524D66]' : 'text-[#6E6688]'}`}
              />
              <input
                className="w-full bg-white border border-[#EBE5FF] rounded-xl pl-10 pr-4 py-3 text-[13px] text-[#1A1035] placeholder-white/20 outline-none focus:border-[#D5CCFF] transition-colors"
                placeholder="Search by name, email or phone..."
                value={search}
                onChange={e => handleSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => handleSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6E6688] hover:text-[#524D66] transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </motion.div>
          )}

          {/* Column headers */}
          {!isEmpty && patients.length > 0 && (
            <div className="flex items-center gap-4 px-5 mb-2">
              <div className="w-9 flex-shrink-0" />
              <div className="flex-1 text-[10px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">Patient</div>
              <div className="hidden md:block min-w-[180px] text-[10px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">Contact</div>
              <div className="hidden lg:block min-w-[100px] text-[10px] uppercase tracking-[0.15em] text-[#6E6688] font-medium text-right">Last Visit</div>
              <div className="hidden xl:block min-w-[110px] text-[10px] uppercase tracking-[0.15em] text-[#6E6688] font-medium text-right">Next Apt</div>
              <div className="w-5 flex-shrink-0" />
            </div>
          )}

          {/* Patient list / states */}
          {isEmpty ? (
            <EmptyState userId={userId!} />
          ) : patients.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 text-center">
              <UserCircle2 size={28} className="mx-auto mb-4 text-[#8B84A0]" />
              <p className="text-[13px] text-[#6E6688]">No patients match &quot;{search}&quot;</p>
              <button onClick={() => handleSearch('')} className="mt-3 text-[12px] text-[#6E6688] hover:text-[#524D66] transition-colors">
                Clear search
              </button>
            </motion.div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {patients.map((s, i) => (
                  <motion.div key={s.patient.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
                    <PatientRow summary={s} onSelect={() => openPatient(s)} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          <div className="h-16" />
        </main>
      </div>

      {/* Detail loading overlay */}
      <AnimatePresence>
        {detailLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-[#FAF7F2]/40"
          >
            <motion.div
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-[#F0EDE5]"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Patient detail panel */}
      <AnimatePresence>
        {selectedPatient && !detailLoading && (
          <PatientDetailPanel
            patient={selectedPatient}
            appointments={selectedAppointments}
            userId={userId!}
            onClose={() => { setSelectedPatient(null); setSelectedAppointments([]); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

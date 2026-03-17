'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { upsertHRRecord, type HRRecord, type ActiveUser } from '@/lib/actions/compliance';

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

const INP_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BORDER}`,
  color: NAVY,
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12,
  width: '100%',
  outline: 'none',
};

function statusColor(status: string): string {
  if (['valid', 'permanent', 'on_track', 'compliant'].includes(status)) return GREEN;
  if (['due_soon', 'expiring_soon', 'no_dbs'].includes(status)) return ORANGE;
  if (['expired', 'overdue'].includes(status)) return RED;
  return MUTED;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    valid: 'Valid', permanent: 'Permanent', on_track: 'On Track',
    due_soon: 'Due Soon', expiring_soon: 'Expiring', no_dbs: 'No DBS',
    expired: 'Expired', overdue: 'Overdue', na: 'N/A', not_set: 'Not Set',
  };
  return map[status] ?? status.replace(/_/g, ' ');
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

interface AddModalProps {
  users: ActiveUser[];
  onClose: () => void;
  onSave: () => void;
}

function AddRecordModal({ users, onClose, onSave }: AddModalProps) {
  const [form, setForm] = useState({
    user_id: '',
    job_title: '',
    dept_team: '',
    start_date: '',
    contract_type: 'full_time',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.user_id) { setError('Please select a staff member'); return; }
    setSaving(true);
    const res = await upsertHRRecord(form.user_id, {
      job_title: form.job_title || null,
      dept_team: form.dept_team || null,
      start_date: form.start_date || null,
      contract_type: form.contract_type,
    });
    setSaving(false);
    if (res.success) { onSave(); } else { setError(res.error ?? 'Failed to save'); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backdropFilter: 'blur(6px)', background: 'rgba(24,29,35,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="rounded-2xl p-6 w-[480px]"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>Add HR Record</h3>
          <button onClick={onClose}><X size={16} color={MUTED} /></button>
        </div>

        {error && <p className="mb-4 text-[11px] p-2 rounded-lg" style={{ background: `${RED}14`, color: RED }}>{error}</p>}

        <div className="space-y-4">
          <div>
            <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Staff Member</label>
            <select style={INP_STYLE} value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
              <option value="">Select staff member...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name} — {u.role_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Job Title</label>
              <input style={INP_STYLE} value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="e.g. Nurse Practitioner" />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Department / Team</label>
              <input style={INP_STYLE} value={form.dept_team} onChange={e => setForm(f => ({ ...f, dept_team: e.target.value }))} placeholder="e.g. Clinical" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Start Date</label>
              <input type="date" style={INP_STYLE} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>Contract Type</label>
              <select style={INP_STYLE} value={form.contract_type} onChange={e => setForm(f => ({ ...f, contract_type: e.target.value }))}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="bank">Bank / Casual</option>
                <option value="contractor">Contractor</option>
                <option value="volunteer">Volunteer</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
          <button onClick={onClose} style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2"
            style={{ background: NAVY, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save Record
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface Props {
  records: HRRecord[];
  users: ActiveUser[];
  currentUserId: string;
  onRefresh: () => void;
}

export default function HRTrackerTab({ records, users, currentUserId, onRefresh }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const dbsIssues      = records.filter(r => ['expired', 'due_soon'].includes(r.dbs_status)).length;
  const rtwIssues      = records.filter(r => ['expired', 'due_soon'].includes(r.rtw_status)).length;
  const appraisalOver  = records.filter(r => r.appraisal_status === 'overdue').length;
  const total          = records.length;

  const filtered = records.filter(r => r.full_name.toLowerCase().includes(search.toLowerCase()) || (r.job_title ?? '').toLowerCase().includes(search.toLowerCase()));

  const statStrip = [
    { label: 'Total Staff', val: total, critical: false },
    { label: 'DBS Issues', val: dbsIssues, critical: dbsIssues > 0 },
    { label: 'RTW Issues', val: rtwIssues, critical: rtwIssues > 0 },
    { label: 'Appraisals Overdue', val: appraisalOver, critical: appraisalOver > 0 },
  ];

  return (
    <div>
      {/* Stats strip */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ border: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-4">
          {statStrip.map((s, i) => (
            <div key={s.label} className="px-5 py-4" style={{ borderRight: i < 3 ? `1px solid ${BORDER}` : 'none' }}>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: s.critical ? RED : NAVY }}>{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search + Add */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 flex-1 rounded-xl px-3 py-2" style={{ border: `1px solid ${BORDER}`, background: 'transparent' }}>
          <Search size={13} color={MUTED} />
          <input
            className="flex-1 bg-transparent outline-none text-[12px]"
            style={{ color: NAVY }}
            placeholder="Search staff..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium transition-all"
          style={{ border: `1px solid ${BORDER}`, color: SEC, background: 'transparent' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${BLUE}08`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <Plus size={12} />
          Add Record
        </button>
      </div>

      {/* Staff cards grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ border: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 13, color: MUTED }}>No HR records found{search ? ` for "${search}"` : ''}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map(record => (
              <motion.div
                key={record.user_id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2 }}
              >
                <HRCard
                  record={record}
                  onClick={() => router.push(`/staff/compliance/hr/${record.user_id}?userId=${currentUserId}`)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <AddRecordModal
            users={users}
            onClose={() => setShowAdd(false)}
            onSave={() => { setShowAdd(false); onRefresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function formatTenure(startDate: string): string {
  const start = new Date(startDate);
  const now = new Date();
  const totalMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (totalMonths < 1) return 'Just started';
  if (totalMonths < 12) return `${totalMonths} month${totalMonths !== 1 ? 's' : ''}`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return months > 0 ? `${years} yr ${months}mo` : `${years} yr`;
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = d.getDate();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const yr = String(d.getFullYear()).slice(2);
  return `${day} ${months[d.getMonth()]} ${yr}`;
}

function contractLabel(ct: string | null): string {
  const map: Record<string, string> = {
    full_time: 'Full Time',
    part_time: 'Part Time',
    bank: 'Bank',
    contractor: 'Contractor',
    volunteer: 'Volunteer',
  };
  return ct ? (map[ct] ?? ct.replace(/_/g, ' ')) : '';
}

function HRCard({ record, onClick }: { record: HRRecord; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  const badges = [
    { key: 'DBS', status: record.dbs_status },
    { key: 'RTW', status: record.rtw_status },
    { key: 'Appraisal', status: record.appraisal_status },
  ];

  // Determine avatar ring color based on worst status
  const allStatuses = [record.dbs_status, record.rtw_status, record.appraisal_status];
  const hasCritical = allStatuses.some(s => ['expired', 'overdue'].includes(s));
  const hasWarn     = allStatuses.some(s => ['due_soon', 'expiring_soon', 'no_dbs'].includes(s));
  const avatarShadow = hasCritical
    ? `0 0 0 2.5px ${RED}`
    : hasWarn
      ? `0 0 0 2.5px ${ORANGE}`
      : `0 0 0 2.5px ${GREEN}60`;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full text-left rounded-2xl p-5 transition-all"
      style={{
        border: `1px solid ${hovered ? `${BLUE}40` : BORDER}`,
        background: hovered ? `${BLUE}04` : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* Avatar + name + contract badge */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-full"
            style={{ width: 40, height: 40, background: NAVY, color: BG, fontSize: 13, fontWeight: 700, boxShadow: avatarShadow }}
          >
            {initials(record.full_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 2 }} className="truncate">{record.full_name}</p>
            <p style={{ fontSize: 11, color: TER }} className="truncate">{record.job_title ?? record.role_name}</p>
            {record.dept_team && <p style={{ fontSize: 10, color: MUTED }} className="truncate">{record.dept_team}</p>}
            {record.start_date && (
              <p style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                Started {formatTenure(record.start_date)}
              </p>
            )}
          </div>
        </div>
        {record.contract_type && (
          <span
            style={{
              background: `${MUTED}14`,
              color: MUTED,
              fontSize: 9,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 999,
              flexShrink: 0,
              marginLeft: 8,
              whiteSpace: 'nowrap',
            }}
          >
            {contractLabel(record.contract_type)}
          </span>
        )}
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {badges.map(b => {
          const col = statusColor(b.status);
          return (
            <span
              key={b.key}
              className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: `${col}18`, color: col }}
            >
              {b.key}: {statusLabel(b.status)}
            </span>
          );
        })}
      </div>

      {/* Hover reveal panel */}
      {hovered && (
        <div
          style={{
            background: `${NAVY}06`,
            borderRadius: 10,
            padding: 10,
            marginTop: 10,
          }}
        >
          <div className="space-y-1.5 mb-2">
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10, color: MUTED, minWidth: 56 }}>DBS:</span>
              <span style={{ fontSize: 10, color: TER }}>
                {record.dbs_expiry_date ? formatDateShort(record.dbs_expiry_date) : 'No DBS'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10, color: MUTED, minWidth: 56 }}>RTW:</span>
              <span style={{ fontSize: 10, color: TER }}>
                {record.rtw_status === 'permanent' ? 'Permanent' : (record.rtw_expiry_date ? formatDateShort(record.rtw_expiry_date) : 'Not set')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10, color: MUTED, minWidth: 56 }}>Appraisal:</span>
              <span style={{ fontSize: 10, color: TER }}>
                {record.next_appraisal_date ? formatDateShort(record.next_appraisal_date) : 'Not scheduled'}
              </span>
            </div>
          </div>
          <span style={{ fontSize: 11, color: BLUE, fontWeight: 700 }}>View full record →</span>
        </div>
      )}
    </button>
  );
}

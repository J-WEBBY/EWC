'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Edit2, Save, X, Trash2, Loader2, CheckSquare, Square } from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import { upsertHRRecord, deleteHRRecord, type HRRecord, type ActiveUser } from '@/lib/actions/compliance';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';

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

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  );
}

function statusColor(status: string): string {
  if (['valid', 'permanent', 'on_track'].includes(status)) return GREEN;
  if (['due_soon', 'no_dbs', 'not_set'].includes(status)) return ORANGE;
  if (['expired', 'overdue'].includes(status)) return RED;
  return MUTED;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    valid: 'Valid', permanent: 'Permanent', on_track: 'On Track', na: 'N/A',
    due_soon: 'Due Soon', no_dbs: 'No DBS', not_set: 'Not Set',
    expired: 'Expired', overdue: 'Overdue',
  };
  return map[status] ?? status.replace(/_/g, ' ');
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

type EditForm = {
  staff_id: string;
  job_title: string;
  dept_team: string;
  start_date: string;
  contract_type: string;
  dbs_number: string;
  dbs_issue_date: string;
  dbs_expiry_date: string;
  rtw_type: string;
  rtw_expiry_date: string;
  registration_body: string;
  registration_number: string;
  registration_expiry: string;
  last_appraisal_date: string;
  next_appraisal_date: string;
  staff_signed: boolean;
  manager_signed: boolean;
  documents_uploaded: boolean;
  notes: string;
};

function recordToForm(record: HRRecord): EditForm {
  return {
    staff_id:            record.staff_id ?? '',
    job_title:           record.job_title ?? '',
    dept_team:           record.dept_team ?? '',
    start_date:          record.start_date ?? '',
    contract_type:       record.contract_type ?? 'full_time',
    dbs_number:          record.dbs_number ?? '',
    dbs_issue_date:      record.dbs_issue_date ?? '',
    dbs_expiry_date:     record.dbs_expiry_date ?? '',
    rtw_type:            record.rtw_type ?? '',
    rtw_expiry_date:     record.rtw_expiry_date ?? '',
    registration_body:   record.registration_body ?? '',
    registration_number: record.registration_number ?? '',
    registration_expiry: record.registration_expiry ?? '',
    last_appraisal_date: record.last_appraisal_date ?? '',
    next_appraisal_date: record.next_appraisal_date ?? '',
    staff_signed:        record.staff_signed,
    manager_signed:      record.manager_signed,
    documents_uploaded:  record.documents_uploaded,
    notes:               record.notes ?? '',
  };
}

interface Props {
  profile: StaffProfile;
  currentUserId: string;
  record: HRRecord | null;
  staffUser: ActiveUser | null;
}

export default function HRRecordClient({ profile, currentUserId, record, staffUser }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(record === null);
  const [form, setForm] = useState<EditForm>(record ? recordToForm(record) : {
    staff_id: '', job_title: '', dept_team: '', start_date: '', contract_type: 'full_time',
    dbs_number: '', dbs_issue_date: '', dbs_expiry_date: '',
    rtw_type: '', rtw_expiry_date: '',
    registration_body: '', registration_number: '', registration_expiry: '',
    last_appraisal_date: '', next_appraisal_date: '',
    staff_signed: false, manager_signed: false, documents_uploaded: false, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const personName = record?.full_name ?? staffUser?.full_name ?? 'Unknown';
  const personRole = record?.role_name ?? staffUser?.role_name ?? '';
  const userId     = record?.user_id ?? staffUser?.id ?? '';

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    const res = await upsertHRRecord(userId, {
      staff_id:            form.staff_id || null,
      job_title:           form.job_title || null,
      dept_team:           form.dept_team || null,
      start_date:          form.start_date || null,
      contract_type:       form.contract_type || null,
      dbs_number:          form.dbs_number || null,
      dbs_issue_date:      form.dbs_issue_date || null,
      dbs_expiry_date:     form.dbs_expiry_date || null,
      rtw_type:            form.rtw_type || null,
      rtw_expiry_date:     form.rtw_expiry_date || null,
      registration_body:   form.registration_body || null,
      registration_number: form.registration_number || null,
      registration_expiry: form.registration_expiry || null,
      last_appraisal_date: form.last_appraisal_date || null,
      next_appraisal_date: form.next_appraisal_date || null,
      staff_signed:        form.staff_signed,
      manager_signed:      form.manager_signed,
      documents_uploaded:  form.documents_uploaded,
      notes:               form.notes || null,
    });
    setSaving(false);
    if (res.success) {
      setEditing(false);
      showToast('success', 'HR record saved successfully');
    } else {
      showToast('error', res.error ?? 'Failed to save');
    }
  }

  async function handleDelete() {
    if (!userId) return;
    setDeleting(true);
    const res = await deleteHRRecord(userId);
    setDeleting(false);
    if (res.success) {
      router.push(`/staff/compliance?tab=hr&userId=${currentUserId}`);
    } else {
      showToast('error', res.error ?? 'Failed to delete');
      setShowDeleteConfirm(false);
    }
  }

  function Field({ label, value, field, type = 'text' }: { label: string; value: string; field: keyof EditForm; type?: string }) {
    if (editing) {
      return (
        <div>
          <Lbl>{label}</Lbl>
          <input
            type={type}
            style={INP_STYLE}
            value={value}
            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          />
        </div>
      );
    }
    return (
      <div>
        <Lbl>{label}</Lbl>
        <p style={{ fontSize: 12, color: value ? NAVY : MUTED }}>{value || '—'}</p>
      </div>
    );
  }

  function SelectField({ label, value, field, options }: { label: string; value: string; field: keyof EditForm; options: Array<{ value: string; label: string }> }) {
    if (editing) {
      return (
        <div>
          <Lbl>{label}</Lbl>
          <select style={INP_STYLE} value={value} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      );
    }
    const opt = options.find(o => o.value === value);
    return (
      <div>
        <Lbl>{label}</Lbl>
        <p style={{ fontSize: 12, color: NAVY }}>{(opt?.label ?? value) || '—'}</p>
      </div>
    );
  }

  function CheckField({ label, checked, field }: { label: string; checked: boolean; field: 'staff_signed' | 'manager_signed' | 'documents_uploaded' }) {
    if (editing) {
      return (
        <button
          onClick={() => setForm(f => ({ ...f, [field]: !f[field] }))}
          className="flex items-center gap-2 text-left"
        >
          {checked ? <CheckSquare size={16} color={BLUE} /> : <Square size={16} color={MUTED} />}
          <span style={{ fontSize: 12, color: NAVY }}>{label}</span>
        </button>
      );
    }
    return (
      <div className="flex items-center gap-2">
        {checked ? <CheckSquare size={16} color={GREEN} /> : <Square size={16} color={MUTED} />}
        <span style={{ fontSize: 12, color: checked ? NAVY : MUTED }}>{label}</span>
      </div>
    );
  }

  function StatusBadge({ status }: { status: string }) {
    const col = statusColor(status);
    return (
      <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${col}18`, color: col }}>
        {statusLabel(status)}
      </span>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <StaffNav profile={profile} userId={currentUserId} brandColor={profile.brandColor || BLUE} currentPath="Compliance" />

      <div style={{ paddingLeft: 'var(--nav-w, 240px)' }}>
        <div className="max-w-[1000px] mx-auto px-8 py-8">

          {/* Back + breadcrumb */}
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => router.push(`/staff/compliance?tab=hr&userId=${currentUserId}`)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all"
              style={{ border: `1px solid ${BORDER}`, color: MUTED, background: 'transparent', fontSize: 11 }}
            >
              <ArrowLeft size={12} />
              Back
            </button>
            <span style={{ fontSize: 11, color: MUTED }}>Compliance / HR Tracker / {personName}</span>
          </div>

          {/* Header */}
          <div className="flex items-start justify-between mb-8" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 20 }}>
            <div className="flex items-center gap-4">
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{ width: 56, height: 56, background: NAVY, color: BG, fontSize: 18, fontWeight: 700 }}
              >
                {initials(personName)}
              </div>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: NAVY }}>{personName}</h1>
                <p style={{ fontSize: 12, color: TER, marginTop: 2 }}>{personRole}</p>
                <div className="flex items-center gap-2 mt-2">
                  {form.staff_id && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${BLUE}14`, color: BLUE }}>
                      ID: {form.staff_id}
                    </span>
                  )}
                  {form.contract_type && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${MUTED}18`, color: MUTED }}>
                      {form.contract_type.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button
                    onClick={() => { setEditing(false); if (record) setForm(recordToForm(record)); }}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] transition-all"
                    style={{ border: `1px solid ${BORDER}`, color: MUTED, background: 'transparent' }}
                  >
                    <X size={12} />Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11px] font-semibold"
                    style={{ background: NAVY, color: BG, border: 'none', opacity: saving ? 0.7 : 1 }}
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Save Record
                  </button>
                </>
              ) : (
                <>
                  {record && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] transition-all"
                      style={{ border: `1px solid ${RED}40`, color: RED, background: 'transparent' }}
                    >
                      <Trash2 size={12} />Delete
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-medium transition-all"
                    style={{ border: `1px solid ${BORDER}`, color: SEC, background: 'transparent' }}
                  >
                    <Edit2 size={12} />Edit Record
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-5">

            {/* Employment */}
            <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 16 }}>Employment</p>
              <div className="grid grid-cols-3 gap-5">
                <Field label="Start Date" value={editing ? form.start_date : fmt(form.start_date)} field="start_date" type="date" />
                <Field label="Job Title" value={form.job_title} field="job_title" />
                <Field label="Department / Team" value={form.dept_team} field="dept_team" />
                <Field label="Staff ID" value={form.staff_id} field="staff_id" />
                <SelectField
                  label="Contract Type"
                  value={form.contract_type}
                  field="contract_type"
                  options={[
                    { value: 'full_time', label: 'Full Time' },
                    { value: 'part_time', label: 'Part Time' },
                    { value: 'bank', label: 'Bank / Casual' },
                    { value: 'contractor', label: 'Contractor' },
                    { value: 'volunteer', label: 'Volunteer' },
                  ]}
                />
              </div>
            </div>

            {/* DBS */}
            <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between mb-4">
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>DBS Check</p>
                {record && <StatusBadge status={record.dbs_status} />}
              </div>
              <div className="grid grid-cols-3 gap-5">
                <Field label="DBS Number" value={form.dbs_number} field="dbs_number" />
                <Field label="Issue Date" value={editing ? form.dbs_issue_date : fmt(form.dbs_issue_date)} field="dbs_issue_date" type="date" />
                <Field label="Expiry Date" value={editing ? form.dbs_expiry_date : fmt(form.dbs_expiry_date)} field="dbs_expiry_date" type="date" />
              </div>
            </div>

            {/* RTW */}
            <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between mb-4">
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>Right to Work</p>
                {record && <StatusBadge status={record.rtw_status} />}
              </div>
              <div className="grid grid-cols-3 gap-5">
                <SelectField
                  label="RTW Type"
                  value={form.rtw_type}
                  field="rtw_type"
                  options={[
                    { value: '', label: 'Not specified' },
                    { value: 'uk_national', label: 'UK National / Permanent' },
                    { value: 'eu_settled', label: 'EU Settled Status' },
                    { value: 'visa', label: 'Visa / Time-limited' },
                    { value: 'na', label: 'N/A' },
                  ]}
                />
                <Field label="Expiry Date" value={editing ? form.rtw_expiry_date : fmt(form.rtw_expiry_date)} field="rtw_expiry_date" type="date" />
              </div>
            </div>

            {/* Professional Registration */}
            <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between mb-4">
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>Professional Registration</p>
                {record && <StatusBadge status={record.registration_status} />}
              </div>
              <div className="grid grid-cols-3 gap-5">
                <Field label="Registration Body" value={form.registration_body} field="registration_body" />
                <Field label="Registration Number" value={form.registration_number} field="registration_number" />
                <Field label="Expiry Date" value={editing ? form.registration_expiry : fmt(form.registration_expiry)} field="registration_expiry" type="date" />
              </div>
            </div>

            {/* Appraisal */}
            <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between mb-4">
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>Appraisal & Review</p>
                {record && <StatusBadge status={record.appraisal_status} />}
              </div>
              <div className="grid grid-cols-2 gap-5">
                <Field label="Last Appraisal" value={editing ? form.last_appraisal_date : fmt(form.last_appraisal_date)} field="last_appraisal_date" type="date" />
                <Field label="Next Appraisal" value={editing ? form.next_appraisal_date : fmt(form.next_appraisal_date)} field="next_appraisal_date" type="date" />
              </div>
            </div>

            {/* Sign-offs */}
            <div className="rounded-2xl p-6" style={{ border: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 16 }}>Sign-offs & Documents</p>
              <div className="flex items-center gap-8 mb-5">
                <CheckField label="Staff Signed" checked={form.staff_signed} field="staff_signed" />
                <CheckField label="Manager Signed" checked={form.manager_signed} field="manager_signed" />
                <CheckField label="Documents Uploaded" checked={form.documents_uploaded} field="documents_uploaded" />
              </div>
              <div>
                <Lbl>Notes</Lbl>
                {editing ? (
                  <textarea
                    rows={4}
                    style={{ ...INP_STYLE, resize: 'vertical' }}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any additional notes..."
                  />
                ) : (
                  <p style={{ fontSize: 12, color: form.notes ? NAVY : MUTED, lineHeight: 1.6 }}>{form.notes || '—'}</p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ backdropFilter: 'blur(6px)', background: 'rgba(24,29,35,0.5)' }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="rounded-2xl p-6 w-[400px]"
              style={{ background: BG, border: `1px solid ${BORDER}` }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Delete HR Record</h3>
              <p style={{ fontSize: 12, color: SEC, marginBottom: 20 }}>
                Are you sure you want to delete the HR record for <strong>{personName}</strong>? This cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{ fontSize: 11, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2"
                  style={{ background: RED, color: BG, fontSize: 12, fontWeight: 600, border: 'none', opacity: deleting ? 0.7 : 1 }}
                >
                  {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Delete Record
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 text-[12px] font-medium flex items-center gap-2"
            style={{
              background: toast.type === 'success' ? GREEN : RED,
              color: BG,
              boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
            }}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

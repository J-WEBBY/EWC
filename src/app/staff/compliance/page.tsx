'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, CheckCircle2, XCircle, Clock, AlertTriangle,
  ChevronDown, ChevronRight, FileText, Download, RefreshCw,
} from 'lucide-react';
import {
  getStaffProfile, getLatestTenantAndUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// SIMULATED COMPLIANCE DATA
// =============================================================================

type RAGStatus = 'green' | 'amber' | 'red';

interface CQCQuestion {
  id: string;
  key: string;
  label: string;
  rating: 'Outstanding' | 'Good' | 'Requires Improvement' | 'Inadequate' | 'Pending';
  status: RAGStatus;
  lastReviewed: string;
  notes: string;
  evidenceCount: number;
}

interface ComplianceItem {
  id: string;
  name: string;
  category: string;
  status: RAGStatus;
  dueDate: string;
  assignedTo: string;
  notes: string;
}

interface StaffCert {
  id: string;
  staff: string;
  cert: string;
  issuedDate: string;
  expiryDate: string;
  status: RAGStatus;
}

interface IncidentEntry {
  id: string;
  date: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  status: 'open' | 'investigating' | 'closed';
  reportedBy: string;
}

const CQC_QUESTIONS: CQCQuestion[] = [
  { id: '1', key: 'Safe',       label: 'Is it safe?',        rating: 'Good', status: 'green', lastReviewed: '2026-01-15', notes: 'All safety protocols current. Infection control up to date.', evidenceCount: 12 },
  { id: '2', key: 'Effective',  label: 'Is it effective?',   rating: 'Good', status: 'green', lastReviewed: '2026-01-15', notes: 'Clinical outcomes tracked. Treatment protocols evidence-based.', evidenceCount: 8 },
  { id: '3', key: 'Caring',     label: 'Is it caring?',      rating: 'Outstanding', status: 'green', lastReviewed: '2026-01-15', notes: 'Patient satisfaction 96%. Staff feedback consistently positive.', evidenceCount: 15 },
  { id: '4', key: 'Responsive', label: 'Is it responsive?',  rating: 'Good', status: 'green', lastReviewed: '2026-01-10', notes: 'Appointment wait times within target. Complaints resolved promptly.', evidenceCount: 9 },
  { id: '5', key: 'Well-led',   label: 'Is it well-led?',    rating: 'Requires Improvement', status: 'amber', lastReviewed: '2025-12-01', notes: 'Governance framework under review. Staff training records need updating.', evidenceCount: 6 },
];

const EQUIPMENT: ComplianceItem[] = [
  { id: 'eq1', name: 'CoolSculpting Elite Machine',     category: 'Equipment', status: 'green', dueDate: '2026-06-01', assignedTo: 'Dr Ganata', notes: 'Annual service due June 2026.' },
  { id: 'eq2', name: 'Cryolipolysis Applicator Set',    category: 'Equipment', status: 'green', dueDate: '2026-06-01', assignedTo: 'Dr Ganata', notes: 'Inspected January 2026.' },
  { id: 'eq3', name: 'IV Therapy Trolley',              category: 'Equipment', status: 'amber', dueDate: '2026-03-15', assignedTo: 'Clinic Manager', notes: 'Quarterly inspection overdue by 2 weeks.' },
  { id: 'eq4', name: 'AED Defibrillator',               category: 'Safety',   status: 'green', dueDate: '2026-04-01', assignedTo: 'Dr Ganata', notes: 'Pads replaced January 2026.' },
  { id: 'eq5', name: 'Emergency Anaphylaxis Kit',       category: 'Safety',   status: 'green', dueDate: '2026-05-30', assignedTo: 'Clinic Manager', notes: 'Stock checked. Expiry dates all valid.' },
  { id: 'eq6', name: 'Autoclave / Sterilisation Unit',  category: 'Equipment', status: 'red',  dueDate: '2026-02-01', assignedTo: 'Clinic Manager', notes: 'Annual validation test OVERDUE.' },
];

const STAFF_CERTS: StaffCert[] = [
  { id: 'sc1', staff: 'Dr Suresh Ganata',  cert: 'GMC Registration',             issuedDate: '2024-04-01', expiryDate: '2027-03-31', status: 'green' },
  { id: 'sc2', staff: 'Dr Suresh Ganata',  cert: 'CQC Registered Manager',       issuedDate: '2024-01-01', expiryDate: '2027-01-01', status: 'green' },
  { id: 'sc3', staff: 'Dr Suresh Ganata',  cert: 'Botox & Filler Level 7',       issuedDate: '2023-09-01', expiryDate: '2026-09-01', status: 'green' },
  { id: 'sc4', staff: 'Clinic Manager',    cert: 'CoolSculpting Certification',  issuedDate: '2023-11-01', expiryDate: '2026-02-28', status: 'amber' },
  { id: 'sc5', staff: 'Clinic Manager',    cert: 'Level 3 Aesthetics Diploma',   issuedDate: '2022-06-01', expiryDate: '2025-06-01', status: 'red'   },
  { id: 'sc6', staff: 'Receptionist',      cert: 'GDPR Awareness Training',      issuedDate: '2025-01-15', expiryDate: '2026-01-15', status: 'amber' },
];

const INCIDENTS: IncidentEntry[] = [
  { id: 'inc1', date: '2026-01-28', type: 'Near Miss',  severity: 'low',    description: 'Patient allergy not documented before treatment. Caught pre-procedure.', status: 'closed',       reportedBy: 'Dr Ganata' },
  { id: 'inc2', date: '2026-02-05', type: 'Complaint',  severity: 'medium', description: 'Patient dissatisfied with Botox results at 2-week review. Requested re-treatment.', status: 'investigating', reportedBy: 'Clinic Manager' },
  { id: 'inc3', date: '2026-02-14', type: 'Equipment',  severity: 'low',    description: 'IV therapy pump alarm triggered. False positive — pump replaced as precaution.', status: 'closed',       reportedBy: 'Clinic Manager' },
];

// =============================================================================
// HELPERS
// =============================================================================

function RAGDot({ status }: { status: RAGStatus }) {
  const colors = { green: 'bg-[#4ade80]', amber: 'bg-[#fbbf24]', red: 'bg-[#f87171]' };
  return <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[status]}`} />;
}

function RAGBadge({ status }: { status: RAGStatus }) {
  const styles: Record<RAGStatus, string> = {
    green: 'text-[#524D66] bg-[#FAF9F5] border-[#EBE5FF]',
    amber: 'text-[#fbbf24]/70 bg-[#fbbf24]/[0.06] border-[#fbbf24]/[0.15]',
    red:   'text-[#f87171]/70 bg-[#f87171]/[0.06] border-[#f87171]/[0.15]',
  };
  const labels = { green: 'Compliant', amber: 'Review', red: 'Action Required' };
  return (
    <span className={`text-[10px] font-medium uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function SectionHeader({ children, count, countColor }: { children: React.ReactNode; count?: number; countColor?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium">{children}</h2>
      {count !== undefined && (
        <span className={`text-[11px] font-medium px-2 py-0.5 bg-[#FAF9F5] border border-[#EBE5FF] rounded-full ${countColor || 'text-[#6E6688]'}`}>
          {count}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function CompliancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]   = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cqc' | 'equipment' | 'certs' | 'incidents'>('cqc');
  const [expandedCQC, setExpandedCQC] = useState<string | null>(null);

  const brandColor = profile?.brandColor || '#8A6CFF';

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getLatestTenantAndUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const profileRes = await getStaffProfile('clinic', uid);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setLoading(false);
    })();
  }, [urlUserId, router]);

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

  const redCount   = [...CQC_QUESTIONS, ...EQUIPMENT, ...STAFF_CERTS].filter(i => i.status === 'red').length;
  const amberCount = [...CQC_QUESTIONS, ...EQUIPMENT, ...STAFF_CERTS].filter(i => i.status === 'amber').length;
  const openIncidents = INCIDENTS.filter(i => i.status !== 'closed').length;

  const TABS = [
    { id: 'cqc' as const,       label: 'CQC 5 Questions' },
    { id: 'equipment' as const, label: 'Equipment Register' },
    { id: 'certs' as const,     label: 'Staff Certificates' },
    { id: 'incidents' as const, label: 'Incident Log' },
  ];

  return (
    <div className="min-h-screen pl-[240px]">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Compliance" />

      <div className="min-h-screen flex">
        <main className="flex-1 px-8 py-10 min-w-0">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] mb-2">Regulatory</p>
                <h1 className="text-[26px] font-semibold tracking-tight text-[#1A1035]">Compliance</h1>
                <p className="text-[13px] text-[#6E6688] mt-1">CQC inspection readiness, equipment register, staff certifications and incidents.</p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium bg-[#1A1035] text-white hover:bg-[#1A1035]/90 transition-colors">
                <Download size={13} />
                Export Pack
              </button>
            </div>
          </motion.div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Action Required', value: redCount,   icon: XCircle,      extra: 'Critical items' },
              { label: 'Under Review',    value: amberCount, icon: Clock,        extra: 'Needs attention' },
              { label: 'Open Incidents',  value: openIncidents, icon: AlertTriangle, extra: 'Active cases' },
              { label: 'CQC Rating',      value: 'Good',     icon: Shield,       extra: 'Last inspection' },
            ].map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="bg-white border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">{c.label}</span>
                  <c.icon size={14} className="text-[#6E6688]" />
                </div>
                <div>
                  <p className="text-[28px] font-semibold tracking-tight text-[#1A1035] leading-none">{c.value}</p>
                  <p className="text-[11px] text-[#6E6688] mt-1">{c.extra}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-6">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-[13px] transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-[#1A1035] font-medium'
                    : 'text-[#6E6688] hover:text-[#524D66]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* CQC */}
          <AnimatePresence mode="wait">
            {activeTab === 'cqc' && (
              <motion.div key="cqc" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <SectionHeader count={CQC_QUESTIONS.length}>CQC 5 Key Questions</SectionHeader>
                <div className="space-y-2">
                  {CQC_QUESTIONS.map(q => (
                    <div key={q.id} className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedCQC(prev => prev === q.id ? null : q.id)}
                        className="w-full flex items-center gap-4 p-4 hover:bg-white transition-colors text-left"
                      >
                        <RAGDot status={q.status} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-[#1A1035]">{q.key}</span>
                            <span className="text-[11px] text-[#6E6688]">{q.label}</span>
                          </div>
                        </div>
                        <span className={`text-[12px] font-medium ${
                          q.rating === 'Outstanding' ? 'text-[#1A1035]' :
                          q.rating === 'Good' ? 'text-[#524D66]' :
                          q.rating === 'Requires Improvement' ? 'text-[#fbbf24]/70' : 'text-[#f87171]/70'
                        }`}>{q.rating}</span>
                        <span className="text-[11px] text-[#6E6688]">{q.evidenceCount} items</span>
                        <ChevronDown size={13} className={`text-[#6E6688] transition-transform ${expandedCQC === q.id ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {expandedCQC === q.id && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-0 border-t border-[#EBE5FF]">
                              <p className="text-[13px] text-[#524D66] leading-relaxed mt-3">{q.notes}</p>
                              <p className="text-[11px] text-[#6E6688] mt-2">Last reviewed: {q.lastReviewed}</p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Equipment */}
            {activeTab === 'equipment' && (
              <motion.div key="equipment" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <SectionHeader count={EQUIPMENT.filter(e => e.status !== 'green').length} countColor="text-[#fbbf24]/70">
                  Equipment Register
                </SectionHeader>
                <div className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
                  {EQUIPMENT.map((eq, i) => (
                    <div
                      key={eq.id}
                      className={`flex items-center gap-4 px-5 py-3.5 ${i < EQUIPMENT.length - 1 ? 'border-b border-[#EBE5FF]' : ''}`}
                    >
                      <RAGDot status={eq.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#1A1035] truncate">{eq.name}</p>
                        <p className="text-[11px] text-[#6E6688]">{eq.notes}</p>
                      </div>
                      <span className="text-[11px] text-[#6E6688] flex-shrink-0">{eq.assignedTo}</span>
                      <span className="text-[11px] text-[#6E6688] flex-shrink-0">{eq.dueDate}</span>
                      <RAGBadge status={eq.status} />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Certs */}
            {activeTab === 'certs' && (
              <motion.div key="certs" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <SectionHeader count={STAFF_CERTS.filter(c => c.status !== 'green').length} countColor="text-[#fbbf24]/70">
                  Staff Certifications
                </SectionHeader>
                <div className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden">
                  {STAFF_CERTS.map((cert, i) => (
                    <div
                      key={cert.id}
                      className={`flex items-center gap-4 px-5 py-3.5 ${i < STAFF_CERTS.length - 1 ? 'border-b border-[#EBE5FF]' : ''}`}
                    >
                      <RAGDot status={cert.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#1A1035] truncate">{cert.cert}</p>
                        <p className="text-[11px] text-[#6E6688]">{cert.staff}</p>
                      </div>
                      <span className="text-[11px] text-[#6E6688] flex-shrink-0">Issued {cert.issuedDate}</span>
                      <span className="text-[11px] text-[#6E6688] flex-shrink-0">Expires {cert.expiryDate}</span>
                      <RAGBadge status={cert.status} />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Incidents */}
            {activeTab === 'incidents' && (
              <motion.div key="incidents" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <SectionHeader count={INCIDENTS.length}>Incident Log</SectionHeader>
                <div className="space-y-2">
                  {INCIDENTS.map(inc => (
                    <div key={inc.id} className="bg-white border border-[#EBE5FF] rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                          inc.severity === 'high' ? 'bg-[#f87171]' :
                          inc.severity === 'medium' ? 'bg-[#fbbf24]' : 'bg-[#F0EDE5]'
                        }`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[12px] font-medium text-[#1A1035]">{inc.type}</span>
                            <span className="text-[10px] uppercase tracking-[0.1em] text-[#6E6688]">{inc.severity}</span>
                            <span className={`text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border ${
                              inc.status === 'closed' ? 'text-[#6E6688] border-[#EBE5FF]' :
                              inc.status === 'investigating' ? 'text-[#fbbf24]/60 border-[#fbbf24]/[0.15]' :
                              'text-[#f87171]/60 border-[#f87171]/[0.15]'
                            }`}>
                              {inc.status}
                            </span>
                          </div>
                          <p className="text-[13px] text-[#524D66] leading-relaxed">{inc.description}</p>
                          <p className="text-[11px] text-[#6E6688] mt-1.5">{inc.date} · {inc.reportedBy}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 px-6 py-10 border-l border-[#EBE5FF]">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-3">Compliance Status</h3>
            <div className="space-y-2 mb-6">
              {[
                { label: 'CQC Ready',        status: 'green' as RAGStatus },
                { label: 'Equipment',        status: 'amber' as RAGStatus },
                { label: 'Staff Certs',      status: 'red' as RAGStatus   },
                { label: 'Incident Log',     status: 'amber' as RAGStatus },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3 px-3 py-2 bg-white border border-[#EBE5FF] rounded-lg">
                  <RAGDot status={s.status} />
                  <span className="text-[12px] text-[#524D66]">{s.label}</span>
                </div>
              ))}
            </div>

            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { label: 'Ask EWC', href: `/staff/chat?userId=${userId}` },
                { label: 'View Signals',   href: `/staff/signals?userId=${userId}` },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => router.push(a.href)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] text-[#6E6688] hover:text-[#524D66] hover:bg-[#FAF9F5] transition-all text-left"
                >
                  <FileText size={12} className="flex-shrink-0" />
                  {a.label}
                  <ChevronRight size={11} className="ml-auto opacity-40" />
                </button>
              ))}
            </div>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}

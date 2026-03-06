'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Download, TrendingUp, Users, PoundSterling,
  Shield, Calendar, ChevronRight, Clock,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// SIMULATED REPORT DATA
// =============================================================================

type ReportCategory = 'revenue' | 'patients' | 'compliance' | 'operations';

interface Report {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  period: string;
  generatedAt: string;
  status: 'ready' | 'generating' | 'scheduled';
  pages: number;
}

const REPORTS: Report[] = [
  {
    id: 'r1',
    title: 'Monthly Revenue Summary — February 2026',
    description: 'Revenue breakdown by treatment, booking conversion rates, outstanding invoices and payment trends.',
    category: 'revenue',
    period: 'Feb 2026',
    generatedAt: '2026-02-28',
    status: 'ready',
    pages: 8,
  },
  {
    id: 'r2',
    title: 'Patient Acquisition & Retention Report — Q1 2026',
    description: 'New patient enquiries, booking conversion funnel, retention rates by treatment category and churn analysis.',
    category: 'patients',
    period: 'Q1 2026',
    generatedAt: '2026-02-28',
    status: 'ready',
    pages: 12,
  },
  {
    id: 'r3',
    title: 'CQC Compliance Readiness Pack — February 2026',
    description: 'CQC 5 key questions evidence summary, equipment register status, staff certification log and open incidents.',
    category: 'compliance',
    period: 'Feb 2026',
    generatedAt: '2026-02-27',
    status: 'ready',
    pages: 18,
  },
  {
    id: 'r4',
    title: 'Operational Signals Digest — Week 9 2026',
    description: 'Summary of all signals raised, resolved and escalated. Agent actions taken and automations triggered.',
    category: 'operations',
    period: 'W9 2026',
    generatedAt: '2026-02-28',
    status: 'ready',
    pages: 6,
  },
  {
    id: 'r5',
    title: 'Treatment Performance Analysis — February 2026',
    description: 'Per-treatment revenue, booking volume, patient satisfaction scores and return rate by treatment type.',
    category: 'revenue',
    period: 'Feb 2026',
    generatedAt: '2026-02-25',
    status: 'ready',
    pages: 10,
  },
  {
    id: 'r6',
    title: 'Staff Certification & Training Status — Q1 2026',
    description: 'All staff certifications, expiry dates, upcoming renewals and training requirements for the quarter.',
    category: 'compliance',
    period: 'Q1 2026',
    generatedAt: '2026-02-20',
    status: 'ready',
    pages: 5,
  },
  {
    id: 'r7',
    title: 'Monthly Revenue Summary — March 2026',
    description: 'Revenue breakdown for March 2026 — scheduled to generate on 01 April 2026.',
    category: 'revenue',
    period: 'Mar 2026',
    generatedAt: '—',
    status: 'scheduled',
    pages: 0,
  },
  {
    id: 'r8',
    title: 'Quarterly Patient Retention Report — Q2 2026',
    description: 'Retention analysis for Q2 — scheduled to generate on 01 July 2026.',
    category: 'patients',
    period: 'Q2 2026',
    generatedAt: '—',
    status: 'scheduled',
    pages: 0,
  },
];

const CATEGORY_META: Record<ReportCategory, { label: string; icon: React.ElementType; color: string }> = {
  revenue:    { label: 'Revenue',    icon: PoundSterling, color: 'text-[#D8A600]' },
  patients:   { label: 'Patients',   icon: Users,         color: 'text-[#00A693]' },
  compliance: { label: 'Compliance', icon: Shield,        color: 'text-[#0058E6]' },
  operations: { label: 'Operations', icon: TrendingUp,    color: 'text-[#181D23]' },
};

// =============================================================================
// COMPONENTS
// =============================================================================

function StatusBadge({ status }: { status: Report['status'] }) {
  const styles = {
    ready:      'bg-[#DCFCE7] text-[#166534]',
    generating: 'bg-[#FEF3C7] text-[#92400E]',
    scheduled:  'bg-[#EDE9FE] text-[#5B21B6]',
  };
  const labels = { ready: 'Ready', generating: 'Generating', scheduled: 'Scheduled' };
  return (
    <span className={`text-[10px] font-medium uppercase tracking-[0.1em] px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function ReportCard({ report, onDownload }: { report: Report; onDownload: (id: string) => void }) {
  const meta = CATEGORY_META[report.category];
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="bg-white border border-[#D4E2FF] rounded-xl p-5 flex items-start gap-4"
    >
      <div className="w-9 h-9 rounded-lg bg-[#F8FAFF] border border-[#D4E2FF] flex items-center justify-center flex-shrink-0">
        <Icon size={16} className={meta.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <p className="text-[13px] font-medium text-[#181D23] leading-snug">{report.title}</p>
          <StatusBadge status={report.status} />
        </div>
        <p className="text-[12px] text-[#5A6475] leading-relaxed mb-3">{report.description}</p>
        <div className="flex items-center gap-4 text-[11px] text-[#96989B]">
          <span className="flex items-center gap-1.5">
            <Calendar size={11} />
            {report.period}
          </span>
          {report.status === 'ready' && (
            <>
              <span className="flex items-center gap-1.5">
                <Clock size={11} />
                {report.generatedAt}
              </span>
              <span className="flex items-center gap-1.5">
                <FileText size={11} />
                {report.pages}p
              </span>
            </>
          )}
        </div>
      </div>
      {report.status === 'ready' && (
        <button
          onClick={() => onDownload(report.id)}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#181D23] text-white hover:bg-[#181D23]/90 transition-colors"
        >
          <Download size={12} />
          Export
        </button>
      )}
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]   = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ReportCategory | 'all'>('all');

  const brandColor = profile?.brandColor || '#0058E6';

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
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
      <div className="min-h-screen pl-[240px] bg-[#F8FAFF] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-[#A8C4FF]"
        />
      </div>
    );
  }

  const filtered = activeCategory === 'all'
    ? REPORTS
    : REPORTS.filter(r => r.category === activeCategory);

  const readyCount = REPORTS.filter(r => r.status === 'ready').length;

  const TABS: { id: ReportCategory | 'all'; label: string }[] = [
    { id: 'all',        label: 'All Reports' },
    { id: 'revenue',    label: 'Revenue' },
    { id: 'patients',   label: 'Patients' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'operations', label: 'Operations' },
  ];

  function handleDownload(id: string) {
    // In Week 2 this will generate a real PDF via an API route
    alert(`Report ${id} export — PDF generation will be connected in Week 2.`);
  }

  return (
    <div className="min-h-screen pl-[240px]">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Reports" />

      <div className="min-h-screen flex">
        <main className="flex-1 px-8 py-10 min-w-0">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] mb-2">Governance</p>
                <h1 className="text-[26px] font-semibold tracking-tight text-[#181D23]">Reports</h1>
                <p className="text-[13px] text-[#5A6475] mt-1">
                  {readyCount} report{readyCount !== 1 ? 's' : ''} ready to export — simulated data (live reporting connects in Week 2).
                </p>
              </div>
            </div>
          </motion.div>

          {/* Summary row */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {(Object.entries(CATEGORY_META) as [ReportCategory, typeof CATEGORY_META[ReportCategory]][]).map(([cat, meta], i) => {
              const count = REPORTS.filter(r => r.category === cat && r.status === 'ready').length;
              const Icon = meta.icon;
              return (
                <motion.div
                  key={cat}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => setActiveCategory(cat)}
                  className={`bg-white border rounded-xl p-5 cursor-pointer transition-all ${
                    activeCategory === cat
                      ? 'border-[#181D23] ring-1 ring-[#181D23]/10'
                      : 'border-[#D4E2FF] hover:border-[#A8C4FF]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium">{meta.label}</span>
                    <Icon size={14} className={meta.color} />
                  </div>
                  <p className="text-[26px] font-semibold tracking-tight text-[#181D23] leading-none">{count}</p>
                  <p className="text-[11px] text-[#5A6475] mt-1">ready to export</p>
                </motion.div>
              );
            })}
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-1 mb-6">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={`px-4 py-2 rounded-lg text-[13px] transition-colors ${
                  activeCategory === tab.id
                    ? 'bg-white text-[#181D23] font-medium border border-[#D4E2FF]'
                    : 'text-[#5A6475] hover:text-[#3D4451]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Report list */}
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filtered.map(report => (
                <ReportCard key={report.id} report={report} onDownload={handleDownload} />
              ))}
            </AnimatePresence>
          </div>

        </main>

        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 px-6 py-10 border-l border-[#D4E2FF]">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] font-medium mb-3">Quick Access</h3>
            <div className="space-y-1 mb-6">
              {[
                { label: 'KPIs Dashboard',  href: `/staff/kpis?userId=${userId}` },
                { label: 'Compliance Pack', href: `/staff/compliance?userId=${userId}` },
                { label: 'Ask EWC',         href: `/staff/chat?userId=${userId}` },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => router.push(a.href)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] text-[#5A6475] hover:text-[#3D4451] hover:bg-[#F8FAFF] transition-all text-left"
                >
                  <ChevronRight size={11} className="flex-shrink-0 opacity-40" />
                  {a.label}
                </button>
              ))}
            </div>

            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] font-medium mb-3">Schedule</h3>
            <div className="space-y-2">
              {REPORTS.filter(r => r.status === 'scheduled').map(r => (
                <div key={r.id} className="p-3 bg-[#F8FAFF] border border-[#D4E2FF] rounded-lg">
                  <p className="text-[11px] font-medium text-[#3D4451] leading-snug">{r.title.split('—')[0].trim()}</p>
                  <p className="text-[10px] text-[#96989B] mt-1">{r.period}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}

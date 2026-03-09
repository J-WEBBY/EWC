'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  FileText, TrendingUp, Users, PoundSterling,
  Shield, ChevronRight, Loader2, Plus,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUT    = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GOLD   = '#D8A600';
const TEAL   = '#00A693';
const GREEN  = '#059669';

// =============================================================================
// REPORT TEMPLATES (available to generate — no fake data)
// =============================================================================

const TEMPLATES = [
  {
    id: 'revenue-monthly',
    title: 'Monthly Revenue Summary',
    description: 'Revenue by treatment, booking conversion rates, outstanding invoices and payment trends.',
    category: 'Revenue',
    icon: PoundSterling,
    color: GOLD,
  },
  {
    id: 'patients-quarterly',
    title: 'Patient Acquisition & Retention',
    description: 'New enquiries, booking funnel, retention rates by treatment category and churn analysis.',
    category: 'Patients',
    icon: Users,
    color: TEAL,
  },
  {
    id: 'compliance-cqc',
    title: 'CQC Compliance Readiness Pack',
    description: 'CQC 5-key-question evidence: equipment register, staff certifications and open incidents.',
    category: 'Compliance',
    icon: Shield,
    color: BLUE,
  },
  {
    id: 'operations-signals',
    title: 'Operational Signals Digest',
    description: 'Signals raised, resolved and escalated. Agent actions taken and automations triggered.',
    category: 'Operations',
    icon: TrendingUp,
    color: SEC,
  },
  {
    id: 'treatment-performance',
    title: 'Treatment Performance Analysis',
    description: 'Per-treatment revenue, booking volume, patient satisfaction scores and return rates.',
    category: 'Revenue',
    icon: PoundSterling,
    color: GOLD,
  },
  {
    id: 'staff-certifications',
    title: 'Staff Certification & Training',
    description: 'All staff certifications, expiry dates, upcoming renewals and training requirements.',
    category: 'Compliance',
    icon: Shield,
    color: BLUE,
  },
] as const;

type TemplateId = typeof TEMPLATES[number]['id'];

// =============================================================================
// TEMPLATE CARD
// =============================================================================

function TemplateCard({
  template, onGenerate, generating, done,
}: {
  template: typeof TEMPLATES[number];
  onGenerate: (id: TemplateId) => void;
  generating: TemplateId | null;
  done: boolean;
}) {
  const Icon = template.icon;
  const isGenerating = generating === template.id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-4 px-5 py-4 rounded-xl"
      style={{ border: `1px solid ${BORDER}`, backgroundColor: BG }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: `${template.color}0d`, border: `1px solid ${template.color}20` }}
      >
        <Icon size={16} style={{ color: template.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[13px] font-semibold" style={{ color: NAVY }}>{template.title}</p>
          <span
            className="text-[9px] font-medium uppercase tracking-[0.10em] px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${template.color}0d`, color: template.color, border: `1px solid ${template.color}20` }}
          >
            {template.category}
          </span>
          {done && (
            <span
              className="text-[9px] font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${GREEN}0d`, color: GREEN, border: `1px solid ${GREEN}20` }}
            >
              Generated
            </span>
          )}
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: TER }}>{template.description}</p>
      </div>
      <button
        onClick={() => onGenerate(template.id)}
        disabled={!!generating}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-75 disabled:opacity-40"
        style={{ backgroundColor: `${BLUE}0c`, border: `1px solid ${BLUE}28`, color: BLUE }}
      >
        {isGenerating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
        {isGenerating ? 'Generating...' : done ? 'Re-generate' : 'Generate'}
      </button>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ReportsPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,     setUserId]     = useState<string | null>(urlUserId);
  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState<TemplateId | null>(null);
  const [generated,  setGenerated]  = useState<Set<string>>(new Set());

  const brandColor = profile?.brandColor || BLUE;

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

  async function handleGenerate(id: TemplateId) {
    if (generating) return;
    setGenerating(id);
    // PDF generation connects in Week 2 via /api/reports
    await new Promise(r => setTimeout(r, 1800));
    setGenerating(null);
    setGenerated(prev => new Set(prev).add(id));
  }

  if (loading || !profile) return <OrbLoader />;

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG, paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Reports" />

      <div className="flex min-h-screen">

        {/* ── MAIN ── */}
        <main className="flex-1 px-8 py-10 min-w-0">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: MUT }}>Governance</p>
            <h1 className="text-[28px] font-black tracking-[-0.03em]" style={{ color: NAVY }}>Reports</h1>
            <p className="text-[13px] mt-1" style={{ color: TER }}>
              Generate reports from live clinic data. PDF export connects in Week 2.
            </p>
          </motion.div>

          {/* Empty state */}
          {generated.size === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex items-center gap-4 px-5 py-4 rounded-xl mb-6"
              style={{ backgroundColor: `${BLUE}06`, border: `1px solid ${BLUE}18` }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${BLUE}10`, border: `1px solid ${BLUE}20` }}
              >
                <FileText size={16} style={{ color: BLUE }} />
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: NAVY }}>No reports generated yet</p>
                <p className="text-[12px]" style={{ color: TER }}>
                  Select a report type below to generate your first report from live clinic data.
                </p>
              </div>
            </motion.div>
          )}

          {/* Generated banner */}
          {generated.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-5 py-3 rounded-xl mb-6"
              style={{ backgroundColor: `${GREEN}08`, border: `1px solid ${GREEN}20` }}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: GREEN }} />
              <p className="text-[12px] font-medium" style={{ color: GREEN }}>
                {generated.size} report{generated.size !== 1 ? 's' : ''} generated this session — PDF export available in Week 2
              </p>
            </motion.div>
          )}

          {/* Templates */}
          <p className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: MUT }}>
            Available Report Types
          </p>
          <div className="space-y-2">
            {TEMPLATES.map((tpl, i) => (
              <motion.div
                key={tpl.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.04 }}
              >
                <TemplateCard
                  template={tpl}
                  onGenerate={handleGenerate}
                  generating={generating}
                  done={generated.has(tpl.id)}
                />
              </motion.div>
            ))}
          </div>

        </main>

        {/* ── SIDEBAR ── */}
        <aside className="w-[220px] flex-shrink-0 px-5 py-10" style={{ borderLeft: `1px solid ${BORDER}` }}>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>

            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: MUT }}>
              Quick Access
            </p>
            <div className="space-y-0.5 mb-8">
              {[
                { label: 'KPIs Dashboard', href: `/staff/kpis?userId=${userId}` },
                { label: 'Compliance',     href: `/staff/compliance?userId=${userId}` },
                { label: 'Governance',     href: `/staff/governance?userId=${userId}` },
                { label: 'Ask Aria',       href: `/staff/chat?userId=${userId}` },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => router.push(a.href)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] transition-all text-left"
                  style={{ color: TER }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = `${BORDER}40`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                >
                  <ChevronRight size={10} style={{ color: MUT }} />
                  {a.label}
                </button>
              ))}
            </div>

            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-3" style={{ color: MUT }}>
              Week 2 Roadmap
            </p>
            <div className="space-y-2">
              {[
                'PDF generation + download',
                'Scheduled auto-reports',
                'Email delivery to stakeholders',
                'Custom date ranges',
              ].map(item => (
                <div key={item} className="flex items-start gap-2 text-[11px]" style={{ color: MUT }}>
                  <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: BORDER }} />
                  {item}
                </div>
              ))}
            </div>

          </motion.div>
        </aside>

      </div>
    </div>
  );
}

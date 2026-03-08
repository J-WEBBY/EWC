'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowUpRight, ChevronRight, Check,
  Zap, Brain,
} from 'lucide-react';
import { getAgentsForTenant } from '@/lib/actions/agent-service';
import type { Agent } from '@/lib/types/database';
import OrbLoader from '@/components/orb-loader';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

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

// =============================================================================
// STATIC AGENT METADATA
// =============================================================================

const AGENT_META: Record<string, {
  role: string;
  tagline: string;
  color: string;
  capabilities: string[];
}> = {
  primary_agent: {
    role: 'Primary Orchestrator',
    tagline: 'Oversees all AI activity, routes queries across the system, and surfaces clinic-wide intelligence to the right people at the right time.',
    color: BLUE,
    capabilities: [
      'Route and coordinate all agent tasks',
      'Surface operational signals and priorities',
      'Generate morning intelligence briefings',
      'Answer complex multi-domain queries end-to-end',
    ],
  },
  sales_agent: {
    role: 'Patient Acquisition',
    tagline: 'Converts new enquiries into booked appointments, manages corporate accounts, and recovers missed opportunities before they go elsewhere.',
    color: GOLD,
    capabilities: [
      'Qualify and convert inbound enquiries',
      'Recover missed calls and abandoned leads',
      'Manage corporate account relationships',
      'Follow up on unanswered booking requests',
    ],
  },
  crm_agent: {
    role: 'Patient Retention',
    tagline: 'Keeps existing patients engaged through personalised follow-ups, loyalty programmes, and proactive churn prevention.',
    color: TEAL,
    capabilities: [
      'Send personalised treatment follow-ups',
      'Identify and re-engage at-risk patients',
      'Manage loyalty and referral programmes',
      'Track and improve patient lifetime value',
    ],
  },
};

// =============================================================================
// INTELLIGENCE MODULES
// =============================================================================

const MODULES = [
  {
    key: 'automations',
    label: 'Automations',
    description: 'Build and manage AI-powered clinic workflows. Set up follow-ups, reminders, and actions that run automatically.',
    icon: Zap,
    color: BLUE,
    href: '/staff/automations',
  },
  {
    key: 'judgement',
    label: 'Judgement Engine',
    description: 'Review AI decisions, approve or adjust recommendations, and train the system on your clinic\'s values over time.',
    icon: Brain,
    color: '#7C3AED',
    href: '/staff/judgement',
  },
];

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function AgentOrb({ color, size = 48 }: { color: string; size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
        animate={{ opacity: [0.08, 0.20, 0.08], scale: [1, 1.4, 1] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.72,
          height: size * 0.72,
          top: size * 0.14,
          left: size * 0.14,
          backgroundColor: color,
          opacity: 0.16,
        }}
        animate={{ opacity: [0.16, 0.30, 0.16] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      />
      <div
        className="absolute rounded-full flex items-center justify-center"
        style={{
          width: size * 0.48,
          height: size * 0.48,
          top: size * 0.26,
          left: size * 0.26,
          backgroundColor: color,
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.85)' }} />
      </div>
    </div>
  );
}


function AgentCard({
  agent,
  userId,
  meta,
  delay,
}: {
  agent: Agent;
  userId: string;
  meta: typeof AGENT_META[string];
  delay: number;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-2xl border overflow-hidden cursor-pointer"
      style={{
        backgroundColor: BG,
        borderColor: hovered ? `${meta.color}50` : BORDER,
        borderLeftWidth: 3,
        borderLeftColor: meta.color,
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => router.push(`/staff/agents/${agent.agent_key}?userId=${userId}`)}
    >
      <div className="p-6">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <AgentOrb color={meta.color} size={46} />
            <div>
              <p className="text-[16px] font-semibold leading-tight" style={{ color: NAVY }}>
                {agent.display_name || agent.name}
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mt-0.5" style={{ color: meta.color }}>
                {meta.role}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <motion.span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: '#059669' }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-[10px]" style={{ color: MUT }}>Active</span>
          </div>
        </div>

        {/* Tagline */}
        <p className="text-[12px] leading-relaxed mb-4" style={{ color: TER }}>
          {meta.tagline}
        </p>

        {/* Capabilities */}
        <div className="space-y-1.5">
          {meta.capabilities.map((cap, i) => (
            <div key={i} className="flex items-start gap-2">
              <Check size={11} className="mt-0.5 flex-shrink-0" style={{ color: meta.color }} />
              <span className="text-[11px]" style={{ color: SEC }}>{cap}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer CTA */}
      <div
        className="px-6 py-3 flex items-center justify-between transition-colors"
        style={{
          backgroundColor: hovered ? `${meta.color}0a` : `${meta.color}05`,
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <span className="text-[12px]" style={{ color: TER }}>Open agent workspace</span>
        <ArrowUpRight size={14} style={{ color: meta.color }} />
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AgentsPage() {
  const router     = useRouter();
  const searchParams = useSearchParams();
  const urlUserId  = searchParams.get('userId');

  const [userId,  setUserId]  = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [agents,  setAgents]  = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const [profileRes, agentList] = await Promise.all([
        getStaffProfile('clinic', uid),
        getAgentsForTenant('clinic'),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setAgents(agentList);
      setLoading(false);
    })();
  }, [urlUserId, router]);

  if (loading || !profile) return <OrbLoader />;

  const brandColor = profile.brandColor || BLUE;

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: BG }}>
      <StaffNav
        profile={profile}
        userId={userId!}
        brandColor={brandColor}
        currentPath="Agents"
      />

      <main className="px-8 py-10">
        {/* Page header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <p className="text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: MUT }}>
            Intelligence
          </p>
          <h1 className="text-[28px] font-semibold tracking-tight mb-1.5" style={{ color: NAVY }}>
            AI Agents
          </h1>
          <p className="text-[13px]" style={{ color: TER }}>
            Three specialised agents work together to run your clinic — acquisition, retention, and orchestration.
          </p>
        </motion.div>

        <div className="flex gap-8">
          {/* Left: Agent cards */}
          <div className="flex-1 min-w-0 space-y-4">
            {agents.map((agent, i) => {
              const meta = AGENT_META[agent.agent_key] ?? {
                role: 'AI Agent',
                tagline: agent.description ?? 'Intelligent AI agent.',
                color: BLUE,
                capabilities: [],
              };
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  userId={userId!}
                  meta={meta}
                  delay={i * 0.08}
                />
              );
            })}
          </div>

          {/* Right: Sidebar */}
          <div className="w-[260px] flex-shrink-0 space-y-6">

            {/* Intelligence Modules */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: MUT }}>
                Intelligence Modules
              </p>
              <div className="space-y-2">
                {MODULES.map((mod) => {
                  const Icon = mod.icon;
                  return (
                    <button
                      key={mod.key}
                      onClick={() => router.push(`${mod.href}?userId=${userId}`)}
                      className="w-full text-left rounded-xl border p-3.5 flex items-start gap-3 transition-all"
                      style={{ backgroundColor: BG, borderColor: BORDER }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = `${mod.color}40`;
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${mod.color}06`;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = BG;
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${mod.color}12` }}
                      >
                        <Icon size={15} style={{ color: mod.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium" style={{ color: NAVY }}>{mod.label}</p>
                        <p className="text-[10px] leading-relaxed mt-0.5" style={{ color: TER }}>
                          {mod.description}
                        </p>
                      </div>
                      <ChevronRight size={12} className="mt-0.5 flex-shrink-0 opacity-30" style={{ color: NAVY }} />
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* System Health */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: MUT }}>
                System Health
              </p>
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{ backgroundColor: BG, borderColor: BORDER }}
              >
                {[
                  { label: 'Agent uptime',       value: '99.9%', color: '#059669' },
                  { label: 'Avg response time',  value: '1.2s',  color: BLUE },
                  { label: 'Decisions today',    value: '47',    color: NAVY },
                  { label: 'Pending approvals',  value: '3',     color: GOLD },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-[11px]" style={{ color: TER }}>{item.label}</span>
                    <span className="text-[12px] font-semibold" style={{ color: item.color }}>{item.value}</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 10, marginTop: 4 }}>
                  <button
                    onClick={() => router.push(`/staff/judgement?userId=${userId}`)}
                    className="w-full text-[11px] text-center py-1.5 rounded-lg transition-colors"
                    style={{ color: BLUE, backgroundColor: `${BLUE}0a` }}
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = `${BLUE}15`)}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = `${BLUE}0a`)}
                  >
                    Review pending decisions
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Quick chat */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
            >
              <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: MUT }}>
                Ask the System
              </p>
              <button
                onClick={() => router.push(`/staff/chat?userId=${userId}`)}
                className="w-full rounded-xl border p-4 text-left transition-all"
                style={{ backgroundColor: BG, borderColor: BORDER }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${BLUE}40`;
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${BLUE}04`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = BG;
                }}
              >
                <p className="text-[12px] font-medium mb-1" style={{ color: NAVY }}>Chat with Aria</p>
                <p className="text-[11px]" style={{ color: TER }}>
                  Ask anything about clinic performance, patients, or operations.
                </p>
                <div className="flex items-center gap-1 mt-2.5" style={{ color: BLUE }}>
                  <span className="text-[11px] font-medium">Open chat</span>
                  <ArrowUpRight size={12} />
                </div>
              </button>
            </motion.div>

          </div>
        </div>
      </main>
    </div>
  );
}

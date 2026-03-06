'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Check, Loader2,
  Compass, Brain, Shield, FileText, TrendingUp, ShieldCheck, ListChecks, BarChart3,
  Target, Sparkles, Users, Eye, LayoutGrid, Activity, AlertTriangle, Building,
  Heart, Bell, BarChart2, Calendar, Radio, Search, BookOpen, Settings,
  Truck, Package, Calculator, GitBranch, Map, MessageSquare,
  Mail, Video, FolderOpen, CheckSquare, Palette, Wrench,
  ChevronDown, Bot,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser, generateRoleInsight,
  saveToolkitSelections, saveAgentPreferences, saveCalibration,
  completeStaffOnboarding,
  type StaffProfile, type IntelligenceMap, type ToolOption, type AgentCard,
} from '@/lib/actions/staff-onboarding';

// =============================================================================
// TYPES
// =============================================================================

type Phase = 'awakening' | 'recognition' | 'intelligence' | 'toolkit' | 'agents' | 'calibration' | 'complete';

const PHASE_LABELS: { key: Phase; label: string }[] = [
  { key: 'awakening', label: 'Contact' },
  { key: 'recognition', label: 'Recognition' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'toolkit', label: 'Toolkit' },
  { key: 'agents', label: 'Agents' },
  { key: 'calibration', label: 'Calibration' },
];

const PHASE_INDEX: Record<Phase, number> = {
  awakening: 0, recognition: 1, intelligence: 2, toolkit: 3, agents: 4, calibration: 5, complete: 6,
};

// =============================================================================
// ICON MAP
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IconMap: Record<string, React.ComponentType<any>> = {
  Compass, Brain, Shield, FileText, TrendingUp, ShieldCheck, ListChecks, BarChart3,
  Target, Sparkles, Users, Eye, LayoutGrid, Activity, AlertTriangle, Building,
  Heart, Bell, BarChart2, Calendar, Radio, Search, BookOpen, Settings,
  Truck, Package, Calculator, GitBranch, Map, MessageSquare,
  Mail, Video, FolderOpen, CheckSquare, Palette, Wrench,
  Bot, ChevronDown,
};

// =============================================================================
// BACKGROUND COMPONENTS
// =============================================================================

function NeuralGrid({ color }: { color: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none">
      <defs>
        <pattern id="staff-grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke={color} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#staff-grid)" />
    </svg>
  );
}

function PulsingOrb({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 350, height: 350, left: '20%', top: '30%',
          background: `radial-gradient(circle, ${color}20 0%, ${color}08 35%, transparent 70%)`,
          filter: 'blur(60px)',
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 200, height: 200, right: '10%', bottom: '25%',
          background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
          filter: 'blur(40px)',
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
    </div>
  );
}

function BreathingOrb({ color }: { color: string }) {
  return (
    <div className="relative w-24 h-24 mx-auto mb-12">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color}40 0%, ${color}15 50%, transparent 70%)`,
          boxShadow: `0 0 60px ${color}25, 0 0 120px ${color}10`,
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-3 rounded-full"
        style={{ background: `radial-gradient(circle, ${color}60 0%, ${color}20 70%)` }}
        animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      />
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 2.5, opacity: 0 }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeOut' }}
        className="absolute inset-0 rounded-full border"
        style={{ borderColor: `${color}30` }}
      />
    </div>
  );
}

// =============================================================================
// PHASE INDICATOR
// =============================================================================

function PhaseIndicator({ current, color }: { current: Phase; color: string }) {
  const idx = PHASE_INDEX[current];

  return (
    <div className="flex items-center gap-1.5">
      {PHASE_LABELS.map((p, i) => (
        <div key={p.key} className="flex items-center gap-1.5">
          <motion.div
            className="flex items-center gap-1.5"
            animate={{ opacity: i <= idx ? 1 : 0.3 }}
          >
            <motion.div
              className="h-1.5 rounded-full"
              style={{
                width: i === idx ? 24 : 8,
                backgroundColor: i <= idx ? color : '#96989B',
                boxShadow: i === idx ? `0 0 8px ${color}60` : 'none',
              }}
              animate={{ width: i === idx ? 24 : 8 }}
              transition={{ duration: 0.3 }}
            />
            {i === idx && (
              <motion.span
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[10px] uppercase tracking-wider font-medium"
                style={{ color }}
              >
                {p.label}
              </motion.span>
            )}
          </motion.div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// TIER BADGE
// =============================================================================

function TierBadge({ tier, color }: { tier: string; color: string }) {
  const labels: Record<string, string> = {
    organization: 'ORG',
    department: 'DEPT',
    role: 'YOU',
  };
  return (
    <span
      className="text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: tier === 'role' ? `${color}25` : `${color}10`,
        color: tier === 'role' ? color : `${color}99`,
        border: tier === 'role' ? `1px solid ${color}40` : 'none',
      }}
    >
      {labels[tier] || tier.toUpperCase()}
    </span>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function StaffOnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  // ─── Resolve user on mount ───
  useEffect(() => {
    getCurrentUser().then(r => { if (r.success && r.userId) setUserId(r.userId); });
  }, []);

  // Data
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [maps, setMaps] = useState<IntelligenceMap[]>([]);
  const [tools, setTools] = useState<ToolOption[]>([]);
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [roleInsight, setRoleInsight] = useState('');

  // Phase state
  const [phase, setPhase] = useState<Phase>('awakening');

  // Awakening animation
  const [displayText, setDisplayText] = useState('');
  const [showSubtext, setShowSubtext] = useState(false);
  const [showButton, setShowButton] = useState(false);

  // Toolkit selections
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  // Agent notification prefs
  const [agentPrefs, setAgentPrefs] = useState<Record<string, 'quiet' | 'nudge' | 'active'>>({});

  // Calibration
  const [commStyle, setCommStyle] = useState<'concise' | 'detailed' | 'balanced'>('balanced');
  const [proactivity, setProactivity] = useState<'reactive' | 'gentle' | 'proactive'>('gentle');

  // UI
  const [loading, setLoading] = useState(false);
  const [expandedTier, setExpandedTier] = useState<string | null>('organization');

  const c = profile?.brandColor || '#10b981';
  const name = profile?.aiName || 'System';

  // ─── Load profile on mount ───
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const result = await getStaffProfile('clinic', userId);
      if (result.success && result.data) {
        setProfile(result.data.profile);
        setMaps(result.data.intelligenceMaps);
        setTools(result.data.tools);
        setAgents(result.data.agents);
        // Initialize agent prefs to 'nudge' (default)
        const defaultPrefs: Record<string, 'quiet' | 'nudge' | 'active'> = {};
        result.data.agents.forEach(a => { defaultPrefs[a.id] = 'nudge'; });
        setAgentPrefs(defaultPrefs);
      }
    })();
  }, [userId]);

  // ─── Typewriter effect for awakening ───
  useEffect(() => {
    if (phase !== 'awakening' || !profile) return;
    const greeting = `Hello, ${profile.firstName}.`;
    let i = 0;
    const interval = setInterval(() => {
      setDisplayText(greeting.slice(0, i + 1));
      i++;
      if (i >= greeting.length) {
        clearInterval(interval);
        setTimeout(() => setShowSubtext(true), 600);
        setTimeout(() => setShowButton(true), 1800);
      }
    }, 70);
    return () => clearInterval(interval);
  }, [phase, profile]);

  // ─── Load role insight when entering recognition ───
  useEffect(() => {
    if (phase !== 'recognition' || !profile || roleInsight) return;
    (async () => {
      const result = await generateRoleInsight(profile);
      if (result.success && result.insight) setRoleInsight(result.insight);
    })();
  }, [phase, profile, roleInsight]);

  // ─── Tool toggle ───
  const toggleTool = (id: string) => {
    setSelectedTools(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Agent pref cycle ───
  const cycleAgentPref = (agentId: string) => {
    setAgentPrefs(prev => {
      const current = prev[agentId] || 'nudge';
      const order: Array<'quiet' | 'nudge' | 'active'> = ['quiet', 'nudge', 'active'];
      const next = order[(order.indexOf(current) + 1) % 3];
      return { ...prev, [agentId]: next };
    });
  };

  // ─── Save toolkit and advance ───
  const handleToolkitContinue = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    await saveToolkitSelections('clinic', userId, Array.from(selectedTools));
    setLoading(false);
    setPhase('agents');
  }, [userId, selectedTools]);

  // ─── Save agents and advance ───
  const handleAgentsContinue = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    await saveAgentPreferences('clinic', userId, agentPrefs);
    setLoading(false);
    setPhase('calibration');
  }, [userId, agentPrefs]);

  // ─── Complete onboarding ───
  const handleComplete = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    await saveCalibration('clinic', userId, {
      communicationStyle: commStyle,
      proactivityLevel: proactivity,
    });

    await completeStaffOnboarding('clinic', userId);
    setPhase('complete');
    setLoading(false);

    setTimeout(() => {
      router.push(`/staff/dashboard`);
    }, 4000);
  }, [userId, commStyle, proactivity, router]);

  // ─── Loading state ───
  if (!profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#F8FAFF] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-[#5A6475] text-[13px]"
        >
          Initializing...
        </motion.div>
      </div>
    );
  }

  // Group tools by category
  const toolCategories = tools.reduce<Record<string, ToolOption[]>>((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    communication: 'Communication',
    productivity: 'Productivity',
    finance: 'Finance & Accounting',
    documents: 'Documents & Knowledge',
    project: 'Project Management',
    industry: 'Industry Tools',
    analytics: 'Analytics & Reporting',
  };

  // Group maps by tier
  const mapsByTier = {
    organization: maps.filter(m => m.tier === 'organization'),
    department: maps.filter(m => m.tier === 'department'),
    role: maps.filter(m => m.tier === 'role'),
  };

  // Split agents by type
  const industryAgents = agents.filter(a => a.type === 'industry');
  const companyAgents = agents.filter(a => a.type === 'company');

  const prefLabels: Record<string, { label: string; desc: string }> = {
    quiet: { label: 'Quiet', desc: 'Only when asked' },
    nudge: { label: 'Nudge', desc: 'Gentle alerts' },
    active: { label: 'Active', desc: 'Proactive updates' },
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="min-h-screen pl-[240px] relative overflow-hidden">

      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#050505] via-black to-[#030303]" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.015] via-transparent to-transparent" />
      <NeuralGrid color={c} />
      <PulsingOrb color={c} />

      {/* ═══════ TOP BAR ═══════ */}
      <AnimatePresence>
        {phase !== 'awakening' && phase !== 'complete' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-8 py-5"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)' }}
          >
            <div className="flex items-center gap-3">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt="" className="h-6 object-contain" />
              ) : (
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-black"
                  style={{ backgroundColor: c }}
                >
                  {name.charAt(0)}
                </div>
              )}
              <span className="text-[13px] font-medium text-[#3D4451]">{name}</span>
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: c, boxShadow: `0 0 6px ${c}80` }}
              />
            </div>
            <PhaseIndicator current={phase} color={c} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════ CONTENT ═══════ */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-6 py-24">
        <AnimatePresence mode="wait">

          {/* ═══════════ PHASE 1: AWAKENING ═══════════ */}
          {phase === 'awakening' && (
            <motion.div
              key="awakening"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.6 }}
              className="text-center max-w-lg"
            >
              <BreathingOrb color={c} />

              <h1 className="text-[clamp(2rem,4vw,3.5rem)] font-light tracking-tight mb-6">
                {displayText}
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                  className="inline-block w-[2px] h-[1em] ml-1 align-middle"
                  style={{ backgroundColor: c }}
                />
              </h1>

              <AnimatePresence>
                {showSubtext && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="space-y-2 mb-12"
                  >
                    <p className="text-[15px] text-[#5A6475]">
                      I&apos;m <span style={{ color: `${c}cc` }}>{name}</span>.
                      I was built specifically for {profile.companyName}.
                    </p>
                    <p className="text-[15px] text-[#5A6475]">
                      Let me show you what I can see.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showButton && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    onClick={() => setPhase('recognition')}
                    className="px-8 py-3.5 rounded-xl font-semibold text-[14px] text-black transition-all active:scale-[0.97]"
                    style={{ backgroundColor: c, boxShadow: `0 0 20px ${c}30, 0 0 40px ${c}10` }}
                  >
                    Show me
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ═══════════ PHASE 2: RECOGNITION ═══════════ */}
          {phase === 'recognition' && (
            <motion.div
              key="recognition"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-md space-y-6"
            >
              <div className="text-center mb-8">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#5A6475] mb-2">Recognition</h2>
                <p className="text-[15px] text-[#5A6475]">I already know a bit about you.</p>
              </div>

              {/* Profile card */}
              <div className="bg-white border border-[#D4E2FF] rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-black flex-shrink-0"
                    style={{ backgroundColor: c }}
                  >
                    {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-[18px] font-semibold">{profile.firstName} {profile.lastName}</h3>
                    <p className="text-[13px] text-[#5A6475]">{profile.jobTitle || 'Team Member'}</p>
                  </div>
                </div>

                <div className="h-px bg-[#FAF9F5]" />

                <div className="grid grid-cols-2 gap-4 text-[13px]">
                  <div>
                    <p className="text-[#5A6475] mb-1">Department</p>
                    <p className="text-[#181D23]">{profile.departmentName || 'General'}</p>
                  </div>
                  {profile.reportsTo && (
                    <div>
                      <p className="text-[#5A6475] mb-1">Reports to</p>
                      <p className="text-[#181D23]">{profile.reportsTo}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[#5A6475] mb-1">Team</p>
                    <p className="text-[#181D23]">{profile.teamSize} colleague{profile.teamSize !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-[#5A6475] mb-1">Access</p>
                    <p className="text-[#181D23]">{profile.isAdmin ? 'Administrator' : 'Staff'}</p>
                  </div>
                </div>
              </div>

              {/* AI Insight */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: roleInsight ? 1 : 0.3 }}
                className="flex items-start gap-3 px-5 py-4 bg-[#F0ECFF] border-l-2 rounded-r-xl"
                style={{ borderColor: `${c}60` }}
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: c }}
                />
                <p className="text-[13px] text-[#3D4451] italic leading-relaxed">
                  {roleInsight || 'Analyzing your position...'}
                </p>
              </motion.div>

              <div className="flex gap-3">
                <button
                  onClick={() => setPhase('intelligence')}
                  className="flex-1 h-12 rounded-xl font-semibold text-[14px] text-black transition-all active:scale-[0.97]"
                  style={{ backgroundColor: c, boxShadow: `0 0 20px ${c}30, 0 0 40px ${c}10` }}
                >
                  That&apos;s me
                </button>
                <button
                  onClick={() => setPhase('intelligence')}
                  className="flex-1 h-12 rounded-xl font-semibold text-[14px] text-[#5A6475] bg-[#F8FAFF] border border-[#D4E2FF] transition-all hover:border-white/[0.15] active:scale-[0.97]"
                >
                  Something&apos;s off
                </button>
              </div>
            </motion.div>
          )}

          {/* ═══════════ PHASE 3: INTELLIGENCE MAPS ═══════════ */}
          {phase === 'intelligence' && (
            <motion.div
              key="intelligence"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-2xl space-y-6"
            >
              <div className="text-center mb-6">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#5A6475] mb-2">Intelligence Maps</h2>
                <p className="text-[15px] text-[#5A6475]">Your operational windows into {profile.companyName}</p>
              </div>

              {/* Three tiers as accordion sections */}
              {(['organization', 'department', 'role'] as const).map((tier) => {
                const tierMaps = mapsByTier[tier];
                const isExpanded = expandedTier === tier;
                const tierLabels: Record<string, { title: string; sub: string }> = {
                  organization: { title: 'Organization', sub: 'Company-wide intelligence everyone sees' },
                  department: { title: profile.departmentName || 'Department', sub: 'Focused on your department\'s operations' },
                  role: { title: 'Your Role', sub: 'Personalized to your specific position' },
                };
                const info = tierLabels[tier];

                return (
                  <motion.div
                    key={tier}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (['organization', 'department', 'role'].indexOf(tier)) * 0.15 }}
                  >
                    {/* Tier header */}
                    <button
                      onClick={() => setExpandedTier(isExpanded ? null : tier)}
                      className="w-full flex items-center justify-between px-5 py-4 rounded-xl border transition-all"
                      style={{
                        backgroundColor: isExpanded ? `${c}08` : 'rgba(0,0,0,0.02)',
                        borderColor: isExpanded ? `${c}30` : 'rgba(0,0,0,0.05)',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <TierBadge tier={tier} color={c} />
                        <div className="text-left">
                          <p className="text-[14px] font-medium text-[#181D23]">{info.title}</p>
                          <p className="text-[11px] text-[#5A6475]">{info.sub}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#5A6475]">{tierMaps.length} maps</span>
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown size={14} className="text-[#5A6475]" />
                        </motion.div>
                      </div>
                    </button>

                    {/* Expanded map cards */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 px-1">
                            {tierMaps.map((m, i) => {
                              const Icon = IconMap[m.icon] || Sparkles;
                              return (
                                <motion.div
                                  key={m.id}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.08 }}
                                  className="bg-white border border-[#D4E2FF] rounded-xl p-4 hover:bg-[#F8FAFF] hover:border-white/[0.12] transition-all"
                                >
                                  <div className="flex items-start gap-3">
                                    <div
                                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                      style={{ backgroundColor: `${c}15` }}
                                    >
                                      <Icon size={18} style={{ color: c }} />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <h4 className="text-[13px] font-semibold text-[#181D23] truncate">{m.title}</h4>
                                        {m.live && (
                                          <motion.div
                                            animate={{ opacity: [0.4, 1, 0.4] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: '#22c55e' }}
                                          />
                                        )}
                                      </div>
                                      <p className="text-[11px] text-[#5A6475] leading-relaxed">{m.description}</p>
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}

              {/* Summary */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-[12px] text-[#5A6475] text-center"
              >
                {maps.length} intelligence maps across 3 tiers — all updating in real-time
              </motion.p>

              <button
                onClick={() => setPhase('toolkit')}
                className="w-full h-12 rounded-xl font-semibold text-[14px] text-black transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                style={{ backgroundColor: c, boxShadow: `0 0 20px ${c}30, 0 0 40px ${c}10` }}
              >
                Continue <ArrowRight size={16} />
              </button>
            </motion.div>
          )}

          {/* ═══════════ PHASE 4: TOOLKIT ═══════════ */}
          {phase === 'toolkit' && (
            <motion.div
              key="toolkit"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-2xl space-y-6"
            >
              <div className="text-center mb-4">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#5A6475] mb-2">Your Toolkit</h2>
                <p className="text-[15px] text-[#5A6475]">Select the tools you use day-to-day</p>
                <p className="text-[12px] text-[#5A6475] mt-1">
                  This helps me integrate with your workflow
                </p>
              </div>

              {/* Tool categories */}
              <div className="space-y-5 max-h-[55vh] overflow-y-auto pr-2 scrollbar-thin">
                {Object.entries(toolCategories).map(([cat, catTools]) => (
                  <div key={cat}>
                    <p className="text-[11px] uppercase tracking-wider text-[#5A6475] mb-2.5 px-1">
                      {categoryLabels[cat] || cat}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {catTools.map((tool) => {
                        const selected = selectedTools.has(tool.id);
                        const Icon = IconMap[tool.icon] || Sparkles;
                        return (
                          <motion.button
                            key={tool.id}
                            onClick={() => toggleTool(tool.id)}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all border"
                            style={{
                              backgroundColor: selected ? `${c}15` : 'rgba(0,0,0,0.02)',
                              borderColor: selected ? `${c}50` : 'rgba(0,0,0,0.06)',
                              color: selected ? c : '#5A6475',
                            }}
                          >
                            <Icon size={14} style={{ opacity: selected ? 1 : 0.5 }} />
                            {tool.name}
                            {selected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 400 }}
                              >
                                <Check size={12} />
                              </motion.div>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Counter */}
              <div className="flex items-center justify-between px-1">
                <p className="text-[12px] text-[#5A6475]">
                  {selectedTools.size} tool{selectedTools.size !== 1 ? 's' : ''} selected
                </p>
                {selectedTools.size === 0 && (
                  <p className="text-[12px] text-[#96989B] italic">Select at least a few to continue</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleToolkitContinue}
                  disabled={loading || selectedTools.size === 0}
                  className="flex-1 h-12 rounded-xl font-semibold text-[14px] text-black transition-all disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.97]"
                  style={{ backgroundColor: c, boxShadow: `0 0 20px ${c}30, 0 0 40px ${c}10` }}
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <>Continue <ArrowRight size={16} /></>}
                </button>
                <button
                  onClick={() => { setPhase('agents'); }}
                  className="px-6 h-12 rounded-xl text-[13px] text-[#5A6475] bg-white border border-[#D4E2FF] hover:border-white/[0.12] transition-all"
                >
                  Skip
                </button>
              </div>
            </motion.div>
          )}

          {/* ═══════════ PHASE 5: AI AGENTS ═══════════ */}
          {phase === 'agents' && (
            <motion.div
              key="agents"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-2xl space-y-6"
            >
              <div className="text-center mb-4">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#5A6475] mb-2">Your AI Agents</h2>
                <p className="text-[15px] text-[#5A6475]">
                  {agents.length} agents working for {profile.companyName}
                </p>
                <p className="text-[12px] text-[#5A6475] mt-1">
                  Set how each agent communicates with you
                </p>
              </div>

              {/* Industry Agents */}
              {industryAgents.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#5A6475] mb-3 px-1 flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest" style={{ backgroundColor: `${c}15`, color: `${c}99` }}>
                      SHARED
                    </span>
                    Industry Intelligence
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {industryAgents.map((agent, i) => {
                      const Icon = IconMap[agent.icon] || Bot;
                      const pref = agentPrefs[agent.id] || 'nudge';
                      return (
                        <motion.div
                          key={agent.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="bg-white border border-[#D4E2FF] rounded-xl p-5 space-y-4 hover:border-white/[0.12] transition-all"
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${c}15` }}
                            >
                              <Icon size={20} style={{ color: c }} />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-[14px] font-semibold text-[#181D23]">{agent.name}</h4>
                              {agent.badge && (
                                <span className="text-[10px] text-[#5A6475]">{agent.badge}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-[12px] text-[#5A6475] leading-relaxed">{agent.description}</p>

                          {/* Notification toggle */}
                          <div className="flex gap-1.5">
                            {(['quiet', 'nudge', 'active'] as const).map((level) => (
                              <button
                                key={level}
                                onClick={() => cycleAgentPref(agent.id)}
                                className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all border"
                                style={{
                                  backgroundColor: pref === level ? `${c}15` : 'transparent',
                                  borderColor: pref === level ? `${c}40` : 'rgba(0,0,0,0.05)',
                                  color: pref === level ? c : '#5A6475',
                                }}
                                title={prefLabels[level].desc}
                              >
                                {prefLabels[level].label}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Company Agents */}
              {companyAgents.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#5A6475] mb-3 px-1 flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest" style={{ backgroundColor: `${c}25`, color: c, border: `1px solid ${c}40` }}>
                      CUSTOM
                    </span>
                    Built for {profile.companyName}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {companyAgents.map((agent, i) => {
                      const Icon = IconMap[agent.icon] || Bot;
                      const pref = agentPrefs[agent.id] || 'nudge';
                      return (
                        <motion.div
                          key={agent.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: (industryAgents.length + i) * 0.1 }}
                          className="bg-white border rounded-xl p-5 space-y-4 transition-all"
                          style={{ borderColor: `${c}15` }}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 relative"
                              style={{ backgroundColor: `${c}20` }}
                            >
                              <Icon size={20} style={{ color: c }} />
                              {/* Custom badge glow */}
                              <motion.div
                                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                                style={{ backgroundColor: c }}
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                              />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-[14px] font-semibold text-[#181D23]">{agent.name}</h4>
                              <span className="text-[10px]" style={{ color: `${c}80` }}>Custom Agent</span>
                            </div>
                          </div>
                          <p className="text-[12px] text-[#5A6475] leading-relaxed">{agent.description}</p>

                          <div className="flex gap-1.5">
                            {(['quiet', 'nudge', 'active'] as const).map((level) => (
                              <button
                                key={level}
                                onClick={() => cycleAgentPref(agent.id)}
                                className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all border"
                                style={{
                                  backgroundColor: pref === level ? `${c}15` : 'transparent',
                                  borderColor: pref === level ? `${c}40` : 'rgba(0,0,0,0.05)',
                                  color: pref === level ? c : '#5A6475',
                                }}
                                title={prefLabels[level].desc}
                              >
                                {prefLabels[level].label}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI note */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-start gap-3 px-5 py-4 bg-[#F0ECFF] border-l-2 rounded-r-xl"
                style={{ borderColor: `${c}60` }}
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: c }}
                />
                <p className="text-[12px] text-[#5A6475] leading-relaxed">
                  These agents run continuously in the background. You can change their notification levels anytime from your dashboard.
                </p>
              </motion.div>

              <button
                onClick={handleAgentsContinue}
                disabled={loading}
                className="w-full h-12 rounded-xl font-semibold text-[14px] text-black transition-all flex items-center justify-center gap-2 active:scale-[0.97]"
                style={{ backgroundColor: c, boxShadow: `0 0 20px ${c}30, 0 0 40px ${c}10` }}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <>Continue <ArrowRight size={16} /></>}
              </button>
            </motion.div>
          )}

          {/* ═══════════ PHASE 6: CALIBRATION ═══════════ */}
          {phase === 'calibration' && (
            <motion.div
              key="calibration"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-md space-y-8"
            >
              <div className="text-center">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#5A6475] mb-2">Calibration</h2>
                <p className="text-[15px] text-[#5A6475]">Last step — how should I talk to you?</p>
              </div>

              {/* Communication Style */}
              <div className="space-y-3">
                <p className="text-[13px] text-[#3D4451]">When I brief you, how much context do you want?</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'concise' as const, label: 'Concise', desc: 'Just the facts' },
                    { key: 'balanced' as const, label: 'Balanced', desc: 'Key context included' },
                    { key: 'detailed' as const, label: 'Detailed', desc: 'Full analysis' },
                  ]).map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => setCommStyle(key)}
                      className="py-3 rounded-xl text-center transition-all border"
                      style={{
                        backgroundColor: commStyle === key ? `${c}15` : 'rgba(0,0,0,0.02)',
                        borderColor: commStyle === key ? `${c}50` : 'rgba(0,0,0,0.06)',
                      }}
                    >
                      <p className="text-[13px] font-medium" style={{ color: commStyle === key ? c : '#5A6475' }}>
                        {label}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: commStyle === key ? `${c}80` : '#96989B' }}>
                        {desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Proactivity Level */}
              <div className="space-y-3">
                <p className="text-[13px] text-[#3D4451]">Should I flag things I notice, or wait until you ask?</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'reactive' as const, label: 'Wait', desc: 'I\'ll be quiet' },
                    { key: 'gentle' as const, label: 'Nudges', desc: 'Gentle prompts' },
                    { key: 'proactive' as const, label: 'Proactive', desc: 'Flag everything' },
                  ]).map(({ key, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => setProactivity(key)}
                      className="py-3 rounded-xl text-center transition-all border"
                      style={{
                        backgroundColor: proactivity === key ? `${c}15` : 'rgba(0,0,0,0.02)',
                        borderColor: proactivity === key ? `${c}50` : 'rgba(0,0,0,0.06)',
                      }}
                    >
                      <p className="text-[13px] font-medium" style={{ color: proactivity === key ? c : '#5A6475' }}>
                        {label}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: proactivity === key ? `${c}80` : '#96989B' }}>
                        {desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Summary */}
              <motion.div
                className="flex items-start gap-3 px-5 py-4 bg-[#F0ECFF] border-l-2 rounded-r-xl"
                style={{ borderColor: `${c}60` }}
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: c }}
                />
                <p className="text-[13px] text-[#5A6475] leading-relaxed">
                  I&apos;ll keep it <span className="text-[#3D4451]">{commStyle}</span> and be{' '}
                  <span className="text-[#3D4451]">
                    {proactivity === 'reactive' ? 'silent until you ask' : proactivity === 'gentle' ? 'gently nudging when something matters' : 'proactively flagging everything I spot'}
                  </span>. You can change this anytime.
                </p>
              </motion.div>

              <button
                onClick={handleComplete}
                disabled={loading}
                className="w-full h-12 rounded-xl font-semibold text-[14px] text-black transition-all flex items-center justify-center gap-2 active:scale-[0.97]"
                style={{ backgroundColor: c, boxShadow: `0 0 20px ${c}30, 0 0 40px ${c}10` }}
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>Launch {name} <ArrowRight size={16} /></>
                )}
              </button>
            </motion.div>
          )}

          {/* ═══════════ PHASE 7: COMPLETE ═══════════ */}
          {phase === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="text-center max-w-md"
            >
              {/* Animated check */}
              <div className="relative w-20 h-20 mx-auto mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 18 }}
                  className="absolute inset-0 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: c, boxShadow: `0 0 20px ${c}40, 0 0 40px ${c}15` }}
                >
                  <Check size={32} style={{ color: c }} />
                </motion.div>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0.5 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{ delay: 0.2, duration: 1.2, ease: 'easeOut' }}
                  className="absolute inset-0 rounded-full"
                  style={{ border: `1px solid ${c}` }}
                />
              </div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-[22px] font-light mb-3"
              >
                You&apos;re all set, {profile.firstName}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-[14px] text-[#5A6475] mb-2"
              >
                {maps.length} intelligence maps loaded
              </motion.p>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="text-[14px] text-[#5A6475] mb-1"
              >
                {selectedTools.size} tools integrated &middot; {agents.length} agents online
              </motion.p>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-[13px] text-[#5A6475] mt-4"
              >
                Initializing your workspace...
              </motion.p>

              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.4, duration: 3, ease: [0.22, 1, 0.36, 1] }}
                className="h-[2px] rounded-full mx-auto mt-8 max-w-[200px] origin-left"
                style={{ backgroundColor: c, boxShadow: `0 0 8px ${c}50, 0 0 20px ${c}20` }}
              />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

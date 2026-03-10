'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { JweblyIcon } from '@/components/jwebly-logo';
import { BRAND } from '@/lib/config/brand';
import { savePhase2 } from '@/lib/actions/platform/onboard';
import {
  Brain, TrendingUp, Heart, Megaphone, Phone,
  Check, Sparkles, Zap, ChevronRight, Edit3,
} from 'lucide-react';

const BG = '#F7F6F3';
const INK = '#18181B';
const MUTED = '#A1A1AA';
const BORDER = '#E4E4E7';

interface Agent {
  role: string;
  defaultName: string;
  accent: string;
  Icon: React.ElementType;
  tagline: string;
  capabilities: string[];
}

const AGENTS: Agent[] = [
  {
    role: 'primary_orchestrator',
    defaultName: 'Aria',
    accent: '#0058E6',
    Icon: Brain,
    tagline: 'Command intelligence across all departments',
    capabilities: ['Coordinates all agents', 'Real-time decisions', 'Strategic oversight', 'Full clinic intelligence'],
  },
  {
    role: 'patient_acquisition',
    defaultName: 'Orion',
    accent: '#D8A600',
    Icon: TrendingUp,
    tagline: 'Convert enquiries into committed patients',
    capabilities: ['Lead qualification', 'Objection handling', 'Booking conversion', 'Follow-up sequences'],
  },
  {
    role: 'patient_retention',
    defaultName: 'Luna',
    accent: '#00A693',
    Icon: Heart,
    tagline: 'Keep every patient engaged and loyal',
    capabilities: ['Re-engagement campaigns', 'Treatment reminders', 'Loyalty tracking', 'Churn prevention'],
  },
  {
    role: 'social_media',
    defaultName: 'Sage',
    accent: '#7C3AED',
    Icon: Megaphone,
    tagline: 'Grow your brand presence automatically',
    capabilities: ['Content generation', 'Reputation monitoring', 'Review responses', 'Campaign insights'],
  },
  {
    role: 'receptionist',
    defaultName: 'Komal',
    accent: '#0891B2',
    Icon: Phone,
    tagline: 'Answer every call, every time, perfectly',
    capabilities: ['24/7 call handling', 'Intelligent booking', 'Patient recognition', 'Instant escalation'],
  },
];

interface Props {
  sessionId: string;
  tenantName: string;
  completedPhases: number[];
}

export default function AgentOnboardClient({ tenantName, completedPhases }: Props) {
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(AGENTS.map(a => [a.role, a.defaultName]))
  );
  const [revealed, setRevealed] = useState<number>(-1);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [allOnline, setAllOnline] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Staggered agent reveal
  useEffect(() => {
    let i = 0;
    const advance = () => {
      if (i < AGENTS.length) {
        setRevealed(i);
        i++;
        setTimeout(advance, 420);
      } else {
        setTimeout(() => setAllOnline(true), 400);
      }
    };
    const t = setTimeout(advance, 600);
    return () => clearTimeout(t);
  }, []);

  const handleNameChange = (role: string, val: string) => {
    setNames(prev => ({ ...prev, [role]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    const agents = AGENTS.map(a => ({ role: a.role, display_name: names[a.role] || a.defaultName }));
    const res = await savePhase2({ agents });
    if (!res.success) {
      setSaving(false);
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/onboard/3'), 2600);
  };

  return (
    <div style={{ background: BG, minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Dot grid */}
      <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.35 }}>
        <defs>
          <pattern id="ag-dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#A1A1AA" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ag-dots)" />
      </svg>

      {/* Ambient bloom */}
      <div style={{ position: 'fixed', top: '-10%', right: '-5%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, #22D3EE18 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '-15%', left: '-8%', width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle, #0058E618 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Top bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, borderBottom: `1px solid ${BORDER}`, backdropFilter: 'blur(12px)', background: `${BG}F0`, padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <JweblyIcon size={28} uid="ag2-nav" />
          <span style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{BRAND.platform}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} style={{
              width: n === 2 ? 24 : 8, height: 8, borderRadius: 4,
              background: completedPhases.includes(n) ? '#059669' : n === 2 ? BRAND.accent : BORDER,
              transition: 'all 0.3s',
            }} />
          ))}
        </div>
      </div>

      {/* Main */}
      <div style={{ paddingTop: 100, paddingBottom: 80, maxWidth: 900, margin: '0 auto', padding: '100px 24px 80px' }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: 'center', marginBottom: 56 }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `${BRAND.accentLight}18`, border: `1px solid ${BRAND.accentLight}40`, borderRadius: 20, padding: '6px 14px', marginBottom: 20 }}>
            <Sparkles size={12} color={BRAND.accent} />
            <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.accent, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Phase 2 — Agent Setup</span>
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: INK, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 0 12px' }}>
            Meet your AI team
          </h1>
          <p style={{ fontSize: 15, color: MUTED, maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            Five specialist agents, each with a unique intelligence. Give them names — they&apos;ll carry those names in every interaction with your clinic.
          </p>
        </motion.div>

        {/* Agent cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 48 }}>
          {AGENTS.map((agent, i) => {
            const isVisible = revealed >= i;
            const isOnline = allOnline || revealed > i;
            const name = names[agent.role] || agent.defaultName;
            const isEditing = editingRole === agent.role;
            const { Icon } = agent;

            return (
              <AnimatePresence key={agent.role}>
                {isVisible && (
                  <motion.div
                    initial={{ opacity: 0, x: -32, scale: 0.97 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.05 }}
                    style={{
                      background: '#FFFFFF',
                      border: `1.5px solid ${isOnline ? agent.accent + '40' : BORDER}`,
                      borderRadius: 16,
                      padding: '20px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 20,
                      transition: 'border-color 0.5s, box-shadow 0.5s',
                      boxShadow: isOnline ? `0 0 0 1px ${agent.accent}10, 0 4px 24px ${agent.accent}10` : '0 1px 4px rgba(0,0,0,0.04)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Left accent strip */}
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: isOnline ? '70%' : 0 }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                      style={{ position: 'absolute', left: 0, top: '15%', width: 3, borderRadius: '0 2px 2px 0', background: agent.accent }}
                    />

                    {/* Agent icon */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <motion.div
                        animate={isOnline ? { boxShadow: [`0 0 0 0px ${agent.accent}30`, `0 0 0 8px ${agent.accent}00`] } : {}}
                        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                        style={{
                          width: 52, height: 52, borderRadius: 14,
                          background: `${agent.accent}14`,
                          border: `1.5px solid ${agent.accent}30`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Icon size={22} color={agent.accent} strokeWidth={1.8} />
                      </motion.div>
                      {/* Online dot */}
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={isOnline ? { scale: 1, opacity: 1 } : {}}
                        transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
                        style={{
                          position: 'absolute', bottom: -3, right: -3,
                          width: 12, height: 12, borderRadius: '50%',
                          background: '#059669', border: '2px solid #FFFFFF',
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                        {isOnline ? (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#05966914', border: '1px solid #05966930', borderRadius: 20, padding: '2px 8px' }}
                          >
                            <Zap size={9} color="#059669" />
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Online</span>
                          </motion.div>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${MUTED}14`, border: `1px solid ${MUTED}30`, borderRadius: 20, padding: '2px 8px' }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Initialising</span>
                          </div>
                        )}
                        <span style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                          {agent.role.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <p style={{ fontSize: 12, color: '#5A6475', margin: '0 0 8px', lineHeight: 1.4 }}>{agent.tagline}</p>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {agent.capabilities.map(c => (
                          <span key={c} style={{ fontSize: 10, color: MUTED, background: `${BORDER}80`, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '2px 7px', fontWeight: 500 }}>{c}</span>
                        ))}
                      </div>
                    </div>

                    {/* Name field */}
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <span style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Name</span>
                      {isEditing ? (
                        <input
                          ref={el => { inputRefs.current[agent.role] = el; }}
                          value={name}
                          onChange={e => handleNameChange(agent.role, e.target.value)}
                          onBlur={() => setEditingRole(null)}
                          onKeyDown={e => { if (e.key === 'Enter') setEditingRole(null); }}
                          style={{
                            fontSize: 18, fontWeight: 800, color: agent.accent,
                            letterSpacing: '-0.02em', border: 'none', borderBottom: `2px solid ${agent.accent}`,
                            background: 'transparent', outline: 'none', textAlign: 'right',
                            width: 120, padding: '2px 0',
                          }}
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => { if (isOnline) setEditingRole(agent.role); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'none', border: 'none', cursor: isOnline ? 'pointer' : 'default',
                            padding: 0,
                          }}
                        >
                          <span style={{ fontSize: 22, fontWeight: 900, color: isOnline ? agent.accent : MUTED, letterSpacing: '-0.03em', transition: 'color 0.4s' }}>{name}</span>
                          {isOnline && <Edit3 size={12} color={MUTED} />}
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            );
          })}
        </div>

        {/* CTA */}
        <AnimatePresence>
          {allOnline && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{ textAlign: 'center' }}
            >
              <p style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>
                All 5 agents online — click any name to customise it, then activate your team.
              </p>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: INK, color: BG, border: 'none', borderRadius: 12,
                  padding: '14px 32px', fontSize: 14, fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  letterSpacing: '-0.01em', transition: 'opacity 0.2s',
                }}
              >
                {saving ? 'Activating agents…' : 'Activate my team'}
                {!saving && <ChevronRight size={16} />}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Phase complete overlay */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: BG, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: '#05966918', border: '2px solid #05966940',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Check size={32} color="#059669" strokeWidth={2.5} />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: INK, letterSpacing: '-0.03em', marginBottom: 6 }}>Phase 2 complete</div>
              <div style={{ fontSize: 14, color: MUTED }}>Your agents are named and ready</div>
              <div style={{ fontSize: 13, color: BRAND.accent, marginTop: 6, fontWeight: 600 }}>Next up: build your team</div>
            </motion.div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} style={{ width: n <= 2 ? 20 : 8, height: 8, borderRadius: 4, background: n <= 2 ? '#059669' : BORDER, transition: 'all 0.3s' }} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

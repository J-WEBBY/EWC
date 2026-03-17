'use client';

// =============================================================================
// Guardrails — Rules injected into every AI agent interaction
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Trash2, ToggleLeft, ToggleRight, X, AlertTriangle,
  CheckCircle, MessageSquare, Ban, Info, Volume2, Lock, ChevronRight,
} from 'lucide-react';
import { getStaffProfile } from '@/lib/actions/staff-onboarding';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getGuardrails,
  createGuardrail,
  deleteGuardrail,
  toggleGuardrail,
} from '@/lib/actions/guardrails';
import type { Guardrail, GuardrailRuleType, GuardrailAppliesTo } from '@/lib/actions/guardrails';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const RED    = '#DC2626';
const ORANGE = '#EA580C';
const PURPLE = '#7C3AED';
const GOLD   = '#D8A600';

// =============================================================================
// TYPE CONFIG
// =============================================================================

const RULE_TYPE_CONFIG: Record<GuardrailRuleType, {
  label: string;
  color: string;
  Icon: React.ElementType;
  description: string;
}> = {
  never_say:           { label: 'Never Say',           color: RED,    Icon: Ban,          description: 'The agent must never say this' },
  always_say:          { label: 'Always Say',           color: GREEN,  Icon: CheckCircle,  description: 'The agent must always include this' },
  topic_block:         { label: 'Topic Block',          color: ORANGE, Icon: AlertTriangle, description: 'Block this topic entirely' },
  required_disclaimer: { label: 'Required Disclaimer',  color: BLUE,   Icon: Info,         description: 'Must include this disclaimer' },
  tone_rule:           { label: 'Tone Rule',             color: PURPLE, Icon: Volume2,      description: 'Governs agent tone and manner' },
  compliance_rule:     { label: 'Compliance Rule',       color: GOLD,   Icon: Lock,         description: 'Regulatory or clinical compliance' },
};

const APPLIES_TO_LABELS: Record<GuardrailAppliesTo, string> = {
  all:           'All Agents',
  primary_agent: 'EWC',
  sales_agent:   'Orion',
  crm_agent:     'Aria',
};

const RULE_TYPE_FILTERS: Array<{ key: GuardrailRuleType | 'all'; label: string }> = [
  { key: 'all',                label: 'All' },
  { key: 'never_say',          label: 'Never Say' },
  { key: 'topic_block',        label: 'Topic Block' },
  { key: 'required_disclaimer',label: 'Required Disclaimer' },
  { key: 'tone_rule',          label: 'Tone Rule' },
  { key: 'compliance_rule',    label: 'Compliance' },
  { key: 'always_say',         label: 'Always Say' },
];

const FALLBACK_PROFILE: StaffProfile = {
  userId: '', firstName: 'Staff', lastName: '', email: '',
  jobTitle: null, departmentName: null, departmentId: null,
  roleName: null, isAdmin: false, isOwner: false,
  companyName: 'Edgbaston Wellness Clinic',
  aiName: 'Aria', brandColor: BLUE, logoUrl: null,
  industry: null, reportsTo: null, teamSize: 0,
};

// =============================================================================
// GUARDRAIL CARD
// =============================================================================

function GuardrailCard({
  rule,
  onDelete,
  onToggle,
}: {
  rule: Guardrail;
  onDelete: (id: string) => void;
  onToggle: (id: string, val: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cfg = RULE_TYPE_CONFIG[rule.rule_type];
  const { Icon: TypeIcon } = cfg;
  const appliesLabel = APPLIES_TO_LABELS[rule.applies_to as GuardrailAppliesTo] ?? rule.applies_to;

  async function handleToggle() {
    setToggling(true);
    await onToggle(rule.id, !rule.is_active);
    setToggling(false);
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await deleteGuardrail(rule.id);
    onDelete(rule.id);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: rule.is_active ? 1 : 0.55, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={{
        border: `1px solid ${hovered && rule.is_active ? cfg.color + '40' : BORDER}`,
        borderRadius: 14,
        padding: '16px 20px',
        background: !rule.is_active ? `${MUTED}05` : hovered ? `${cfg.color}04` : 'transparent',
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
      }}
    >
      {/* Left color strip */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: rule.is_active ? cfg.color : 'transparent',
        borderRadius: '3px 0 0 3px',
        transition: 'background 0.2s',
      }} />

      {/* Icon */}
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        background: `${cfg.color}12`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: rule.is_active ? 1 : 0.5,
      }}>
        <TypeIcon size={15} color={cfg.color} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          {/* Type badge */}
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
            background: `${cfg.color}12`, color: cfg.color,
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            {cfg.label}
          </span>
          {/* Applies to (only if not 'all') */}
          {rule.applies_to !== 'all' && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
              background: `${BLUE}08`, color: BLUE,
            }}>
              {appliesLabel}
            </span>
          )}
          {!rule.is_active && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
              background: `${MUTED}10`, color: MUTED,
            }}>
              Inactive
            </span>
          )}
        </div>

        <p style={{ fontSize: 13, fontWeight: 700, color: rule.is_active ? NAVY : MUTED, letterSpacing: '-0.015em', margin: '0 0 4px' }}>
          {rule.title}
        </p>
        <p style={{ fontSize: 12, color: rule.is_active ? SEC : MUTED, lineHeight: 1.55, margin: 0 }}>
          {rule.content}
        </p>
      </div>

      {/* Right: toggle + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Toggle */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          title={rule.is_active ? 'Deactivate' : 'Activate'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: rule.is_active ? GREEN : MUTED, opacity: toggling ? 0.5 : 1 }}
        >
          {rule.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
        </button>

        {/* Delete (hover reveal) */}
        <AnimatePresence>
          {hovered && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={handleDelete}
              disabled={deleting}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                background: confirmDelete ? RED : `${RED}10`,
                color: confirmDelete ? '#fff' : RED,
                border: `1px solid ${confirmDelete ? RED : RED + '30'}`,
                fontSize: 10, fontWeight: 700,
                transition: 'all 0.2s',
              }}
            >
              <Trash2 size={10} />
              {deleting ? 'Removing…' : confirmDelete ? 'Confirm' : 'Delete'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// =============================================================================
// ADD RULE MODAL
// =============================================================================

function AddRuleModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (rule: Guardrail) => void;
}) {
  const [title, setTitle] = useState('');
  const [ruleType, setRuleType] = useState<GuardrailRuleType>('never_say');
  const [appliesTo, setAppliesTo] = useState<GuardrailAppliesTo>('all');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Title is required'); return; }
    if (!content.trim()) { setError('Rule content is required'); return; }

    setSubmitting(true);
    const result = await createGuardrail({ title, rule_type: ruleType, applies_to: appliesTo, content, priority, is_active: isActive });
    setSubmitting(false);

    if (result.success && result.id) {
      const newRule: Guardrail = {
        id: result.id,
        tenant_id: '',
        title: title.trim(),
        rule_type: ruleType,
        applies_to: appliesTo,
        content: content.trim(),
        priority,
        is_active: isActive,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onSuccess(newRule);
      onClose();
    } else {
      setError(result.error ?? 'Failed to create rule');
    }
  }

  const selectedCfg = RULE_TYPE_CONFIG[ruleType];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(24,29,35,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        style={{
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 20, width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED, marginBottom: 4 }}>Guardrails</p>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: NAVY, letterSpacing: '-0.03em', margin: 0 }}>Add Rule</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
              Title <span style={{ color: RED }}>*</span>
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. No medical diagnoses"
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: 'transparent',
                fontSize: 13, color: NAVY, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Rule Type */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
              Rule Type
            </label>
            <select
              value={ruleType}
              onChange={e => setRuleType(e.target.value as GuardrailRuleType)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: BG,
                fontSize: 13, color: NAVY, outline: 'none', boxSizing: 'border-box',
              }}
            >
              {(Object.keys(RULE_TYPE_CONFIG) as GuardrailRuleType[]).map(k => (
                <option key={k} value={k}>{RULE_TYPE_CONFIG[k].label}</option>
              ))}
            </select>
            {ruleType && (
              <p style={{ fontSize: 11, color: TER, marginTop: 5, margin: '5px 0 0' }}>
                {selectedCfg.description}
              </p>
            )}
          </div>

          {/* Applies To */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
              Applies To
            </label>
            <select
              value={appliesTo}
              onChange={e => setAppliesTo(e.target.value as GuardrailAppliesTo)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: BG,
                fontSize: 13, color: NAVY, outline: 'none', boxSizing: 'border-box',
              }}
            >
              <option value="all">All Agents</option>
              <option value="primary_agent">EWC (primary_agent)</option>
              <option value="sales_agent">Orion (sales_agent)</option>
              <option value="crm_agent">Aria (crm_agent)</option>
            </select>
          </div>

          {/* Content */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
              Rule Content <span style={{ color: RED }}>*</span>
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>— the actual instruction the AI will follow</span>
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              placeholder="Write the exact instruction the agent must follow…"
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: 'transparent',
                fontSize: 13, color: NAVY, outline: 'none', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.6,
              }}
            />
          </div>

          {/* Priority + Active row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
                Priority (0–100)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={priority}
                onChange={e => setPriority(Number(e.target.value))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${BORDER}`, background: 'transparent',
                  fontSize: 13, color: NAVY, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
                Active
              </label>
              <button
                type="button"
                onClick={() => setIsActive(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                  background: isActive ? `${GREEN}10` : `${MUTED}08`,
                  border: `1px solid ${isActive ? GREEN + '30' : BORDER}`,
                  color: isActive ? GREEN : MUTED, fontSize: 12, fontWeight: 700,
                  width: '100%', transition: 'all 0.2s',
                }}
              >
                {isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                {isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: `${RED}08`, border: `1px solid ${RED}25`, color: RED, fontSize: 12, fontWeight: 600 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${BORDER}`,
                fontSize: 13, fontWeight: 600, color: TER,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 22px', borderRadius: 8, cursor: submitting ? 'wait' : 'pointer',
                background: submitting ? `${BLUE}60` : BLUE,
                border: 'none', fontSize: 13, fontWeight: 700, color: '#fff',
                transition: 'all 0.2s',
              }}
            >
              <Shield size={13} />
              {submitting ? 'Adding…' : 'Add Rule'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function GuardrailsPage() {
  const params = useSearchParams();
  const userId  = params.get('userId') ?? '';
  const tenantId = params.get('tenantId') ?? '';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [rules, setRules] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<GuardrailRuleType | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [profileRes, rulesData] = await Promise.all([
      getStaffProfile(tenantId || 'clinic', userId),
      getGuardrails(),
    ]);

    if (profileRes.success && profileRes.data) {
      setProfile(profileRes.data.profile);
    } else {
      setProfile(FALLBACK_PROFILE);
    }

    setRules(rulesData);
    setLoading(false);
  }, [userId, tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  function handleDeleteRule(id: string) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  async function handleToggleRule(id: string, is_active: boolean) {
    await toggleGuardrail(id, is_active);
    setRules(prev => prev.map(r => r.id === id ? { ...r, is_active } : r));
  }

  function handleAddRule(rule: Guardrail) {
    setRules(prev => [rule, ...prev]);
  }

  const accentColor = profile?.brandColor ?? BLUE;

  // Stat counts
  const activeCount      = rules.filter(r => r.is_active).length;
  const neverSayCount    = rules.filter(r => r.rule_type === 'never_say').length;
  const disclaimerCount  = rules.filter(r => r.rule_type === 'required_disclaimer').length;
  const topicBlockCount  = rules.filter(r => r.rule_type === 'topic_block').length;

  // Filtered rules
  const filteredRules = activeFilter === 'all'
    ? rules
    : rules.filter(r => r.rule_type === activeFilter);

  if (loading) return <OrbLoader />;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG }}>
      {profile && (
        <StaffNav
          profile={profile}
          userId={userId}
          brandColor={accentColor}
          currentPath="Guardrails"
        />
      )}

      <main style={{ paddingLeft: 'var(--nav-w, 240px)', minHeight: '100vh' }}>

        {/* ── Header ── */}
        <div style={{ padding: '40px 40px 28px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED, marginBottom: 6 }}>
              Intelligence
            </p>
            <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: NAVY, lineHeight: 1, margin: 0 }}>
              Guardrails
            </h1>
            <p style={{ fontSize: 13, color: SEC, marginTop: 8, margin: '8px 0 0' }}>
              Rules injected into every AI interaction
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10,
              background: BLUE, color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Plus size={14} />
            Add Rule
          </button>
        </div>

        {/* ── Stat bar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${BORDER}` }}>
          {[
            { label: 'Active Rules',          value: activeCount,     color: GREEN },
            { label: 'Never Say',              value: neverSayCount,   color: RED },
            { label: 'Required Disclaimers',   value: disclaimerCount, color: BLUE },
            { label: 'Topic Blocks',           value: topicBlockCount, color: ORANGE },
          ].map((t, i) => (
            <div key={t.label} style={{
              padding: '20px 28px',
              borderRight: i < 3 ? `1px solid ${BORDER}` : 'none',
            }}>
              <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED, marginBottom: 4 }}>{t.label}</p>
              <p style={{ fontSize: 36, fontWeight: 900, color: t.color, letterSpacing: '-0.04em', margin: 0 }}>{t.value}</p>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ── */}
        <div style={{ display: 'flex', gap: 4, padding: '16px 40px', borderBottom: `1px solid ${BORDER}`, overflowX: 'auto' }}>
          {RULE_TYPE_FILTERS.map(f => {
            const isActive = activeFilter === f.key;
            const cfg = f.key !== 'all' ? RULE_TYPE_CONFIG[f.key as GuardrailRuleType] : null;
            const count = f.key === 'all' ? rules.length : rules.filter(r => r.rule_type === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key as GuardrailRuleType | 'all')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                  background: isActive ? (cfg ? `${cfg.color}12` : `${BLUE}10`) : 'transparent',
                  border: `1px solid ${isActive ? (cfg?.color ?? BLUE) + '40' : BORDER}`,
                  color: isActive ? (cfg?.color ?? BLUE) : MUTED,
                  fontSize: 11, fontWeight: isActive ? 700 : 500,
                  transition: 'all 0.15s', flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {f.label}
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  background: isActive ? (cfg ? cfg.color : BLUE) : MUTED,
                  color: '#fff',
                  borderRadius: '999px', padding: '1px 5px', lineHeight: 1.4,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Rules list ── */}
        <div style={{ padding: '28px 40px' }}>
          {filteredRules.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ textAlign: 'center', padding: '80px 0' }}
            >
              <Shield size={32} style={{ color: BORDER, margin: '0 auto 16px', display: 'block' }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
                {activeFilter === 'all' ? 'No guardrails yet' : `No ${RULE_TYPE_CONFIG[activeFilter as GuardrailRuleType]?.label ?? activeFilter} rules`}
              </p>
              <p style={{ fontSize: 12, color: MUTED, marginBottom: 20 }}>
                Add your first rule to guide agent behaviour.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 22px', borderRadius: 10,
                  background: BLUE, color: '#fff', border: 'none',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                Add Rule
              </button>
            </motion.div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED }}>
                  {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Shield size={11} color={GREEN} />
                  <span style={{ fontSize: 10, color: TER }}>
                    {activeCount} active · injected into all AI interactions
                  </span>
                  <ChevronRight size={10} color={MUTED} />
                </div>
              </div>
              <AnimatePresence>
                {filteredRules.map(rule => (
                  <GuardrailCard
                    key={rule.id}
                    rule={rule}
                    onDelete={handleDeleteRule}
                    onToggle={handleToggleRule}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Add Rule Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddRuleModal
            onClose={() => setShowAddModal(false)}
            onSuccess={handleAddRule}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

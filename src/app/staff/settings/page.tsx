'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Settings2, CheckCircle2, AlertTriangle, ChevronRight,
  Save, RefreshCw,
} from 'lucide-react';
import {
  getClinicSettings, updateClinicSettings,
  type ClinicSettings,
} from '@/lib/actions/settings';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// FIELD
// =============================================================================

function Field({
  label, value, onChange, type = 'text', hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-4 py-2.5 bg-[#FAF9F5] border border-[#A8C4FF] rounded-xl text-[13px] text-[#181D23] placeholder:text-[#5A6475] outline-none focus:border-[#A8C4FF] focus:bg-[#FAF9F5] transition-all"
      />
      {hint && <p className="text-[11px] text-[#5A6475]">{hint}</p>}
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-4 py-2.5 bg-[#FAF9F5] border border-[#A8C4FF] rounded-xl text-[13px] text-[#181D23] outline-none focus:border-[#A8C4FF] transition-all appearance-none"
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-neutral-900">{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({
  label, value, onChange, rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="px-4 py-2.5 bg-[#FAF9F5] border border-[#A8C4FF] rounded-xl text-[13px] text-[#181D23] placeholder:text-[#5A6475] outline-none focus:border-[#A8C4FF] focus:bg-[#FAF9F5] transition-all resize-none"
      />
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]       = useState<string | null>(urlUserId);
  const [profile, setProfile]     = useState<StaffProfile | null>(null);
  const [settings, setSettings]   = useState<ClinicSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Editable fields
  const [clinicName, setClinicName]   = useState('');
  const [aiName, setAiName]           = useState('');
  const [brandColor, setBrandColor]   = useState('');
  const [tone, setTone]               = useState('');
  const [tagline, setTagline]         = useState('');
  const [manifesto, setManifesto]     = useState('');

  const loadData = useCallback(async (uid: string) => {
    const [profileRes, settingsRes] = await Promise.all([
      getStaffProfile('clinic', uid),
      getClinicSettings(),
    ]);

    if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
    if (settingsRes.success && settingsRes.settings) {
      const s = settingsRes.settings;
      setSettings(s);
      setClinicName(s.clinic_name);
      setAiName(s.ai_name);
      setBrandColor(s.brand_color);
      setTone(s.tone);
      setTagline(s.tagline || '');
      setManifesto(s.manifesto || '');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);
      await loadData(uid);
    })();
  }, [urlUserId, router, loadData]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const res = await updateClinicSettings({
      clinic_name: clinicName,
      ai_name:     aiName,
      brand_color: brandColor,
      tone,
      tagline:     tagline || undefined,
      manifesto:   manifesto || undefined,
    });
    setSaving(false);
    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError('Failed to save settings. Please try again.');
    }
  };

  if (loading || !profile) {
    return (
      <div className="min-h-screen nav-offset bg-[#FAF7F2] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-[#F0EDE5]"
        />
      </div>
    );
  }

  const displayBrandColor = brandColor || profile.brandColor || '#0058E6';

  return (
    <div className="min-h-screen nav-offset">
      <StaffNav profile={profile} userId={userId!} brandColor={displayBrandColor} currentPath="Settings" />

      <div className="min-h-screen flex">
        <main className="flex-1 px-8 py-10 min-w-0 max-w-2xl">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] mb-2">Configuration</p>
            <h1 className="text-[26px] font-semibold tracking-tight text-[#181D23]">Clinic Settings</h1>
            <p className="text-[13px] text-[#5A6475] mt-1">Manage clinic identity, AI persona, and system configuration.</p>
          </motion.div>

          {/* Clinic Identity */}
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-8"
          >
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] font-medium mb-4">Clinic Identity</h2>
            <div className="bg-[#F0ECFF] border border-[#D4E2FF] rounded-xl p-5 space-y-4">
              <Field label="Clinic Name" value={clinicName} onChange={setClinicName} />
              <Field
                label="Brand Colour"
                value={brandColor}
                onChange={setBrandColor}
                hint="Hex value — used for the Aria pulse indicator and accents."
              />
              <Field label="Tagline" value={tagline} onChange={setTagline} hint="Short tagline displayed in patient-facing materials." />
              <TextAreaField
                label="Clinic Manifesto"
                value={manifesto}
                onChange={setManifesto}
                rows={4}
              />
            </div>
          </motion.section>

          {/* AI Configuration */}
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.10 }}
            className="mb-8"
          >
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] font-medium mb-4">AI Configuration</h2>
            <div className="bg-[#F0ECFF] border border-[#D4E2FF] rounded-xl p-5 space-y-4">
              <Field
                label="AI Name"
                value={aiName}
                onChange={setAiName}
                hint="The name your clinic AI responds to (e.g. Aria)."
              />
              <SelectField
                label="Communication Tone"
                value={tone}
                onChange={setTone}
                options={[
                  { value: 'professional', label: 'Professional' },
                  { value: 'warm',         label: 'Warm & Friendly' },
                  { value: 'clinical',     label: 'Clinical' },
                  { value: 'friendly',     label: 'Friendly' },
                ]}
              />
            </div>
          </motion.section>

          {/* Save */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-3"
          >
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium bg-[#0058E6] text-[#181D23] hover:bg-[#0058E6]/10 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : saved ? (
                <CheckCircle2 size={13} />
              ) : (
                <Save size={13} />
              )}
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
            </button>

            {error && (
              <div className="flex items-center gap-1.5 text-[12px] text-[#f87171]/70">
                <AlertTriangle size={12} />
                {error}
              </div>
            )}
          </motion.div>
        </main>

        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 px-6 py-10 border-l border-[#D4E2FF]">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {settings && (
              <div className="mb-6">
                <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] font-medium mb-3">Current Config</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Clinic',     value: settings.clinic_name },
                    { label: 'AI Name',    value: settings.ai_name },
                    { label: 'Tone',       value: settings.tone },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between px-3 py-2 bg-[#F0ECFF] border border-[#D4E2FF] rounded-lg">
                      <span className="text-[11px] text-[#5A6475]">{item.label}</span>
                      <span className="text-[11px] text-[#3D4451] truncate ml-2 max-w-[100px]">{item.value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2 bg-[#F0ECFF] border border-[#D4E2FF] rounded-lg">
                    <span className="text-[11px] text-[#5A6475]">Colour</span>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-3 h-3 rounded-full border border-[#A8C4FF]"
                        style={{ backgroundColor: settings.brand_color }}
                      />
                      <span className="text-[11px] text-[#5A6475]">{settings.brand_color}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] font-medium mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { label: 'Manage Agents',      href: `/staff/agents?userId=${userId}` },
                { label: 'Integrations',       href: `/staff/integrations?userId=${userId}` },
                { label: 'Compliance',         href: `/staff/compliance?userId=${userId}` },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => router.push(a.href)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] text-[#5A6475] hover:text-[#3D4451] hover:bg-[#FAF9F5] transition-all text-left"
                >
                  <Settings2 size={12} className="flex-shrink-0" />
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

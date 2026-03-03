'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, BarChart3, Loader2, X,
  AlertTriangle, CheckCircle2, Brain, Clock,
  Zap, Target, TrendingUp, TrendingDown,
  Sparkles, MessageSquare, FileText, Download,
  ChevronDown, Eye, Shield, Activity,
  ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import {
  getAnalyticsOverview, generateAnalysisInsight, generateReport,
  type AnalyticsOverview, type KPICard as KPICardType, type DepartmentMetric,
  type AgentPerformance, type VolumePoint, type StatusComposition,
  type CategoryBreakdown, type ReportPreview, type ReportConfig,
  type TimeRange, type DeptSortKey,
} from '@/lib/actions/analytics';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// CONSTANTS
// =============================================================================

const PRIORITY_COLORS = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#6b7280' };
const STATUS_COLORS = { new: '#3b82f6', processing: '#8b5cf6', judged: '#f59e0b', acted: '#22c55e', resolved: '#6b7280' };

const RADAR_LABELS = ['Accuracy', 'Speed', 'Volume', 'Consistency', 'Coverage'];

const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
];

const KPI_ICONS: Record<string, typeof AlertTriangle> = {
  AlertTriangle, CheckCircle2, Brain, Clock, Zap, Target,
};

const REPORT_METRICS = [
  { id: 'signal_volume', label: 'Signal Volume' },
  { id: 'resolution_rates', label: 'Resolution Rates' },
  { id: 'department_performance', label: 'Department Performance' },
  { id: 'agent_accuracy', label: 'Agent Accuracy' },
  { id: 'priority_distribution', label: 'Priority Distribution' },
  { id: 'category_breakdown', label: 'Category Breakdown' },
];

// =============================================================================
// SVG BACKGROUND
// =============================================================================

function NeuralGrid({ color }: { color: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none">
      <defs>
        <pattern id="analytics-grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke={color} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#analytics-grid)" />
    </svg>
  );
}

// =============================================================================
// SPARKLINE CHART (tiny inline for KPI cards)
// =============================================================================

function SparklineChart({ data, color, width = 80, height = 28 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const gradId = `spark-${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// =============================================================================
// MULTI-LINE AREA CHART (signal volume)
// =============================================================================

function MultiAreaChart({
  data, color, height = 200, series,
}: {
  data: VolumePoint[]; color: string; height?: number;
  series: { key: 'signals' | 'judgements' | 'decisions'; label: string; color: string; visible: boolean }[];
}) {
  if (data.length < 2) return null;
  const visibleSeries = series.filter(s => s.visible);
  const allVals = data.flatMap(d => visibleSeries.map(s => d[s.key]));
  const maxVal = Math.max(...allVals, 1);
  const w = 100;
  const pad = 1;

  return (
    <div>
      <div style={{ height }}>
        <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            {visibleSeries.map(s => (
              <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(pct => (
            <line key={pct} x1={pad} y1={100 - pct * 98} x2={w - pad} y2={100 - pct * 98}
              stroke="rgba(0,0,0,0.02)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          ))}

          {visibleSeries.map(s => {
            const points = data.map((d, i) => ({
              x: pad + (i / (data.length - 1)) * (w - pad * 2),
              y: 100 - pad - (d[s.key] / maxVal) * (100 - pad * 2),
            }));
            const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
            const areaD = `${pathD} L ${points[points.length - 1].x} ${100 - pad} L ${pad} ${100 - pad} Z`;
            return (
              <g key={s.key}>
                <path d={areaD} fill={`url(#area-${s.key})`} />
                <path d={pathD} fill="none" stroke={s.color} strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}
        </svg>
      </div>
      {/* X-axis labels */}
      <div className="flex justify-between mt-1 px-0.5">
        {data.filter((_, i) => i % 5 === 0 || i === data.length - 1).map(d => (
          <span key={d.date} className="text-[8px] text-[#8B84A0]">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// DONUT CHART (decisions)
// =============================================================================

function DonutChart({
  data, colors, size = 110,
}: { data: { label: string; value: number }[]; colors: string[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-[11px] text-[#6E6688] text-center py-4">No data</div>;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulative = 0;
  const segments = data.map((d, i) => {
    const dashLen = (d.value / total) * circumference;
    const gap = circumference - dashLen;
    const rotation = (cumulative / total) * 360 - 90;
    cumulative += d.value;
    return { ...d, dashLen, gap, rotation, color: colors[i % colors.length] };
  });

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(0,0,0,0.02)" strokeWidth={strokeWidth} />
          {segments.map((seg, i) => (
            <motion.circle
              key={i} cx={center} cy={center} r={radius} fill="none" stroke={seg.color} strokeWidth={strokeWidth}
              strokeDasharray={`${seg.dashLen} ${seg.gap}`} strokeLinecap="butt"
              transform={`rotate(${seg.rotation} ${center} ${center})`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.15 }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[16px] font-light text-[#1A1035]">{total}</span>
          <span className="text-[7px] text-[#6E6688] uppercase tracking-wider">Total</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-[10px] text-[#6E6688] capitalize">{seg.label}</span>
            <span className="text-[10px] text-[#524D66] font-medium">{seg.value}</span>
            <span className="text-[8px] text-[#6E6688]">({Math.round((seg.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// GAUGE CHART (semi-circular)
// =============================================================================

function GaugeChart({
  value, max, color, label, size = 120,
}: { value: number; max: number; color: string; label: string; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  // Half circle: PI radians = 180°
  const halfCircumference = Math.PI * radius;
  const percentage = Math.min(value / max, 1);
  const offset = halfCircumference - percentage * halfCircumference;

  // Color based on thresholds
  const gaugeColor = percentage > 0.7 ? '#ef4444' : percentage > 0.4 ? '#f59e0b' : '#22c55e';

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size / 2 + 10 }}>
        <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
          {/* Background arc */}
          <path
            d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
            fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth={strokeWidth} strokeLinecap="round"
          />
          {/* Value arc */}
          <motion.path
            d={`M ${strokeWidth / 2} ${center} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${center}`}
            fill="none" stroke={color || gaugeColor} strokeWidth={strokeWidth} strokeLinecap="round"
            strokeDasharray={halfCircumference}
            initial={{ strokeDashoffset: halfCircumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            style={{ filter: `drop-shadow(0 0 6px ${(color || gaugeColor)}40)` }}
          />
        </svg>
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center">
          <span className="text-[18px] font-light text-[#1A1035]">{value}</span>
        </div>
      </div>
      <span className="text-[9px] text-[#6E6688] uppercase tracking-wider mt-1">{label}</span>
    </div>
  );
}

// =============================================================================
// RADAR CHART (agent comparison)
// =============================================================================

function RadarChart({
  agents, labels, size = 220,
}: { agents: { name: string; dimensions: number[]; color: string }[]; labels: string[]; size?: number }) {
  const center = size / 2;
  const maxRadius = size / 2 - 30;
  const angleStep = (2 * Math.PI) / labels.length;
  const levels = 4;

  // Compute polygon point
  const getPoint = (angle: number, radius: number) => ({
    x: center + radius * Math.cos(angle - Math.PI / 2),
    y: center + radius * Math.sin(angle - Math.PI / 2),
  });

  // Grid polygons
  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const r = maxRadius * ((level + 1) / levels);
    return labels.map((_, i) => getPoint(i * angleStep, r)).map(p => `${p.x},${p.y}`).join(' ');
  });

  // Axis lines
  const axes = labels.map((_, i) => getPoint(i * angleStep, maxRadius));

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size}>
        {/* Grid levels */}
        {gridPolygons.map((pts, i) => (
          <polygon key={i} points={pts} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="0.5" />
        ))}

        {/* Axis lines */}
        {axes.map((pt, i) => (
          <line key={i} x1={center} y1={center} x2={pt.x} y2={pt.y} stroke="rgba(0,0,0,0.02)" strokeWidth="0.5" />
        ))}

        {/* Agent polygons */}
        {agents.map((agent, agentIdx) => {
          const pts = agent.dimensions.map((val, i) => {
            const r = (val / 100) * maxRadius;
            return getPoint(i * angleStep, r);
          });
          const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
          return (
            <motion.g key={agent.name}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + agentIdx * 0.1, duration: 0.6 }}
              style={{ transformOrigin: `${center}px ${center}px` }}
            >
              <polygon points={pointsStr} fill={`${agent.color}15`} stroke={agent.color} strokeWidth="1.5" />
              {pts.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r="2.5" fill={agent.color} />
              ))}
            </motion.g>
          );
        })}

        {/* Labels */}
        {labels.map((label, i) => {
          const pt = getPoint(i * angleStep, maxRadius + 16);
          return (
            <text key={label} x={pt.x} y={pt.y}
              textAnchor="middle" dominantBaseline="middle"
              className="text-[9px] fill-white/30">{label}</text>
          );
        })}
      </svg>
    </div>
  );
}

// =============================================================================
// HEATMAP GRID (department × status)
// =============================================================================

function StatusHeatmap({ data, brandColor }: { data: StatusComposition[]; brandColor: string }) {
  const statuses = ['new', 'processing', 'judged', 'acted', 'resolved'] as const;
  const maxCount = Math.max(...data.flatMap(d => statuses.map(s => d[s])), 1);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 ml-[110px]">
        {statuses.map(s => (
          <div key={s} className="flex-1 text-center text-[8px] uppercase tracking-wider"
            style={{ color: STATUS_COLORS[s] }}>{s}</div>
        ))}
      </div>
      {data.map(row => (
        <div key={row.department} className="flex items-center gap-1">
          <div className="w-[110px] text-[9px] text-[#6E6688] truncate text-right pr-2">{row.department}</div>
          {statuses.map(s => {
            const count = row[s];
            const intensity = count / maxCount;
            const col = STATUS_COLORS[s];
            return (
              <motion.div key={s}
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.random() * 0.3 }}
                className="flex-1 h-7 rounded flex items-center justify-center text-[10px] font-medium"
                style={{
                  backgroundColor: count > 0 ? `${col}${Math.round(intensity * 40 + 10).toString(16).padStart(2, '0')}` : 'rgba(0,0,0,0.02)',
                  color: count > 0 ? `${col}cc` : 'transparent',
                  border: `1px solid ${count > 0 ? `${col}20` : 'rgba(0,0,0,0.03)'}`,
                }}
              >
                {count > 0 ? count : ''}
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// REPORT MODAL
// =============================================================================

function ReportModal({
  open, onClose, brandColor, aiName,
  onGenerate, preview, generating,
}: {
  open: boolean; onClose: () => void; brandColor: string; aiName: string;
  onGenerate: (config: ReportConfig) => void;
  preview: ReportPreview | null; generating: boolean;
}) {
  const [dateRange, setDateRange] = useState<TimeRange>('30d');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['signal_volume', 'resolution_rates', 'department_performance']);
  const [exported, setExported] = useState(false);

  const toggleMetric = (id: string) => {
    setSelectedMetrics(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#FAF7F2]/80 backdrop-blur-sm"
          onClick={onClose}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[85vh] bg-[#FAF7F2] border border-[#EBE5FF] rounded-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#EBE5FF] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={15} style={{ color: brandColor }} />
                <h3 className="text-[14px] text-[#1A1035] font-medium">Generate Report</h3>
              </div>
              <button onClick={onClose} className="text-[#6E6688] hover:text-[#6E6688] transition-colors"><X size={14} /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {!preview ? (
                <div className="px-6 py-5 space-y-5">
                  {/* Date range */}
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688] block mb-2">Date Range</label>
                    <div className="flex items-center gap-1.5">
                      {TIME_RANGES.map(r => (
                        <button key={r.id} onClick={() => setDateRange(r.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] transition-all ${dateRange === r.id ? 'text-[#1A1035]' : 'text-[#6E6688] hover:text-[#6E6688]'}`}
                          style={dateRange === r.id ? { backgroundColor: `${brandColor}20`, color: brandColor } : undefined}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688] block mb-2">Include Metrics</label>
                    <div className="grid grid-cols-2 gap-2">
                      {REPORT_METRICS.map(m => (
                        <button key={m.id} onClick={() => toggleMetric(m.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] border transition-all text-left ${
                            selectedMetrics.includes(m.id) ? 'border-[#D5CCFF] bg-[#FAF9F5] text-[#524D66]' : 'border-[#EBE5FF] text-[#6E6688] hover:bg-[#FAF7F2]'
                          }`}>
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                            selectedMetrics.includes(m.id) ? 'border-[#D5CCFF]' : 'border-[#EBE5FF]'
                          }`}
                            style={selectedMetrics.includes(m.id) ? { backgroundColor: `${brandColor}30`, borderColor: brandColor } : undefined}>
                            {selectedMetrics.includes(m.id) && <CheckCircle2 size={8} style={{ color: brandColor }} />}
                          </div>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Report preview */
                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13px] text-[#1A1035] font-medium">{preview.title}</h4>
                      <p className="text-[10px] text-[#6E6688] mt-0.5">
                        Generated by {aiName} · {new Date(preview.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <Sparkles size={14} style={{ color: brandColor }} />
                  </div>

                  <div className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <p className="text-[12px] text-[#524D66] leading-relaxed whitespace-pre-wrap">{preview.summary}</p>
                  </div>

                  {preview.sections.length > 0 && (
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.2em] text-[#6E6688] mb-2">Report Sections</p>
                      <div className="space-y-1.5">
                        {preview.sections.map((sec, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F0ECFF] border border-[#EBE5FF]">
                            <Eye size={10} className="text-[#6E6688]" />
                            <span className="text-[10px] text-[#6E6688]">{sec.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#EBE5FF] flex justify-between items-center flex-shrink-0">
              {preview ? (
                <>
                  <button onClick={() => { setExported(false); }}
                    className="px-4 py-2 rounded-lg text-[11px] text-[#6E6688] border border-[#EBE5FF] hover:bg-[#FAF9F5] transition-all">
                    Back
                  </button>
                  <button onClick={() => { setExported(true); setTimeout(() => setExported(false), 3000); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-medium transition-all"
                    style={{ backgroundColor: `${brandColor}20`, color: brandColor }}>
                    {exported ? <><CheckCircle2 size={12} /> Exported!</> : <><Download size={12} /> Export Report</>}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={onClose}
                    className="px-4 py-2 rounded-lg text-[11px] text-[#6E6688] border border-[#EBE5FF] hover:bg-[#FAF9F5] transition-all">
                    Cancel
                  </button>
                  <button onClick={() => onGenerate({ dateRange, selectedMetrics, departments: [] })}
                    disabled={selectedMetrics.length === 0 || generating}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30"
                    style={{ backgroundColor: `${brandColor}20`, color: brandColor }}>
                    {generating ? <><Loader2 size={12} className="animate-spin" /> Generating...</> : <><Sparkles size={12} /> Generate with {aiName}</>}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramTenantId = searchParams.get('tenantId');
  const paramUserId = searchParams.get('userId');

  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(paramTenantId);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(paramUserId);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);

  // Controls
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [deptSort, setDeptSort] = useState<DeptSortKey>('signals');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // Series visibility
  const [showSignals, setShowSignals] = useState(true);
  const [showJudgements, setShowJudgements] = useState(true);
  const [showDecisions, setShowDecisions] = useState(true);

  // AI panel
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  // Report modal
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const c = profile?.brandColor || '#10b981';
  const aiName = profile?.aiName || 'Ilyas';

  // ── Resolve tenant ──
  useEffect(() => {
    if (paramTenantId && paramUserId) {
      setResolvedTenantId(paramTenantId);
      setResolvedUserId(paramUserId);
      return;
    }
    (async () => {
      const res = await getCurrentUser();
      if (res.success && res.userId) {
        setResolvedTenantId('clinic');
        setResolvedUserId(res.userId);
      }
    })();
  }, [paramTenantId, paramUserId]);

  // ── Load data ──
  useEffect(() => {
    if (!resolvedTenantId || !resolvedUserId) return;
    (async () => {
      setLoading(true);
      const [profileRes, overviewRes] = await Promise.all([
        getStaffProfile(resolvedTenantId, resolvedUserId),
        getAnalyticsOverview(resolvedTenantId),
      ]);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      if (overviewRes.success && overviewRes.data) {
        setOverview(overviewRes.data);
        // Default select first 3 agents for radar
        setSelectedAgents(overviewRes.data.agents.slice(0, 3).map(a => a.id));
      }
      setLoading(false);
    })();
  }, [resolvedTenantId, resolvedUserId]);

  // ── Sorted departments ──
  const sortedDepts = useMemo(() => {
    if (!overview) return [];
    const depts = [...overview.departments];
    switch (deptSort) {
      case 'signals': depts.sort((a, b) => b.signal_count - a.signal_count); break;
      case 'resolution': depts.sort((a, b) => b.resolution_rate - a.resolution_rate); break;
      case 'response': depts.sort((a, b) => a.avg_response_hours - b.avg_response_hours); break;
    }
    return depts;
  }, [overview, deptSort]);

  // ── Radar agents ──
  const radarAgents = useMemo(() => {
    if (!overview) return [];
    return overview.agents
      .filter(a => selectedAgents.includes(a.id))
      .map(a => ({ name: a.name, dimensions: a.dimensions, color: a.color }));
  }, [overview, selectedAgents]);

  // ── AI Analysis ──
  const handleAskAI = useCallback(async (question: string) => {
    if (!resolvedTenantId || !resolvedUserId || !overview) return;
    setLoadingAI(true);
    setAiResponse(null);

    const kpiSummary = overview.kpis.map(k => `${k.label}: ${k.value}${k.unit} (${k.change > 0 ? '+' : ''}${k.change}%)`).join(', ');
    const deptSummary = overview.departments.map(d => `${d.name}: ${d.signal_count} signals, ${d.resolution_rate}% resolution, ${d.avg_response_hours}h avg`).join('; ');

    const res = await generateAnalysisInsight(resolvedTenantId, resolvedUserId, question, { kpiSummary, departmentSummary: deptSummary });
    if (res.success && res.response) setAiResponse(res.response);
    setLoadingAI(false);
  }, [resolvedTenantId, resolvedUserId, overview]);

  // ── Generate Report ──
  const handleGenerateReport = useCallback(async (config: ReportConfig) => {
    if (!resolvedTenantId || !resolvedUserId) return;
    setGeneratingReport(true);
    const res = await generateReport(resolvedTenantId, resolvedUserId, config);
    if (res.success && res.report) setReportPreview(res.report);
    setGeneratingReport(false);
  }, [resolvedTenantId, resolvedUserId]);

  // ── Loading ──
  if (loading && !profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }}
          className="flex items-center gap-3 text-[#6E6688] text-[13px]">
          <Loader2 size={16} className="animate-spin" />
          <span>Loading Analytics...</span>
        </motion.div>
      </div>
    );
  }

  const maxDeptSignals = overview ? Math.max(...overview.departments.map(d => d.signal_count)) : 1;

  return (
    <div className="min-h-screen pl-[240px] relative overflow-hidden">
      {profile && <StaffNav profile={profile} userId={resolvedUserId || ''} brandColor={c} currentPath="Analytics" />}
      <NeuralGrid color={c} />
      <ReportModal
        open={reportModalOpen}
        onClose={() => { setReportModalOpen(false); setReportPreview(null); }}
        brandColor={c} aiName={aiName}
        onGenerate={handleGenerateReport}
        preview={reportPreview} generating={generatingReport}
      />

      <div className="relative z-10 flex flex-col h-screen">

        {/* ── HEADER ── */}
        <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-5 py-3 border-b border-[#EBE5FF] flex-shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push(`/staff/dashboard?tenantId=${resolvedTenantId}&userId=${resolvedUserId}`)}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FAF9F5] hover:bg-white transition-colors">
              <ArrowLeft size={14} className="text-[#6E6688]" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${c}20` }}>
                <BarChart3 size={16} style={{ color: c }} />
              </div>
              <div>
                <h1 className="text-[15px] font-medium text-[#1A1035]">Analytics</h1>
                <p className="text-[10px] text-[#6E6688]">Operational intelligence metrics</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Time range selector */}
            <div className="flex items-center bg-[#FAF9F5] rounded-lg p-0.5">
              {TIME_RANGES.map(r => (
                <button key={r.id} onClick={() => setTimeRange(r.id)}
                  className={`px-2.5 py-1.5 rounded-md text-[10px] transition-all ${
                    timeRange === r.id ? 'text-[#1A1035]' : 'text-[#6E6688] hover:text-[#6E6688]'
                  }`}
                  style={timeRange === r.id ? { backgroundColor: `${c}15`, color: c } : undefined}>
                  {r.label}
                </button>
              ))}
            </div>

            <button onClick={() => { setReportPreview(null); setReportModalOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] border border-[#EBE5FF] text-[#6E6688] hover:bg-[#FAF9F5] transition-all">
              <FileText size={11} /> Report
            </button>
          </div>
        </motion.header>

        {/* ── KPI ROW ── */}
        {overview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
            className="px-5 py-3 border-b border-[#EBE5FF] flex-shrink-0">
            <div className="grid grid-cols-6 gap-3">
              {overview.kpis.map((kpi, i) => {
                const Icon = KPI_ICONS[kpi.icon] || Activity;
                const isPositive = kpi.trend === 'up' && kpi.change > 0;
                const isNegative = kpi.trend === 'down' && kpi.change < 0;
                // For response time, down is good
                const isGood = kpi.id === 'kpi-response' ? isNegative : isPositive;
                const TrendIcon = kpi.change > 0 ? ArrowUpRight : kpi.change < 0 ? ArrowDownRight : Minus;
                return (
                  <motion.div key={kpi.id}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.06 }}
                    className="px-3 py-2.5 rounded-xl bg-white border border-[#EBE5FF] hover:border-[#D5CCFF] transition-all"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Icon size={11} style={{ color: kpi.color }} />
                        <span className="text-[9px] text-[#6E6688] uppercase tracking-wider">{kpi.label}</span>
                      </div>
                      <div className={`flex items-center gap-0.5 text-[9px] font-medium ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
                        <TrendIcon size={9} />
                        {Math.abs(kpi.change)}%
                      </div>
                    </div>
                    <div className="flex items-end justify-between">
                      <span className="text-[20px] font-light text-[#1A1035] leading-none">{kpi.value}<span className="text-[11px] text-[#6E6688]">{kpi.unit}</span></span>
                      <SparklineChart data={kpi.sparkline} color={kpi.color} width={60} height={22} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── MAIN GRID ── */}
        <div className="flex-1 overflow-y-auto">
          {overview && (
            <div className="px-5 py-4">
              <div className="grid grid-cols-12 gap-4">

                {/* ════ LEFT COLUMN (8 cols) ════ */}
                <div className="col-span-8 space-y-4">

                  {/* Signal Volume Chart */}
                  <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-[12px] text-[#524D66] font-medium">Signal Volume</h3>
                        <p className="text-[9px] text-[#6E6688] mt-0.5">Signals, judgements, and decisions over time</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {[
                          { key: 'signals' as const, label: 'Signals', color: c, visible: showSignals, toggle: () => setShowSignals(!showSignals) },
                          { key: 'judgements' as const, label: 'Judgements', color: '#f59e0b', visible: showJudgements, toggle: () => setShowJudgements(!showJudgements) },
                          { key: 'decisions' as const, label: 'Decisions', color: '#22c55e', visible: showDecisions, toggle: () => setShowDecisions(!showDecisions) },
                        ].map(s => (
                          <button key={s.key} onClick={s.toggle}
                            className={`flex items-center gap-1.5 text-[9px] transition-all ${s.visible ? 'text-[#524D66]' : 'text-[#8B84A0]'}`}>
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.visible ? s.color : '#8B84A0' }} />
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <MultiAreaChart
                      data={overview.volume}
                      color={c}
                      height={180}
                      series={[
                        { key: 'signals', label: 'Signals', color: c, visible: showSignals },
                        { key: 'judgements', label: 'Judgements', color: '#f59e0b', visible: showJudgements },
                        { key: 'decisions', label: 'Decisions', color: '#22c55e', visible: showDecisions },
                      ]}
                    />
                  </motion.section>

                  {/* Department Performance */}
                  <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[12px] text-[#524D66] font-medium">Department Performance</h3>
                      <div className="flex items-center gap-1">
                        {([
                          { key: 'signals' as DeptSortKey, label: 'Signals' },
                          { key: 'resolution' as DeptSortKey, label: 'Resolution' },
                          { key: 'response' as DeptSortKey, label: 'Response' },
                        ]).map(s => (
                          <button key={s.key} onClick={() => setDeptSort(s.key)}
                            className={`px-2 py-1 rounded text-[9px] transition-all ${deptSort === s.key ? '' : 'text-[#6E6688] hover:text-[#6E6688]'}`}
                            style={deptSort === s.key ? { backgroundColor: `${c}15`, color: c } : undefined}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {sortedDepts.map((dept, i) => (
                        <motion.div key={dept.id}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.05 * i }}
                          className="flex items-center gap-3"
                        >
                          <div className="w-[120px] flex-shrink-0 text-right">
                            <span className="text-[10px] text-[#6E6688]">{dept.name}</span>
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            {/* Signal count bar */}
                            <div className="flex-1 h-5 rounded bg-[#FAF9F5] relative overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(dept.signal_count / maxDeptSignals) * 100}%` }}
                                transition={{ duration: 0.8, delay: 0.1 * i }}
                                className="h-full rounded"
                                style={{ backgroundColor: `${dept.color}30` }}
                              />
                              {/* Resolution rate overlay */}
                              <div className="absolute inset-y-0 left-0" style={{ width: `${dept.resolution_rate}%` }}>
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: '100%' }}
                                  transition={{ duration: 0.8, delay: 0.1 * i + 0.2 }}
                                  className="h-full rounded-l border-r border-white/10"
                                  style={{ backgroundColor: `${dept.color}15` }}
                                />
                              </div>
                              <span className="absolute inset-0 flex items-center px-2 text-[9px] text-[#6E6688] font-mono">
                                {dept.signal_count}
                              </span>
                            </div>
                            {/* Stats */}
                            <span className="text-[9px] text-[#6E6688] font-mono w-10 text-right">{dept.resolution_rate}%</span>
                            <span className="text-[9px] text-[#8B84A0] font-mono w-10 text-right">{dept.avg_response_hours}h</span>
                          </div>
                          <SparklineChart data={dept.trend} color={dept.color} width={40} height={14} />
                        </motion.div>
                      ))}
                    </div>
                  </motion.section>

                  {/* Status Heatmap */}
                  <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                    className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <h3 className="text-[12px] text-[#524D66] font-medium mb-3">Signal Status by Department</h3>
                    <StatusHeatmap data={overview.statusComposition} brandColor={c} />
                  </motion.section>

                  {/* Agent Radar */}
                  <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                    className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-[12px] text-[#524D66] font-medium">Agent Performance Comparison</h3>
                        <p className="text-[9px] text-[#6E6688] mt-0.5">Select agents to compare across 5 dimensions</p>
                      </div>
                    </div>

                    <div className="flex gap-6">
                      {/* Radar chart */}
                      <div className="flex-1 flex justify-center">
                        {radarAgents.length > 0 ? (
                          <RadarChart agents={radarAgents} labels={RADAR_LABELS} size={240} />
                        ) : (
                          <div className="h-[240px] flex items-center justify-center text-[#8B84A0] text-[11px]">Select agents to compare</div>
                        )}
                      </div>

                      {/* Agent selector */}
                      <div className="w-[180px] space-y-1.5">
                        <p className="text-[9px] uppercase tracking-[0.15em] text-[#6E6688] mb-2">Agents</p>
                        {overview.agents.map(agent => {
                          const isSelected = selectedAgents.includes(agent.id);
                          return (
                            <button key={agent.id}
                              onClick={() => setSelectedAgents(prev =>
                                prev.includes(agent.id) ? prev.filter(id => id !== agent.id) : [...prev, agent.id]
                              )}
                              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] transition-all text-left ${
                                isSelected ? 'text-[#524D66] bg-[#FAF9F5]' : 'text-[#6E6688] hover:text-[#6E6688]'
                              }`}>
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: isSelected ? agent.color : '#8B84A0' }} />
                              <span className="truncate">{agent.name}</span>
                              <span className="text-[8px] text-[#8B84A0] ml-auto font-mono">{agent.accuracy}%</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.section>
                </div>

                {/* ════ RIGHT COLUMN (4 cols) ════ */}
                <div className="col-span-4 space-y-4">

                  {/* Decision Distribution */}
                  <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                    className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <h3 className="text-[12px] text-[#524D66] font-medium mb-3">Decision Distribution</h3>
                    <DonutChart
                      data={[
                        { label: 'Accepted', value: overview.decisionSplit.accepted },
                        { label: 'Modified', value: overview.decisionSplit.modified },
                        { label: 'Rejected', value: overview.decisionSplit.rejected },
                      ]}
                      colors={['#22c55e', '#f59e0b', '#ef4444']}
                      size={100}
                    />
                  </motion.section>

                  {/* Priority Gauge */}
                  <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
                    className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <h3 className="text-[12px] text-[#524D66] font-medium mb-3">Priority Pressure</h3>
                    <div className="flex justify-center">
                      <GaugeChart
                        value={overview.prioritySplit.critical + overview.prioritySplit.high}
                        max={overview.prioritySplit.critical + overview.prioritySplit.high + overview.prioritySplit.medium + overview.prioritySplit.low}
                        color={c}
                        label="Critical + High"
                        size={140}
                      />
                    </div>
                    <div className="flex justify-center gap-4 mt-3">
                      {(Object.entries(overview.prioritySplit) as [string, number][]).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[key as keyof typeof PRIORITY_COLORS] }} />
                          <span className="text-[9px] text-[#6E6688] capitalize">{key}</span>
                          <span className="text-[9px] text-[#524D66] font-mono">{val}</span>
                        </div>
                      ))}
                    </div>
                  </motion.section>

                  {/* Category Ranking */}
                  <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                    className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <h3 className="text-[12px] text-[#524D66] font-medium mb-3">Top Categories</h3>
                    <div className="space-y-2">
                      {overview.categories.map((cat, i) => (
                        <div key={cat.name} className="flex items-center gap-2.5">
                          <span className="text-[9px] text-[#8B84A0] font-mono w-3">{i + 1}</span>
                          <span className="text-[10px] text-[#6E6688] w-[80px] truncate">{cat.name}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-[#FAF9F5]">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${cat.percentage}%` }}
                              transition={{ duration: 0.6, delay: 0.1 * i }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                          </div>
                          <span className="text-[9px] text-[#6E6688] font-mono w-6 text-right">{cat.count}</span>
                        </div>
                      ))}
                    </div>
                  </motion.section>

                  {/* AI Analysis Panel */}
                  <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                    className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={13} style={{ color: c }} />
                      <h3 className="text-[12px] font-medium" style={{ color: `${c}cc` }}>Ask {aiName}</h3>
                    </div>

                    {aiResponse && (
                      <div className="mb-3 p-3 rounded-lg bg-white border border-[#EBE5FF]">
                        <p className="text-[11px] text-[#524D66] leading-relaxed whitespace-pre-wrap">{aiResponse}</p>
                      </div>
                    )}

                    <div className="flex items-end gap-2 mb-2">
                      <div className="flex-1 px-3 py-2 rounded-lg border transition-all"
                        style={{ borderColor: aiQuestion ? `${c}30` : 'rgba(0,0,0,0.05)', backgroundColor: 'transparent' }}>
                        <input type="text" value={aiQuestion}
                          onChange={e => setAiQuestion(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && aiQuestion.trim()) {
                              handleAskAI(aiQuestion.trim());
                              setAiQuestion('');
                            }
                          }}
                          placeholder="Ask about the data..."
                          className="w-full bg-transparent text-[11px] text-[#524D66] placeholder-[#B0A8C8] outline-none" />
                      </div>
                      <button disabled={!aiQuestion.trim() || loadingAI}
                        onClick={() => { handleAskAI(aiQuestion.trim()); setAiQuestion(''); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-25 flex-shrink-0"
                        style={{ backgroundColor: `${c}20` }}>
                        {loadingAI ? <Loader2 size={12} className="animate-spin" style={{ color: c }} /> : <MessageSquare size={12} style={{ color: c }} />}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {['What trends do you see?', 'Which dept needs attention?', 'Summarise this week', 'Compare agent performance'].map(q => (
                        <button key={q} onClick={() => handleAskAI(q)}
                          className="text-[8px] text-[#6E6688] border border-[#EBE5FF] px-2 py-1 rounded-full hover:bg-[#FAF7F2] hover:text-[#6E6688] transition-all">
                          {q}
                        </button>
                      ))}
                    </div>
                  </motion.section>

                  {/* Quick Report */}
                  <motion.section initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                    className="p-4 rounded-xl bg-white border border-[#EBE5FF]">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText size={13} className="text-[#6E6688]" />
                      <h3 className="text-[12px] text-[#524D66] font-medium">Quick Report</h3>
                    </div>
                    <p className="text-[10px] text-[#6E6688] mb-3">
                      Generate an AI-powered report with selected metrics and date range.
                    </p>
                    <button onClick={() => { setReportPreview(null); setReportModalOpen(true); }}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[11px] font-medium transition-all"
                      style={{ backgroundColor: `${c}15`, color: c }}>
                      <Sparkles size={11} /> Generate Report
                    </button>
                  </motion.section>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

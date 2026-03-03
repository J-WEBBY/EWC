'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, FlaskConical, Loader2, Play,
  TrendingDown, TrendingUp, Minus, AlertTriangle,
  Zap, Bot, Shield, Building2, UserMinus,
  Clock, ChevronRight, RotateCcw, Activity,
  Brain, Globe2, Network, History,
} from 'lucide-react';
import {
  getSimulationOverview, runSimulation,
  type SimulationOverview, type SimulationParam,
  type SimulationResult,
  type GlobeNode, type GlobeConnection,
  type NeuralNode, type NeuralEdge,
} from '@/lib/actions/simulations';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// CONSTANTS
// =============================================================================

const SCENARIO_ICONS: Record<string, typeof AlertTriangle> = {
  TrendingDown, UserMinus, Zap, Building2, Bot, Shield,
};

const CATEGORY_COLORS: Record<string, string> = {
  operational: '#3b82f6',
  financial: '#f59e0b',
  strategic: '#8b5cf6',
  risk: '#ef4444',
};

const IMPACT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  neutral: '#f59e0b',
  negative: '#ef4444',
  critical: '#dc2626',
};

// =============================================================================
// SVG BACKGROUND
// =============================================================================

function NeuralGrid({ color }: { color: string }) {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none">
      <defs>
        <pattern id="simulations-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke={color} strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#simulations-grid)" />
    </svg>
  );
}

// =============================================================================
// SPINNING GLOBE — SVG wireframe with CSS 3D rotation
// =============================================================================

function SpinningGlobe({
  nodes,
  connections,
  brandColor,
  speed,
  hoveredNode,
  onHoverNode,
  runPhase,
}: {
  nodes: GlobeNode[];
  connections: GlobeConnection[];
  brandColor: string;
  speed: number;
  hoveredNode: string | null;
  onHoverNode: (id: string | null) => void;
  runPhase: 'idle' | 'charging' | 'processing' | 'complete';
}) {
  const size = 380;
  const cx = size / 2;
  const cy = size / 2;
  const r = 150;

  // Project spherical coords to 2D with perspective
  const projectNode = useCallback((lat: number, lng: number) => {
    const phi = (lat * Math.PI) / 180;
    const theta = (lng * Math.PI) / 180;
    const x = cx + r * Math.cos(phi) * Math.sin(theta);
    const y = cy - r * Math.sin(phi);
    const z = Math.cos(phi) * Math.cos(theta); // depth for opacity
    return { x, y, z };
  }, [cx, cy, r]);

  const animDuration = speed === 1 ? '40s' : '14s';
  const isActive = runPhase === 'charging' || runPhase === 'processing';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* CSS keyframe for globe rotation */}
      <style>{`
        @keyframes globe-rotate { from { transform: rotateY(0deg); } to { transform: rotateY(360deg); } }
        @keyframes radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes orbit-1 { from { transform: rotate(0deg) translateX(210px) rotate(0deg); } to { transform: rotate(360deg) translateX(210px) rotate(-360deg); } }
        @keyframes orbit-2 { from { transform: rotate(90deg) translateX(210px) rotate(-90deg); } to { transform: rotate(450deg) translateX(210px) rotate(-450deg); } }
        @keyframes orbit-3 { from { transform: rotate(180deg) translateX(210px) rotate(-180deg); } to { transform: rotate(540deg) translateX(210px) rotate(-540deg); } }
        @keyframes orbit-4 { from { transform: rotate(270deg) translateX(210px) rotate(-270deg); } to { transform: rotate(630deg) translateX(210px) rotate(-630deg); } }
        @keyframes dash-flow { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
      `}</style>

      {/* Radial background glow */}
      <div
        className="absolute inset-0 rounded-full opacity-20"
        style={{
          background: `radial-gradient(circle at center, ${brandColor}22 0%, transparent 70%)`,
        }}
      />

      {/* Main SVG with rotation wrapper */}
      <div
        style={{
          animation: `globe-rotate ${animDuration} linear infinite`,
          transformStyle: 'preserve-3d',
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Wireframe longitude lines */}
          {Array.from({ length: 12 }, (_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const rx = r * Math.abs(Math.sin(angle));
            return (
              <ellipse
                key={`lng-${i}`}
                cx={cx}
                cy={cy}
                rx={rx || 0.5}
                ry={r}
                fill="none"
                stroke="white"
                strokeWidth="0.5"
                opacity={0.12}
                transform={`rotate(${i * 15}, ${cx}, ${cy})`}
              />
            );
          })}

          {/* Wireframe latitude lines */}
          {Array.from({ length: 7 }, (_, i) => {
            const lat = -60 + i * 20;
            const phi = (lat * Math.PI) / 180;
            const latR = r * Math.cos(phi);
            const latY = cy - r * Math.sin(phi);
            return (
              <ellipse
                key={`lat-${i}`}
                cx={cx}
                cy={latY}
                rx={latR}
                ry={latR * 0.3}
                fill="none"
                stroke="white"
                strokeWidth="0.5"
                opacity={0.1}
              />
            );
          })}

          {/* Connection lines between nodes */}
          {connections.filter(c => c.active).map((conn, i) => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return null;
            const p1 = projectNode(fromNode.lat, fromNode.lng);
            const p2 = projectNode(toNode.lat, toNode.lng);
            return (
              <line
                key={`conn-${i}`}
                x1={p1.x} y1={p1.y}
                x2={p2.x} y2={p2.y}
                stroke={brandColor}
                strokeWidth={conn.strength * 1.5}
                opacity={isActive ? 0.5 : 0.25}
                strokeDasharray="4 4"
                style={{ animation: 'dash-flow 1s linear infinite' }}
              />
            );
          })}

          {/* Node markers */}
          {nodes.map(node => {
            const pos = projectNode(node.lat, node.lng);
            const isHovered = hoveredNode === node.id;
            const nodeR = node.type === 'metric' ? 6 : node.type === 'department' ? 5 : 4;
            return (
              <g
                key={node.id}
                onMouseEnter={() => onHoverNode(node.id)}
                onMouseLeave={() => onHoverNode(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Glow */}
                <circle
                  cx={pos.x} cy={pos.y}
                  r={nodeR + 4}
                  fill={node.color}
                  opacity={isHovered ? 0.3 : 0.1}
                />
                {/* Main dot */}
                <circle
                  cx={pos.x} cy={pos.y}
                  r={nodeR}
                  fill={node.color}
                  opacity={0.6 + pos.z * 0.4}
                  stroke={isHovered ? 'white' : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                />
                {/* Pulse ring */}
                {isActive && (
                  <circle
                    cx={pos.x} cy={pos.y}
                    r={nodeR + 2}
                    fill="none"
                    stroke={node.color}
                    strokeWidth="1"
                    opacity="0.4"
                  >
                    <animate attributeName="r" from={`${nodeR}`} to={`${nodeR + 10}`} dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.4" to="0" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Radar sweep overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          animation: `radar-sweep ${speed === 1 ? '6s' : '2s'} linear infinite`,
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id="sweep-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={brandColor} stopOpacity="0" />
              <stop offset="100%" stopColor={brandColor} stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <line x1={cx} y1={cy} x2={cx + r} y2={cy} stroke="url(#sweep-grad)" strokeWidth="2" />
          <path
            d={`M ${cx} ${cy} L ${cx + r} ${cy} A ${r} ${r} 0 0 0 ${cx + r * Math.cos(Math.PI / 8)} ${cy - r * Math.sin(Math.PI / 8)} Z`}
            fill={brandColor}
            opacity="0.06"
          />
        </svg>
      </div>

      {/* Orbital metric badges */}
      {[
        { label: '247', sub: 'Signals', anim: 'orbit-1', dur: '20s' },
        { label: '78%', sub: 'Resolved', anim: 'orbit-2', dur: '25s' },
        { label: '9', sub: 'Agents', anim: 'orbit-3', dur: '22s' },
        { label: '84%', sub: 'Confidence', anim: 'orbit-4', dur: '28s' },
      ].map((badge, i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            top: '50%', left: '50%',
            marginTop: '-16px', marginLeft: '-32px',
            animation: `${badge.anim} ${badge.dur} linear infinite`,
          }}
        >
          <div className="bg-[#FAF7F2]/80 border border-white/10 rounded px-2 py-1 text-center backdrop-blur-sm">
            <div className="text-[10px] font-bold text-[#1A1035]">{badge.label}</div>
            <div className="text-[8px] text-[#6E6688]">{badge.sub}</div>
          </div>
        </div>
      ))}

      {/* Hovered node tooltip */}
      <AnimatePresence>
        {hoveredNode && (() => {
          const node = nodes.find(n => n.id === hoveredNode);
          if (!node) return null;
          const pos = projectNode(node.lat, node.lng);
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute pointer-events-none bg-[#FAF7F2]/90 border border-[#D5CCFF] rounded-lg px-3 py-2 backdrop-blur-sm z-10"
              style={{ left: pos.x - 50, top: pos.y - 60 }}
            >
              <div className="text-xs font-medium text-[#1A1035]">{node.label}</div>
              <div className="text-[10px] text-[#524D66] capitalize">{node.type} · Score: {node.value}</div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// NEURAL NETWORK VISUALIZATION
// =============================================================================

function NeuralNetworkViz({
  nodes,
  edges,
  brandColor,
  pulseActive,
}: {
  nodes: NeuralNode[];
  edges: NeuralEdge[];
  brandColor: string;
  pulseActive: boolean;
}) {
  const width = 460;
  const height = 340;
  const layerLabels = ['Signal Sources', 'Processing', 'Outcomes'];

  const getNodePos = useCallback((node: NeuralNode) => {
    const lx = [80, 230, 380];
    const layerNodes = nodes.filter(n => n.layer === node.layer);
    const totalInLayer = layerNodes.length;
    const spacing = height / (totalInLayer + 1);
    return { x: lx[node.layer], y: spacing * (node.position + 1) };
  }, [nodes, height]);

  return (
    <div className="relative">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Layer labels */}
        {layerLabels.map((label, i) => (
          <text
            key={`label-${i}`}
            x={[80, 230, 380][i]}
            y={16}
            textAnchor="middle"
            fill="white"
            fillOpacity="0.3"
            fontSize="10"
            fontFamily="monospace"
          >
            {label}
          </text>
        ))}

        {/* Edges */}
        {edges.map((edge, i) => {
          const fromNode = nodes.find(n => n.id === edge.from);
          const toNode = nodes.find(n => n.id === edge.to);
          if (!fromNode || !toNode) return null;
          const p1 = getNodePos(fromNode);
          const p2 = getNodePos(toNode);
          const pathId = `edge-path-${i}`;
          return (
            <g key={`edge-${i}`}>
              <path
                id={pathId}
                d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`}
                fill="none"
                stroke={brandColor}
                strokeWidth={edge.weight * 1.2}
                opacity={edge.active ? 0.2 : 0.06}
              />
              {/* Animated pulse particle */}
              {edge.active && (
                <circle r="2.5" fill={brandColor} opacity="0.8">
                  <animateMotion
                    dur={pulseActive ? '0.6s' : '3s'}
                    repeatCount="indefinite"
                    begin={`${(i % 5) * 0.3}s`}
                  >
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map(node => {
          const pos = getNodePos(node);
          const glowR = 12 + node.activation * 10;
          const nodeR = 8;
          return (
            <g key={node.id}>
              {/* Glow */}
              <circle
                cx={pos.x} cy={pos.y}
                r={glowR}
                fill={brandColor}
                opacity={node.activation * 0.15}
                style={{
                  filter: `drop-shadow(0 0 ${node.activation * 8}px ${brandColor})`,
                }}
              />
              {/* Node circle */}
              <circle
                cx={pos.x} cy={pos.y}
                r={nodeR}
                fill="black"
                stroke={brandColor}
                strokeWidth="1.5"
                opacity={0.4 + node.activation * 0.6}
              />
              {/* Inner dot */}
              <circle
                cx={pos.x} cy={pos.y}
                r={3}
                fill={brandColor}
                opacity={node.activation}
              />
              {/* Label */}
              <text
                x={pos.x}
                y={pos.y + nodeR + 14}
                textAnchor="middle"
                fill="white"
                fillOpacity="0.5"
                fontSize="9"
                fontFamily="monospace"
              >
                {node.label}
              </text>
              {/* Value */}
              <text
                x={pos.x}
                y={pos.y + 3}
                textAnchor="middle"
                fill="white"
                fillOpacity="0.7"
                fontSize="8"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {node.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// =============================================================================
// RISK GAUGE — Circular arc
// =============================================================================

function RiskGauge({
  score,
  label,
  animated,
}: {
  score: number;
  label: string;
  animated: boolean;
}) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 80;
  const sweepAngle = 270; // degrees
  const circumference = (sweepAngle / 360) * 2 * Math.PI * r;
  const filled = (score / 100) * circumference;
  const startAngle = 135; // degrees from 12 o'clock

  const gaugeColor = score <= 30 ? '#22c55e' : score <= 60 ? '#f59e0b' : '#ef4444';

  // Arc path
  const describeArc = (startDeg: number, endDeg: number) => {
    const startRad = ((startDeg - 90) * Math.PI) / 180;
    const endRad = ((endDeg - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <path
          d={describeArc(startAngle, startAngle + sweepAngle)}
          fill="none"
          stroke="white"
          strokeWidth="8"
          opacity="0.06"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={describeArc(startAngle, startAngle + sweepAngle)}
          fill="none"
          stroke={gaugeColor}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={animated ? circumference - filled : circumference}
          style={{
            transition: animated ? 'stroke-dashoffset 1.5s ease-out' : 'none',
            filter: `drop-shadow(0 0 6px ${gaugeColor}60)`,
          }}
        />
        {/* Center score */}
        <text
          x={cx} y={cy - 8}
          textAnchor="middle"
          fill="white"
          fontSize="36"
          fontWeight="bold"
          fontFamily="monospace"
        >
          {score}
        </text>
        {/* Label */}
        <text
          x={cx} y={cy + 16}
          textAnchor="middle"
          fill={gaugeColor}
          fontSize="12"
          fontWeight="600"
        >
          {label}
        </text>
        {/* Scale markers */}
        <text x={cx - r - 4} y={cy + 24} textAnchor="end" fill="white" fillOpacity="0.3" fontSize="9">0</text>
        <text x={cx + r + 4} y={cy + 24} textAnchor="start" fill="white" fillOpacity="0.3" fontSize="9">100</text>
      </svg>
    </div>
  );
}

// =============================================================================
// PARAM SLIDER
// =============================================================================

function ParamSlider({
  param,
  brandColor,
  onChange,
}: {
  param: SimulationParam;
  brandColor: string;
  onChange: (value: number) => void;
}) {
  const pct = ((param.value - param.min) / (param.max - param.min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#524D66]">{param.label}</span>
        <span className="text-xs font-mono font-bold text-[#1A1035]">
          {param.value}{param.unit}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={param.min}
          max={param.max}
          step={param.step}
          value={param.value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${brandColor} 0%, ${brandColor} ${pct}%, rgba(0,0,0,0.040) ${pct}%, rgba(0,0,0,0.040) 100%)`,
            accentColor: brandColor,
          }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-[#6E6688]">
        <span>{param.min}{param.unit}</span>
        <span className="text-[#6E6688]">{param.description}</span>
        <span>{param.max}{param.unit}</span>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function SimulationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Profile & branding
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Data
  const [overview, setOverview] = useState<SimulationOverview | null>(null);

  // Scenario
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [params, setParams] = useState<SimulationParam[]>([]);

  // Simulation
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [runPhase, setRunPhase] = useState<'idle' | 'charging' | 'processing' | 'complete'>('idle');

  // Neural viz state
  const [neuralPulseActive, setNeuralPulseActive] = useState(false);

  // Globe state
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [globeSpeed, setGlobeSpeed] = useState(1);

  // History
  const [showHistory, setShowHistory] = useState(false);

  const brandColor = profile?.brandColor || '#10b981';
  const aiName = profile?.aiName || 'Ilyas';

  // ── Load profile + data ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let tid = searchParams.get('tenantId');
        let uid = searchParams.get('userId');

        if (!tid || !uid) {
          const fallback = await getCurrentUser();
          if (fallback.success) {
            tid = tid || 'clinic';
            uid = uid || fallback.userId || null;
          }
        }
        if (!tid || !uid) { setLoading(false); return; }
        if (cancelled) return;

        setTenantId(tid);
        setUserId(uid);

        const [profileRes, overviewRes] = await Promise.all([
          getStaffProfile(tid, uid),
          getSimulationOverview(tid),
        ]);

        if (cancelled) return;
        if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
        if (overviewRes.success && overviewRes.data) {
          setOverview(overviewRes.data);
        }
      } catch (err) {
        console.error('[simulations] load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [searchParams]);

  // ── Selected scenario details ──────────────────────────────────────────
  const selectedTemplate = useMemo(() => {
    if (!selectedScenario || !overview) return null;
    return overview.scenarios.find(s => s.id === selectedScenario) || null;
  }, [selectedScenario, overview]);

  const handleSelectScenario = useCallback((id: string) => {
    const template = overview?.scenarios.find(s => s.id === id);
    if (!template) return;
    setSelectedScenario(id);
    setParams(template.defaultParams.map(p => ({ ...p })));
    setResult(null);
    setRunPhase('idle');
  }, [overview]);

  const handleParamChange = useCallback((paramId: string, value: number) => {
    setParams(prev => prev.map(p => p.id === paramId ? { ...p, value } : p));
  }, []);

  // ── Run Simulation ─────────────────────────────────────────────────────
  const handleRunSimulation = useCallback(async () => {
    if (!tenantId || !userId || !selectedScenario || running) return;

    setRunning(true);
    setResult(null);
    setRunPhase('charging');
    setGlobeSpeed(3);
    setNeuralPulseActive(true);

    // Phase 1: Charging (1s)
    await new Promise(res => setTimeout(res, 1000));
    setRunPhase('processing');

    // Phase 2: Processing — actual AI call
    try {
      const simParams = params.map(p => ({
        id: p.id,
        label: p.label,
        value: p.value,
        unit: p.unit,
      }));

      const res = await runSimulation(tenantId, userId, selectedScenario, simParams);

      if (res.success && res.result) {
        setResult(res.result);
      }
    } catch (err) {
      console.error('[simulations] run error:', err);
    }

    // Phase 3: Complete — settle animations
    setRunPhase('complete');
    setGlobeSpeed(1);

    setTimeout(() => {
      setNeuralPulseActive(false);
      setRunning(false);
    }, 500);
  }, [tenantId, userId, selectedScenario, params, running]);

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-8 h-8 text-[#6E6688]" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pl-[240px] relative overflow-hidden">
      {profile && <StaffNav profile={profile} userId={userId || ''} brandColor={brandColor} currentPath="Simulations" />}
      <NeuralGrid color={brandColor} />

      <div className="relative z-10 max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* ── HEADER ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/staff/dashboard?tenantId=${tenantId}&userId=${userId}`)}
              className="p-2 rounded-lg bg-white border border-[#EBE5FF] hover:bg-[#FAF9F5] transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-[#524D66]" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: `${brandColor}15` }}>
                <FlaskConical className="w-5 h-5" style={{ color: brandColor }} />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-[#1A1035]">Predictive Simulations</h1>
                <p className="text-xs text-[#6E6688]">Scenario modeling &amp; impact forecasting</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Run phase indicator */}
            <AnimatePresence>
              {runPhase !== 'idle' && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    background: runPhase === 'complete' ? '#22c55e20' : `${brandColor}20`,
                    color: runPhase === 'complete' ? '#22c55e' : brandColor,
                    border: `1px solid ${runPhase === 'complete' ? '#22c55e30' : `${brandColor}30`}`,
                  }}
                >
                  {runPhase === 'charging' && <><Loader2 className="w-3 h-3 animate-spin" /> Charging...</>}
                  {runPhase === 'processing' && <><Activity className="w-3 h-3 animate-pulse" /> Processing...</>}
                  {runPhase === 'complete' && <><Brain className="w-3 h-3" /> Complete</>}
                </motion.div>
              )}
            </AnimatePresence>

            {/* History toggle */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                showHistory ? 'bg-[#F5F2EB] text-[#1A1035]' : 'bg-white border border-[#EBE5FF] text-[#524D66] hover:bg-[#FAF9F5]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              History
            </button>
          </div>
        </div>

        {/* ── TOP ROW: Globe + Neural Network ───────────────────────────── */}
        <div className="grid grid-cols-12 gap-4">
          {/* Globe panel */}
          <div className="col-span-7 bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4 flex flex-col items-center">
            <div className="flex items-center gap-2 self-start mb-2">
              <Globe2 className="w-4 h-4 text-[#6E6688]" />
              <span className="text-xs font-medium text-[#6E6688]">Operational Network</span>
            </div>
            {overview && (
              <SpinningGlobe
                nodes={overview.globeNodes}
                connections={overview.globeConnections}
                brandColor={brandColor}
                speed={globeSpeed}
                hoveredNode={hoveredNode}
                onHoverNode={setHoveredNode}
                runPhase={runPhase}
              />
            )}
          </div>

          {/* Neural Network panel */}
          <div className="col-span-5 bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4 flex flex-col items-center">
            <div className="flex items-center gap-2 self-start mb-2">
              <Network className="w-4 h-4 text-[#6E6688]" />
              <span className="text-xs font-medium text-[#6E6688]">Agent Neural Mesh</span>
            </div>
            {overview && (
              <NeuralNetworkViz
                nodes={overview.neuralNodes}
                edges={overview.neuralEdges}
                brandColor={brandColor}
                pulseActive={neuralPulseActive}
              />
            )}
          </div>
        </div>

        {/* ── MAIN CONTENT: Scenario Builder + Results ──────────────────── */}
        <div className="grid grid-cols-12 gap-4">
          {/* Scenario Builder — left */}
          <div className="col-span-5 space-y-4">
            {/* Template selector */}
            <div className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4">
              <h3 className="text-sm font-medium text-[#524D66] mb-3">Scenario Templates</h3>
              <div className="grid grid-cols-2 gap-2">
                {overview?.scenarios.map(scenario => {
                  const Icon = SCENARIO_ICONS[scenario.icon] || FlaskConical;
                  const isSelected = selectedScenario === scenario.id;
                  const catColor = CATEGORY_COLORS[scenario.category] || brandColor;
                  return (
                    <button
                      key={scenario.id}
                      onClick={() => handleSelectScenario(scenario.id)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-[#FAF9F5] border-white/[0.15]'
                          : 'bg-[#F0ECFF] border-[#EBE5FF] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="p-1 rounded"
                          style={{ background: `${catColor}20` }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color: catColor }} />
                        </div>
                        <span className="text-xs font-medium text-[#1A1035]">{scenario.name}</span>
                      </div>
                      <p className="text-[10px] text-[#6E6688] leading-tight">{scenario.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Parameter sliders */}
            <AnimatePresence>
              {selectedTemplate && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4 space-y-4"
                >
                  <h3 className="text-sm font-medium text-[#524D66]">
                    Parameters — {selectedTemplate.name}
                  </h3>
                  {params.map(param => (
                    <ParamSlider
                      key={param.id}
                      param={param}
                      brandColor={brandColor}
                      onChange={(v) => handleParamChange(param.id, v)}
                    />
                  ))}

                  {/* Run button */}
                  <button
                    onClick={handleRunSimulation}
                    disabled={running}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium text-sm transition-all relative overflow-hidden disabled:opacity-50"
                    style={{
                      background: running ? `${brandColor}30` : brandColor,
                      color: running ? brandColor : 'black',
                    }}
                  >
                    {running ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Running Simulation...
                        {/* Pulsing ring */}
                        <motion.div
                          className="absolute inset-0 rounded-lg"
                          animate={{ opacity: [0.3, 0, 0.3] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          style={{ border: `2px solid ${brandColor}` }}
                        />
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Run Simulation
                      </>
                    )}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Prompt to select */}
            {!selectedTemplate && (
              <div className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-6 flex flex-col items-center justify-center text-center">
                <FlaskConical className="w-8 h-8 text-[#8B84A0] mb-3" />
                <p className="text-sm text-[#6E6688]">Select a scenario template above to configure simulation parameters</p>
              </div>
            )}
          </div>

          {/* Simulation Results — right */}
          <div className="col-span-7 space-y-4">
            <AnimatePresence>
              {result ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  {/* Risk Gauge + KPI projections */}
                  <div className="grid grid-cols-12 gap-4">
                    {/* Gauge */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 }}
                      className="col-span-5 bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4 flex flex-col items-center"
                    >
                      <h3 className="text-xs font-medium text-[#6E6688] mb-2 self-start">Risk Assessment</h3>
                      <RiskGauge
                        score={result.riskScore}
                        label={result.riskLabel}
                        animated={runPhase === 'complete'}
                      />
                    </motion.div>

                    {/* KPI Projections */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 }}
                      className="col-span-7 bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4"
                    >
                      <h3 className="text-xs font-medium text-[#6E6688] mb-3">KPI Projections</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {result.kpiProjections.map((kpi, i) => (
                          <motion.div
                            key={kpi.name}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 + i * 0.08 }}
                            className="flex items-center justify-between p-2 rounded bg-[#F0ECFF]"
                          >
                            <div>
                              <div className="text-[10px] text-[#6E6688]">{kpi.name}</div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-mono text-[#524D66]">{kpi.current}{kpi.unit}</span>
                                <ChevronRight className="w-3 h-3 text-[#6E6688]" />
                                <span className="text-xs font-mono font-bold text-[#1A1035]">{kpi.projected}{kpi.unit}</span>
                              </div>
                            </div>
                            <div className={`flex items-center gap-0.5 text-[10px] font-mono ${
                              kpi.trend === 'up' && kpi.name !== 'Response Time' ? 'text-emerald-400' :
                              kpi.trend === 'down' && kpi.name !== 'Response Time' ? 'text-red-400' :
                              kpi.trend === 'up' && kpi.name === 'Response Time' ? 'text-red-400' :
                              kpi.trend === 'down' && kpi.name === 'Response Time' ? 'text-emerald-400' :
                              'text-[#6E6688]'
                            }`}>
                              {kpi.trend === 'up' ? <TrendingUp className="w-3 h-3" /> :
                               kpi.trend === 'down' ? <TrendingDown className="w-3 h-3" /> :
                               <Minus className="w-3 h-3" />}
                              {kpi.delta > 0 ? '+' : ''}{kpi.delta.toFixed(1)}%
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  </div>

                  {/* Department Impacts */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4"
                  >
                    <h3 className="text-xs font-medium text-[#6E6688] mb-3">Department Impact Analysis</h3>
                    <div className="space-y-2">
                      {result.departmentImpacts.map((dept, i) => {
                        const delta = dept.projectedScore - dept.currentScore;
                        const impactColor = IMPACT_COLORS[dept.status];
                        return (
                          <motion.div
                            key={dept.name}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.7 + i * 0.06 }}
                            className="flex items-center gap-3"
                          >
                            <span className="text-xs text-[#524D66] w-36 truncate">{dept.name}</span>
                            <div className="flex-1 h-2 bg-[#FAF9F5] rounded-full overflow-hidden relative">
                              {/* Current */}
                              <div
                                className="absolute inset-y-0 left-0 bg-[#F5F2EB] rounded-full"
                                style={{ width: `${dept.currentScore}%` }}
                              />
                              {/* Projected */}
                              <motion.div
                                className="absolute inset-y-0 left-0 rounded-full"
                                initial={{ width: `${dept.currentScore}%` }}
                                animate={{ width: `${dept.projectedScore}%` }}
                                transition={{ delay: 0.8 + i * 0.06, duration: 0.8 }}
                                style={{ background: impactColor }}
                              />
                            </div>
                            <div className="flex items-center gap-1 w-20">
                              <span className="text-[10px] font-mono text-[#6E6688]">{dept.currentScore}</span>
                              <ChevronRight className="w-3 h-3 text-[#8B84A0]" />
                              <span className="text-[10px] font-mono font-bold" style={{ color: impactColor }}>
                                {dept.projectedScore}
                              </span>
                              <span className="text-[10px] font-mono" style={{ color: impactColor }}>
                                ({delta > 0 ? '+' : ''}{delta})
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>

                  {/* Agent Workload */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4"
                  >
                    <h3 className="text-xs font-medium text-[#6E6688] mb-3">Agent Workload Capacity</h3>
                    <div className="grid grid-cols-3 gap-2">
                      {result.agentWorkloads.map((agent, i) => (
                        <motion.div
                          key={agent.name}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.9 + i * 0.05 }}
                          className={`p-2 rounded-lg border ${
                            agent.overflow
                              ? 'bg-red-500/[0.06] border-red-500/20'
                              : 'bg-[#F0ECFF] border-[#EBE5FF]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-[#524D66] truncate">{agent.name}</span>
                            {agent.overflow && (
                              <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
                            )}
                          </div>
                          <div className="h-1.5 bg-[#FAF9F5] rounded-full overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              initial={{ width: `${agent.currentCapacity}%` }}
                              animate={{ width: `${Math.min(agent.projectedCapacity, 100)}%` }}
                              transition={{ delay: 1 + i * 0.05, duration: 0.8 }}
                              style={{
                                background: agent.overflow ? '#ef4444' :
                                  agent.projectedCapacity > 80 ? '#f59e0b' : brandColor,
                              }}
                            />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[9px] font-mono text-[#6E6688]">{agent.currentCapacity}%</span>
                            <span className={`text-[9px] font-mono font-bold ${
                              agent.overflow ? 'text-red-400' : 'text-[#524D66]'
                            }`}>
                              {agent.projectedCapacity}%
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Predicted Timeline */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1 }}
                    className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4"
                  >
                    <h3 className="text-xs font-medium text-[#6E6688] mb-3">Predicted Timeline</h3>
                    <div className="flex items-start gap-0 overflow-x-auto pb-2">
                      {result.predictedTimeline.map((event, i) => (
                        <motion.div
                          key={event.week}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1.1 + i * 0.08 }}
                          className="flex-1 min-w-[100px] flex flex-col items-center text-center relative"
                        >
                          {/* Connector line */}
                          {i < result.predictedTimeline.length - 1 && (
                            <div
                              className="absolute top-3 left-1/2 w-full h-px bg-[#F5F2EB]"
                            />
                          )}
                          {/* Confidence dot */}
                          <div
                            className="relative z-10 rounded-full border-2 border-black"
                            style={{
                              width: 8 + (event.confidence / 100) * 12,
                              height: 8 + (event.confidence / 100) * 12,
                              background: brandColor,
                              opacity: 0.3 + (event.confidence / 100) * 0.7,
                            }}
                          />
                          <span className="text-[10px] font-mono text-[#524D66] mt-1">
                            Wk {event.week}
                          </span>
                          <span className="text-[9px] text-[#6E6688] leading-tight mt-0.5 px-1">
                            {event.event}
                          </span>
                          <span className="text-[8px] font-mono mt-0.5" style={{ color: brandColor }}>
                            {event.confidence}%
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>

                  {/* AI Narrative */}
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2 }}
                    className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="w-4 h-4" style={{ color: brandColor }} />
                      <h3 className="text-xs font-medium text-[#524D66]">{aiName} Analysis</h3>
                    </div>
                    <div className="text-xs text-[#524D66] leading-relaxed whitespace-pre-line">
                      {result.aiNarrative}
                    </div>
                  </motion.div>
                </motion.div>
              ) : (
                /* Empty state — no results yet */
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-12 flex flex-col items-center justify-center text-center"
                >
                  <div className="relative mb-4">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{ background: `${brandColor}10` }}
                    >
                      <FlaskConical className="w-8 h-8" style={{ color: `${brandColor}40` }} />
                    </div>
                    {/* Orbiting dot */}
                    <motion.div
                      className="absolute w-2 h-2 rounded-full"
                      style={{
                        background: brandColor,
                        top: '50%',
                        left: '50%',
                      }}
                      animate={{
                        x: [0, 40, 0, -40, 0],
                        y: [-40, 0, 40, 0, -40],
                        opacity: [0.8, 0.4, 0.8, 0.4, 0.8],
                      }}
                      transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                  <p className="text-sm text-[#6E6688] mb-1">No simulation running</p>
                  <p className="text-xs text-[#6E6688]">Select a scenario and configure parameters to run a prediction</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── SIMULATION HISTORY ─────────────────────────────────────────── */}
        <AnimatePresence>
          {showHistory && overview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[#F0ECFF] border border-[#EBE5FF] rounded-xl p-4">
                <h3 className="text-sm font-medium text-[#524D66] mb-3">Recent Simulations</h3>
                <div className="space-y-1">
                  {overview.recentRuns.map((run) => {
                    const riskColor = run.riskScore <= 30 ? '#22c55e' : run.riskScore <= 60 ? '#f59e0b' : '#ef4444';
                    return (
                      <div
                        key={run.id}
                        className="flex items-center gap-4 p-3 rounded-lg bg-[#F0ECFF] hover:bg-[#FAF9F5] transition-colors"
                      >
                        {/* Risk badge */}
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-mono font-bold"
                          style={{ background: `${riskColor}15`, color: riskColor }}
                        >
                          {run.riskScore}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[#1A1035]">{run.scenarioName}</span>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{
                                background: `${riskColor}15`,
                                color: riskColor,
                              }}
                            >
                              {run.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#6E6688] mt-0.5 truncate">{run.keyFinding}</p>
                        </div>
                        {/* Timestamp */}
                        <div className="text-[10px] text-[#6E6688] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(run.timestamp).toLocaleDateString('en-GB', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                        {/* Re-run */}
                        <button
                          className="p-1.5 rounded hover:bg-[#FAF9F5] transition-colors"
                          title="Re-run this simulation"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-[#6E6688]" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

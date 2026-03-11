'use server';

import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================


export interface GlobeNode {
  id: string;
  lat: number;        // -90 to 90
  lng: number;        // -180 to 180
  label: string;
  value: number;
  color: string;
  type: 'department' | 'agent' | 'metric';
}

export interface GlobeConnection {
  from: string;
  to: string;
  strength: number;   // 0-1
  active: boolean;
}

export interface NeuralNode {
  id: string;
  layer: 0 | 1 | 2;
  position: number;   // vertical index within layer
  label: string;
  value: number;
  activation: number; // 0-1
}

export interface NeuralEdge {
  from: string;
  to: string;
  weight: number;     // 0-1
  active: boolean;
}

export interface ScenarioTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'operational' | 'financial' | 'strategic' | 'risk';
  defaultParams: SimulationParam[];
}

export interface SimulationParam {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  description: string;
}

export interface KPIProjection {
  name: string;
  current: number;
  projected: number;
  delta: number;
  trend: 'up' | 'down' | 'flat';
  unit: string;
}

export interface DepartmentImpact {
  name: string;
  currentScore: number;
  projectedScore: number;
  status: 'positive' | 'neutral' | 'negative' | 'critical';
}

export interface AgentWorkload {
  name: string;
  currentCapacity: number;   // 0-100
  projectedCapacity: number; // 0-100+
  overflow: boolean;
}

export interface TimelineEvent {
  week: number;
  event: string;
  confidence: number; // 0-100
}

export interface SimulationResult {
  riskScore: number;         // 0-100
  riskLabel: string;
  kpiProjections: KPIProjection[];
  departmentImpacts: DepartmentImpact[];
  agentWorkloads: AgentWorkload[];
  predictedTimeline: TimelineEvent[];
  aiNarrative: string;
}

export interface SimulationRun {
  id: string;
  scenarioName: string;
  timestamp: string;
  riskScore: number;
  status: 'completed' | 'warning' | 'critical';
  keyFinding: string;
}

export interface SimulationOverview {
  globeNodes: GlobeNode[];
  globeConnections: GlobeConnection[];
  neuralNodes: NeuralNode[];
  neuralEdges: NeuralEdge[];
  scenarios: ScenarioTemplate[];
  recentRuns: SimulationRun[];
}

// =============================================================================
// MOCK DATA — Globe Nodes
// =============================================================================

const MOCK_GLOBE_NODES: GlobeNode[] = [
  // Departments
  { id: 'gn-aesthetics', lat: 45, lng: -30, label: 'Aesthetics', value: 83, color: '#ef4444', type: 'department' },
  { id: 'gn-wellness', lat: 20, lng: 60, label: 'Wellness & IV', value: 87, color: '#8b5cf6', type: 'department' },
  { id: 'gn-medical', lat: -15, lng: -90, label: 'Medical & GP', value: 91, color: '#3b82f6', type: 'department' },
  { id: 'gn-compliance', lat: -40, lng: 120, label: 'Compliance', value: 68, color: '#f97316', type: 'department' },
  { id: 'gn-ops', lat: 60, lng: 150, label: 'Operations', value: 78, color: '#22c55e', type: 'department' },
  // Agents
  { id: 'gn-agent-aria', lat: 35, lng: -60, label: 'Aria (EWC)', value: 89, color: '#ffffff', type: 'agent' },
  { id: 'gn-agent-orion', lat: -5, lng: -120, label: 'Orion', value: 93, color: '#d1d5db', type: 'agent' },
  { id: 'gn-agent-arry', lat: -30, lng: 90, label: 'Aria', value: 86, color: '#9ca3af', type: 'agent' },
  // Metrics
  { id: 'gn-signals', lat: 0, lng: 0, label: 'Signal Hub', value: 47, color: '#f59e0b', type: 'metric' },
  { id: 'gn-resolution', lat: -55, lng: -150, label: 'Resolution Rate', value: 82, color: '#10b981', type: 'metric' },
  { id: 'gn-confidence', lat: 70, lng: -120, label: 'Avg Confidence', value: 87, color: '#6366f1', type: 'metric' },
];

const MOCK_GLOBE_CONNECTIONS: GlobeConnection[] = [
  // Department ↔ Agent links
  { from: 'gn-aesthetics', to: 'gn-agent-aria', strength: 0.85, active: true },
  { from: 'gn-wellness', to: 'gn-agent-aria', strength: 0.8, active: true },
  { from: 'gn-medical', to: 'gn-agent-aria', strength: 0.75, active: true },
  { from: 'gn-aesthetics', to: 'gn-agent-orion', strength: 0.9, active: true },
  { from: 'gn-wellness', to: 'gn-agent-orion', strength: 0.82, active: true },
  { from: 'gn-aesthetics', to: 'gn-agent-arry', strength: 0.78, active: true },
  { from: 'gn-ops', to: 'gn-agent-aria', strength: 0.7, active: true },
  // Cross-department links
  { from: 'gn-aesthetics', to: 'gn-wellness', strength: 0.6, active: true },
  { from: 'gn-wellness', to: 'gn-medical', strength: 0.55, active: true },
  { from: 'gn-compliance', to: 'gn-ops', strength: 0.7, active: true },
  { from: 'gn-medical', to: 'gn-compliance', strength: 0.5, active: false },
  // Agent ↔ Metric links
  { from: 'gn-agent-aria', to: 'gn-signals', strength: 0.88, active: true },
  { from: 'gn-agent-orion', to: 'gn-signals', strength: 0.72, active: true },
  { from: 'gn-agent-arry', to: 'gn-signals', strength: 0.65, active: true },
  // Metric cross-links
  { from: 'gn-signals', to: 'gn-resolution', strength: 0.85, active: true },
  { from: 'gn-signals', to: 'gn-confidence', strength: 0.78, active: true },
  { from: 'gn-resolution', to: 'gn-confidence', strength: 0.65, active: false },
  // Extended links
  { from: 'gn-agent-orion', to: 'gn-ops', strength: 0.45, active: false },
  { from: 'gn-compliance', to: 'gn-confidence', strength: 0.55, active: true },
];

// =============================================================================
// MOCK DATA — Neural Network
// =============================================================================

const MOCK_NEURAL_NODES: NeuralNode[] = [
  // Input Layer (Signal Sources)
  { id: 'nn-input-manual', layer: 0, position: 0, label: 'Manual', value: 14, activation: 0.55 },
  { id: 'nn-input-agent', layer: 0, position: 1, label: 'Agent', value: 21, activation: 0.88 },
  { id: 'nn-input-auto', layer: 0, position: 2, label: 'Automation', value: 8, activation: 0.67 },
  { id: 'nn-input-integ', layer: 0, position: 3, label: 'Cliniko', value: 4, activation: 0.38 },
  // Hidden Layer (AI Agents)
  { id: 'nn-hidden-aria', layer: 1, position: 0, label: 'Aria', value: 89, activation: 0.89 },
  { id: 'nn-hidden-orion', layer: 1, position: 1, label: 'Orion', value: 93, activation: 0.93 },
  { id: 'nn-hidden-arry', layer: 1, position: 2, label: 'Aria', value: 86, activation: 0.86 },
  // Output Layer (Outcomes)
  { id: 'nn-output-resolved', layer: 2, position: 0, label: 'Resolved', value: 82, activation: 0.82 },
  { id: 'nn-output-escalated', layer: 2, position: 1, label: 'Escalated', value: 11, activation: 0.3 },
  { id: 'nn-output-pending', layer: 2, position: 2, label: 'Pending', value: 7, activation: 0.18 },
];

const MOCK_NEURAL_EDGES: NeuralEdge[] = (() => {
  const edges: NeuralEdge[] = [];
  const inputIds = MOCK_NEURAL_NODES.filter(n => n.layer === 0).map(n => n.id);
  const hiddenIds = MOCK_NEURAL_NODES.filter(n => n.layer === 1).map(n => n.id);
  const outputIds = MOCK_NEURAL_NODES.filter(n => n.layer === 2).map(n => n.id);

  // Input → Hidden
  for (const from of inputIds) {
    for (const to of hiddenIds) {
      edges.push({
        from, to,
        weight: 0.3 + Math.random() * 0.7,
        active: Math.random() > 0.3,
      });
    }
  }
  // Hidden → Output
  for (const from of hiddenIds) {
    for (const to of outputIds) {
      edges.push({
        from, to,
        weight: 0.4 + Math.random() * 0.6,
        active: Math.random() > 0.2,
      });
    }
  }
  return edges;
})();

// =============================================================================
// MOCK DATA — Scenario Templates
// =============================================================================

const MOCK_SCENARIOS: ScenarioTemplate[] = [
  {
    id: 'sc-revenue-drop',
    name: 'Revenue Shortfall',
    description: 'Model the impact of a treatment booking decline on clinic revenue and operations',
    icon: 'TrendingDown',
    category: 'financial',
    defaultParams: [
      { id: 'p-revenue-pct', label: 'Booking Drop', min: 5, max: 40, step: 5, value: 20, unit: '%', description: 'Percentage decline in monthly bookings' },
      { id: 'p-revenue-depts', label: 'Affected Treatments', min: 1, max: 5, step: 1, value: 2, unit: 'treatments', description: 'Number of treatment lines affected' },
      { id: 'p-revenue-timeline', label: 'Recovery Period', min: 1, max: 12, step: 1, value: 3, unit: 'months', description: 'Expected time to restore booking levels' },
      { id: 'p-revenue-reserve', label: 'Cash Reserve', min: 0, max: 50, step: 5, value: 15, unit: '%', description: 'Cash reserve as percentage of monthly revenue' },
    ],
  },
  {
    id: 'sc-staff-crisis',
    name: 'Staff Capacity Crisis',
    description: 'Simulate sudden staff departures and their cascade effects on clinic operations',
    icon: 'UserMinus',
    category: 'operational',
    defaultParams: [
      { id: 'p-staff-loss', label: 'Staff Departures', min: 1, max: 5, step: 1, value: 2, unit: 'staff', description: 'Number of simultaneous departures' },
      { id: 'p-staff-seniority', label: 'Avg Seniority', min: 1, max: 10, step: 1, value: 4, unit: 'years', description: 'Average years of clinical experience lost' },
      { id: 'p-staff-backfill', label: 'Backfill Time', min: 2, max: 16, step: 2, value: 6, unit: 'weeks', description: 'Expected time to recruit and credential replacements' },
    ],
  },
  {
    id: 'sc-signal-surge',
    name: 'Signal Surge',
    description: 'Test system resilience under dramatically increased signal volume',
    icon: 'Zap',
    category: 'operational',
    defaultParams: [
      { id: 'p-surge-mult', label: 'Volume Multiplier', min: 1.5, max: 5, step: 0.5, value: 2, unit: '×', description: 'Signal volume increase factor' },
      { id: 'p-surge-duration', label: 'Surge Duration', min: 1, max: 8, step: 1, value: 2, unit: 'weeks', description: 'How long the surge lasts' },
      { id: 'p-surge-priority', label: 'Critical Signal %', min: 5, max: 40, step: 5, value: 15, unit: '%', description: 'Percentage of signals that are critical priority' },
      { id: 'p-surge-agents', label: 'Agent Availability', min: 50, max: 100, step: 10, value: 80, unit: '%', description: 'Agent processing availability during surge' },
    ],
  },
  {
    id: 'sc-new-treatment',
    name: 'New Treatment Launch',
    description: 'Model the operational impact of launching a new treatment line at the clinic',
    icon: 'Building2',
    category: 'strategic',
    defaultParams: [
      { id: 'p-treat-patients', label: 'Target Patients/Month', min: 5, max: 50, step: 5, value: 20, unit: 'patients', description: 'Expected monthly patient volume for new treatment' },
      { id: 'p-treat-signals', label: 'Expected Signals', min: 2, max: 20, step: 2, value: 6, unit: '/month', description: 'Anticipated monthly operational signals' },
      { id: 'p-treat-ramp', label: 'Ramp-up Period', min: 2, max: 12, step: 2, value: 6, unit: 'weeks', description: 'Time to reach full patient throughput' },
    ],
  },
  {
    id: 'sc-agent-expand',
    name: 'Agent Expansion',
    description: 'Evaluate the effect of deploying additional AI agents across the system',
    icon: 'Bot',
    category: 'strategic',
    defaultParams: [
      { id: 'p-agent-count', label: 'New Agents', min: 1, max: 6, step: 1, value: 3, unit: 'agents', description: 'Number of new AI agents to deploy' },
      { id: 'p-agent-accuracy', label: 'Expected Accuracy', min: 70, max: 95, step: 5, value: 85, unit: '%', description: 'Projected accuracy of new agents' },
      { id: 'p-agent-coverage', label: 'Signal Coverage', min: 20, max: 80, step: 10, value: 50, unit: '%', description: 'Percentage of signals routed to new agents' },
      { id: 'p-agent-training', label: 'Training Period', min: 1, max: 8, step: 1, value: 2, unit: 'weeks', description: 'Initial calibration and training period' },
    ],
  },
  {
    id: 'sc-cqc-inspection',
    name: 'CQC Inspection',
    description: 'Simulate a CQC inspection and stress-test clinic governance and compliance readiness',
    icon: 'Shield',
    category: 'risk',
    defaultParams: [
      { id: 'p-cqc-gaps', label: 'Open Compliance Gaps', min: 0, max: 10, step: 1, value: 3, unit: 'gaps', description: 'Number of outstanding compliance items at time of inspection' },
      { id: 'p-cqc-depth', label: 'Inspection Depth', min: 1, max: 5, step: 1, value: 3, unit: 'level', description: 'Thoroughness level (1=light touch, 5=deep dive)' },
      { id: 'p-cqc-notice', label: 'Notice Period', min: 0, max: 14, step: 1, value: 5, unit: 'days', description: 'Days of advance notice before inspection' },
    ],
  },
];

// =============================================================================
// FALLBACK RESULT (for when AI call fails)
// =============================================================================

const FALLBACK_RESULT: SimulationResult = {
  riskScore: 0,
  riskLabel: 'No Data',
  kpiProjections: [],
  departmentImpacts: [],
  agentWorkloads: [],
  predictedTimeline: [],
  aiNarrative: 'Simulation could not be completed. Please try again.',
};

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getSimulationOverview(
  _tenantId: string,
): Promise<{ success: boolean; data?: SimulationOverview; error?: string }> {
  return {
    success: true,
    data: {
      globeNodes: MOCK_GLOBE_NODES,
      globeConnections: MOCK_GLOBE_CONNECTIONS,
      neuralNodes: MOCK_NEURAL_NODES,
      neuralEdges: MOCK_NEURAL_EDGES,
      scenarios: MOCK_SCENARIOS,
      recentRuns: MOCK_RECENT_RUNS,
    },
  };
}

export async function getScenarioTemplates(
  _tenantId: string,
): Promise<{ success: boolean; scenarios?: ScenarioTemplate[]; error?: string }> {
  return { success: true, scenarios: MOCK_SCENARIOS };
}

const MOCK_RECENT_RUNS: SimulationRun[] = [
  { id: 'run-001', scenarioName: 'CQC Inspection', timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), riskScore: 71, status: 'warning', keyFinding: '3 open compliance gaps pose a moderate risk if CQC arrive with less than 5 days notice.' },
  { id: 'run-002', scenarioName: 'Signal Surge', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), riskScore: 38, status: 'completed', keyFinding: 'System can absorb a 2× signal surge for up to 2 weeks before Aria reaches capacity.' },
  { id: 'run-003', scenarioName: 'Revenue Shortfall', timestamp: new Date(Date.now() - 9 * 86400000).toISOString(), riskScore: 54, status: 'warning', keyFinding: 'A 20% Aesthetics booking drop would reduce monthly revenue by ~£8,400 — activate follow-up automations to mitigate.' },
];

export async function getSimulationHistory(
  _tenantId: string,
): Promise<{ success: boolean; runs?: SimulationRun[]; error?: string }> {
  return { success: true, runs: MOCK_RECENT_RUNS };
}

export async function runSimulation(
  _tenantId: string,
  _userId: string,
  scenarioId: string,
  params: { id: string; label: string; value: number; unit: string }[],
): Promise<{ success: boolean; result?: SimulationResult; error?: string }> {

  const scenario = MOCK_SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) return { success: false, error: 'Unknown scenario' };

  try {
    const client = getAnthropicClient();

    const paramsDescription = params.map(p => `- ${p.label}: ${p.value}${p.unit}`).join('\n');

    const systemPrompt = `You are Aria, the predictive simulation AI for this clinic. You model "what-if" scenarios and produce realistic clinical and operational impact assessments for clinic leadership.

Scenario: "${scenario.name}"
Description: ${scenario.description}

Parameters:
${paramsDescription}

Current clinic baseline:
- Signals: 47/month, Resolution Rate: 82%, Avg Response Time: 2.8h
- Automation Rate: 67%, Agent Accuracy: 89%
- 5 departments: Aesthetics (83% resolution), Wellness & IV (87%), Medical & GP (91%), Compliance (68%), Operations (78%)
- 3 AI agents: Aria/EWC (89% accuracy, 31 signals), Orion/Sales (93%, 9 signals), Aria/CRM (86%, 7 signals)
- Monthly revenue target: £42,000 | Corporate accounts: 3 active

Generate a concise (150-200 word) narrative analysis of this simulation. Include:
1. Overall risk assessment with a risk score (0-100)
2. Which departments/agents are most affected and how
3. Key inflection points and timeline
4. Specific, actionable recommendations for Dr Ganata

Use British English. Be data-driven and reference specific numbers from the clinic baseline.`;

    const response = await client.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Run the "${scenario.name}" simulation with the parameters above and provide your predictive analysis.` }],
    });

    const narrative = response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate analysis.';

    return {
      success: true,
      result: {
        riskScore: 50,
        riskLabel: 'Pending Analysis',
        kpiProjections: [],
        departmentImpacts: [],
        agentWorkloads: [],
        predictedTimeline: [],
        aiNarrative: narrative,
      },
    };
  } catch {
    return {
      success: true,
      result: FALLBACK_RESULT,
    };
  }
}

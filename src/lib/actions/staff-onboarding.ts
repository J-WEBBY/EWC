'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';
import { getAgentsForTenant } from '@/lib/actions/agent-service';
import { getStaffSession } from '@/lib/supabase/tenant-context';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// =============================================================================
// TYPES
// =============================================================================

export interface StaffProfile {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  departmentName: string | null;
  departmentId: string | null;
  roleName: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  companyName: string;
  aiName: string;
  brandColor: string;
  logoUrl: string | null;
  industry: string | null;
  reportsTo: string | null;
  teamSize: number;
}

export interface IntelligenceMap {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: 'organization' | 'department' | 'role';
  live: boolean;
}

export interface ToolOption {
  id: string;
  name: string;
  category: 'communication' | 'productivity' | 'finance' | 'documents' | 'project' | 'industry' | 'analytics';
  icon: string;
}

export interface AgentCard {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: 'industry' | 'company';
  badge?: string;
}

export interface StaffOnboardingData {
  profile: StaffProfile;
  intelligenceMaps: IntelligenceMap[];
  tools: ToolOption[];
  agents: AgentCard[];
}

export interface StaffPreferences {
  communicationStyle: 'concise' | 'detailed' | 'balanced';
  proactivityLevel: 'reactive' | 'gentle' | 'proactive';
}

export interface UserSettings {
  selectedTools: string[];
  agentPreferences: Record<string, 'quiet' | 'nudge' | 'active'>;
  communicationStyle: 'concise' | 'balanced' | 'detailed';
  proactivityLevel: 'reactive' | 'gentle' | 'proactive';
}

// =============================================================================
// STATIC DATA — Intelligence Map Templates
// =============================================================================

function computeIntelligenceMaps(
  industry: string | null,
  departmentName: string | null,
  jobTitle: string | null,
): IntelligenceMap[] {
  const maps: IntelligenceMap[] = [];
  const ind = (industry || '').toLowerCase();
  const dept = (departmentName || '').toLowerCase();
  const title = (jobTitle || '').toLowerCase();

  // ── Organization-tier maps (everyone sees these) ──
  maps.push(
    { id: 'org_pulse', title: 'Organization Pulse', description: 'Live health metrics across departments with trend analysis and anomaly detection', icon: 'Activity', tier: 'organization', live: true },
    { id: 'org_insights', title: 'Strategic Insights', description: 'AI-generated weekly intelligence brief with cross-department patterns and recommendations', icon: 'Brain', tier: 'organization', live: true },
  );

  // Add industry-specific org map
  if (ind.includes('education') || ind.includes('charity')) {
    maps.push({ id: 'org_impact', title: 'Impact Dashboard', description: 'Track outcomes against objectives, generate funder-ready impact reports', icon: 'Target', tier: 'organization', live: true });
  } else if (ind.includes('recruit')) {
    maps.push({ id: 'org_pipeline', title: 'Pipeline Overview', description: 'Company-wide recruitment pipeline with velocity metrics and bottleneck detection', icon: 'TrendingUp', tier: 'organization', live: true });
  } else if (ind.includes('account') || ind.includes('finance')) {
    maps.push({ id: 'org_fiscal', title: 'Fiscal Health', description: 'Revenue recognition, cash flow forecasts, and cross-client portfolio analysis', icon: 'BarChart3', tier: 'organization', live: true });
  } else if (ind.includes('legal')) {
    maps.push({ id: 'org_caseload', title: 'Caseload Intelligence', description: 'Firm-wide case distribution, outcome tracking, and capacity utilization', icon: 'BarChart3', tier: 'organization', live: true });
  } else if (ind.includes('property') || ind.includes('estate')) {
    maps.push({ id: 'org_portfolio', title: 'Portfolio Health', description: 'Occupancy rates, rental yield analysis, and maintenance cost tracking', icon: 'Building', tier: 'organization', live: true });
  } else if (ind.includes('supply') || ind.includes('logistics')) {
    maps.push({ id: 'org_supply', title: 'Supply Network', description: 'End-to-end supply chain visibility with risk scoring and alternative routing', icon: 'Truck', tier: 'organization', live: true });
  }

  // ── Department-tier maps ──
  if (dept.includes('finance') || dept.includes('account')) {
    maps.push(
      { id: 'dept_budget', title: 'Budget Tracker', description: 'Real-time spend vs. allocation with variance alerts and reforecast triggers', icon: 'TrendingUp', tier: 'department', live: true },
      { id: 'dept_approvals', title: 'Approval Queue', description: 'Smart-prioritized queue for purchase orders, expenses, and budget requests', icon: 'ListChecks', tier: 'department', live: true },
    );
  } else if (dept.includes('marketing') || dept.includes('comms') || dept.includes('communication')) {
    maps.push(
      { id: 'dept_engagement', title: 'Engagement Analytics', description: 'Cross-channel performance metrics with audience sentiment tracking', icon: 'BarChart2', tier: 'department', live: true },
      { id: 'dept_content', title: 'Content Intelligence', description: 'AI-assisted content calendar with optimal timing and channel recommendations', icon: 'Calendar', tier: 'department', live: true },
    );
  } else if (dept.includes('welfare') || dept.includes('support') || dept.includes('hr') || dept.includes('people')) {
    maps.push(
      { id: 'dept_wellbeing', title: 'Wellbeing Monitor', description: 'Anonymized pattern detection for systemic issues with intervention recommendations', icon: 'Heart', tier: 'department', live: true },
      { id: 'dept_cases', title: 'Case Intelligence', description: 'Case load distribution, resolution tracking, and resource allocation insights', icon: 'Shield', tier: 'department', live: true },
    );
  } else if (dept.includes('operation') || dept.includes('facilit')) {
    maps.push(
      { id: 'dept_ops', title: 'Operations Dashboard', description: 'Facility utilization, maintenance scheduling, and operational efficiency metrics', icon: 'Settings', tier: 'department', live: true },
      { id: 'dept_logistics', title: 'Resource Planner', description: 'Space and resource allocation with predictive booking patterns', icon: 'LayoutGrid', tier: 'department', live: true },
    );
  } else if (dept.includes('student') && (dept.includes('activ') || dept.includes('voice') || dept.includes('represent'))) {
    maps.push(
      { id: 'dept_participation', title: 'Participation Tracker', description: 'Society and event engagement metrics with trend analysis and growth signals', icon: 'Users', tier: 'department', live: true },
      { id: 'dept_events', title: 'Event Intelligence', description: 'Attendance prediction, scheduling optimization, and logistics automation', icon: 'Calendar', tier: 'department', live: true },
    );
  } else if (dept.includes('commercial') || dept.includes('sales') || dept.includes('revenue')) {
    maps.push(
      { id: 'dept_revenue', title: 'Revenue Intelligence', description: 'Sales pipeline analytics with conversion prediction and pricing optimization', icon: 'TrendingUp', tier: 'department', live: true },
      { id: 'dept_customer', title: 'Customer Insights', description: 'Client satisfaction tracking with churn prediction and expansion opportunities', icon: 'Users', tier: 'department', live: true },
    );
  } else if (dept.includes('leadership') || dept.includes('executive')) {
    maps.push(
      { id: 'dept_strategic', title: 'Strategic Command', description: 'Executive-level KPI tracking with AI-generated board-ready summaries', icon: 'Compass', tier: 'department', live: true },
      { id: 'dept_risk', title: 'Risk Radar', description: 'Cross-functional risk detection with early warning signals and mitigation suggestions', icon: 'AlertTriangle', tier: 'department', live: true },
    );
  } else {
    maps.push(
      { id: 'dept_team', title: 'Team Dashboard', description: 'Department workload, capacity, and performance metrics at a glance', icon: 'Users', tier: 'department', live: true },
      { id: 'dept_workflow', title: 'Workflow Monitor', description: 'Active process tracking with bottleneck detection and completion forecasts', icon: 'Activity', tier: 'department', live: true },
    );
  }

  // ── Role-tier maps (personalized) ──
  const isLead = title.includes('head') || title.includes('manager') || title.includes('director') || title.includes('lead') || title.includes('coordinator') || title.includes('president');

  if (isLead) {
    maps.push(
      { id: 'role_team_perf', title: 'Team Performance', description: 'Individual and collective output metrics with AI coaching suggestions', icon: 'Target', tier: 'role', live: true },
      { id: 'role_priorities', title: 'Priority Engine', description: 'AI-ranked task list based on deadlines, dependencies, and strategic importance', icon: 'Sparkles', tier: 'role', live: true },
    );
  } else {
    maps.push(
      { id: 'role_focus', title: 'Focus Board', description: 'Your personal AI-prioritized task list with smart reminders and context', icon: 'Target', tier: 'role', live: true },
      { id: 'role_growth', title: 'Growth Tracker', description: 'Skills development suggestions, learning paths, and achievement milestones', icon: 'TrendingUp', tier: 'role', live: true },
    );
  }

  return maps;
}

// =============================================================================
// STATIC DATA — Toolkit (tools by industry)
// =============================================================================

function computeToolkit(industry: string | null): ToolOption[] {
  const ind = (industry || '').toLowerCase();

  // Common tools everyone sees
  const common: ToolOption[] = [
    { id: 'slack', name: 'Slack', category: 'communication', icon: 'MessageSquare' },
    { id: 'teams', name: 'Microsoft Teams', category: 'communication', icon: 'MessageSquare' },
    { id: 'email_outlook', name: 'Outlook / Email', category: 'communication', icon: 'Mail' },
    { id: 'zoom', name: 'Zoom', category: 'communication', icon: 'Video' },
    { id: 'google_workspace', name: 'Google Workspace', category: 'productivity', icon: 'LayoutGrid' },
    { id: 'ms_office', name: 'Microsoft 365', category: 'productivity', icon: 'FileText' },
    { id: 'notion', name: 'Notion', category: 'documents', icon: 'BookOpen' },
    { id: 'sharepoint', name: 'SharePoint', category: 'documents', icon: 'FolderOpen' },
    { id: 'trello', name: 'Trello', category: 'project', icon: 'LayoutGrid' },
    { id: 'asana', name: 'Asana', category: 'project', icon: 'CheckSquare' },
    { id: 'jira', name: 'Jira', category: 'project', icon: 'GitBranch' },
    { id: 'excel_sheets', name: 'Excel / Sheets', category: 'analytics', icon: 'BarChart3' },
  ];

  // Industry-specific tools
  let specific: ToolOption[] = [];

  if (ind.includes('education') || ind.includes('charity')) {
    specific = [
      { id: 'moodle', name: 'Moodle / VLE', category: 'industry', icon: 'BookOpen' },
      { id: 'eventbrite', name: 'Eventbrite', category: 'industry', icon: 'Calendar' },
      { id: 'mailchimp', name: 'Mailchimp', category: 'industry', icon: 'Mail' },
      { id: 'canva', name: 'Canva', category: 'industry', icon: 'Palette' },
      { id: 'sms_union', name: 'MSL / Union Cloud', category: 'industry', icon: 'Users' },
      { id: 'sage', name: 'Sage / Xero', category: 'finance', icon: 'Calculator' },
      { id: 'survey_monkey', name: 'SurveyMonkey', category: 'analytics', icon: 'BarChart2' },
      { id: 'social_media', name: 'Social Media Tools', category: 'communication', icon: 'Radio' },
    ];
  } else if (ind.includes('recruit')) {
    specific = [
      { id: 'ats', name: 'ATS (Bullhorn/Greenhouse)', category: 'industry', icon: 'Users' },
      { id: 'linkedin_recruiter', name: 'LinkedIn Recruiter', category: 'industry', icon: 'Search' },
      { id: 'indeed', name: 'Indeed / Job Boards', category: 'industry', icon: 'Search' },
      { id: 'crm_recruit', name: 'Recruitment CRM', category: 'industry', icon: 'Users' },
      { id: 'calendly', name: 'Calendly', category: 'productivity', icon: 'Calendar' },
      { id: 'docusign', name: 'DocuSign', category: 'documents', icon: 'FileText' },
    ];
  } else if (ind.includes('account') || ind.includes('finance')) {
    specific = [
      { id: 'xero', name: 'Xero', category: 'finance', icon: 'Calculator' },
      { id: 'sage_acc', name: 'Sage', category: 'finance', icon: 'Calculator' },
      { id: 'quickbooks', name: 'QuickBooks', category: 'finance', icon: 'Calculator' },
      { id: 'dext', name: 'Dext / Receipt Bank', category: 'finance', icon: 'FileText' },
      { id: 'taxcalc', name: 'TaxCalc / CCH', category: 'industry', icon: 'ShieldCheck' },
      { id: 'power_bi', name: 'Power BI / Tableau', category: 'analytics', icon: 'BarChart3' },
    ];
  } else if (ind.includes('legal')) {
    specific = [
      { id: 'clio', name: 'Clio / PracticePanther', category: 'industry', icon: 'FileText' },
      { id: 'westlaw', name: 'Westlaw / LexisNexis', category: 'industry', icon: 'Search' },
      { id: 'docusign_legal', name: 'DocuSign', category: 'documents', icon: 'FileText' },
      { id: 'billing_legal', name: 'Legal Billing Software', category: 'finance', icon: 'Calculator' },
      { id: 'case_mgmt', name: 'Case Management System', category: 'industry', icon: 'FolderOpen' },
      { id: 'contract_mgmt', name: 'Contract Management', category: 'industry', icon: 'Shield' },
    ];
  } else if (ind.includes('property') || ind.includes('estate')) {
    specific = [
      { id: 'property_mgmt', name: 'Property Management System', category: 'industry', icon: 'Building' },
      { id: 'rightmove', name: 'Rightmove / Zoopla', category: 'industry', icon: 'Search' },
      { id: 'reapit', name: 'Reapit / Alto', category: 'industry', icon: 'Building' },
      { id: 'fixflo', name: 'Fixflo / Maintenance', category: 'industry', icon: 'Wrench' },
      { id: 'docusign_prop', name: 'DocuSign', category: 'documents', icon: 'FileText' },
      { id: 'power_bi_prop', name: 'Power BI / Analytics', category: 'analytics', icon: 'BarChart3' },
    ];
  } else if (ind.includes('supply') || ind.includes('logistics')) {
    specific = [
      { id: 'sap', name: 'SAP / Oracle', category: 'industry', icon: 'Package' },
      { id: 'warehouse_mgmt', name: 'WMS (Warehouse)', category: 'industry', icon: 'Package' },
      { id: 'tms', name: 'TMS (Transport)', category: 'industry', icon: 'Truck' },
      { id: 'erp', name: 'ERP System', category: 'industry', icon: 'LayoutGrid' },
      { id: 'tracking', name: 'Shipment Tracking', category: 'industry', icon: 'Map' },
      { id: 'power_bi_sc', name: 'Power BI / Analytics', category: 'analytics', icon: 'BarChart3' },
    ];
  }

  return [...common, ...specific];
}

// =============================================================================
// DB-DRIVEN AGENTS — loads from agents table per tenant
// =============================================================================

async function getAgentsAsCards(): Promise<AgentCard[]> {
  const agents = await getAgentsForTenant();

  return agents.map(a => ({
    id: a.agent_key,
    name: a.display_name || a.name,
    description: a.description || '',
    icon: a.icon || 'Bot',
    type: a.type as 'industry' | 'company',
    badge: a.type === 'industry' ? 'Industry' : undefined,
  }));
}

// =============================================================================
// getStaffProfile — Load user + dept + role + tenant + maps + tools + agents
// =============================================================================

export async function getStaffProfile(
  _tenantId: string,
  userId: string,
): Promise<{ success: boolean; data?: StaffOnboardingData; error?: string }> {
  if (!userId || !UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();
    const session = await getStaffSession();
    const tenantId = session?.tenantId;

    const userQuery = sovereign
      .from('users')
      .select('id, first_name, last_name, email, job_title, department_id, role_id, is_admin, department:departments(id, name), role:roles(name)')
      .eq('id', userId);
    if (tenantId) userQuery.eq('tenant_id', tenantId);

    const clinicQuery = sovereign
      .from('clinic_config')
      .select('clinic_name, ai_name, brand_color, logo_url');
    if (tenantId) clinicQuery.eq('tenant_id', tenantId);

    const [userResult, clinicResult] = await Promise.all([
      userQuery.single(),
      clinicQuery.single(),
    ]);

    const user = userResult.data;
    if (userResult.error || !user) {
      console.error('[staff-onboarding] user fetch failed:', userResult.error);
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    const clinic = clinicResult.data;

    // Count teammates
    let teamSize = 0;
    if (user.department_id) {
      const countQuery = sovereign
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', user.department_id)
        .neq('id', userId);
      if (tenantId) countQuery.eq('tenant_id', tenantId);
      const { count } = await countQuery;
      teamSize = count || 0;
    }

    const dept = user.department as unknown as Record<string, unknown> | null;
    const role = user.role as unknown as Record<string, unknown> | null;
    const deptName = (dept?.name as string) || null;
    const titleStr = user.job_title || null;

    const profile: StaffProfile = {
      userId: user.id,
      firstName: user.first_name || 'Team Member',
      lastName: user.last_name || '',
      email: user.email,
      jobTitle: titleStr,
      departmentName: deptName,
      departmentId: user.department_id,
      roleName: (role?.name as string) || null,
      isAdmin: user.is_admin,
      isOwner: false,
      companyName: clinic?.clinic_name || 'Your Clinic',
      aiName: clinic?.ai_name || 'Aria',
      brandColor: clinic?.brand_color || '#0ea5e9',
      logoUrl: clinic?.logo_url || null,
      industry: 'healthcare',
      reportsTo: null,
      teamSize,
    };

    return {
      success: true,
      data: {
        profile,
        intelligenceMaps: computeIntelligenceMaps('healthcare', deptName, titleStr),
        tools: computeToolkit('healthcare'),
        agents: await getAgentsAsCards(),
      },
    };
  } catch (err: unknown) {
    console.error('[staff-onboarding] getStaffProfile threw:', err);
    return { success: false, error: 'FETCH_FAILED' };
  }
}

// =============================================================================
// generateRoleInsight — AI-generated one-liner about their position
// =============================================================================

export async function generateRoleInsight(
  profile: StaffProfile,
): Promise<{ success: boolean; insight?: string; error?: string }> {
  try {
    const anthropic = getAnthropicClient();
    const msg = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 120,
      system: `You are ${profile.aiName}, an operational intelligence system for ${profile.companyName}. Write ONE sentence (25 words max) about what you can specifically do for this person in their role. Be concrete, not generic. Do NOT use markdown.`,
      messages: [{
        role: 'user',
        content: `${profile.firstName} ${profile.lastName}, ${profile.jobTitle || 'Team Member'} in ${profile.departmentName || 'the organization'}. Industry: ${profile.industry || 'professional services'}.`,
      }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return { success: true, insight: text };
  } catch {
    return { success: true, insight: `I'll help you work smarter in ${profile.departmentName || 'your role'}.` };
  }
}

// =============================================================================
// saveToolkitSelections — Persist selected tools to users.settings
// =============================================================================

export async function saveToolkitSelections(
  _tenantId: string,
  userId: string,
  toolIds: string[],
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();

    const { data: existing } = await sovereign
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single();

    const settings = { ...(existing?.settings as Record<string, unknown> || {}), selectedTools: toolIds };

    const { error } = await sovereign
      .from('users')
      .update({ settings })
      .eq('id', userId);

    if (error) return { success: false, error: 'UPDATE_FAILED' };
    return { success: true };
  } catch {
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// =============================================================================
// saveAgentPreferences — Persist agent notification prefs to users.settings
// =============================================================================

export async function saveAgentPreferences(
  _tenantId: string,
  userId: string,
  agentPrefs: Record<string, 'quiet' | 'nudge' | 'active'>,
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();

    const { data: existing } = await sovereign
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single();

    const settings = { ...(existing?.settings as Record<string, unknown> || {}), agentPreferences: agentPrefs };

    const { error } = await sovereign
      .from('users')
      .update({ settings })
      .eq('id', userId);

    if (error) return { success: false, error: 'UPDATE_FAILED' };
    return { success: true };
  } catch {
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// =============================================================================
// saveCalibration — Persist communication + proactivity prefs
// =============================================================================

export async function saveCalibration(
  _tenantId: string,
  userId: string,
  prefs: StaffPreferences,
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();

    const { data: existing } = await sovereign
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single();

    const settings = {
      ...(existing?.settings as Record<string, unknown> || {}),
      communicationStyle: prefs.communicationStyle,
      proactivityLevel: prefs.proactivityLevel,
    };

    const { error } = await sovereign
      .from('users')
      .update({ settings })
      .eq('id', userId);

    if (error) return { success: false, error: 'UPDATE_FAILED' };
    return { success: true };
  } catch {
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// =============================================================================
// completeStaffOnboarding — Mark user as onboarded
// =============================================================================

export async function completeStaffOnboarding(
  _tenantId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();
    const { error } = await sovereign
      .from('users')
      .update({
        staff_onboarding_completed: true,
        staff_onboarding_completed_at: new Date().toISOString(),
        status: 'active',
      })
      .eq('id', userId);

    if (error) {
      console.error('[staff-onboarding] completeStaffOnboarding failed:', error);
      return { success: false, error: 'UPDATE_FAILED' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// =============================================================================
// getUserSettings — Load user preferences from settings JSONB
// =============================================================================

export async function getUserSettings(
  _tenantId: string,
  userId: string,
): Promise<{ success: boolean; settings?: UserSettings; error?: string }> {
  if (!userId || !UUID_RE.test(userId)) return { success: false, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();
    const { data, error } = await sovereign
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single();

    if (error || !data) return { success: false, error: 'NOT_FOUND' };

    const s = (data.settings || {}) as Record<string, unknown>;
    return {
      success: true,
      settings: {
        selectedTools: (s.selectedTools as string[]) || [],
        agentPreferences: (s.agentPreferences as Record<string, 'quiet' | 'nudge' | 'active'>) || {},
        communicationStyle: (s.communicationStyle as 'concise' | 'balanced' | 'detailed') || 'balanced',
        proactivityLevel: (s.proactivityLevel as 'reactive' | 'gentle' | 'proactive') || 'gentle',
      },
    };
  } catch {
    return { success: false, error: 'FETCH_FAILED' };
  }
}

// =============================================================================
// LEGACY-COMPATIBLE — getUserData (used by dashboard page)
// =============================================================================

export async function getUserData(_tenantId: string, userId: string) {
  if (!userId || !UUID_RE.test(userId)) return { success: false as const, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();

    const [userResult, clinicResult] = await Promise.all([
      sovereign
        .from('users')
        .select('id, first_name, last_name, email, job_title, is_admin, role:roles(name)')
        .eq('id', userId)
        .single(),
      sovereign
        .from('clinic_config')
        .select('clinic_name, ai_name, brand_color, logo_url')
        .single(),
    ]);

    const user = userResult.data;
    if (userResult.error || !user) return { success: false as const, error: 'USER_NOT_FOUND' };

    const clinic = clinicResult.data;
    const role = user.role as unknown as Record<string, unknown> | null;

    return {
      success: true as const,
      user: {
        user_id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: (role?.name as string) || user.job_title || 'Staff',
        is_admin: user.is_admin,
        company_name: clinic?.clinic_name || 'Your Clinic',
        ai_name: clinic?.ai_name || 'Aria',
        brand_color: clinic?.brand_color || '#0ea5e9',
        logo_url: clinic?.logo_url || null,
      },
    };
  } catch {
    return { success: false as const, error: 'FETCH_FAILED' };
  }
}

// =============================================================================
// LEGACY-COMPATIBLE — getDashboardConfig (used by dashboard page)
// =============================================================================

export async function getDashboardConfig(_tenantId: string, userId: string) {
  if (!userId || !UUID_RE.test(userId)) return { success: false as const, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();
    const { data, error } = await sovereign
      .from('users')
      .select('settings')
      .eq('id', userId)
      .single();

    if (error || !data) return { success: false as const, error: 'CONFIG_NOT_FOUND' };
    const cfg = (data.settings as Record<string, unknown>)?.dashboard_config;
    if (!cfg) return { success: false as const, error: 'CONFIG_NOT_FOUND' };
    return { success: true as const, config: cfg };
  } catch {
    return { success: false as const, error: 'FETCH_FAILED' };
  }
}

// =============================================================================
// LEGACY-COMPATIBLE — generatePersonalizedDashboard (used by processing page)
// =============================================================================

export async function generatePersonalizedDashboard(_tenantId: string, userId: string) {
  if (!userId || !UUID_RE.test(userId)) return { success: false as const, error: 'INVALID_USER' };

  try {
    const sovereign = createSovereignClient();

    const [userResult, clinicResult] = await Promise.all([
      sovereign
        .from('users')
        .select('first_name, job_title, onboarding_responses, settings, role:roles(name), department:departments(name)')
        .eq('id', userId)
        .single(),
      sovereign
        .from('clinic_config')
        .select('clinic_name, ai_name')
        .single(),
    ]);

    const user = userResult.data;
    if (userResult.error || !user) return { success: false as const, error: 'USER_NOT_FOUND' };

    const clinic = clinicResult.data;
    const anthropic = getAnthropicClient();
    const role = user.role as unknown as Record<string, unknown> | null;
    const dept = user.department as unknown as Record<string, unknown> | null;

    const completion = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.SONNET,
      max_tokens: 2048,
      system: `You are a dashboard configuration AI. Based on a staff member's role, preferences, and onboarding responses, generate a personalized dashboard configuration.

Return ONLY valid JSON with this structure:
{
  "widgets": [{ "type": "string", "title": "string", "size": "small|medium|large|full", "position": 1 }],
  "quick_actions": [{ "id": "string", "label": "string", "description": "string" }],
  "greeting": "Personalized greeting"
}

Widget sizes: small (1/4), medium (1/2), large (3/4), full (100%). Positions 1-6.
Return ONLY the JSON.`,
      messages: [{
        role: 'user',
        content: `Generate dashboard for:
Role: ${(role?.name as string) || user.job_title || 'Staff'}
Department: ${(dept?.name as string) || 'General'}
Name: ${user.first_name}
Company: ${clinic?.clinic_name || 'Your Clinic'}
AI Name: ${clinic?.ai_name || 'Aria'}
Preferences: ${JSON.stringify(user.settings || {})}
Onboarding: ${JSON.stringify(user.onboarding_responses || {})}`,
      }],
    });

    const raw = completion.content[0].type === 'text' ? completion.content[0].text : '{}';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const config = JSON.parse(cleaned);

    // Store dashboard config inside user settings
    const { data: existing } = await sovereign.from('users').select('settings').eq('id', userId).single();
    const updatedSettings = { ...(existing?.settings as Record<string, unknown> || {}), dashboard_config: config };
    await sovereign.from('users').update({ settings: updatedSettings }).eq('id', userId);

    return { success: true as const, config };
  } catch {
    return { success: false as const, error: 'GENERATION_FAILED' };
  }
}

// =============================================================================
// getCurrentUser — resolve the active admin user (single-tenant)
// =============================================================================

export async function getCurrentUser(): Promise<{
  success: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    const sovereign = createSovereignClient();

    const { data: user, error: userErr } = await sovereign
      .from('users')
      .select('id')
      .eq('status', 'active')
      .order('is_admin', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (userErr || !user) {
      return { success: false, error: 'NO_USER_FOUND' };
    }

    return { success: true, userId: user.id };
  } catch {
    return { success: false, error: 'RESOLUTION_FAILED' };
  }
}

// getLatestTenantAndUser — kept for backward compat, use getStaffSession() instead
/** @deprecated use getStaffSession() from @/lib/supabase/tenant-context */
export async function getLatestTenantAndUser(): Promise<{
  success: boolean;
  tenantId?: string;
  userId?: string;
  error?: string;
}> {
  const session = await getStaffSession();
  if (session) {
    return { success: true, tenantId: session.tenantId, userId: session.userId };
  }
  const res = await getCurrentUser();
  return { ...res, tenantId: undefined };
}

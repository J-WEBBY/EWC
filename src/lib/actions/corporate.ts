'use server';

// =============================================================================
// Corporate Accounts — B2B client management, employer wellness packages
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

// =============================================================================
// TYPES
// =============================================================================

export type AccountStatus = 'active' | 'negotiating' | 'renewal_due' | 'at_risk' | 'lapsed';
export type PackageTier = 'essential' | 'premium' | 'bespoke';

export interface CorporateContact {
  name: string;
  title: string;
  email: string;
  phone: string | null;
}

export interface CorporateAccount {
  id: string;
  company_name: string;
  industry: string;
  employee_count: number;
  primary_contact: CorporateContact;
  package_tier: PackageTier;
  annual_value: number;
  contract_start: string;
  contract_end: string;
  status: AccountStatus;
  utilisation_pct: number;    // how much of the package they've used
  treatments_ytd: number;
  outstanding_invoice: number | null;
  notes: string | null;
  ai_account_brief: string | null;
}

export interface CorporateStats {
  total_accounts: number;
  active_accounts: number;
  total_arr: number;           // annual recurring revenue
  renewal_due_30d: number;
  at_risk_value: number;
  avg_utilisation: number;
}

// =============================================================================
// DEMO DATA
// =============================================================================

const DEMO_ACCOUNTS: CorporateAccount[] = [
  {
    id: 'corp-001',
    company_name: 'Midlands Law Group',
    industry: 'Legal',
    employee_count: 120,
    primary_contact: { name: 'Helen Brady', title: 'Head of HR', email: 'h.brady@midlandslaw.co.uk', phone: '0121 555 0101' },
    package_tier: 'premium',
    annual_value: 18000,
    contract_start: '2025-01-01',
    contract_end: '2026-01-01',
    status: 'active',
    utilisation_pct: 62,
    treatments_ytd: 47,
    outstanding_invoice: null,
    notes: 'Key account — quarterly review due Feb 2026. Considering adding weight loss programme.',
    ai_account_brief: 'Strong account at 62% utilisation. Renewal 10 months away. Opportunity to upsell weight management or executive health screening to extend value.',
  },
  {
    id: 'corp-002',
    company_name: 'Apex Financial Services',
    industry: 'Finance',
    employee_count: 85,
    primary_contact: { name: 'Daniel Cross', title: 'COO', email: 'd.cross@apexfs.co.uk', phone: null },
    package_tier: 'bespoke',
    annual_value: 32000,
    contract_start: '2024-06-01',
    contract_end: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'renewal_due',
    utilisation_pct: 88,
    treatments_ytd: 104,
    outstanding_invoice: null,
    notes: 'Renewal in 28 days. High utilisation — strong case for renewal. Director satisfaction very high.',
    ai_account_brief: 'RENEWAL URGENT — contract expires in 28 days. 88% utilisation demonstrates strong ROI for the client. Priority call with Daniel Cross this week to agree renewal terms.',
  },
  {
    id: 'corp-003',
    company_name: 'Pinnacle Property Group',
    industry: 'Real Estate',
    employee_count: 55,
    primary_contact: { name: 'Sandra Okafor', title: 'MD', email: 's.okafor@pinnacleproperty.co.uk', phone: '0121 555 0230' },
    package_tier: 'essential',
    annual_value: 8400,
    contract_start: '2025-03-01',
    contract_end: '2026-03-01',
    status: 'at_risk',
    utilisation_pct: 22,
    treatments_ytd: 8,
    outstanding_invoice: 1400,
    notes: 'Low utilisation — employees not aware of the package. Invoice £1400 overdue 21 days.',
    ai_account_brief: 'AT RISK: only 22% utilisation and overdue invoice. Recommend scheduling employee awareness session with Pinnacle, and sending invoice reminder. If no engagement within 14 days, flag for churn risk.',
  },
  {
    id: 'corp-004',
    company_name: 'Edgbaston Private School',
    industry: 'Education',
    employee_count: 68,
    primary_contact: { name: 'James Whitfield', title: 'Bursar', email: 'j.whitfield@edgbastonschool.co.uk', phone: '0121 555 0340' },
    package_tier: 'essential',
    annual_value: 6000,
    contract_start: '2025-09-01',
    contract_end: '2026-09-01',
    status: 'active',
    utilisation_pct: 41,
    treatments_ytd: 14,
    outstanding_invoice: null,
    notes: 'New account — 5 months in. Good start. Teachers strongly taking up IV therapy and Botox.',
    ai_account_brief: 'New account performing well at 41% utilisation after 5 months. On track to hit 70%+ by year end. No issues.',
  },
  {
    id: 'corp-005',
    company_name: 'BrightTech Solutions',
    industry: 'Technology',
    employee_count: 210,
    primary_contact: { name: 'Priya Mehra', title: 'People & Culture Director', email: 'p.mehra@brighttech.io', phone: null },
    package_tier: 'bespoke',
    annual_value: 45000,
    contract_start: '2024-01-01',
    contract_end: '2026-06-30',
    status: 'negotiating',
    utilisation_pct: 75,
    treatments_ytd: 188,
    outstanding_invoice: null,
    notes: 'Largest prospect — currently negotiating multi-site bespoke package for Birmingham + Manchester offices.',
    ai_account_brief: 'High-value prospect at negotiation stage. 75% trial utilisation (pilot). Secure executive commitment before March end. Multi-site deal could be £45k+ ARR.',
  },
];

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getCorporateAccounts(
  _tenantId: string,
): Promise<{ success: boolean; data?: { accounts: CorporateAccount[]; stats: CorporateStats }; error?: string }> {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'UNAUTHORIZED' };
    const supabase = createSovereignClient();
    await supabase.from('clinic_config').select('id').limit(1);

    const accounts = DEMO_ACCOUNTS;
    const now = new Date();
    const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const stats: CorporateStats = {
      total_accounts: accounts.length,
      active_accounts: accounts.filter(a => a.status === 'active' || a.status === 'renewal_due').length,
      total_arr: accounts.filter(a => a.status !== 'lapsed').reduce((s, a) => s + a.annual_value, 0),
      renewal_due_30d: accounts.filter(a => new Date(a.contract_end) <= in30d && a.status !== 'lapsed').length,
      at_risk_value: accounts.filter(a => a.status === 'at_risk').reduce((s, a) => s + a.annual_value, 0),
      avg_utilisation: Math.round(accounts.reduce((s, a) => s + a.utilisation_pct, 0) / accounts.length),
    };

    return { success: true, data: { accounts, stats } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function generateAccountBrief(
  _tenantId: string,
  accountId: string,
): Promise<{ success: boolean; data?: { brief: string }; error?: string }> {
  try {
    const session = await getStaffSession();
    if (!session) return { success: false, error: 'UNAUTHORIZED' };
    const account = DEMO_ACCOUNTS.find(a => a.id === accountId);
    if (!account) return { success: false, error: 'Account not found' };

    const client = getAnthropicClient();
    const daysToRenewal = Math.round((new Date(account.contract_end).getTime() - Date.now()) / 86400000);

    const response = await client.messages.create({
      model: ANTHROPIC_MODELS.HAIKU,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Corporate account AI brief for Edgbaston Wellness Clinic. Account: ${account.company_name} (${account.industry}), ${account.employee_count} employees. Package: ${account.package_tier} (£${account.annual_value}/yr). Utilisation: ${account.utilisation_pct}%. Status: ${account.status}. Contract end: ${daysToRenewal > 0 ? daysToRenewal + ' days' : 'EXPIRED'}. Outstanding invoice: ${account.outstanding_invoice ? '£' + account.outstanding_invoice : 'None'}. Notes: ${account.notes}.\n\nWrite a 2-3 sentence account intelligence brief and the single most important action for the account manager right now.`,
      }],
    });

    const brief = response.content[0].type === 'text' ? response.content[0].text : account.ai_account_brief ?? '';
    return { success: true, data: { brief } };
  } catch {
    const account = DEMO_ACCOUNTS.find(a => a.id === accountId);
    return { success: true, data: { brief: account?.ai_account_brief ?? 'Brief unavailable.' } };
  }
}

export async function logCorporateNote(
  _tenantId: string,
  accountId: string,
  note: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  void accountId; void note;
  return { success: true };
}

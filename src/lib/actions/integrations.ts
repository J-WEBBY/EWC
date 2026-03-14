'use server';

// =============================================================================
// TYPES
// =============================================================================

export type ConnectionStatus = 'connected' | 'pending' | 'error' | 'disconnected';
export type IntegrationCategory = 'communication' | 'productivity' | 'documents' | 'project' | 'analytics' | 'finance' | 'industry' | 'automation';

export interface CatalogIntegration {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  icon: string;
  popular: boolean;
  auth_type: 'oauth' | 'api_key' | 'webhook';
  features: string[];
}

export interface ConnectedIntegration {
  id: string;
  catalog_id: string;
  name: string;
  category: IntegrationCategory;
  icon: string;
  status: ConnectionStatus;
  auth_type: 'oauth' | 'api_key' | 'webhook';
  connected_at: string | null;
  connected_by: string;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'partial' | 'failed' | null;
  sync_error: string | null;
  data_synced: number;
  config: Record<string, string>;
}

export interface IntegrationStats {
  total_connected: number;
  total_available: number;
  healthy: number;
  errored: number;
  total_syncs_today: number;
  data_points_synced: number;
}

export interface SyncLogEntry {
  id: string;
  integration_id: string;
  integration_name: string;
  status: 'success' | 'partial' | 'failed';
  records_synced: number;
  duration_ms: number;
  error_message: string | null;
  synced_at: string;
}

// =============================================================================
// CATALOG — All available integrations
// =============================================================================

const CATALOG: CatalogIntegration[] = [
  // Communication
  { id: 'slack', name: 'Slack', description: 'Send notifications, receive commands, and sync channel data with your workspace', category: 'communication', icon: 'MessageSquare', popular: true, auth_type: 'oauth', features: ['Notifications', 'Commands', 'Channel sync'] },
  { id: 'teams', name: 'Microsoft Teams', description: 'Push alerts to Teams channels, sync calendar events, and enable bot interactions', category: 'communication', icon: 'MessageSquare', popular: true, auth_type: 'oauth', features: ['Notifications', 'Calendar sync', 'Bot'] },
  { id: 'email_outlook', name: 'Outlook / Email', description: 'Send automated emails, parse incoming messages, and sync calendar events', category: 'communication', icon: 'Mail', popular: true, auth_type: 'oauth', features: ['Send emails', 'Parse inbox', 'Calendar'] },
  { id: 'zoom', name: 'Zoom', description: 'Schedule meetings automatically, sync recordings, and track attendance', category: 'communication', icon: 'Video', popular: false, auth_type: 'oauth', features: ['Schedule meetings', 'Recordings', 'Attendance'] },
  { id: 'social_media', name: 'Social Media Tools', description: 'Monitor sentiment across platforms, schedule posts, and track engagement metrics', category: 'communication', icon: 'Radio', popular: false, auth_type: 'api_key', features: ['Sentiment analysis', 'Scheduling', 'Analytics'] },

  // Productivity
  { id: 'google_workspace', name: 'Google Workspace', description: 'Sync documents, sheets, calendar events, and drive files bidirectionally', category: 'productivity', icon: 'LayoutGrid', popular: true, auth_type: 'oauth', features: ['Docs sync', 'Sheets sync', 'Drive', 'Calendar'] },
  { id: 'ms_office', name: 'Microsoft 365', description: 'Connect to Office apps, OneDrive, and SharePoint for seamless document flow', category: 'productivity', icon: 'FileText', popular: true, auth_type: 'oauth', features: ['Office apps', 'OneDrive', 'SharePoint'] },
  { id: 'calendly', name: 'Calendly', description: 'Auto-schedule meetings based on availability and sync with your calendar', category: 'productivity', icon: 'Calendar', popular: false, auth_type: 'api_key', features: ['Scheduling', 'Calendar sync', 'Reminders'] },

  // Documents
  { id: 'notion', name: 'Notion', description: 'Sync knowledge base pages, databases, and wiki content automatically', category: 'documents', icon: 'BookOpen', popular: true, auth_type: 'oauth', features: ['Page sync', 'Database sync', 'Wiki'] },
  { id: 'sharepoint', name: 'SharePoint', description: 'Connect to document libraries, lists, and intranet sites for content ingestion', category: 'documents', icon: 'FolderOpen', popular: false, auth_type: 'oauth', features: ['Document library', 'Lists', 'Sites'] },
  { id: 'docusign', name: 'DocuSign', description: 'Track document signing status, automate signature requests, and archive completed contracts', category: 'documents', icon: 'FileText', popular: false, auth_type: 'oauth', features: ['E-signatures', 'Templates', 'Archive'] },

  // Project Management
  { id: 'trello', name: 'Trello', description: 'Sync boards, cards, and checklists — auto-create cards from signals', category: 'project', icon: 'LayoutGrid', popular: false, auth_type: 'api_key', features: ['Board sync', 'Auto-create cards', 'Checklists'] },
  { id: 'asana', name: 'Asana', description: 'Create tasks from signals, sync project timelines, and track team workload', category: 'project', icon: 'CheckSquare', popular: false, auth_type: 'oauth', features: ['Task creation', 'Timeline sync', 'Workload'] },
  { id: 'jira', name: 'Jira', description: 'Create and track issues, sync sprint data, and automate status transitions', category: 'project', icon: 'GitBranch', popular: false, auth_type: 'api_key', features: ['Issue tracking', 'Sprint sync', 'Automation'] },

  // Analytics
  { id: 'excel_sheets', name: 'Excel / Sheets', description: 'Import and export data to spreadsheets for custom reporting and analysis', category: 'analytics', icon: 'BarChart3', popular: false, auth_type: 'api_key', features: ['Import/Export', 'Templates', 'Formulas'] },
  { id: 'survey_monkey', name: 'SurveyMonkey', description: 'Sync survey responses into signals, trigger workflows on new submissions', category: 'analytics', icon: 'BarChart2', popular: false, auth_type: 'api_key', features: ['Response sync', 'Triggers', 'Analytics'] },
  { id: 'power_bi', name: 'Power BI / Tableau', description: 'Push data to dashboards and pull insights from external analytics platforms', category: 'analytics', icon: 'BarChart3', popular: false, auth_type: 'api_key', features: ['Data push', 'Dashboard sync', 'Reports'] },

  // Finance
  { id: 'sage', name: 'Sage / Xero', description: 'Sync invoices, expenses, and financial data for budget monitoring signals', category: 'finance', icon: 'Calculator', popular: false, auth_type: 'oauth', features: ['Invoice sync', 'Expense tracking', 'Budgets'] },
  { id: 'quickbooks', name: 'QuickBooks', description: 'Connect accounting data, automate reconciliation, and generate financial signals', category: 'finance', icon: 'Calculator', popular: false, auth_type: 'oauth', features: ['Accounting sync', 'Reconciliation', 'Reports'] },

  // Industry
  { id: 'moodle', name: 'Moodle / VLE', description: 'Sync student engagement data, course completions, and learning analytics', category: 'industry', icon: 'BookOpen', popular: false, auth_type: 'api_key', features: ['Engagement data', 'Completions', 'Analytics'] },
  { id: 'eventbrite', name: 'Eventbrite', description: 'Sync event registrations, attendance tracking, and ticket sales data', category: 'industry', icon: 'Calendar', popular: false, auth_type: 'api_key', features: ['Registrations', 'Attendance', 'Ticket data'] },
  { id: 'mailchimp', name: 'Mailchimp', description: 'Sync email campaigns, audience segments, and engagement metrics', category: 'industry', icon: 'Mail', popular: false, auth_type: 'api_key', features: ['Campaigns', 'Segments', 'Metrics'] },
  { id: 'sms_union', name: 'MSL / Union Cloud', description: 'Sync membership data, society records, and student union operations', category: 'industry', icon: 'Users', popular: false, auth_type: 'api_key', features: ['Membership', 'Societies', 'Elections'] },

  // Automation platforms
  { id: 'n8n', name: 'n8n', description: 'Open-source workflow automation — connect via webhooks for full pipeline control', category: 'automation', icon: 'Zap', popular: true, auth_type: 'webhook', features: ['Webhooks', 'Custom flows', 'Self-hosted'] },
  { id: 'zapier', name: 'Zapier', description: 'Connect to 5,000+ apps with no-code zaps — trigger actions from signals', category: 'automation', icon: 'Zap', popular: true, auth_type: 'api_key', features: ['5000+ apps', 'No-code', 'Triggers'] },
  { id: 'custom_webhook', name: 'Custom Webhook', description: 'Direct HTTP integration with any REST API — full control over payloads', category: 'automation', icon: 'Globe', popular: false, auth_type: 'webhook', features: ['REST API', 'Custom headers', 'Payloads'] },
];

// =============================================================================
// DATA — Empty (populated from real integration connections)
// =============================================================================

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getConnectedIntegrations(
): Promise<{ success: boolean; integrations?: ConnectedIntegration[]; error?: string }> {
  return { success: true, integrations: [] };
}

export async function getIntegrationCatalog(
): Promise<{ success: boolean; catalog?: CatalogIntegration[]; error?: string }> {
  return { success: true, catalog: CATALOG };
}

export async function getIntegrationStats(
): Promise<{ success: boolean; stats?: IntegrationStats; error?: string }> {
  return {
    success: true,
    stats: {
      total_connected: 0,
      total_available: CATALOG.length,
      healthy: 0,
      errored: 0,
      total_syncs_today: 0,
      data_points_synced: 0,
    },
  };
}

export async function getSyncLog(
): Promise<{ success: boolean; log?: SyncLogEntry[]; error?: string }> {
  return { success: true, log: [] };
}

export async function testConnection(
  _integrationId: string,
): Promise<{ success: boolean; status?: 'ok' | 'failed'; latency_ms?: number; error?: string }> {
  // TODO: Real connection test against integration endpoint
  return { success: true, status: 'ok', latency_ms: 0 };
}

export async function disconnectIntegration(
  _integrationId: string,
): Promise<{ success: boolean; error?: string }> {
  // TODO: Remove from DB when integrations are live
  return { success: true };
}

// =============================================================================
// CLINIC CONFIG SETTINGS HELPERS (for Vapi / Twilio / Stripe)
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

async function getClinicSettings(): Promise<Record<string, unknown>> {
  const db = createSovereignClient();
  const { data } = await db.from('clinic_config').select('settings').single();
  return (data?.settings as Record<string, unknown>) ?? {};
}

async function patchClinicSettings(patch: Record<string, unknown>): Promise<void> {
  const db = createSovereignClient();
  const { data } = await db.from('clinic_config').select('id, settings').single();
  const current = (data?.settings as Record<string, unknown>) ?? {};
  const newSettings = { ...current, ...patch };
  if (data?.id) {
    await db.from('clinic_config').update({
      settings:   newSettings,
      updated_at: new Date().toISOString(),
    }).eq('id', data.id);
  } else {
    await db.from('clinic_config').insert({ settings: newSettings });
  }
}

// =============================================================================
// VAPI
// =============================================================================

export async function getVapiConfig(): Promise<{
  isConnected: boolean;
  publicKey: string | null;
  lastTestedAt: string | null;
}> {
  const s = await getClinicSettings();
  const v = s.vapi as Record<string, string> | null;
  return {
    isConnected:  !!(v?.private_key),
    publicKey:    v?.public_key ?? null,
    lastTestedAt: v?.last_tested_at ?? null,
  };
}

export async function saveVapiConfig(
  privateKey: string,
  publicKey: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.vapi.ai/assistant?limit=1', {
      headers: { Authorization: `Bearer ${privateKey}` },
    });
    if (!res.ok) {
      return { success: false, error: 'Invalid API key — could not connect to Vapi. Check your Private API Key and try again.' };
    }
    await patchClinicSettings({
      vapi: {
        private_key:    privateKey,
        public_key:     publicKey || null,
        last_tested_at: new Date().toISOString(),
      },
    });
    return { success: true };
  } catch {
    return { success: false, error: 'Could not reach Vapi. Check your internet connection and try again.' };
  }
}

export async function disconnectVapi(): Promise<{ success: boolean }> {
  await patchClinicSettings({ vapi: null });
  return { success: true };
}

// =============================================================================
// TWILIO
// =============================================================================

export async function getTwilioConfig(): Promise<{
  isConnected: boolean;
  phoneNumber: string | null;
  lastTestedAt: string | null;
}> {
  const s = await getClinicSettings();
  const t = s.twilio as Record<string, string> | null;
  return {
    isConnected:  !!(t?.account_sid && t?.auth_token),
    phoneNumber:  t?.phone_number ?? null,
    lastTestedAt: t?.last_tested_at ?? null,
  };
}

export async function saveTwilioConfig(
  accountSid: string,
  authToken: string,
  phoneNumber: string,
): Promise<{ success: boolean; friendlyName?: string; error?: string }> {
  try {
    const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      { headers: { Authorization: `Basic ${creds}` } },
    );
    if (!res.ok) {
      return { success: false, error: 'Could not verify your Twilio credentials. Check your Account SID and Authentication Token.' };
    }
    const json = await res.json() as { friendly_name?: string };
    await patchClinicSettings({
      twilio: {
        account_sid:    accountSid,
        auth_token:     authToken,
        phone_number:   phoneNumber || null,
        last_tested_at: new Date().toISOString(),
      },
    });
    return { success: true, friendlyName: json.friendly_name };
  } catch {
    return { success: false, error: 'Could not reach Twilio. Check your internet connection and try again.' };
  }
}

export async function disconnectTwilio(): Promise<{ success: boolean }> {
  await patchClinicSettings({ twilio: null });
  return { success: true };
}

// =============================================================================
// STRIPE
// =============================================================================

export async function getStripeConfig(): Promise<{
  isConnected: boolean;
  accountName: string | null;
  lastTestedAt: string | null;
}> {
  const s = await getClinicSettings();
  const st = s.stripe as Record<string, string> | null;
  return {
    isConnected:  !!(st?.secret_key),
    accountName:  st?.account_name ?? null,
    lastTestedAt: st?.last_tested_at ?? null,
  };
}

export async function saveStripeConfig(
  publishableKey: string,
  secretKey: string,
): Promise<{ success: boolean; accountName?: string; error?: string }> {
  try {
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) {
      return { success: false, error: 'Invalid Stripe Secret Key — could not connect. Check your key and try again.' };
    }
    const json = await res.json() as { business_profile?: { name?: string }; email?: string };
    const accountName = json.business_profile?.name ?? json.email ?? 'Stripe account';
    await patchClinicSettings({
      stripe: {
        publishable_key: publishableKey || null,
        secret_key:      secretKey,
        account_name:    accountName,
        last_tested_at:  new Date().toISOString(),
      },
    });
    return { success: true, accountName };
  } catch {
    return { success: false, error: 'Could not reach Stripe. Check your internet connection and try again.' };
  }
}

export async function disconnectStripe(): Promise<{ success: boolean }> {
  await patchClinicSettings({ stripe: null });
  return { success: true };
}

// =============================================================================
// Integrations Page — Server Component
// Pre-fetches all integration statuses server-side so the client renders
// with correct state immediately — no "Not connected" flash on load.
// =============================================================================

import { redirect } from 'next/navigation';
import {
  getCurrentUser,
  getStaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getClinikoStatus,
  getClinikoStats,
} from '@/lib/actions/cliniko';
import {
  getVapiConfig,
  getTwilioConfig,
  getStripeConfig,
} from '@/lib/actions/integrations';
import IntegrationsClient from './_client';

export default async function IntegrationsPage() {
  // Auth
  const userRes = await getCurrentUser();
  if (!userRes.success || !userRes.userId) redirect('/login');

  // Fetch everything in parallel — statuses arrive with the HTML, zero client flash
  const [profileRes, clinikoStatus, clinikoStats, vapiCfg, twilioCfg, stripeCfg] =
    await Promise.all([
      getStaffProfile('clinic', userRes.userId),
      getClinikoStatus(),
      getClinikoStats(),
      getVapiConfig(),
      getTwilioConfig(),
      getStripeConfig(),
    ]);

  if (!profileRes.success || !profileRes.data) redirect('/login');

  return (
    <IntegrationsClient
      profile={profileRes.data.profile}
      userId={userRes.userId}
      initialCliniko={{ status: clinikoStatus, stats: clinikoStats }}
      initialVapi={vapiCfg}
      initialTwilio={twilioCfg}
      initialStripe={stripeCfg}
    />
  );
}

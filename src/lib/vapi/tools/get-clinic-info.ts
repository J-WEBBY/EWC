// =============================================================================
// Vapi Tool: get_clinic_info
// Loads clinic info from clinic_config — tenant-aware via Vapi call context.
// Falls back to generic responses if DB unavailable.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export async function getClinicInfo(args: {
  topic: 'hours' | 'location' | 'team' | 'parking' | 'general';
  tenantId?: string;
}): Promise<string> {
  const { topic, tenantId } = args;

  // Try to load clinic-specific info from DB
  if (tenantId) {
    try {
      const db = createSovereignClient();
      const { data } = await db
        .from('clinic_config')
        .select('clinic_name, settings')
        .eq('tenant_id', tenantId)
        .single();

      if (data) {
        const clinicName = data.clinic_name || 'the clinic';
        const settings = (data.settings as Record<string, unknown>) ?? {};
        const hoursText = (settings.opening_hours as string) ?? 'Monday to Friday 9:00am – 6:00pm, Saturday 10:00am – 2:00pm, Sunday closed';

        switch (topic) {
          case 'hours':
            return `${clinicName} opening hours: ${hoursText}. Bank holidays: please call to confirm.`;
          case 'location':
            return `Please contact ${clinicName} directly for our address and directions, or visit our website for full details.`;
          case 'team':
            return `${clinicName} has a team of qualified practitioners and healthcare professionals. All practitioners are fully registered with the relevant regulatory bodies. Consultations are always carried out by a qualified clinician.`;
          case 'parking':
            return `For parking and accessibility information, please contact ${clinicName} directly when booking your appointment.`;
          case 'general':
          default:
            return `${clinicName} is a premium private clinic offering aesthetic, wellness, and medical services. All aesthetic consultations are completely free with no obligation to proceed.`;
        }
      }
    } catch {
      // Fall through to generic responses
    }
  }

  // Generic fallback responses
  switch (topic) {
    case 'hours':
      return `Our clinic is open Monday to Friday 9:00am to 6:00pm and Saturday 10:00am to 2:00pm. We are closed on Sundays and bank holidays.`;
    case 'location':
      return `Please contact us directly for our address and directions. We are happy to help you plan your visit.`;
    case 'team':
      return `Our clinical team consists of qualified practitioners, nurses, and healthcare professionals — all fully registered with the relevant regulatory bodies.`;
    case 'parking':
      return `Please contact us when booking your appointment and we will advise on the best parking or transport options for your visit.`;
    case 'general':
    default:
      return `We are a premium private clinic offering aesthetic treatments, wellness services, and medical consultations. All aesthetic consultations are completely free with no obligation to proceed.`;
  }
}

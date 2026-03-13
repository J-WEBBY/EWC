'use server';

import { createPlatformClient } from '@/lib/supabase/platform';
import { createSovereignClient } from '@/lib/supabase/service';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

// ── Read tenant context from cookie ──────────────────────────────────────────
async function getTenantId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('jwh_tenant')?.value;
  if (!raw) return null;
  try { return JSON.parse(raw).tenantId ?? null; } catch { return null; }
}

async function getSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get('jwh_tenant')?.value;
  if (!raw) return null;
  try { return JSON.parse(raw).sessionId ?? null; } catch { return null; }
}

// ── Phase 1: Save clinic overview ────────────────────────────────────────────
export interface Phase1Data {
  clinic_name: string;
  clinic_type: string[];
  tagline: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postcode: string;
  phone: string;
  email: string;
  website: string;
  cqc_number: string;
  founded_year: number | null;
  director_name: string;
  director_title: string;
}

export async function savePhase1(data: Phase1Data): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId();
    const sessionId = await getSessionId();
    if (!tenantId) return { success: false, error: 'Session expired. Please re-activate.' };

    const db = createPlatformClient();

    // Update clinic_profiles
    const { error: profileErr } = await db
      .from('clinic_profiles')
      .update({
        clinic_name:    data.clinic_name,
        clinic_type:    data.clinic_type,
        tagline:        data.tagline || null,
        address_line1:  data.address_line1 || null,
        address_line2:  data.address_line2 || null,
        city:           data.city || null,
        postcode:       data.postcode || null,
        phone:          data.phone || null,
        email:          data.email || null,
        website:        data.website || null,
        cqc_number:     data.cqc_number || null,
        founded_year:   data.founded_year || null,
        director_name:  data.director_name || null,
        director_title: data.director_title || null,
        overview_confirmed: true,
        updated_at:     new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);

    if (profileErr) return { success: false, error: profileErr.message };

    // Advance onboarding session to phase 2
    if (sessionId) {
      const { data: session } = await db
        .from('onboarding_sessions')
        .select('completed_phases, phase_data')
        .eq('id', sessionId)
        .single();

      if (session) {
        const completed = Array.from(new Set([...(session.completed_phases ?? []), 1]));
        await db
          .from('onboarding_sessions')
          .update({
            current_phase:    2,
            completed_phases: completed,
            phase_data:       { ...(session.phase_data ?? {}), 1: data },
          })
          .eq('id', sessionId);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[savePhase1]', err);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ── Phase 2: Save agent names ─────────────────────────────────────────────────
export interface Phase2Data {
  agents: { role: string; display_name: string }[];
}

export async function savePhase2(data: Phase2Data): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId();
    const sessionId = await getSessionId();
    if (!tenantId) return { success: false, error: 'Session expired. Please re-activate.' };

    // Dev bypass — no platform DB
    if (!process.env.PLATFORM_SUPABASE_URL) {
      console.log('[savePhase2] dev bypass — agent names:', data.agents);
      return { success: true };
    }

    const db = createPlatformClient();

    // Update agent display names in clinic_profiles (stored as JSON)
    await db
      .from('clinic_profiles')
      .update({ agent_names: data.agents, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);

    // Advance onboarding session to phase 3
    if (sessionId) {
      const { data: session } = await db
        .from('onboarding_sessions')
        .select('completed_phases, phase_data')
        .eq('id', sessionId)
        .single();

      if (session) {
        const completed = Array.from(new Set([...(session.completed_phases ?? []), 2]));
        await db
          .from('onboarding_sessions')
          .update({
            current_phase:    3,
            completed_phases: completed,
            phase_data:       { ...(session.phase_data ?? {}), 2: data },
          })
          .eq('id', sessionId);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[savePhase2]', err);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ── Phase 3: Save team members ────────────────────────────────────────────────
export interface TeamMember {
  full_name: string;
  email: string;
  role: string;
  title?: string;         // Dr, Mr, Ms, Miss, Mrs, Prof
  is_clinical?: boolean;  // true if this person delivers clinical care
  username: string;
  login_method: 'email_otp' | 'username';
  department?: string;
  temp_password?: string;
}

export interface Phase3Data {
  members: TeamMember[];
}

export async function savePhase3(data: Phase3Data): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await getTenantId();
    const sessionId = await getSessionId();
    if (!tenantId) return { success: false, error: 'Session expired. Please re-activate.' };

    // Dev bypass — no platform DB
    if (!process.env.PLATFORM_SUPABASE_URL) {
      console.log('[savePhase3] dev bypass — team members:', data.members);
      return { success: true };
    }

    const db = createPlatformClient();

    // Store team member invites in clinic_profiles (stored as JSON)
    await db
      .from('clinic_profiles')
      .update({ team_members: data.members, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);

    // Advance onboarding session to phase 4
    if (sessionId) {
      const { data: session } = await db
        .from('onboarding_sessions')
        .select('completed_phases, phase_data')
        .eq('id', sessionId)
        .single();

      if (session) {
        const completed = Array.from(new Set([...(session.completed_phases ?? []), 3]));
        await db
          .from('onboarding_sessions')
          .update({
            current_phase:    4,
            completed_phases: completed,
            phase_data:       { ...(session.phase_data ?? {}), 3: data },
          })
          .eq('id', sessionId);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[savePhase3]', err);
    return { success: false, error: 'Failed to save. Please try again.' };
  }
}

// ── Phase 5: Complete onboarding + go live ────────────────────────────────────
export async function completeOnboarding(): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId  = await getTenantId();
    const sessionId = await getSessionId();
    if (!tenantId) return { success: false, error: 'Session expired. Please re-activate.' };

    // Dev bypass
    if (!process.env.PLATFORM_SUPABASE_URL) {
      console.log('[completeOnboarding] dev bypass — skipping platform DB');
      return { success: true };
    }

    const db  = createPlatformClient();
    const sov = createSovereignClient();

    // 1. Load all clinic data from platform DB
    const { data: profile } = await db
      .from('clinic_profiles')
      .select('clinic_name, tagline, phone, email, address_line1, address_line2, city, postcode, primary_color, team_members, agent_names')
      .eq('tenant_id', tenantId)
      .single();

    if (!profile) return { success: false, error: 'Clinic profile not found.' };

    // 2. Provision sovereign DB — idempotent (upsert pattern)

    // 2a. clinic_config (one row per tenant)
    await sov.from('clinic_config').upsert({
      tenant_id:  tenantId,
      clinic_name: profile.clinic_name ?? 'Your Clinic',
      ai_name:    'Aria',
      brand_color: profile.primary_color ?? '#0058E6',
      tagline:    profile.tagline ?? null,
    }, { onConflict: 'tenant_id' });

    // 2b. Roles (standard set per tenant)
    // Architecture:
    //   BASE ROLES: practitioner (clinical), receptionist (non-clinical)
    //   PRIVILEGE TIERS: admin, manager, system_admin
    //   is_clinical=true on practitioner role — clinical staff get EHR/SOAP access
    const roles = [
      { slug: 'system_admin', name: 'System Admin',  permission_level: 200, is_admin: true,  is_clinical: false },
      { slug: 'manager',      name: 'Manager',       permission_level: 100, is_admin: true,  is_clinical: false },
      { slug: 'admin',        name: 'Admin',         permission_level: 70,  is_admin: true,  is_clinical: false },
      { slug: 'practitioner', name: 'Practitioner',  permission_level: 30,  is_admin: false, is_clinical: true  },
      { slug: 'receptionist', name: 'Receptionist',  permission_level: 20,  is_admin: false, is_clinical: false },
    ];
    for (const role of roles) {
      await sov.from('roles').upsert({ tenant_id: tenantId, ...role, permissions: {} }, { onConflict: 'tenant_id,slug' });
    }

    // 2c. Departments (standard set per tenant)
    const departments = [
      { name: 'Reception',      display_order: 1 },
      { name: 'Clinical',       display_order: 2 },
      { name: 'Management',     display_order: 3 },
      { name: 'Administration', display_order: 4 },
    ];
    for (const dept of departments) {
      // Check if already exists
      const { data: existing } = await sov.from('departments').select('id').eq('tenant_id', tenantId).eq('name', dept.name).single();
      if (!existing) {
        await sov.from('departments').insert({ tenant_id: tenantId, ...dept, is_active: true });
      }
    }

    // 2d. Agents (3 standard agents per tenant)
    const agentNames = (profile.agent_names as { role: string; display_name: string }[] | null) ?? [];
    const getAgentName = (role: string, fallback: string) =>
      agentNames.find(a => a.role === role)?.display_name || fallback;

    const agents = [
      { agent_key: 'primary_agent', name: getAgentName('primary_agent', 'EWC'),   is_catch_all: true  },
      { agent_key: 'sales_agent',   name: getAgentName('sales_agent',   'Orion'), is_catch_all: false },
      { agent_key: 'crm_agent',     name: getAgentName('crm_agent',     'Aria'),  is_catch_all: false },
    ];
    for (const agent of agents) {
      await sov.from('agents').upsert({
        tenant_id:   tenantId,
        agent_key:   agent.agent_key,
        name:        agent.name,
        is_active:   true,
        is_catch_all: agent.is_catch_all,
        scope:       agent.agent_key === 'primary_agent' ? 'all' : agent.agent_key === 'sales_agent' ? 'sales,acquisition' : 'retention,crm',
      }, { onConflict: 'tenant_id,agent_key' });
    }

    // 2e. Users — create staff accounts from Phase 3 team members
    const members = (profile.team_members as TeamMember[] | null) ?? [];
    for (const member of members) {
      const [firstName, ...rest] = (member.full_name ?? '').split(' ');
      const lastName = rest.join(' ') || '';

      // Look up role_id by slug (role values from onboarding form match slugs)
      const { data: roleRow } = await sov.from('roles')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', member.role)
        .single();

      const tempHash = member.temp_password ? await bcrypt.hash(member.temp_password, 10) : null;

      await sov.from('users').upsert({
        tenant_id:             tenantId,
        email:                 member.email?.toLowerCase() ?? '',
        username:              member.username ?? null,
        title:                 member.title ?? null,
        first_name:            firstName ?? '',
        last_name:             lastName,
        role_id:               roleRow?.id ?? null,
        temp_password_hash:    tempHash,
        must_change_password:  true,
        status:                'active',
        staff_onboarding_completed: false,
        is_admin:              ['admin', 'manager', 'system_admin'].includes(member.role),
        is_clinical:           member.is_clinical ?? member.role === 'practitioner',
      }, { onConflict: 'tenant_id,email' });
    }

    // 3. Mark tenant as active in platform DB
    await db.from('tenants').update({ status: 'active', activated_at: new Date().toISOString() }).eq('id', tenantId);

    // 4. Close onboarding session
    if (sessionId) {
      await db.from('onboarding_sessions').update({
        current_phase:    5,
        completed_phases: [1, 2, 3, 4, 5],
        completed_at:     new Date().toISOString(),
      }).eq('id', sessionId);
    }

    return { success: true };
  } catch (err) {
    console.error('[completeOnboarding]', err);
    return { success: false, error: 'Failed to activate. Please try again.' };
  }
}

// ── Get existing team from sovereign DB (used by Phase 3 to detect pre-seeded staff) ──
export interface ExistingMember {
  id: string;
  display_name: string;
  email: string;
  job_title: string | null;
  role_name: string | null;
  role_slug: string | null;
  department_name: string | null;
}

export async function getExistingTeam(): Promise<ExistingMember[]> {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return [];

    const sov = createSovereignClient();

    const { data, error } = await sov
      .from('users')
      .select(`
        id,
        display_name,
        email,
        job_title,
        roles ( name, slug ),
        departments ( name )
      `)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .neq('email', 'admin@edgbastonwellness.co.uk')
      .order('display_name');

    if (error || !data) return [];

    return data.map((u: Record<string, unknown>) => ({
      id:              u.id as string,
      display_name:    (u.display_name as string) || (u.email as string),
      email:           u.email as string,
      job_title:       u.job_title as string | null,
      role_name:       (u.roles as { name: string; slug: string } | null)?.name ?? null,
      role_slug:       (u.roles as { name: string; slug: string } | null)?.slug ?? null,
      department_name: (u.departments as { name: string } | null)?.name ?? null,
    }));
  } catch (err) {
    console.error('[getExistingTeam]', err);
    return [];
  }
}

'use server';

// =============================================================================
// Edgbaston Wellness Clinic — Authentication Actions
// Single-tenant: no tenant_id, no activation keys, no multi-tenancy
// Password hashing: bcrypt via pgcrypto (DB-side on creation),
//                   bcryptjs on the application side for verification
// =============================================================================

import { createSovereignClient } from '../supabase/service';
import bcrypt from 'bcryptjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// getClinicInfo — load clinic branding for the login page
// ---------------------------------------------------------------------------

export async function getClinicInfo() {
  const sovereign = createSovereignClient();

  try {
    const { data, error } = await sovereign
      .from('clinic_config')
      .select('clinic_name, ai_name, brand_color, logo_url, tone, tagline, manifesto, ai_persona, neural_contract')
      .limit(1)
      .single();

    if (error || !data) {
      console.error('[auth] getClinicInfo failed:', error);
      // Return safe defaults if DB not yet seeded
      return {
        success: true as const,
        data: {
          clinic_name: 'Edgbaston Wellness Clinic',
          ai_name: 'Aria',
          brand_color: '#0058E6',
          logo_url: null as string | null,
          tone: 'professional',
          tagline: 'Your wellbeing, elevated.',
          manifesto: null as string | null,
          traits: [] as string[],
          communication_style: null as string | null,
          philosophy: null as string | null,
        },
      };
    }

    const persona = (data.ai_persona || {}) as Record<string, unknown>;

    return {
      success: true as const,
      data: {
        clinic_name: data.clinic_name,
        ai_name: data.ai_name,
        brand_color: data.brand_color,
        logo_url: data.logo_url as string | null,
        tone: data.tone,
        tagline: data.tagline as string | null,
        manifesto: data.manifesto as string | null,
        traits: (persona.traits as string[]) || [],
        communication_style: (persona.communication_style as string) || null,
        philosophy: (persona.philosophy as string) || null,
      },
    };

  } catch (err) {
    console.error('[auth] getClinicInfo threw:', err);
    return { success: false as const, error: 'FETCH_FAILED' };
  }
}

// ---------------------------------------------------------------------------
// verifyLogin — authenticate staff by email + password (bcrypt)
// ---------------------------------------------------------------------------

export async function verifyLogin(email: string, password: string) {
  const sovereign = createSovereignClient();

  if (!email?.trim() || !password) {
    return { success: false as const, error: 'MISSING_CREDENTIALS' };
  }

  try {
    const { data: user, error } = await sovereign
      .from('users')
      .select(`
        id, email, first_name, last_name, display_name,
        is_admin, must_change_password,
        temp_password_hash, password_hash,
        status, staff_onboarding_completed,
        role_id
      `)
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !user) {
      return { success: false as const, error: 'INVALID_CREDENTIALS' };
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      return { success: false as const, error: 'ACCOUNT_DISABLED' };
    }

    let isValid = false;
    let isTempPassword = false;

    // Check temp password first (bcrypt)
    if (user.temp_password_hash) {
      try {
        isValid = await bcrypt.compare(password, user.temp_password_hash);
        if (isValid) isTempPassword = true;
      } catch {
        // not a bcrypt hash — skip
      }
    }

    // Check permanent password (bcrypt)
    if (!isValid && user.password_hash) {
      try {
        isValid = await bcrypt.compare(password, user.password_hash);
      } catch {
        // not a bcrypt hash — skip
      }
    }

    if (!isValid) {
      return { success: false as const, error: 'INVALID_CREDENTIALS' };
    }

    // Update last login
    await sovereign
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    return {
      success: true as const,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        display_name: user.display_name as string | null,
        is_admin: user.is_admin,
        staff_onboarding_completed: user.staff_onboarding_completed,
        role_id: user.role_id as string | null,
      },
      requiresPasswordChange: isTempPassword || user.must_change_password,
    };

  } catch (err) {
    console.error('[auth] verifyLogin failed:', err);
    return { success: false as const, error: 'VERIFICATION_FAILED' };
  }
}

// ---------------------------------------------------------------------------
// changePassword — set a new bcrypt password for the user
// ---------------------------------------------------------------------------

export async function changePassword(userId: string, newPassword: string) {
  const sovereign = createSovereignClient();

  if (!userId || !UUID_RE.test(userId)) {
    return { success: false as const, error: 'INVALID_USER' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { success: false as const, error: 'PASSWORD_TOO_SHORT' };
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const { error } = await sovereign
      .from('users')
      .update({
        password_hash: passwordHash,
        temp_password_hash: null,
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
        status: 'active',
      })
      .eq('id', userId);

    if (error) {
      console.error('[auth] changePassword failed:', error);
      return { success: false as const, error: 'UPDATE_FAILED' };
    }

    await sovereign.from('audit_trail').insert({
      user_id: userId,
      action_type: 'user.password_changed',
      resource_type: 'user',
      resource_id: userId,
      details: { initiated_by: 'user' },
    });

    return { success: true as const };

  } catch (err) {
    console.error('[auth] changePassword threw:', err);
    return { success: false as const, error: 'CRITICAL_FAILURE' };
  }
}

// ---------------------------------------------------------------------------
// getUserSession — re-validate a session on page load
// ---------------------------------------------------------------------------

export async function getUserSession(userId: string) {
  const sovereign = createSovereignClient();

  if (!userId || !UUID_RE.test(userId)) {
    return { success: false as const, error: 'INVALID_SESSION' };
  }

  try {
    const { data: user, error } = await sovereign
      .from('users')
      .select('id, first_name, last_name, email, is_admin, staff_onboarding_completed, status, role_id, display_name')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return { success: false as const, error: 'SESSION_INVALID' };
    }

    if (user.status === 'suspended' || user.status === 'deactivated') {
      return { success: false as const, error: 'ACCOUNT_DISABLED' };
    }

    return {
      success: true as const,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        display_name: user.display_name as string | null,
        is_admin: user.is_admin,
        staff_onboarding_completed: user.staff_onboarding_completed,
        role_id: user.role_id as string | null,
      },
    };

  } catch (err) {
    console.error('[auth] getUserSession failed:', err);
    return { success: false as const, error: 'SESSION_FAILED' };
  }
}

// ---------------------------------------------------------------------------
// requestPasswordReset — logs the request; admin handles reset manually
// ---------------------------------------------------------------------------

export async function requestPasswordReset(email: string) {
  const sovereign = createSovereignClient();

  try {
    const { data: user } = await sovereign
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (user) {
      await sovereign.from('audit_trail').insert({
        user_id: user.id,
        action_type: 'user.password_reset_requested',
        resource_type: 'user',
        resource_id: user.id,
        details: { email: email.toLowerCase().trim() },
      });
    }

    // Always return same message — don't reveal account existence
    return {
      success: true as const,
      message: 'If an account exists with this email, your administrator has been notified.',
    };

  } catch (err) {
    console.error('[auth] requestPasswordReset failed:', err);
    return {
      success: true as const,
      message: 'If an account exists with this email, your administrator has been notified.',
    };
  }
}

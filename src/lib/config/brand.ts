/**
 * Brand configuration — single source of truth for platform identity.
 *
 * WHITE-LABELLING NOTE:
 * Currently hardcoded to Jwebly Health (cyan variant).
 * When white-labelling is activated, load this at runtime from:
 *   - platform_tenants.brand_config (JSONB) in the platform DB, OR
 *   - BRAND_CONFIG_JSON environment variable
 * No architectural changes needed — swap this object at the call-site.
 *
 * Usage: import { BRAND } from '@/lib/config/brand'
 */

export const BRAND = {
  // ── Platform identity ──────────────────────────────────────────────────────
  platform:      'Jwebly Health',
  tagline:       'Operational Intelligence',
  subtitle:      'Private Clinic Platform',
  supportEmail:  'hello@jwebly.com',

  // ── Accent colours (cyan health palette) ──────────────────────────────────
  accent:        '#0891B2',   // cyan-600  — primary
  accentLight:   '#22D3EE',   // cyan-400  — lighter
  accentFaint:   '#67E8F9',   // cyan-300  — faintest

  // ── Dark theme ─────────────────────────────────────────────────────────────
  darkBg:        '#0D1420',
  darkSurface:   '#111827',
  darkBorder:    'rgba(8,145,178,0.15)',

  // ── Light theme ────────────────────────────────────────────────────────────
  lightBg:       '#F7F6F3',
  lightBorder:   '#E4E4E7',

  // ── Typography ─────────────────────────────────────────────────────────────
  ink:           '#18181B',
  secondary:     '#4A5568',
  muted:         '#A1A1AA',

  // ── Status ─────────────────────────────────────────────────────────────────
  green:         '#059669',
  red:           '#DC2626',
  gold:          '#D8A600',
} as const;

export type Brand = typeof BRAND;

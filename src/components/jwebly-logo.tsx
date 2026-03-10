'use client';

// ─── Jwebly Logo — hub-and-spoke neural network mark ─────────────────────────
// Cyan health variant: #22D3EE / #0891B2 / #67E8F9
//
// Exports:
//   JweblyIcon   — square icon (viewBox 0 0 200 200), accepts `size` + `uid`
//   JweblyLogo   — horizontal wordmark (viewBox 0 0 400 100), accepts `width` + `uid` + `dark`

// ─── Cyan palette ─────────────────────────────────────────────────────────────
const S = '#0891B2';   // spokes, ring, glow bloom
const HS = '#22D3EE';  // hub gradient start
const HE = '#0891B2';  // hub gradient end
const NS = '#67E8F9';  // node gradient start
const NE = '#22D3EE';  // node gradient end

// ─── Icon (200×200 viewBox) ───────────────────────────────────────────────────
export function JweblyIcon({
  size = 40,
  uid = '0',
}: {
  size?: number;
  uid?: string;
}) {
  const mg = `jw_mg_${uid}`;
  const ng = `jw_ng_${uid}`;
  const gl = `jw_gl_${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        {/* Hub fill */}
        <linearGradient id={mg} x1="68" y1="68" x2="132" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={HS} />
          <stop offset="100%" stopColor={HE} />
        </linearGradient>
        {/* Node fill */}
        <linearGradient id={ng} x1="68" y1="68" x2="132" y2="132" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={NS} />
          <stop offset="100%" stopColor={NE} />
        </linearGradient>
        {/* Background glow bloom */}
        <radialGradient id={gl} cx="100" cy="100" r="78" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={S} stopOpacity="0.35" />
          <stop offset="60%"  stopColor={S} stopOpacity="0.08" />
          <stop offset="100%" stopColor={S} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Glow bloom */}
      <circle cx="100" cy="100" r="78" fill={`url(#${gl})`} />

      {/* Orbit ring */}
      <circle cx="100" cy="100" r="44" stroke={S} strokeWidth="1.4" strokeOpacity="0.19" fill="none" />

      {/* Secondary spokes 45° — NE / SE / SW / NW */}
      <line x1="100" y1="100" x2="151" y2="49"  stroke={S} strokeWidth="1.3" strokeOpacity="0.28" />
      <line x1="100" y1="100" x2="151" y2="151" stroke={S} strokeWidth="1.3" strokeOpacity="0.28" />
      <line x1="100" y1="100" x2="49"  y2="151" stroke={S} strokeWidth="1.3" strokeOpacity="0.28" />
      <line x1="100" y1="100" x2="49"  y2="49"  stroke={S} strokeWidth="1.3" strokeOpacity="0.28" />

      {/* Primary spokes 90° — N / E / S / W */}
      <line x1="100" y1="100" x2="100" y2="28"  stroke={S} strokeWidth="2.2" strokeOpacity="0.48" />
      <line x1="100" y1="100" x2="172" y2="100" stroke={S} strokeWidth="2.2" strokeOpacity="0.48" />
      <line x1="100" y1="100" x2="100" y2="172" stroke={S} strokeWidth="2.2" strokeOpacity="0.48" />
      <line x1="100" y1="100" x2="28"  y2="100" stroke={S} strokeWidth="2.2" strokeOpacity="0.48" />

      {/* Secondary nodes r=9, opacity 0.62 */}
      <circle cx="151" cy="49"  r="9" fill={`url(#${ng})`} opacity="0.62" />
      <circle cx="151" cy="151" r="9" fill={`url(#${ng})`} opacity="0.62" />
      <circle cx="49"  cy="151" r="9" fill={`url(#${ng})`} opacity="0.62" />
      <circle cx="49"  cy="49"  r="9" fill={`url(#${ng})`} opacity="0.62" />

      {/* Primary nodes r=14, opacity 0.9 */}
      <circle cx="100" cy="28"  r="14" fill={`url(#${ng})`} opacity="0.9" />
      <circle cx="172" cy="100" r="14" fill={`url(#${ng})`} opacity="0.9" />
      <circle cx="100" cy="172" r="14" fill={`url(#${ng})`} opacity="0.9" />
      <circle cx="28"  cy="100" r="14" fill={`url(#${ng})`} opacity="0.9" />

      {/* Hub */}
      <circle cx="100" cy="100" r="32" fill={`url(#${mg})`} />

      {/* Glint highlight top-left */}
      <circle cx="88" cy="88" r="12" fill="white" fillOpacity="0.25" />
    </svg>
  );
}

// ─── Horizontal Logo (400×100 viewBox) ───────────────────────────────────────
export function JweblyLogo({
  width = 240,
  uid = '0',
  dark = true,
  brandName = 'JWEBLY HEALTH',
  subsidiary = 'OPERATIONAL INTELLIGENCE',
  tagline = 'PRIVATE CLINIC PLATFORM',
}: {
  width?: number;
  uid?: string;
  dark?: boolean;
  brandName?: string;
  subsidiary?: string;
  tagline?: string;
}) {
  const mg = `jw_hmg_${uid}`;
  const ng = `jw_hng_${uid}`;
  const gl = `jw_hgl_${uid}`;

  const wordFill    = dark ? '#FFFFFF' : '#0C1A2E';
  const accentFill  = S;   // #0891B2
  const taglineFill = '#6B7280';

  return (
    <svg
      width={width}
      height={width / 4}
      viewBox="0 0 400 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={mg} x1="34" y1="34" x2="66" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={HS} />
          <stop offset="100%" stopColor={HE} />
        </linearGradient>
        <linearGradient id={ng} x1="34" y1="34" x2="66" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={NS} />
          <stop offset="100%" stopColor={NE} />
        </linearGradient>
        <radialGradient id={gl} cx="50" cy="50" r="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={S} stopOpacity="0.35" />
          <stop offset="60%"  stopColor={S} stopOpacity="0.08" />
          <stop offset="100%" stopColor={S} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── Icon at cx=50 cy=50 ── */}
      {/* Glow bloom r=38 */}
      <circle cx="50" cy="50" r="38" fill={`url(#${gl})`} />

      {/* Orbit ring r=22 */}
      <circle cx="50" cy="50" r="22" stroke={S} strokeWidth="0.8" strokeOpacity="0.19" fill="none" />

      {/* Secondary spokes 45° */}
      <line x1="50" y1="50" x2="76" y2="24" stroke={S} strokeWidth="1.0" strokeOpacity="0.28" />
      <line x1="50" y1="50" x2="76" y2="76" stroke={S} strokeWidth="1.0" strokeOpacity="0.28" />
      <line x1="50" y1="50" x2="24" y2="76" stroke={S} strokeWidth="1.0" strokeOpacity="0.28" />
      <line x1="50" y1="50" x2="24" y2="24" stroke={S} strokeWidth="1.0" strokeOpacity="0.28" />

      {/* Primary spokes 90° */}
      <line x1="50" y1="50" x2="50" y2="14" stroke={S} strokeWidth="1.6" strokeOpacity="0.48" />
      <line x1="50" y1="50" x2="86" y2="50" stroke={S} strokeWidth="1.6" strokeOpacity="0.48" />
      <line x1="50" y1="50" x2="50" y2="86" stroke={S} strokeWidth="1.6" strokeOpacity="0.48" />
      <line x1="50" y1="50" x2="14" y2="50" stroke={S} strokeWidth="1.6" strokeOpacity="0.48" />

      {/* Secondary nodes r=4.5 */}
      <circle cx="76" cy="24" r="4.5" fill={`url(#${ng})`} opacity="0.62" />
      <circle cx="76" cy="76" r="4.5" fill={`url(#${ng})`} opacity="0.62" />
      <circle cx="24" cy="76" r="4.5" fill={`url(#${ng})`} opacity="0.62" />
      <circle cx="24" cy="24" r="4.5" fill={`url(#${ng})`} opacity="0.62" />

      {/* Primary nodes r=7 */}
      <circle cx="50" cy="14" r="7" fill={`url(#${ng})`} opacity="0.9" />
      <circle cx="86" cy="50" r="7" fill={`url(#${ng})`} opacity="0.9" />
      <circle cx="50" cy="86" r="7" fill={`url(#${ng})`} opacity="0.9" />
      <circle cx="14" cy="50" r="7" fill={`url(#${ng})`} opacity="0.9" />

      {/* Hub r=16 */}
      <circle cx="50" cy="50" r="16" fill={`url(#${mg})`} />

      {/* Glint r=6 */}
      <circle cx="44" cy="44" r="6" fill="white" fillOpacity="0.25" />

      {/* ── Wordmark ── */}
      <text
        x="115" y="52"
        fontFamily="Inter,-apple-system,system-ui,sans-serif"
        fontSize="28"
        fontWeight="600"
        fill={wordFill}
        letterSpacing="4"
      >
        {brandName}
      </text>
      <text
        x="116" y="68"
        fontFamily="Inter,-apple-system,system-ui,sans-serif"
        fontSize="11"
        fontWeight="600"
        fill={accentFill}
        letterSpacing="2"
      >
        {subsidiary}
      </text>
      <text
        x="116" y="80"
        fontFamily="Inter,-apple-system,system-ui,sans-serif"
        fontSize="8.5"
        fontWeight="400"
        fill={taglineFill}
        letterSpacing="2.5"
      >
        {tagline}
      </text>
    </svg>
  );
}

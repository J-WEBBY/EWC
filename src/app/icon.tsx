import { ImageResponse } from 'next/og';

export const size        = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  const S  = '#0891B2';
  const HS = '#22D3EE';
  const HE = '#0891B2';

  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          background: '#0D1420',
        }}
      >
        <svg width="26" height="26" viewBox="0 0 200 200" fill="none">
          {/* Glow bloom */}
          <circle cx="100" cy="100" r="78" fill={S} fillOpacity="0.12" />

          {/* Orbit ring */}
          <circle cx="100" cy="100" r="44" stroke={S} strokeWidth="2" strokeOpacity="0.3" fill="none" />

          {/* Primary spokes */}
          <line x1="100" y1="100" x2="100" y2="28"  stroke={S} strokeWidth="3.5" strokeOpacity="0.6" />
          <line x1="100" y1="100" x2="172" y2="100" stroke={S} strokeWidth="3.5" strokeOpacity="0.6" />
          <line x1="100" y1="100" x2="100" y2="172" stroke={S} strokeWidth="3.5" strokeOpacity="0.6" />
          <line x1="100" y1="100" x2="28"  y2="100" stroke={S} strokeWidth="3.5" strokeOpacity="0.6" />

          {/* Secondary spokes */}
          <line x1="100" y1="100" x2="151" y2="49"  stroke={S} strokeWidth="2" strokeOpacity="0.35" />
          <line x1="100" y1="100" x2="151" y2="151" stroke={S} strokeWidth="2" strokeOpacity="0.35" />
          <line x1="100" y1="100" x2="49"  y2="151" stroke={S} strokeWidth="2" strokeOpacity="0.35" />
          <line x1="100" y1="100" x2="49"  y2="49"  stroke={S} strokeWidth="2" strokeOpacity="0.35" />

          {/* Secondary nodes */}
          <circle cx="151" cy="49"  r="9"  fill={HS} fillOpacity="0.7" />
          <circle cx="151" cy="151" r="9"  fill={HS} fillOpacity="0.7" />
          <circle cx="49"  cy="151" r="9"  fill={HS} fillOpacity="0.7" />
          <circle cx="49"  cy="49"  r="9"  fill={HS} fillOpacity="0.7" />

          {/* Primary nodes */}
          <circle cx="100" cy="28"  r="14" fill={HS} />
          <circle cx="172" cy="100" r="14" fill={HS} />
          <circle cx="100" cy="172" r="14" fill={HS} />
          <circle cx="28"  cy="100" r="14" fill={HS} />

          {/* Hub */}
          <circle cx="100" cy="100" r="32" fill={HE} />

          {/* Glint */}
          <circle cx="88" cy="88" r="12" fill="white" fillOpacity="0.22" />
        </svg>
      </div>
    ),
    { ...size },
  );
}

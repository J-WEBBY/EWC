import { ImageResponse } from 'next/og';

export const size        = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          background: '#011440',
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          E
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#D8A600',
          }}
        />
      </div>
    ),
    { ...size },
  );
}

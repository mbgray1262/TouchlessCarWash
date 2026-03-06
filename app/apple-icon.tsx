import { ImageResponse } from 'next/server';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          backgroundColor: '#0F2744',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="110"
          height="130"
          viewBox="0 0 110 130"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M55 0C55 0 0 65 0 92C0 113 24.6 130 55 130C85.4 130 110 113 110 92C110 65 55 0 55 0Z"
            fill="#22C55E"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}

interface HeroImageFallbackProps {
  variant?: 'card' | 'full';
  className?: string;
}

export default function HeroImageFallback({ variant = 'card', className = '' }: HeroImageFallbackProps) {
  const isCard = variant === 'card';

  if (isCard) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/card-fallback.svg"
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  // Full (detail page) variant — clean gradient with subtle geometric elements
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: 'linear-gradient(135deg, #0F2744 0%, #1a3a5c 40%, #0d4f6b 70%, #0a3d54 100%)' }}
    >
      {/* Subtle geometric pattern — water-inspired circles */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute rounded-full opacity-[0.04]"
          style={{
            width: '400px',
            height: '400px',
            right: '-80px',
            top: '-100px',
            border: '2px solid white',
          }}
        />
        <div
          className="absolute rounded-full opacity-[0.03]"
          style={{
            width: '550px',
            height: '550px',
            right: '-120px',
            top: '-160px',
            border: '2px solid white',
          }}
        />
        <div
          className="absolute rounded-full opacity-[0.04]"
          style={{
            width: '300px',
            height: '300px',
            left: '-60px',
            bottom: '-80px',
            border: '1.5px solid #22C55E',
          }}
        />
      </div>

      {/* Subtle bottom-left accent glow */}
      <div
        className="absolute opacity-[0.08]"
        style={{
          width: '200px',
          height: '200px',
          left: '-30px',
          bottom: '-40px',
          background: 'radial-gradient(circle, #22C55E 0%, transparent 70%)',
        }}
      />
    </div>
  );
}

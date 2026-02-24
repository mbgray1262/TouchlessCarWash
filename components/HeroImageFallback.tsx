interface HeroImageFallbackProps {
  variant?: 'card' | 'full';
  className?: string;
}

export default function HeroImageFallback({ variant = 'card', className = '' }: HeroImageFallbackProps) {
  const isCard = variant === 'card';

  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden ${className}`}
      style={{ background: 'linear-gradient(135deg, #0F2744 0%, #0d3d5c 50%, #0a4a52 100%)' }}
    >
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
      </div>

      <div className={`relative flex flex-col items-center gap-${isCard ? '2' : '3'} select-none`}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 80 56"
          className={isCard ? 'w-16 h-12' : 'w-24 h-[68px]'}
          fill="none"
        >
          <g opacity="0.9">
            <rect x="4" y="24" width="72" height="24" rx="4" fill="#22C55E" opacity="0.15" stroke="#22C55E" strokeWidth="1.5" />
            <rect x="10" y="28" width="40" height="16" rx="3" fill="#22C55E" opacity="0.1" />
            <rect x="10" y="28" width="40" height="16" rx="3" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.2" />
            <circle cx="17" cy="46" r="5" fill="none" stroke="white" strokeWidth="1.5" />
            <circle cx="17" cy="46" r="2" fill="white" opacity="0.5" />
            <circle cx="55" cy="46" r="5" fill="none" stroke="white" strokeWidth="1.5" />
            <circle cx="55" cy="46" r="2" fill="white" opacity="0.5" />
            <path d="M50 28 L44 20 Q42 18 40 18 L22 18 Q20 18 19 20 L14 28" stroke="white" strokeWidth="1.5" fill="none" strokeOpacity="0.7" />
            <rect x="52" y="24" width="8" height="4" rx="1" fill="white" opacity="0.4" />
          </g>

          <g opacity="0.8">
            <path d="M4 10 Q6 6 8 10 Q10 14 12 10" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d="M18 6 Q20 2 22 6 Q24 10 26 6" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d="M32 10 Q34 6 36 10 Q38 14 40 10" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d="M46 6 Q48 2 50 6 Q52 10 54 6" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d="M60 10 Q62 6 64 10 Q66 14 68 10" stroke="#22C55E" strokeWidth="1.5" fill="none" strokeLinecap="round" />

            <path d="M4 18 L4 12 M12 18 L12 12" stroke="#22C55E" strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
            <path d="M20 14 L20 8 M28 14 L28 8" stroke="#22C55E" strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
            <path d="M34 18 L34 12 M42 18 L42 12" stroke="#22C55E" strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
            <path d="M48 14 L48 8 M56 14 L56 8" stroke="#22C55E" strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
            <path d="M62 18 L62 12 M70 18 L70 12" stroke="#22C55E" strokeWidth="1" strokeOpacity="0.5" strokeLinecap="round" />
          </g>
        </svg>

        {isCard ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-white/90 text-[11px] font-semibold tracking-widest uppercase">Photo Coming Soon</span>
            <div className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="none">
                <path d="M8 2 C8 2 4 5 4 8.5 A4 4 0 0 0 12 8.5 C12 5 8 2 8 2Z" fill="#22C55E" />
              </svg>
              <span className="text-white/40 text-[9px] tracking-wider uppercase">Touchless Car Wash Finder</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span className="text-white/90 text-sm font-semibold tracking-widest uppercase">Photo Coming Soon</span>
            <div className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className="w-3 h-3" fill="none">
                <path d="M8 2 C8 2 4 5 4 8.5 A4 4 0 0 0 12 8.5 C12 5 8 2 8 2Z" fill="#22C55E" />
              </svg>
              <span className="text-white/50 text-[10px] tracking-wider uppercase">Touchless Car Wash Finder</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

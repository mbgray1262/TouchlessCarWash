'use client';

import { useEffect, useRef } from 'react';

interface AdUnitProps {
  /** AdSense ad slot ID — get this from the AdSense dashboard after approval */
  slot?: string;
  /** Ad format: 'auto' lets Google pick the best size */
  format?: 'auto' | 'rectangle' | 'horizontal';
  /** Additional className for the wrapper */
  className?: string;
}

const AD_CLIENT = 'ca-pub-2012332157653110';

/**
 * Google AdSense display ad unit.
 *
 * Renders a responsive ad in the specified slot. The ad will only appear
 * once the AdSense account is approved and the adsbygoogle script is loaded.
 * Before approval, this component renders an empty (invisible) container.
 */
export function AdUnit({ slot, format = 'auto', className = '' }: AdUnitProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    // Only push once per mount, and only if the script is loaded
    if (pushed.current) return;
    if (typeof window === 'undefined') return;

    try {
      const adsbygoogle = (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle;
      if (adsbygoogle) {
        adsbygoogle.push({});
        pushed.current = true;
      }
    } catch {
      // AdSense not loaded or not approved yet — fail silently
    }
  }, []);

  // Don't render anything in development
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }

  return (
    <div className={`ad-unit-wrapper ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot || ''}
        data-ad-format={format}
        data-full-width-responsive="true"
        ref={adRef}
      />
    </div>
  );
}

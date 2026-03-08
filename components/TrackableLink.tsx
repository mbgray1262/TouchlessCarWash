'use client';

import type { ReactNode, MouseEvent } from 'react';

interface TrackableLinkProps {
  href: string;
  listingId: string;
  eventType: 'directions' | 'phone' | 'website';
  className?: string;
  target?: string;
  rel?: string;
  children: ReactNode;
}

export function TrackableLink({
  href,
  listingId,
  eventType,
  className,
  target,
  rel,
  children,
}: TrackableLinkProps) {
  function handleClick(_e: MouseEvent) {
    // Fire-and-forget: sendBeacon won't block navigation
    try {
      const payload = JSON.stringify({ listing_id: listingId, event_type: eventType });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
      } else {
        // Fallback for older browsers
        fetch('/api/track', { method: 'POST', body: payload, keepalive: true });
      }
    } catch {
      // Tracking should never break the user experience
    }
  }

  return (
    <a
      href={href}
      className={className}
      target={target}
      rel={rel}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}

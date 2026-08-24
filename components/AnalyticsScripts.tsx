'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

/**
 * Loads the AdSense + Monumetric ad scripts, excluded from /admin/* pages.
 *
 * NOTE: Google Analytics is deliberately NOT here — it's a raw inline <script>
 * at the top of <head> in app/layout.tsx. Loading GA alongside these ad scripts
 * (even with next/script `beforeInteractive`) let the ad stack's consent
 * framework delay the gtag page_view ~5s, so most visitors left uncounted. See
 * the comment in app/layout.tsx for the full rationale.
 *
 * usePathname() works in client components even during the initial SSR pass,
 * so these scripts are excluded from the rendered HTML for admin paths.
 */
export function AnalyticsScripts() {
  const pathname = usePathname();

  if (process.env.NODE_ENV !== 'production') return null;
  if (pathname?.startsWith('/admin')) return null;

  return (
    <>
      {/* Google AdSense loader — required for AdSense approval
          verification AND for any AdUnit components to serve ads. */}
      <Script
        id="adsbygoogle-init"
        async
        strategy="afterInteractive"
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2012332157653110"
        crossOrigin="anonymous"
      />
      {/* Monumetric ad-management head script (hybrid/custom-site install).
          Monumetric maintains the matching ads.txt via a 301 redirect on
          /ads.txt (see netlify.toml) → monu.delivery hosted file. */}
      <Script
        id="monumetric-ads"
        strategy="afterInteractive"
        src="https://monu.delivery/site/3/e/b2b8b0-9b01-4c4f-bca0-6a5b305299a6.js"
        data-cfasync="false"
      />
    </>
  );
}

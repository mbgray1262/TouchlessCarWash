'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

/**
 * Loads the AdSense + Monumetric ad scripts, excluded from /admin/* pages.
 *
 * These load with `lazyOnload` (after the window `load` event), NOT
 * `afterInteractive`. When they ran `afterInteractive`, Monumetric's ad stack
 * (~250 resources — it froze the main thread for several seconds) started
 * executing before Google Analytics could dispatch its pageview, starving the
 * gtag beacon for ~6s. On a search directory most visitors leave within a few
 * seconds, so ~80% of sessions went uncounted (real traffic was fine — verified
 * server-side via Cloudflare). Deferring the ad stack gives GA a clean early
 * window to send the pageview, and also stops the ads from blocking initial
 * page interactivity. This is a stopgap while Monumetric reduces the ad-load
 * weight at the source (the proper fix). If ad revenue/viewability regresses,
 * revert these two strategies to `afterInteractive`.
 *
 * NOTE: Google Analytics is deliberately NOT here — it's a raw inline <script>
 * at the top of <head> in app/layout.tsx so it runs before this ad stack.
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
        strategy="lazyOnload"
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2012332157653110"
        crossOrigin="anonymous"
      />
      {/* Monumetric ad-management head script (hybrid/custom-site install).
          Monumetric maintains the matching ads.txt via a 301 redirect on
          /ads.txt (see netlify.toml) → monu.delivery hosted file. */}
      <Script
        id="monumetric-ads"
        strategy="lazyOnload"
        src="https://monu.delivery/site/3/e/b2b8b0-9b01-4c4f-bca0-6a5b305299a6.js"
        data-cfasync="false"
      />
    </>
  );
}

'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

/**
 * Wraps Google Analytics + AdSense so neither loads on /admin/* pages.
 * Admin sessions were skewing the GA traffic numbers because every
 * admin visit counted as a pageview against the public site's totals.
 *
 * usePathname() works in client components even during the initial
 * SSR pass, so the scripts are excluded from the rendered HTML for
 * admin paths — they never load, and admin pageviews never fire.
 */
export function AnalyticsScripts() {
  const pathname = usePathname();

  if (process.env.NODE_ENV !== 'production') return null;
  if (pathname?.startsWith('/admin')) return null;

  return (
    <>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-55HHXHEVFP"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-55HHXHEVFP');
        `}
      </Script>
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

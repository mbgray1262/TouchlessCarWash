import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { PublicShell } from '@/components/PublicShell';
import { AnalyticsScripts } from '@/components/AnalyticsScripts';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Touchless Car Wash Finder',
    template: '%s | Touchless Car Wash Finder',
  },
  description: 'Find verified automatic touchless car washes near you. Browse 3,465+ in-bay automatic, brushless & no-touch car wash locations across all 50 states + DC.',
  metadataBase: new URL('https://touchlesscarwashfinder.com'),
  verification: {
    google: 'aO6V2H3Yb4O904NRWtdJRkZZdb2AiVRtPNdf3Hy9Zzk',
  },
  robots: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
  },
  openGraph: {
    siteName: 'Touchless Car Wash Finder',
    type: 'website',
    images: [
      {
        url: 'https://res.cloudinary.com/dret3qhyu/image/upload/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png',
        width: 1200,
        height: 630,
        alt: 'Touchless Car Wash Finder',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: [
      {
        url: 'https://res.cloudinary.com/dret3qhyu/image/upload/v1771409300/ChatGPT_Image_Feb_18_2026_10_07_23_AM_qvq0yj.png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Analytics — a RAW inline <script> at the top of <head>, run
            during HTML parse, before hydration and before the Monumetric ad
            stack (which is deferred to `lazyOnload` in AnalyticsScripts). After
            Monumetric's ad changes, GA was undercounting ~80% of visits: the ad
            stack (~250 resources, froze the main thread for several seconds)
            monopolized the browser so gtag couldn't dispatch its pageview for
            ~6s, and on a search directory most visitors leave before that (real
            traffic was fine — confirmed server-side via Cloudflare; GA was just
            blind). Fix = run GA first + defer the ad stack so the pageview
            fires in the first second. The `analytics_storage` grant below is
            good hygiene (no consent framework is active on the site); it is
            scoped to analytics ONLY — ad_storage / ad_user_data /
            ad_personalization are left unset so Monumetric governs ad consent.
            Self-gates /admin (admin visits skewed totals); production only. */}
        {process.env.NODE_ENV === 'production' && (
          <script
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html:
                "(function(){if(location.pathname.indexOf('/admin')===0)return;" +
                'window.dataLayer=window.dataLayer||[];' +
                'function gtag(){dataLayer.push(arguments);}window.gtag=gtag;' +
                "gtag('consent','default',{analytics_storage:'granted'});" +
                "gtag('js',new Date());gtag('config','G-55HHXHEVFP');" +
                'var s=document.createElement("script");s.async=true;' +
                "s.src='https://www.googletagmanager.com/gtag/js?id=G-55HHXHEVFP';" +
                'document.head.appendChild(s);})();',
            }}
          />
        )}
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <meta name="impact-site-verification" content="f3b814bc-d87d-473f-b3f3-91951d20170e" />
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        {/* AdSense + Monumetric ad scripts (afterInteractive), excluded from
            /admin. GA is loaded above (not here) so it can't be delayed by the
            ad stack. */}
        <AnalyticsScripts />
        {/* Google Maps is loaded on-demand by HeroSection when user interacts with search */}
      </head>
      <body className={inter.className}>
        <PublicShell>
          {children}
        </PublicShell>
        <Toaster />
      </body>
    </html>
  );
}

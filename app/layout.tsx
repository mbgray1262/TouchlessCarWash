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
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <meta name="impact-site-verification" content="f3b814bc-d87d-473f-b3f3-91951d20170e" />
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        {/* GA + AdSense are wrapped in AnalyticsScripts so they don't load
            on /admin/* pages — admin sessions were skewing GA totals. */}
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

import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { PublicShell } from '@/components/PublicShell';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Touchless Car Wash Finder',
    template: '%s | Touchless Car Wash Finder',
  },
  description: 'Find verified touchless car washes near you. Browse 3,465+ brushless car wash locations across all 50 states + DC.',
  metadataBase: new URL('https://touchlesscarwashfinder.com'),
  verification: {
    google: 'aO6V2H3Yb4O904NRWtdJRkZZdb2AiVRtPNdf3Hy9Zzk',
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
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        {process.env.NODE_ENV === 'production' && (
          <>
            <Script
              src="https://www.googletagmanager.com/gtag/js?id=G-55HHXHEVFP"
              strategy="lazyOnload"
            />
            <Script id="google-analytics" strategy="lazyOnload">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', 'G-55HHXHEVFP');
              `}
            </Script>
            <Script
              async
              src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2012332157653110"
              crossOrigin="anonymous"
              strategy="beforeInteractive"
            />
          </>
        )}
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

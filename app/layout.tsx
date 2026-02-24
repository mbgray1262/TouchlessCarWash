import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { headers } from 'next/headers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Touchless Car Wash Finder',
    template: '%s | Touchless Car Wash Finder',
  },
  description: 'Find verified touchless car washes near you. Browse 3,465+ brushless car wash locations across all 50 states + DC.',
  metadataBase: new URL('https://touchlesscarwashfinder.com'),
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
  const headersList = headers();
  const pathname = headersList.get('x-pathname') ?? '';
  const isAdmin = pathname.startsWith('/admin');

  return (
    <html lang="en">
      <body className={inter.className}>
        {!isAdmin && <Header />}
        {children}
        {!isAdmin && <Footer />}
        <Toaster />
      </body>
    </html>
  );
}

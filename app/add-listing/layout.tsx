import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Add Your Touchless Car Wash',
  description:
    'Submit your touchless car wash to our free directory. Get found by car owners searching for verified brushless, touch-free washes near them.',
  alternates: {
    canonical: 'https://touchlesscarwashfinder.com/add-listing',
  },
  openGraph: {
    title: 'Add Your Touchless Car Wash | Touchless Car Wash Finder',
    description:
      'Submit your touchless car wash to our free directory. Get found by car owners searching for verified brushless, touch-free washes near them.',
    url: 'https://touchlesscarwashfinder.com/add-listing',
    type: 'website',
  },
};

export default function AddListingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

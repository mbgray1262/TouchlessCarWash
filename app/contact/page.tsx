import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Mail, MapPin, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Get in touch with Touchless Car Wash Finder. Questions about listings, corrections, or business inquiries — we\'re here to help.',
  alternates: {
    canonical: 'https://touchlesscarwashfinder.com/contact',
  },
  openGraph: {
    title: 'Contact Us | Touchless Car Wash Finder',
    description:
      'Get in touch with Touchless Car Wash Finder. Questions about listings, corrections, or business inquiries — we\'re here to help.',
    url: 'https://touchlesscarwashfinder.com/contact',
    type: 'website',
  },
};

export default function ContactPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://touchlesscarwashfinder.com' },
      { '@type': 'ListItem', position: 2, name: 'Contact', item: 'https://touchlesscarwashfinder.com/contact' },
    ],
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Header */}
      <div className="bg-[#0F2744] py-14">
        <div className="container mx-auto px-4 max-w-3xl">
          <nav className="flex items-center gap-1.5 text-sm text-white/50 mb-5">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white">Contact</span>
          </nav>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
            Contact Us
          </h1>
          <p className="text-white/70 text-lg">
            Have a question, correction, or business inquiry? We&apos;d love to hear from you.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 max-w-3xl py-12">
        <div className="grid md:grid-cols-2 gap-10">

          {/* Contact Info */}
          <div>
            <h2 className="text-2xl font-bold text-[#0F2744] mb-6">Get in Touch</h2>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Email</h3>
                  <a
                    href="mailto:hello@touchlesscarwashfinder.com"
                    className="text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    hello@touchlesscarwashfinder.com
                  </a>
                  <p className="text-sm text-gray-500 mt-1">We typically respond within 1-2 business days.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Hours</h3>
                  <p className="text-gray-600">Monday – Friday, 9 AM – 5 PM ET</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Coverage</h3>
                  <p className="text-gray-600">Serving all 50 states + Washington, D.C.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Common Reasons */}
          <div>
            <h2 className="text-2xl font-bold text-[#0F2744] mb-6">How Can We Help?</h2>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-1">Listing Corrections</h3>
                <p className="text-sm text-gray-600">
                  Notice incorrect hours, phone number, or other details for a car wash? Let us know and we&apos;ll update it.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-1">Add Your Business</h3>
                <p className="text-sm text-gray-600">
                  Own or operate a touchless car wash? <Link href="/add-listing" className="text-blue-600 hover:underline">Submit your listing</Link> to get featured in our directory.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-1">Report a Non-Touchless Listing</h3>
                <p className="text-sm text-gray-600">
                  Found a car wash in our directory that uses brushes? Email us and we&apos;ll investigate and remove it if confirmed.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-1">Partnerships & Media</h3>
                <p className="text-sm text-gray-600">
                  For advertising, partnership opportunities, or media inquiries, reach out via email.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 p-8 rounded-2xl bg-[#0F2744] text-center">
          <h2 className="text-2xl font-bold text-white mb-3">
            Own a Touchless Car Wash?
          </h2>
          <p className="text-white/70 mb-6 max-w-lg mx-auto">
            Get your business listed on the only directory dedicated exclusively to touchless car washes. It&apos;s free to add your listing.
          </p>
          <Link
            href="/add-listing"
            className="inline-flex items-center px-6 py-3 rounded-full bg-green-500 hover:bg-green-600 text-white font-semibold transition-colors"
          >
            Add Your Business
          </Link>
        </div>
      </div>
    </div>
  );
}

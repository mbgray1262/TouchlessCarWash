import type { Metadata } from 'next';
import Link from 'next/link';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const SITE_NAME = 'Touchless Car Wash Finder';
const CONTACT_EMAIL = 'hello@touchlesscarwashfinder.com';
const EFFECTIVE_DATE = 'March 6, 2026';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `Read the ${SITE_NAME} terms of service. Understand your rights and responsibilities when using our touchless car wash directory.`,
  alternates: {
    canonical: `${SITE_URL}/terms-of-service`,
  },
  openGraph: {
    title: `Terms of Service | ${SITE_NAME}`,
    description: `Read the ${SITE_NAME} terms of service. Understand your rights and responsibilities when using our directory.`,
    url: `${SITE_URL}/terms-of-service`,
    type: 'website',
  },
};

export default function TermsOfServicePage() {
  return (
    <main>
      {/* Hero */}
      <section className="bg-[#0F2744] text-white py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
            Terms of Service
          </h1>
          <p className="text-blue-100 text-lg">
            Effective date: {EFFECTIVE_DATE}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto max-w-3xl prose prose-lg prose-gray">
          <p>
            Welcome to {SITE_NAME} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By
            accessing or using{' '}
            <Link href="/" className="text-[#0F2744] underline">
              touchlesscarwashfinder.com
            </Link>{' '}
            (the &ldquo;Site&rdquo;), you agree to be bound by these Terms of Service
            (&ldquo;Terms&rdquo;). If you do not agree, please do not use the Site.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">1. About the Site</h2>
          <p className="text-gray-700">
            {SITE_NAME} is an online directory that lists verified touchless (brushless) car wash
            locations across the United States. The Site provides information including business
            names, addresses, hours of operation, ratings, reviews, photos, and other details to
            help users find touchless car wash locations.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">2. Use of the Site</h2>
          <p className="text-gray-700">You agree to use the Site only for lawful purposes. You may not:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Use the Site in any way that violates applicable laws or regulations.</li>
            <li>
              Scrape, crawl, or use automated tools to extract data from the Site without our
              prior written consent.
            </li>
            <li>
              Interfere with the proper functioning of the Site, including by introducing
              viruses, bots, or other harmful code.
            </li>
            <li>
              Attempt to gain unauthorized access to any part of the Site or its underlying
              systems.
            </li>
            <li>
              Reproduce, distribute, or commercially exploit the Site&rsquo;s content without
              our permission.
            </li>
          </ul>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">
            3. Directory Only — Not a Car Wash Operator
          </h2>
          <p className="text-gray-700">
            <strong>{SITE_NAME} is an independent online directory.</strong> We do not own, operate,
            manage, or have any affiliation with any of the car wash businesses listed on this Site.
            We are not responsible for the quality of service, pricing, billing, refunds, customer
            service, or any other aspect of any car wash listed in our directory.
          </p>
          <p className="text-gray-700 mt-3">
            <strong>If you have a complaint, refund request, billing dispute, or service issue
            with a specific car wash, you must contact that car wash business directly.</strong> We
            cannot process refunds, mediate disputes, or intervene in any transaction between you
            and a car wash business. Contact information for each car wash (phone number, website)
            is provided on their listing page.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">
            4. Directory Listings and Accuracy
          </h2>
          <p className="text-gray-700">
            We make reasonable efforts to verify that each car wash listed in our directory is a
            genuine touchless (brushless) facility. However, we cannot guarantee the accuracy,
            completeness, or timeliness of any listing. Car wash businesses may change their
            equipment, hours, prices, or operating status without notifying us.
          </p>
          <p className="text-gray-700 mt-3">
            <strong>You acknowledge that:</strong>
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              Listings are provided for informational purposes only and should not be considered
              a guarantee of service quality or equipment type.
            </li>
            <li>
              You should confirm details directly with the car wash before visiting, especially
              if equipment type is critical to you (e.g., for ceramic-coated vehicles).
            </li>
            <li>
              Ratings and reviews displayed on the Site are sourced from third-party platforms
              (such as Google) and may not reflect current conditions.
            </li>
          </ul>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">
            5. Business Listing Submissions
          </h2>
          <p className="text-gray-700">
            If you submit a car wash for inclusion in our directory, you represent that:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              The information you provide is accurate and you are authorized to submit it.
            </li>
            <li>The car wash operates genuinely touchless (brushless) equipment.</li>
            <li>
              You grant us a non-exclusive, royalty-free license to display the submitted
              information on the Site.
            </li>
          </ul>
          <p className="text-gray-700 mt-3">
            We reserve the right to reject, edit, or remove any submitted listing at our sole
            discretion.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">6. Intellectual Property</h2>
          <p className="text-gray-700">
            All content on the Site — including text, graphics, logos, page layouts, and software
            — is the property of {SITE_NAME} or its licensors and is protected by applicable
            intellectual property laws. You may not copy, modify, distribute, or create
            derivative works from the Site&rsquo;s content without our prior written permission.
          </p>
          <p className="text-gray-700 mt-3">
            Car wash business names, logos, and photos displayed in listings belong to their
            respective owners and are used here for informational purposes.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">7. Third-Party Content and Links</h2>
          <p className="text-gray-700">
            The Site may display content from or link to third-party websites, including Google
            Maps, car wash business websites, and advertising partners. We do not control and
            are not responsible for the content, accuracy, or practices of third-party websites.
            Your use of third-party sites is governed by their respective terms and policies.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">8. Advertising</h2>
          <p className="text-gray-700">
            The Site may display advertisements served by third-party ad networks. These ads may
            use cookies or similar technologies to deliver relevant content. Your interaction
            with advertisements is solely between you and the advertiser. We are not responsible
            for the content or accuracy of any advertisement or the practices of any advertiser.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">9. Disclaimer of Warranties</h2>
          <p className="text-gray-700">
            THE SITE AND ALL CONTENT ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
            AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE FULLEST
            EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES
            OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>
          <p className="text-gray-700 mt-3">
            We do not warrant that the Site will be uninterrupted, error-free, or free of
            harmful components, or that any listing information is accurate or current.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">10. Limitation of Liability</h2>
          <p className="text-gray-700">
            TO THE FULLEST EXTENT PERMITTED BY LAW, {SITE_NAME.toUpperCase()} SHALL NOT BE
            LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES
            ARISING OUT OF OR RELATED TO YOUR USE OF THE SITE, INCLUDING BUT NOT LIMITED TO
            DAMAGES RESULTING FROM RELIANCE ON LISTING INFORMATION, VEHICLE DAMAGE AT A LISTED
            CAR WASH, OR LOSS OF DATA.
          </p>
          <p className="text-gray-700 mt-3">
            Our total liability for any claim arising from your use of the Site shall not exceed
            the amount you paid to us (if any) in the twelve months preceding the claim.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">11. Indemnification</h2>
          <p className="text-gray-700">
            You agree to indemnify and hold harmless {SITE_NAME}, its owners, operators, and
            affiliates from any claims, damages, losses, or expenses (including reasonable
            attorney&rsquo;s fees) arising from your use of the Site, your violation of these
            Terms, or your violation of any third-party rights.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">12. Changes to These Terms</h2>
          <p className="text-gray-700">
            We may update these Terms from time to time. When we make changes, we will update
            the &ldquo;Effective date&rdquo; at the top of this page. Your continued use of the
            Site after changes are posted constitutes your acceptance of the updated Terms.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">13. Governing Law</h2>
          <p className="text-gray-700">
            These Terms are governed by and construed in accordance with the laws of the United
            States. Any disputes arising from these Terms or your use of the Site shall be
            resolved in the courts of competent jurisdiction.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">14. Contact Us</h2>
          <p className="text-gray-700">
            If you have questions about these Terms, please contact us at:
          </p>
          <p className="text-gray-700 mt-2">
            <strong>{SITE_NAME}</strong>
            <br />
            Email:{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#0F2744] underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}

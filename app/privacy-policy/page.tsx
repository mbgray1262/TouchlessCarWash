import type { Metadata } from 'next';
import Link from 'next/link';

const SITE_URL = 'https://touchlesscarwashfinder.com';
const SITE_NAME = 'Touchless Car Wash Finder';
const CONTACT_EMAIL = 'hello@touchlesscarwashfinder.com';
const EFFECTIVE_DATE = 'March 6, 2026';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `Read the ${SITE_NAME} privacy policy. Learn how we collect, use, and protect your personal information when you use our touchless car wash directory.`,
  alternates: {
    canonical: `${SITE_URL}/privacy-policy`,
  },
  openGraph: {
    title: `Privacy Policy | ${SITE_NAME}`,
    description: `Read the ${SITE_NAME} privacy policy. Learn how we collect, use, and protect your personal information.`,
    url: `${SITE_URL}/privacy-policy`,
    type: 'website',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <main>
      {/* Hero */}
      <section className="bg-[#0F2744] text-white py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
            Privacy Policy
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
            {SITE_NAME} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the website at{' '}
            <Link href="/" className="text-[#0F2744] underline">
              touchlesscarwashfinder.com
            </Link>{' '}
            (the &ldquo;Site&rdquo;). This Privacy Policy explains what information we collect, how we
            use it, and the choices you have.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">1. Information We Collect</h2>

          <h3 className="text-xl font-semibold text-[#0F2744] mt-6 mb-3">
            Information You Provide
          </h3>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              <strong>Newsletter sign-up:</strong> If you subscribe to our email list, we collect
              your email address.
            </li>
            <li>
              <strong>Business listing submissions:</strong> If you submit a car wash for inclusion
              in our directory, we collect the business name, address, phone number, website URL,
              and any other details you provide about the location.
            </li>
            <li>
              <strong>Contact messages:</strong> If you email us or use a contact form, we collect
              your name, email address, and message content.
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-[#0F2744] mt-6 mb-3">
            Information Collected Automatically
          </h3>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              <strong>Usage data:</strong> We collect standard web server logs and analytics data,
              including your IP address, browser type, operating system, referring URLs, pages
              visited, and timestamps.
            </li>
            <li>
              <strong>Cookies and similar technologies:</strong> We use cookies, pixels, and
              similar tracking technologies to understand how visitors use the Site and to serve
              relevant advertisements. See Section 4 below for details.
            </li>
            <li>
              <strong>Location data:</strong> When you use our search feature, we may request
              access to your device&rsquo;s geolocation to show car washes near you. This is
              optional and only occurs with your permission.
            </li>
          </ul>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">2. How We Use Your Information</h2>
          <p className="text-gray-700">We use the information we collect to:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Operate, maintain, and improve the Site and our directory of touchless car washes.</li>
            <li>Respond to your inquiries and listing submissions.</li>
            <li>Send newsletters and updates if you have opted in (you can unsubscribe at any time).</li>
            <li>Analyze usage trends and improve the user experience.</li>
            <li>Display relevant advertisements through third-party ad networks.</li>
            <li>Detect and prevent fraud, abuse, or security issues.</li>
          </ul>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">3. Information Sharing</h2>
          <p className="text-gray-700">
            We do not sell your personal information. We may share information with:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              <strong>Service providers:</strong> Third-party vendors that help us operate the
              Site, such as hosting providers, analytics services, and email delivery platforms.
            </li>
            <li>
              <strong>Advertising partners:</strong> Third-party ad networks (such as Google
              AdSense or Mediavine) that may use cookies to serve relevant ads. These partners
              may collect information about your browsing activity across different websites.
            </li>
            <li>
              <strong>Legal obligations:</strong> When required by law, subpoena, or other legal
              process, or to protect our rights, property, or safety.
            </li>
          </ul>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">4. Cookies and Advertising</h2>
          <p className="text-gray-700">
            The Site uses cookies and similar technologies for the following purposes:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>
              <strong>Essential cookies:</strong> Required for the Site to function properly
              (e.g., remembering your location preference).
            </li>
            <li>
              <strong>Analytics cookies:</strong> Help us understand how visitors interact with
              the Site so we can improve it. We may use services such as Google Analytics.
            </li>
            <li>
              <strong>Advertising cookies:</strong> Used by third-party ad networks to deliver
              ads that are relevant to your interests. These cookies may track your activity
              across different websites.
            </li>
          </ul>
          <p className="text-gray-700">
            You can manage cookie preferences through your browser settings. Most browsers allow
            you to block or delete cookies, although doing so may affect Site functionality. You
            can also opt out of personalized advertising by visiting{' '}
            <a
              href="https://www.aboutads.info/choices/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0F2744] underline"
            >
              aboutads.info/choices
            </a>{' '}
            or{' '}
            <a
              href="https://optout.networkadvertising.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0F2744] underline"
            >
              optout.networkadvertising.org
            </a>
            .
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">5. Third-Party Links</h2>
          <p className="text-gray-700">
            The Site contains links to third-party websites, including Google Maps, car wash
            business websites, and advertiser pages. We are not responsible for the privacy
            practices of those websites. We encourage you to read their privacy policies before
            providing any personal information.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">6. Data Retention</h2>
          <p className="text-gray-700">
            We retain personal information for as long as reasonably necessary to fulfill the
            purposes described in this policy, unless a longer retention period is required by
            law. You can request deletion of your personal information at any time by contacting
            us.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">7. Data Security</h2>
          <p className="text-gray-700">
            We take reasonable measures to protect your information from unauthorized access,
            loss, misuse, or alteration. However, no method of transmission over the Internet
            or electronic storage is completely secure, and we cannot guarantee absolute security.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">8. Your Rights</h2>
          <p className="text-gray-700">Depending on your location, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Access the personal information we hold about you.</li>
            <li>Request correction of inaccurate information.</li>
            <li>Request deletion of your personal information.</li>
            <li>Opt out of marketing communications at any time.</li>
            <li>Opt out of the sale or sharing of your personal information (where applicable).</li>
          </ul>
          <p className="text-gray-700">
            To exercise any of these rights, please contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#0F2744] underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">
            9. California Privacy Rights (CCPA)
          </h2>
          <p className="text-gray-700">
            If you are a California resident, the California Consumer Privacy Act (CCPA) gives
            you additional rights regarding your personal information, including the right to
            know what information we collect, the right to request deletion, and the right to
            opt out of the sale of your personal information. We do not sell personal information
            as defined by the CCPA. To make a request, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#0F2744] underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">10. Children&rsquo;s Privacy</h2>
          <p className="text-gray-700">
            The Site is not directed at children under the age of 13, and we do not knowingly
            collect personal information from children under 13. If you believe we have
            inadvertently collected information from a child under 13, please contact us so we
            can delete it.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">11. Changes to This Policy</h2>
          <p className="text-gray-700">
            We may update this Privacy Policy from time to time. When we make changes, we will
            update the &ldquo;Effective date&rdquo; at the top of this page. We encourage you to review
            this policy periodically to stay informed about how we protect your information.
          </p>

          <h2 className="text-2xl font-bold text-[#0F2744] mt-10 mb-4">12. Contact Us</h2>
          <p className="text-gray-700">
            If you have questions or concerns about this Privacy Policy, please contact us at:
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

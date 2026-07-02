/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent duplicate URLs from trailing slashes (e.g. /state/texas vs /state/texas/)
  trailingSlash: false,
  // Disable Next.js ETag generation. With ETags on, Netlify's Durable Cache can
  // revalidate a compressed (brotli) variant, receive a bodyless 304 from the
  // Next origin, and then have nothing to serve — so brotli-requesting browsers
  // (i.e. all of them) get a BLANK PAGE while curl (uncompressed) sees 200.
  // Netlify does its own edge caching + compression, so losing Next's ETags is
  // harmless. (Root-cause fix for the 2026-07-02 blank-listing bug.)
  generateEtags: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: true,
    serverActionsBodySizeLimit: '50mb',
    browsersListForSwc: true,
  },
  async redirects() {
    return [
      {
        source: '/car-washes/:state',
        destination: '/state/:state',
        permanent: true,
      },
      {
        source: '/car-washes/:state/:city',
        destination: '/state/:state/:city',
        permanent: true,
      },
      {
        source: '/car-washes/:state/:city/:slug',
        destination: '/state/:state/:city/:slug',
        permanent: true,
      },
      // Old blog-based product page → consolidated /shop catalog
      {
        source: '/blog/recommended-products',
        destination: '/shop',
        permanent: true,
      },
      // Deleted duplicate blog posts → redirect to surviving articles
      {
        source: '/blog/touchless-vs-automatic-car-wash',
        destination: '/blog/touchless-vs-brush-car-wash',
        permanent: true,
      },
      {
        source: '/blog/why-touchless-car-washes-are-better',
        destination: '/blog/benefits-of-touchless-car-washes',
        permanent: true,
      },
      // Listing slug renames — keep any pre-existing inbound links working.
      // (Same pattern can be reused if/when other long auto-generated slugs
      // get cleaned up; not retroactively renaming all of them per policy.)
      {
        source: '/state/massachusetts/rutland/sentry-suds-car-wash-13a-pommogussett-rd-rutland-ma-01543-rutland-massachusetts',
        destination: '/state/massachusetts/rutland/sentry-suds-car-wash',
        permanent: true,
      },
      // City-name normalization (2026-06-20): listings consolidated onto one
      // canonical spelling per city, which empties the old variant slug. 301
      // those to the canonical city page so no soft-404s / split coverage.
      {
        source: '/state/minnesota/saint-paul',
        destination: '/state/minnesota/st-paul',
        permanent: true,
      },
      {
        source: '/state/minnesota/saint-cloud',
        destination: '/state/minnesota/st-cloud',
        permanent: true,
      },
      {
        source: '/state/minnesota/saint-joseph',
        destination: '/state/minnesota/st-joseph',
        permanent: true,
      },
      {
        source: '/state/south-carolina/mt-pleasant',
        destination: '/state/south-carolina/mount-pleasant',
        permanent: true,
      },
      {
        source: '/state/wisconsin/mt-horeb',
        destination: '/state/wisconsin/mount-horeb',
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [96, 128, 256, 384],
  },
};

module.exports = nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent duplicate URLs from trailing slashes (e.g. /state/texas vs /state/texas/)
  trailingSlash: false,
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

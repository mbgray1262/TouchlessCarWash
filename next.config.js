/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'gteqijdpqjmgxfnyuhvy.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'streetviewpixels-pa.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'places.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'maps.googleapis.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [96, 128, 256, 384],
  },
};

module.exports = nextConfig;

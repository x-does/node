import type { NextConfig } from 'next';

const NO_STORE =
  'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0';

const noCacheHeaders = [
  { key: 'Cache-Control', value: NO_STORE },
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Expires', value: '0' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/', headers: noCacheHeaders },
      { source: '/audit', headers: noCacheHeaders },
      { source: '/api/audit-click', headers: noCacheHeaders },
      { source: '/api/audit-metrics', headers: noCacheHeaders },
    ];
  },
};

export default nextConfig;

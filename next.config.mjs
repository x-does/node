/** @type {import('next').NextConfig} */
const NO_STORE = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: NO_STORE },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/audit',
        headers: [
          { key: 'Cache-Control', value: NO_STORE },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/api/audit-click',
        headers: [
          { key: 'Cache-Control', value: NO_STORE },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/api/audit-metrics',
        headers: [
          { key: 'Cache-Control', value: NO_STORE },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
};

export default nextConfig;

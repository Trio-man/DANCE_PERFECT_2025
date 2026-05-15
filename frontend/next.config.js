/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        // When the frontend calls /api/backend/..., 
        // Vercel will fetch from your Hetzner IP behind the scenes.
        source: '/api/backend/:path*',
        destination: 'http://49.13.74.29:5000/:path*',
      },
    ];
  },
};

module.exports = nextConfig;

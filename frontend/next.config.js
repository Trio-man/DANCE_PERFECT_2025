/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
      },
      // 🎯 ADD THIS RULE: Proxy asset traffic cleanly to your backend domain
      {
        source: '/deviation_gifs/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/deviation_gifs/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

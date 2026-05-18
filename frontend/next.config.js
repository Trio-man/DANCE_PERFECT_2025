/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        // 🎯 Catch '/api/analyze' directly from the frontend
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
      },
      {
        source: '/deviation_gifs/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/deviation_gifs/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

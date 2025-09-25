/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://vycitegtmnlrsrztrhvk.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5Y2l0ZWd0bW5scnNyenRyaHZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzNjgwMzksImV4cCI6MjA3Mzk0NDAzOX0.RVW26hATQsgE4Bpnh-_bAOh0FGM6kDLrWwCHCdSDM7w", 
  },
};

module.exports = nextConfig;

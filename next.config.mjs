/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  serverExternalPackages: ['firebase-admin', 'googleapis'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

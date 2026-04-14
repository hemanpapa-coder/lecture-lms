/** @type {import('next').NextConfig} */
const nextConfig = {
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

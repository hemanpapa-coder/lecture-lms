import type { NextConfig } from "next";

// @ts-ignore
const nextConfig: NextConfig = {
  serverExternalPackages: ['googleapis'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

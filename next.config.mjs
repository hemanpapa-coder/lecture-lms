import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
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

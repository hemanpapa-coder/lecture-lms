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
  serverExternalPackages: ['firebase-admin', 'googleapis', 'ffmpeg-static'],
  outputFileTracingIncludes: {
    '/api/recording-class/transcribe-drive': ['./node_modules/ffmpeg-static/ffmpeg'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;

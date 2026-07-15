import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@twitter2020/contracts', '@twitter2020/db'],
  turbopack: { root: workspaceRoot },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '9000' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;

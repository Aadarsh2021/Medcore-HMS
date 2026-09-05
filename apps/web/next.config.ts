import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@medcore/types'],
  output: 'export',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

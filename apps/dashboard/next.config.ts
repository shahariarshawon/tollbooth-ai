import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Stops Next.js from writing AGENTS.md and CLAUDE.md into the app. Remove to opt in.
  agentRules: false,
};

export default nextConfig;

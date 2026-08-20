import type { NextConfig } from 'next';

const API = process.env.API_URL || 'http://127.0.0.1:4000';

const nextConfig: NextConfig = {
  // A second server (a dev build for checking a change, say) must not write to
  // the same .next as the one already serving — they overwrite each other's
  // manifests and both start throwing ENOENT. Point it elsewhere instead.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // The browser always talks same-origin; Next proxies /api to the NestJS
  // service. In production nginx does this instead — same paths, no CORS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};

export default nextConfig;

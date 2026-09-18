import type { NextConfig } from "next";

// The browser only ever talks to this origin. /api requests are proxied to the
// backend, so the auth cookie is a *first-party* cookie on the frontend origin
// and survives reloads on every browser — iOS/Android Safari/Chrome block
// third-party cookies, which made the old cross-site refresh fail there.
const nextConfig: NextConfig = {
  async rewrites() {
    const target = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
};

export default nextConfig;

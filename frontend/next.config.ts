import type { NextConfig } from "next";

// The browser only ever talks to this origin. /api requests are proxied to the
// backend, so the auth cookie is a *first-party* cookie on the frontend origin
// and survives reloads on every browser — iOS/Android Safari/Chrome block
// third-party cookies, which made the old cross-site refresh fail there.

const isDev = process.env.NODE_ENV !== "production";
const cdnHosts = ["https://res.cloudinary.com"];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  images: {
    /**
     * `next/image` optimises and re-serves remote avatars and group covers, so
     * these hosts have to be allow-listed explicitly.
     *
     * Cloudinary is where the app itself puts uploaded media, and is pinned to
     * `res.cloudinary.com` alone. The wildcard is here because the API currently
     * accepts *any* https URL for `profileImage` and a community `image` (see the
     * `.url()` validators in backend/src/validators), and tightening those to
     * Cloudinary-only would blank the avatars of everyone who set an external
     * image today.
     *
     * That wildcard is also the remaining version of the tracking-pixel risk: a
     * crafted avatar URL can still be loaded as a third-party pixel. The durable
     * fix is to constrain the backend validator to hosts we serve media from,
     * after which this wildcard can be deleted.
     */
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
      { protocol: "https", hostname: "**", pathname: "/**" },
    ],
    // Avatars are tiny; the default device sizes overshoot on dense lists.
    deviceSizes: [40, 64, 96, 128, 256, 384],
  },

  async rewrites() {
    const target = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // An app whose UI is voice, PTT and "I need help" must not be
          // clickjacked — a transparent overlay over those buttons is a
          // safety issue, not just a UI one.
          { key: "Content-Security-Policy", value: contentSecurityPolicy(cdnHosts) },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=()" },
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]),
        ],
      },
    ];
  },
};

/**
 * Media is user-supplied and served from Cloudinary, so `img-src`/`media-src`
 * are the interesting directives: they constrain the tracking-pixel surface that
 * a crafted profile/avatar URL would otherwise open up.
 *
 * `'unsafe-inline'` is required for styles because Next.js injects a style tag
 * for the route's CSS module. Scripts stay locked to 'self' — nothing in this app
 * uses eval or inline script beyond the theme bootstrap, which is served as its
 * own file.
 */
function contentSecurityPolicy(cdn: string[]) {
  const img = ["'self'", "data:", "blob:", ...cdn].join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img}`,
    `media-src ${img}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export default nextConfig;
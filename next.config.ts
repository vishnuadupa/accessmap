import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent MIME-type sniffing — stops browser from guessing content-type
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Deny framing entirely — prevents clickjacking
  { key: "X-Frame-Options", value: "DENY" },
  // Limit referrer information sent to third parties
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // DNS prefetch control — minor privacy improvement
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Restrict browser features we don't use
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
  },
  // L3 FIX: Content Security Policy
  // Allows: self, OSM tiles, Google Fonts (for Inter), inline styles (Leaflet needs this)
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-inline needed for Next.js inline scripts (RSC streaming, __next_r)
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Leaflet uses inline styles
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://*.tile.openstreetmap.org https://*.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com",
      "connect-src 'self'", // all external calls are server-side only
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Leaflet imports CSS from node_modules — needs transpiling
  transpilePackages: ["leaflet", "react-leaflet"],

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.tile.openstreetmap.org" },
    ],
  },

  turbopack: {},
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Leaflet imports CSS from node_modules — needs transpiling
  transpilePackages: ["leaflet", "react-leaflet"],
  images: {
    remotePatterns: [
      // OSM tile servers (for any future image needs)
      { protocol: "https", hostname: "*.tile.openstreetmap.org" },
    ],
  },
  // Silence the "Critical dependency: the request of a dependency is an expression"
  // warning from mongoose during build
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Content media uploads go through a server action (see lib/content/assets.ts).
    serverActions: { bodySizeLimit: "100mb" },
  },
  // Every agency screen reads the session, so pages render per request.
  // Cache Components stays off until a route has static content worth caching.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

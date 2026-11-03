
import { fileURLToPath } from "node:url";

const nextRouterAdapter = fileURLToPath(new URL("./src/lib/next-router.tsx", import.meta.url));

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  pageExtensions: ["next.tsx", "next.ts", "next.jsx", "next.js"],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "react-router-dom$": nextRouterAdapter,
    };
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
  typescript: {
    tsconfigPath: "tsconfig.next.json",
  },
};

export default nextConfig;

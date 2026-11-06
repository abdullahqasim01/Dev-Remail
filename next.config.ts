import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is fully dynamic (a mail server), so Cache Components buys nothing.
  cacheComponents: false,
  partialPrefetching: false,
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Resend accepts large attachments; do not trim request bodies.
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // a separate dist dir lets an e2e build run without clobbering `next dev`'s .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;

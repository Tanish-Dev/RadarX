import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // a separate dist dir lets an e2e build run without clobbering `next dev`'s .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["@libsql/client"],
  poweredByHeader: false, // don't advertise the framework/version
  productionBrowserSourceMaps: false,
  // resume PDFs go through server actions; Vercel's request cap is 4.5 MB
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;

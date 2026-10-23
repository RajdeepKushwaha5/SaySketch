import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the dev-only "N" badge covers the composer controls (and would show in demo recordings)
  devIndicators: false,
  // lets browser tests run beside a developer's `next dev` (separate build dir and lock)
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: process.cwd(),
  },
  // always defined so it is inlined and the browser-test hook is dead-code-eliminated in normal builds
  env: { NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E === "1" ? "1" : "" },
};

export default nextConfig;

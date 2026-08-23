import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Left to Node rather than bundled: the Postgres driver and PGlite both
  // resolve files at runtime.
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],

  // The Playwright suite drives the dev server over 127.0.0.1 rather than
  // localhost, which Next treats as a cross-origin dev request.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; it must not be bundled by webpack/turbopack.
  serverExternalPackages: ["better-sqlite3"],

  // The Playwright suite drives the dev server over 127.0.0.1 rather than
  // localhost, which Next treats as a cross-origin dev request.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;

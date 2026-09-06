import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@sentry/nextjs"],
  async headers() { return [{ source: "/:path*", headers: securityHeaders }]; },
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;

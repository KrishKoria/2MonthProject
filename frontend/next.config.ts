import type { NextConfig } from "next";

function normalizeBaseUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    return undefined;
  }
  return normalized.replace(/\/+$/, "");
}

function resolveApiProxyTarget() {
  return (
    normalizeBaseUrl(process.env.API_BASE_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL) ??
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : undefined)
  );
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    const proxyTarget = resolveApiProxyTarget();
    if (!proxyTarget) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${proxyTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

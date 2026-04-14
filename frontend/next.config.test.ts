import { expect, test } from "bun:test";

test("next config proxies API requests to the backend in local development", async () => {
  const previousApiBaseUrl = process.env.API_BASE_URL;
  const previousPublicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.API_BASE_URL = undefined;
  process.env.NEXT_PUBLIC_API_BASE_URL = undefined;
  process.env.NODE_ENV = "development";

  try {
    const { default: nextConfig } = await import("./next.config");
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual([
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ]);
  } finally {
    process.env.API_BASE_URL = previousApiBaseUrl;
    process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicBaseUrl;
    process.env.NODE_ENV = previousNodeEnv;
  }
});

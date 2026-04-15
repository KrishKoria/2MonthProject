import { expect, test } from "bun:test";

test("next config proxies API requests to the backend in local development", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previousApiBaseUrl = env.API_BASE_URL;
  const previousPublicBaseUrl = env.NEXT_PUBLIC_API_BASE_URL;
  const previousNodeEnv = env.NODE_ENV;

  env.API_BASE_URL = undefined;
  env.NEXT_PUBLIC_API_BASE_URL = undefined;
  env.NODE_ENV = "development";

  try {
    const { default: nextConfig } = await import("./next.config");
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toEqual([
      {
        source: "/api/((?!auth|admin).*)",
        destination: "http://127.0.0.1:8000/api/$1",
      },
    ]);
  } finally {
    env.API_BASE_URL = previousApiBaseUrl;
    env.NEXT_PUBLIC_API_BASE_URL = previousPublicBaseUrl;
    env.NODE_ENV = previousNodeEnv;
  }
});

import "server-only";

import { headers } from "next/headers";

function normalizeBaseUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    return undefined;
  }
  return normalized.replace(/\/+$/, "");
}

export async function getServerApiBaseUrl() {
  const configuredBaseUrl =
    normalizeBaseUrl(process.env.API_BASE_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    throw new Error("Unable to determine API base URL for server-side requests.");
  }

  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${proto}://${host}`;
}

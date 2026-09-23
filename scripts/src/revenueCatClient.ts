import { createClient } from "@replit/revenuecat-sdk/client";
import { ReplitConnectors } from "@replit/connectors-sdk";

/**
 * Creates a fresh authenticated RevenueCat client via Replit's connectors proxy.
 * Always call this fresh — tokens expire and the proxy handles refresh automatically.
 */
export async function getUncachableRevenueCatClient() {
  const connectors = new ReplitConnectors();

  const client = createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      const path = url.pathname + url.search;

      let body: string | undefined;
      if (request.method !== "GET" && request.method !== "HEAD") {
        const text = await request.text();
        if (text) body = text;
      }

      const extraHeaders: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        // Don't forward host header — let the proxy set it
        if (key.toLowerCase() !== "host") {
          extraHeaders[key] = value;
        }
      });

      return connectors.proxy("revenuecat", path, {
        method: request.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        headers: extraHeaders,
        body,
      }) as unknown as Response;
    },
  });

  return client;
}

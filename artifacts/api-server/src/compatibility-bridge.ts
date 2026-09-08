import { createServer, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";

const upstreamOrigin = new URL(
  process.env["COMPATIBILITY_UPSTREAM_ORIGIN"]
    ?? "https://tbm-api-v4-candidate.onrender.com",
);
const port = Number(process.env["PORT"] ?? "8080");
const requestTimeoutMs = Number(
  process.env["COMPATIBILITY_UPSTREAM_TIMEOUT_MS"] ?? "120000",
);

if (upstreamOrigin.protocol !== "https:") {
  throw new Error("Compatibility bridge upstream must use HTTPS");
}
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("PORT must be a positive integer");
}
if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
  throw new Error("COMPATIBILITY_UPSTREAM_TIMEOUT_MS must be a positive integer");
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function forwardedRequestHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const forwarded: IncomingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase()) && name.toLowerCase() !== "host") {
      forwarded[name] = value;
    }
  }
  forwarded.host = upstreamOrigin.host;
  return forwarded;
}

const server = createServer((clientRequest, clientResponse) => {
  const requestPath = clientRequest.url ?? "/";
  const pathname = new URL(requestPath, "http://compatibility-bridge.local").pathname;

  if (pathname !== "/api" && !pathname.startsWith("/api/")) {
    clientResponse.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    clientResponse.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const upstreamRequest = httpsRequest(
    {
      protocol: upstreamOrigin.protocol,
      hostname: upstreamOrigin.hostname,
      port: upstreamOrigin.port || 443,
      method: clientRequest.method,
      path: requestPath,
      headers: forwardedRequestHeaders(clientRequest.headers),
      timeout: requestTimeoutMs,
    },
    (upstreamResponse) => {
      const responseHeaders: IncomingHttpHeaders = {};
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
          responseHeaders[name] = value;
        }
      }
      responseHeaders["x-tbm-compatibility-bridge"] = "replit-to-render";
      clientResponse.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
      upstreamResponse.pipe(clientResponse);
    },
  );

  upstreamRequest.on("timeout", () => {
    upstreamRequest.destroy(new Error("Upstream request timed out"));
  });
  upstreamRequest.on("error", (error) => {
    console.error(JSON.stringify({
      level: "error",
      message: "Compatibility bridge upstream request failed",
      method: clientRequest.method,
      path: pathname,
      error: error.message,
    }));
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-tbm-compatibility-bridge": "replit-to-render",
      });
    }
    clientResponse.end(JSON.stringify({
      error: "Upstream service temporarily unavailable",
      code: "COMPATIBILITY_UPSTREAM_UNAVAILABLE",
    }));
  });
  clientRequest.on("aborted", () => upstreamRequest.destroy());

  // Deliberately no retries: replaying a write request could create duplicate
  // subscriptions, preferences, chat messages, or push-token mutations.
  clientRequest.pipe(upstreamRequest);
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    level: "info",
    message: "Temporary production compatibility bridge listening",
    port,
    upstream: upstreamOrigin.origin,
    schedulerEnabled: false,
    databaseConnected: false,
  }));
});

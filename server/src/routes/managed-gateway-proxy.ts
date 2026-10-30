import http from "node:http";
import https from "node:https";
import { Router, type Request, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { readManagedGatewayConfig } from "../services/managed-gateway.js";
import { resolveRunGatewayToken } from "../services/managed-gateway-tokens.js";

/** Largest request body the proxy forwards. */
export const MANAGED_GATEWAY_PROXY_BODY_LIMIT_BYTES = 20 * 1024 * 1024;
const INVALID_TOKEN = { error: "Invalid or expired gateway token" } as const;

// Hop-by-hop headers (RFC 9110 7.6.1) plus every credential the client sent;
// the server substitutes the operator's key.
const STRIPPED_REQUEST_HEADERS = new Set([
  "connection", "keep-alive", "proxy-connection", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host",
  "authorization", "x-api-key", "cookie",
]);
const STRIPPED_RESPONSE_HEADERS = new Set([
  "connection", "keep-alive", "proxy-connection", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "set-cookie",
]);

function bearer(req: Request) {
  const value = req.header("authorization") ?? "";
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, "").trim() : "";
}

/**
 * Rejects `..` segments (plain or percent-encoded) and any backslash, raw or
 * `%5c`: WHATWG URL parsing treats `\\` as `/`, so either could leave the
 * gateway base.
 */
function hasTraversal(pathAndQuery: string) {
  if (/\\|%5c/i.test(pathAndQuery)) return true;
  const pathname = pathAndQuery.split("?")[0] ?? "";
  return pathname.split("/").some(segment => {
    try { return decodeURIComponent(segment) === ".."; } catch { return true; }
  });
}

/**
 * The upstream URL for a proxied path, or null when the resolved URL leaves
 * the configured gateway origin or base path.
 */
export function managedGatewayUpstreamUrl(baseUrl: string, pathAndQuery: string): URL | null {
  if (hasTraversal(pathAndQuery)) return null;
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  let target: URL;
  try {
    target = new URL(`${base.origin}${basePath}${pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`}`);
  } catch {
    return null;
  }
  if (target.origin !== base.origin || !target.pathname.startsWith(`${basePath}/`)) return null;
  return target;
}

/**
 * Run-scoped proxy to the operator's 9Router gateway, mounted at
 * `/api/managed-gateway/v1` before the body parsers and actor middleware.
 * The bearer token is the access check: it binds one company and one active
 * run. The request is forwarded verbatim except for authorization, which
 * becomes the master key, and the response is streamed back unbuffered.
 * Bodies and tokens are never logged.
 */
export function managedGatewayProxyRoutes(db: Db) {
  const router = Router();

  router.use(async (req: Request, res: Response) => {
    let claims: Awaited<ReturnType<typeof resolveRunGatewayToken>> = null;
    try {
      claims = await resolveRunGatewayToken(db, bearer(req));
    } catch (error) {
      logger.error({ err: error }, "managed gateway token lookup failed");
      res.status(500).json({ error: "Gateway token lookup failed" });
      return;
    }
    if (!claims) {
      res.status(401).json(INVALID_TOKEN);
      return;
    }
    const gateway = readManagedGatewayConfig();
    if (!gateway) {
      res.status(503).json({ error: "The managed AI gateway is not configured on this instance" });
      return;
    }
    const target = managedGatewayUpstreamUrl(gateway.baseUrl, req.url);
    if (!target) {
      res.status(400).json({ error: "Invalid gateway path" });
      return;
    }
    const declaredLength = Number(req.header("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MANAGED_GATEWAY_PROXY_BODY_LIMIT_BYTES) {
      res.status(413).json({ error: "Request body too large" });
      return;
    }

    const headers: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined && !STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) headers[name] = value;
    }
    headers.authorization = `Bearer ${gateway.apiKey}`;

    let rejectedBody = false;
    const transport = target.protocol === "https:" ? https : http;
    const upstream = transport.request(target, { method: req.method, headers }, upstreamResponse => {
      const responseHeaders: http.OutgoingHttpHeaders = {};
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (value !== undefined && !STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) responseHeaders[name] = value;
      }
      res.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
      res.flushHeaders();
      upstreamResponse.pipe(res);
      upstreamResponse.on("error", () => res.destroy());
    });
    upstream.on("error", error => {
      if (rejectedBody) return;
      logger.warn({ runId: claims.runId, companyId: claims.companyId, code: (error as NodeJS.ErrnoException).code }, "managed gateway upstream request failed");
      if (!res.headersSent) res.status(502).json({ error: "The managed AI gateway is unreachable" });
      else res.destroy();
    });
    // A client that disconnects stops the upstream generation too.
    res.on("close", () => { if (!res.writableFinished) upstream.destroy(); });

    let received = 0;
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > MANAGED_GATEWAY_PROXY_BODY_LIMIT_BYTES && !rejectedBody) {
        rejectedBody = true;
        req.unpipe(upstream);
        upstream.destroy();
        if (!res.headersSent) res.status(413).json({ error: "Request body too large" });
        req.resume();
      }
    });
    req.pipe(upstream);
  });

  return router;
}

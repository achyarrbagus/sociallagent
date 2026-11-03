import { request as httpRequest, type IncomingHttpHeaders, type RequestOptions } from "node:http";
import type { Request, RequestHandler } from "express";

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

type RequestWithRawBody = Request & { rawBody?: Buffer };

function forwardedHeaders(req: Request, target: URL): IncomingHttpHeaders {
  const headers: IncomingHttpHeaders = { ...req.headers };
  const connectionTokens = (req.headers.connection ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  for (const name of [...HOP_BY_HOP_HEADERS, ...connectionTokens]) delete headers[name];

  headers.host = target.host;
  headers["x-forwarded-host"] = req.get("host") ?? "";
  headers["x-forwarded-proto"] = req.protocol;
  headers["x-forwarded-for"] = req.ip;
  return headers;
}

/** Stream a browser UI request to the private Next process after API/plugin routes. */
export function nextUiProxy(origin: string): RequestHandler {
  const base = new URL(origin);
  if (
    base.protocol !== "http:" ||
    base.hostname !== "127.0.0.1" ||
    base.username ||
    base.password ||
    base.pathname !== "/"
  ) {
    throw new Error("Next UI proxy origin must be a loopback HTTP origin");
  }

  return (req, res) => {
    const target = new URL(req.originalUrl, base);
    const options: RequestOptions = {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: `${target.pathname}${target.search}`,
      headers: forwardedHeaders(req, target),
    };
    const upstreamRequest = httpRequest(options, (upstreamResponse) => {
      res.statusCode = upstreamResponse.statusCode ?? 502;
      if (upstreamResponse.statusMessage) res.statusMessage = upstreamResponse.statusMessage;
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
          res.setHeader(name, value);
        }
      }
      upstreamResponse.on("error", () => res.destroy());
      upstreamResponse.pipe(res);
    });

    const abortUpstream = () => {
      if (!res.writableEnded) upstreamRequest.destroy();
    };
    req.once("aborted", abortUpstream);
    res.once("close", abortUpstream);
    upstreamRequest.once("error", () => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.status(502).type("text/plain").send("Next.js UI runtime unavailable");
    });

    const rawBody = (req as RequestWithRawBody).rawBody;
    if (Buffer.isBuffer(rawBody)) {
      upstreamRequest.end(rawBody);
    } else if (req.readableEnded) {
      upstreamRequest.end();
    } else {
      req.pipe(upstreamRequest);
    }
  };
}

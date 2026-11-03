import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { nextUiProxy } from "./next-ui-proxy.js";

type CapturedRequest = {
  url: string | undefined;
  method: string | undefined;
  cookie: string | undefined;
  forwardedHost: string | undefined;
  forwardedProto: string | undefined;
  body: Buffer;
};

const servers: Array<ReturnType<typeof createServer>> = [];

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close((error) => error ? reject(error) : resolve());
  })));
});

function captureRequest(req: IncomingMessage, res: ServerResponse) {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    const captured: CapturedRequest = {
      url: req.url,
      method: req.method,
      cookie: req.headers.cookie,
      forwardedHost: req.headers["x-forwarded-host"] as string | undefined,
      forwardedProto: req.headers["x-forwarded-proto"] as string | undefined,
      body: Buffer.concat(chunks),
    };
    res.statusCode = 201;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Set-Cookie", ["ui-session=private; Path=/; HttpOnly", "csrf=token; Path=/"]);
    res.end(JSON.stringify({
      ...captured,
      body: captured.body.toString("utf8"),
    }));
  });
}

describe("nextUiProxy", () => {
  it("preserves URL, cookies, forwarded origin, and the exact parsed JSON body", async () => {
    const upstream = createServer(captureRequest);
    const origin = await listen(upstream);
    const app = express();
    app.use(express.json({
      verify(req, _res, body) {
        (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(body);
      },
    }));
    app.use(nextUiProxy(origin));
    const proxy = createServer(app);
    const proxyOrigin = await listen(proxy);

    const response = await fetch(`${proxyOrigin}/_next/action?return=%2FCO%2Fdashboard`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "board-session=secret; csrf=token",
      },
      body: "{\"intent\":\"save\",\"sequence\":1}",
    });

    expect(response.status).toBe(201);
    expect(response.headers.getSetCookie()).toEqual([
      "ui-session=private; Path=/; HttpOnly",
      "csrf=token; Path=/",
    ]);
    await expect(response.json()).resolves.toMatchObject({
      url: "/_next/action?return=%2FCO%2Fdashboard",
      method: "POST",
      cookie: "board-session=secret; csrf=token",
      forwardedHost: `127.0.0.1:${new URL(proxyOrigin).port}`,
      forwardedProto: "http",
      body: "{\"intent\":\"save\",\"sequence\":1}",
    });
  });

  it("streams an upstream response without waiting for it to finish", async () => {
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      res.write("event: ready\ndata: first\n\n");
      setTimeout(() => res.end("event: done\ndata: second\n\n"), 100);
    });
    const origin = await listen(upstream);
    const app = express();
    app.use(nextUiProxy(origin));
    const proxy = createServer(app);
    const proxyOrigin = await listen(proxy);

    const response = await fetch(`${proxyOrigin}/events`);
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader!.read();
    expect(new TextDecoder().decode(first.value)).toContain("event: ready");
    const second = await reader!.read();
    expect(new TextDecoder().decode(second.value)).toContain("event: done");
    expect(second.done).toBe(false);
    expect((await reader!.read()).done).toBe(true);
  });

  it("rejects non-loopback origins", () => {
    expect(() => nextUiProxy("http://example.com:3000")).toThrow(/loopback HTTP origin/);
    expect(() => nextUiProxy("https://127.0.0.1:3000")).toThrow(/loopback HTTP origin/);
  });
});

import http from "node:http";
import type { AddressInfo } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { activityLog, agents, heartbeatRuns, managedGatewayTokens } from "@paperclipai/db";
import { managedGatewayService, readManagedGatewayConfig } from "../services/managed-gateway.js";
import { prepareManagedAiRuntime } from "../services/ai-connection-runtime.js";
import { issueRunGatewayToken, resolveRunGatewayToken, revokeRunGatewayTokens } from "../services/managed-gateway-tokens.js";
import { managedGatewayProxyRoutes, managedGatewayUpstreamUrl } from "../routes/managed-gateway-proxy.js";
import { describeEmbeddedPostgres, seedCompanyWithBoardAccess, useEmbeddedPostgres } from "./helpers/route-test-harness.js";

const MASTER_KEY = "sk-9router-master-key-never-in-sandbox";
const PUBLIC_URL = "https://socialagent.example.test";

type UpstreamRequest = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };

describeEmbeddedPostgres("managed 9Router gateway proxy", () => {
  const ctx = useEmbeddedPostgres("managed-gateway-proxy");
  const upstreamRequests: UpstreamRequest[] = [];
  let releaseStream: (() => void) | null = null;
  let upstream: http.Server;
  let upstreamBase = "";
  let proxy: http.Server;
  let proxyBase = "";

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        upstreamRequests.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
        if (req.url?.startsWith("/v1/responses")) {
          // An SSE stream that only finishes once the test releases it.
          res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
          res.write("data: first\n\n");
          releaseStream = () => { res.write("data: second\n\n"); res.end(); };
          return;
        }
        res.writeHead(200, { "content-type": "application/json", "x-upstream": "9router" });
        res.end(JSON.stringify({ ok: true, path: req.url }));
      });
    });
    await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
    upstreamBase = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1`;

    const app = express();
    app.use("/api/managed-gateway/v1", managedGatewayProxyRoutes(ctx.db));
    proxy = http.createServer(app);
    await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
    proxyBase = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/api/managed-gateway/v1`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => proxy?.close(() => resolve()));
    await new Promise<void>(resolve => upstream?.close(() => resolve()));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    upstreamRequests.length = 0;
  });

  function enable() {
    vi.stubEnv("SOCIALAGENT_9ROUTER_API_KEY", MASTER_KEY);
    vi.stubEnv("SOCIALAGENT_9ROUTER_BASE_URL", upstreamBase);
  }

  async function seedRun(status = "running") {
    const seeded = await seedCompanyWithBoardAccess(ctx.db, "Gateway proxy");
    const agentId = randomUUID();
    await ctx.db.insert(agents).values({ id: agentId, companyId: seeded.companyId, name: "Nova", adapterType: "codex_local" });
    const runId = randomUUID();
    await ctx.db.insert(heartbeatRuns).values({ id: runId, companyId: seeded.companyId, agentId, status });
    return { ...seeded, agentId, runId };
  }

  async function activeToken() {
    const seeded = await seedRun();
    const token = await issueRunGatewayToken(ctx.db, { companyId: seeded.companyId, runId: seeded.runId, expiresAt: new Date(Date.now() + 60_000) });
    return { ...seeded, token };
  }

  it("forwards an OpenAI-style request with the master key and streams the response back", async () => {
    enable();
    const { token, companyId, runId } = await activeToken();
    const [stored] = await ctx.db.select().from(managedGatewayTokens).where(eq(managedGatewayTokens.runId, runId));
    expect(stored!.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(stored)).not.toContain(token);
    const issued = await ctx.db.select().from(activityLog).where(and(eq(activityLog.companyId, companyId), eq(activityLog.action, "managed_gateway.token_issued")));
    expect(issued).toHaveLength(1);
    expect(JSON.stringify(issued[0])).not.toContain(token);

    const response = await fetch(`${proxyBase}/responses?stream=true`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "openai-beta": "responses=v1" },
      body: JSON.stringify({ model: "gpt-5.5", input: "hi" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    const first = await reader.read();
    // The first event reaches the client while the upstream stream is still open.
    expect(new TextDecoder().decode(first.value)).toBe("data: first\n\n");
    expect(upstreamRequests).toHaveLength(1);
    const forwarded = upstreamRequests[0]!;
    expect(forwarded).toMatchObject({ method: "POST", url: "/v1/responses?stream=true", body: JSON.stringify({ model: "gpt-5.5", input: "hi" }) });
    expect(forwarded.headers.authorization).toBe(`Bearer ${MASTER_KEY}`);
    expect(forwarded.headers["openai-beta"]).toBe("responses=v1");
    expect(JSON.stringify(forwarded.headers)).not.toContain(token);
    releaseStream!();
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) rest += new TextDecoder().decode(chunk.value);
    expect(rest).toBe("data: second\n\n");
  });

  it("forwards an Anthropic-style request, replacing only authorization", async () => {
    enable();
    const { token } = await activeToken();
    const response = await fetch(`${proxyBase}/v1/messages?beta=true`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "x-api-key": token, "anthropic-version": "2023-06-01", "anthropic-beta": "tools-1", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5-5", messages: [] }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-upstream")).toBe("9router");
    expect(await response.json()).toEqual({ ok: true, path: "/v1/v1/messages?beta=true" });
    const forwarded = upstreamRequests[0]!;
    expect(forwarded.headers.authorization).toBe(`Bearer ${MASTER_KEY}`);
    expect(forwarded.headers["x-api-key"]).toBeUndefined();
    expect(forwarded.headers["anthropic-version"]).toBe("2023-06-01");
    expect(forwarded.headers["anthropic-beta"]).toBe("tools-1");
    expect(JSON.stringify(forwarded.headers)).not.toContain(token);
  });

  it("rejects a token once its run is terminal without calling upstream", async () => {
    enable();
    const { token, runId } = await activeToken();
    await ctx.db.update(heartbeatRuns).set({ status: "succeeded" }).where(eq(heartbeatRuns.id, runId));
    const response = await fetch(`${proxyBase}/models`, { headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Invalid or expired gateway token" });
    expect(upstreamRequests).toHaveLength(0);
  });

  it("rejects a revoked token", async () => {
    enable();
    const { token, runId, companyId } = await activeToken();
    await revokeRunGatewayTokens(ctx.db, runId);
    const response = await fetch(`${proxyBase}/models`, { headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(401);
    expect(upstreamRequests).toHaveLength(0);
    const revoked = await ctx.db.select().from(activityLog).where(and(eq(activityLog.companyId, companyId), eq(activityLog.action, "managed_gateway.tokens_revoked")));
    expect(revoked).toHaveLength(1);
  });

  it("rejects unknown, missing and expired tokens", async () => {
    enable();
    const seeded = await seedRun();
    const expired = await issueRunGatewayToken(ctx.db, { companyId: seeded.companyId, runId: seeded.runId, expiresAt: new Date(Date.now() - 1_000) });
    for (const headers of [{ authorization: "Bearer not-a-real-token" }, {}, { authorization: `Bearer ${expired}` }] as Record<string, string>[]) {
      const response = await fetch(`${proxyBase}/models`, { headers });
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Invalid or expired gateway token" });
    }
    expect(upstreamRequests).toHaveLength(0);
  });

  /** Sends a raw request path; fetch would normalize `..` before sending. */
  function rawGet(pathAndQuery: string, token: string) {
    const url = new URL(proxyBase);
    return new Promise<{ status: number }>((resolve, reject) => {
      const request = http.request({ host: url.hostname, port: url.port, method: "GET", path: `${url.pathname}${pathAndQuery}`,
        headers: { authorization: `Bearer ${token}` } }, response => { response.resume(); resolve({ status: response.statusCode ?? 0 }); });
      request.on("error", reject);
      request.end();
    });
  }

  it.each([
    "/../dashboard/api/keys",
    "/%2e%2e/dashboard/api/keys",
    "/%2E%2E/%2e%2e/dashboard",
    "/..\\..\\dashboard/api/keys",
    "/%5c..%5c..%5cdashboard/api/keys",
    "/models%5C..%5C..%5Cdashboard",
  ])("never forwards a path that escapes the gateway base: %s", async escape => {
    enable();
    const { token } = await activeToken();
    expect((await rawGet(escape, token)).status).toBe(400);
    expect(upstreamRequests).toHaveLength(0);
  });

  it.each([
    ["GET", "/models"],
    ["GET", "/models/gpt-5.5"],
    ["POST", "/chat/completions"],
    ["POST", "/completions"],
    ["POST", "/embeddings"],
    ["POST", "/messages/count_tokens"],
    ["GET", "/responses/resp_123"],
    ["POST", "/v1/messages"],
  ])("forwards allowlisted inference path %s %s", async (method, pathAndQuery) => {
    enable();
    const { token } = await activeToken();
    const response = await fetch(`${proxyBase}${pathAndQuery}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: method === "POST" ? "{}" : undefined,
    });
    expect(response.status).toBe(200);
    expect(upstreamRequests).toHaveLength(1);
  });

  it.each([
    ["GET", "/dashboard/api/keys"],
    ["GET", "/keys"],
    ["POST", "/admin/users"],
    ["GET", "/"],
    ["GET", "/modelsx"],
    ["PUT", "/models"],
    ["DELETE", "/responses/resp_123"],
    ["PATCH", "/chat/completions"],
  ])("returns 404 for non-inference method/path %s %s without calling upstream", async (method, pathAndQuery) => {
    enable();
    const { token } = await activeToken();
    const response = await fetch(`${proxyBase}${pathAndQuery}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: method === "GET" ? undefined : "{}",
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(upstreamRequests).toHaveLength(0);
  });

  it("resolves upstream URLs only inside the gateway origin and base path", () => {
    const base = "https://9router.example/v1";
    expect(managedGatewayUpstreamUrl(base, "/responses?x=1")?.href).toBe("https://9router.example/v1/responses?x=1");
    expect(managedGatewayUpstreamUrl(base, "/v1/messages")?.href).toBe("https://9router.example/v1/v1/messages");
    for (const escape of ["/../dashboard", "/%2e%2e/dashboard", "/..\\dashboard", "/%5cdashboard", "/%5C..%5Cdashboard"]) {
      expect(managedGatewayUpstreamUrl(base, escape)).toBeNull();
    }
    expect(managedGatewayUpstreamUrl(base, "")?.href).toBe("https://9router.example/v1/");
  });

  it("rejects a run token whose heartbeat row is missing", async () => {
    enable();
    const { companyId } = await seedRun();
    const token = await issueRunGatewayToken(ctx.db, { companyId, runId: randomUUID(), expiresAt: new Date(Date.now() + 60_000) });
    expect(await resolveRunGatewayToken(ctx.db, token)).toBeNull();
    const response = await fetch(`${proxyBase}/models`, { headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(401);
    expect(upstreamRequests).toHaveLength(0);
  });

  it("rejects a run token whose heartbeat run was deleted", async () => {
    enable();
    const { token, runId } = await activeToken();
    await ctx.db.delete(heartbeatRuns).where(eq(heartbeatRuns.id, runId));
    expect((await fetch(`${proxyBase}/models`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
    expect(upstreamRequests).toHaveLength(0);
  });

  it("rejects a token whose run belongs to another company", async () => {
    enable();
    const other = await seedRun();
    const mine = await seedCompanyWithBoardAccess(ctx.db, "Token company");
    const token = await issueRunGatewayToken(ctx.db, { companyId: mine.companyId, runId: other.runId, expiresAt: new Date(Date.now() + 60_000) });
    expect((await fetch(`${proxyBase}/models`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
    expect(upstreamRequests).toHaveLength(0);
  });

  it("issues a probe token capped at 15 minutes and revokes it", async () => {
    enable();
    const { companyId } = await seedRun();
    const probeId = randomUUID();
    const token = await issueRunGatewayToken(ctx.db, { companyId, runId: probeId, kind: "probe", expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    const [stored] = await ctx.db.select().from(managedGatewayTokens).where(eq(managedGatewayTokens.runId, probeId));
    expect(stored!.kind).toBe("probe");
    expect(stored!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
    expect(await resolveRunGatewayToken(ctx.db, token)).toEqual({ companyId, runId: probeId });
    expect((await fetch(`${proxyBase}/models`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    await revokeRunGatewayTokens(ctx.db, probeId);
    expect((await fetch(`${proxyBase}/models`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
    expect(upstreamRequests).toHaveLength(1);
  });

  it("rejects a probe token whose stored lifetime exceeds 15 minutes", async () => {
    enable();
    const { companyId } = await seedRun();
    const probeId = randomUUID();
    const token = await issueRunGatewayToken(ctx.db, { companyId, runId: probeId, kind: "probe", expiresAt: new Date(Date.now() + 60_000) });
    await ctx.db.update(managedGatewayTokens).set({ expiresAt: new Date(Date.now() + 60 * 60 * 1000) }).where(eq(managedGatewayTokens.runId, probeId));
    expect(await resolveRunGatewayToken(ctx.db, token)).toBeNull();
  });

  it("refuses request bodies over 20 MB", async () => {
    enable();
    const { token } = await activeToken();
    const response = await fetch(`${proxyBase}/responses`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "x".repeat(20 * 1024 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    expect(upstreamRequests).toHaveLength(0);
  });

  async function filesUnder(directory: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) Object.assign(result, await filesUnder(full));
      else result[full] = await readFile(full, "utf8");
    }
    return result;
  }

  async function managedRuntime(adapterType: "codex_local" | "claude_local") {
    const { companyId, userId, agentId, runId } = await seedRun();
    await ctx.db.update(agents).set({ adapterType }).where(eq(agents.id, agentId));
    const { binding } = await managedGatewayService(ctx.db, () => readManagedGatewayConfig()).ensure(companyId, userId, adapterType);
    const runtime = await prepareManagedAiRuntime(ctx.db, {
      companyId, agentId, responsibleUserId: userId, adapterType, binding, config: {},
      gatewayRun: { runId, timeoutSec: 600 },
    });
    return { runtime, companyId, runId };
  }

  it.each(["codex_local", "claude_local"] as const)("never writes the master key into the sandbox auth file (%s)", async adapterType => {
    enable();
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    vi.stubEnv("SOCIALAGENT_PUBLIC_URL", `${PUBLIC_URL}/`);
    const { runtime, runId } = await managedRuntime(adapterType);
    try {
      const env = runtime.config.env as Record<string, string>;
      const files = await filesUnder(runtime.home!);
      expect(JSON.stringify(env)).not.toContain(MASTER_KEY);
      expect(JSON.stringify(runtime.config)).not.toContain(MASTER_KEY);
      for (const content of Object.values(files)) expect(content).not.toContain(MASTER_KEY);
      const [stored] = await ctx.db.select().from(managedGatewayTokens).where(eq(managedGatewayTokens.runId, runId));
      expect(stored!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 600_000);
      expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 500_000);
      const proxyUrl = `${PUBLIC_URL}/api/managed-gateway/v1`;
      const token = adapterType === "codex_local" ? env.PAPERCLIP_AI_PROVIDER_KEY! : env.ANTHROPIC_AUTH_TOKEN!;
      expect(createHash("sha256").update(token).digest("hex")).toBe(stored!.tokenHash);
      if (adapterType === "codex_local") {
        expect(files[path.join(runtime.home!, "provider", "config.toml")]).toContain(`base_url = ${JSON.stringify(proxyUrl)}`);
      } else {
        expect(env.ANTHROPIC_BASE_URL).toBe(proxyUrl);
      }
    } finally { await runtime.cleanup(); }
  });

  it("keeps the connection's own key outside SaaS mode", async () => {
    enable();
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "false");
    vi.stubEnv("SOCIALAGENT_PUBLIC_URL", PUBLIC_URL);
    const { runtime, runId } = await managedRuntime("codex_local");
    try {
      const env = runtime.config.env as Record<string, string>;
      expect(env.PAPERCLIP_AI_PROVIDER_KEY).toBe(MASTER_KEY);
      const files = await filesUnder(runtime.home!);
      expect(files[path.join(runtime.home!, "provider", "config.toml")]).toContain(`base_url = ${JSON.stringify(upstreamBase)}`);
      expect(await ctx.db.select().from(managedGatewayTokens).where(eq(managedGatewayTokens.runId, runId))).toHaveLength(0);
    } finally { await runtime.cleanup(); }
  });

  it("fails a SaaS managed run clearly when SOCIALAGENT_PUBLIC_URL is missing", async () => {
    enable();
    vi.stubEnv("SOCIALAGENT_SAAS_MODE", "true");
    vi.stubEnv("SOCIALAGENT_PUBLIC_URL", "");
    await expect(managedRuntime("claude_local")).rejects.toThrow("SOCIALAGENT_PUBLIC_URL");
  });
});

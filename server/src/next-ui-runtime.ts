import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
} from "node:http";
import type { Duplex } from "node:stream";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NEXT_READY_PATTERN = /(?:^|\n)\s*[✓✔]?\s*ready in\b|started server on/i;
const STARTUP_TIMEOUT_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

type NextUiRuntimeOptions = {
  expressApiOrigin: string;
  startupTimeoutMs?: number;
};

export type NextUiRuntime = {
  origin: string;
  attachUpgradeProxy(server: Server): void;
  close(): Promise<void>;
};

export function expressInternalApiOrigin(bindHost: string, port: number): string {
  const normalizedHost = bindHost.trim();
  const host = normalizedHost === "0.0.0.0" || normalizedHost === "::"
    ? "127.0.0.1"
    : normalizedHost.includes(":") && !normalizedHost.startsWith("[")
      ? `[${normalizedHost}]`
      : normalizedHost;
  return new URL(`http://${host}:${port}`).origin;
}

function uiRootFromModule() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../ui");
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const reservation = createNetServer();
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close();
        reject(new Error("Could not reserve a loopback port for Next.js"));
        return;
      }
      reservation.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function childExited(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForChildExit(child: ChildProcess): Promise<void> {
  if (childExited(child)) return Promise.resolve();
  return new Promise((resolveExit) => {
    child.once("exit", () => resolveExit());
    child.once("error", () => resolveExit());
  });
}

async function stopChild(child: ChildProcess, exited: Promise<void>) {
  if (childExited(child)) return;
  child.kill("SIGTERM");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<boolean>((resolveTimeout) => {
      timeout = setTimeout(() => resolveTimeout(false), SHUTDOWN_TIMEOUT_MS);
      timeout.unref();
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  if (!graceful && !childExited(child)) {
    child.kill("SIGKILL");
    await exited;
  }
}

function logChildOutput(stream: "stdout" | "stderr", child: ChildProcess, onReady: () => void) {
  let pending = "";
  child[stream]?.on("data", (chunk: Buffer | string) => {
    const text = chunk.toString();
    process[stream].write(`[next-ui] ${text}`);
    pending = `${pending}${text}`.slice(-8_192);
    if (NEXT_READY_PATTERN.test(pending)) onReady();
  });
}

function proxyNextUpgrade(origin: URL, request: IncomingMessage, socket: Duplex, head: Buffer) {
  const target = new URL(request.url ?? "/", origin);
  const headers: IncomingHttpHeaders = { ...request.headers, host: target.host };
  if (request.headers.host) headers["x-forwarded-host"] = request.headers.host;
  if (!headers["x-forwarded-proto"]) headers["x-forwarded-proto"] = "http";

  const upstream = httpRequest({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: request.method,
    path: `${target.pathname}${target.search}`,
    headers,
  });
  const fail = () => {
    if (socket.destroyed) return;
    socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  };
  upstream.once("error", fail);
  socket.once("error", () => upstream.destroy());
  socket.once("close", () => upstream.destroy());
  upstream.once("upgrade", (response, upstreamSocket, upstreamHead) => {
    if (socket.destroyed) {
      upstreamSocket.destroy();
      return;
    }
    let responseHead = `HTTP/1.1 ${response.statusCode ?? 502} ${response.statusMessage ?? "Bad Gateway"}\r\n`;
    for (const [name, value] of Object.entries(response.headers)) {
      if (value === undefined) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) responseHead += `${name}: ${item}\r\n`;
    }
    socket.write(`${responseHead}\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.once("error", () => socket.destroy());
    upstreamSocket.once("close", () => socket.destroy());
    socket.pipe(upstreamSocket).pipe(socket);
  });
  upstream.once("response", (response) => {
    let responseHead = `HTTP/1.1 ${response.statusCode ?? 502} ${response.statusMessage ?? "Bad Gateway"}\r\n`;
    for (const [name, value] of Object.entries(response.headers)) {
      if (value === undefined) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) responseHead += `${name}: ${item}\r\n`;
    }
    socket.write(`${responseHead}\r\n`);
    response.pipe(socket);
  });
  upstream.end();
}

export async function startNextUiRuntime(options: NextUiRuntimeOptions): Promise<NextUiRuntime> {
  const apiOrigin = new URL(options.expressApiOrigin);
  if (apiOrigin.protocol !== "http:" || apiOrigin.username || apiOrigin.password) {
    throw new Error("Next.js internal API origin must use trusted HTTP configuration");
  }

  const uiRoot = uiRootFromModule();
  const port = await reserveLoopbackPort();
  const origin = new URL(`http://127.0.0.1:${port}`);
  const standaloneServer = resolve(uiRoot, ".next/standalone/ui/server.js");
  const isProduction = process.env.NODE_ENV === "production";
  const command = process.env.PAPERCLIP_NODE_BINARY?.trim() || "node";
  const args = isProduction
    ? [standaloneServer]
    : [
        resolve(uiRoot, "node_modules/next/dist/bin/next"),
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ];
  const childEnv: NodeJS.ProcessEnv = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
    NODE_ENV: isProduction ? "production" : "development",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    PAPERCLIP_INTERNAL_API_ORIGIN: apiOrigin.origin,
    NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1",
    ...(process.env.PAPERCLIP_BUILD_COMMIT
      ? { PAPERCLIP_BUILD_COMMIT: process.env.PAPERCLIP_BUILD_COMMIT }
      : {}),
  };
  const child = spawn(command, args, {
    cwd: isProduction ? resolve(uiRoot, ".next/standalone/ui") : uiRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const exited = waitForChildExit(child);
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolveReadyPromise, rejectReadyPromise) => {
    resolveReady = resolveReadyPromise;
    rejectReady = rejectReadyPromise;
  });
  let readySeen = false;
  const signalReady = () => {
    if (readySeen) return;
    readySeen = true;
    resolveReady();
  };
  logChildOutput("stdout", child, signalReady);
  logChildOutput("stderr", child, signalReady);
  child.once("error", (error) => rejectReady(error));
  child.once("exit", (code, signal) => {
    if (!readySeen) rejectReady(new Error(`Next.js UI process exited before readiness (code=${code}, signal=${signal})`));
  });

  const startupTimeout = options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ready,
      new Promise<never>((_resolve, reject) => {
        startupTimer = setTimeout(() => reject(new Error(`Next.js UI process did not become ready within ${startupTimeout}ms`)), startupTimeout);
      }),
    ]);
    if (startupTimer) clearTimeout(startupTimer);

    const probeDeadline = Date.now() + startupTimeout;
    let listenerReady = false;
    while (!listenerReady && Date.now() < probeDeadline) {
      if (childExited(child)) throw new Error("Next.js UI process exited after reporting readiness");
      try {
        await fetch(new URL("/__paperclip_next_readiness_probe__", origin), {
          signal: AbortSignal.timeout(1_000),
          cache: "no-store",
        });
        listenerReady = true;
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
    if (!listenerReady) throw new Error("Next.js UI listener did not accept requests after readiness");
  } catch (error) {
    if (startupTimer) clearTimeout(startupTimer);
    await stopChild(child, exited);
    throw error;
  }

  let closePromise: Promise<void> | null = null;
  return {
    origin: origin.origin,
    attachUpgradeProxy(server) {
      server.on("upgrade", (request, socket, head) => {
        let pathname: string;
        try {
          pathname = new URL(request.url ?? "/", origin).pathname;
        } catch {
          return;
        }
        if (pathname !== "/_next/webpack-hmr") return;
        proxyNextUpgrade(origin, request, socket, head);
      });
    },
    close() {
      closePromise ??= stopChild(child, exited);
      return closePromise;
    },
  };
}

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveServerDevWatchIgnorePaths } from "../src/dev-watch-ignore.ts";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Bun is the default runtime: `bun --watch` follows the server's import graph,
// so data directories never trigger restarts. Under Node, tsx watch needs the
// explicit exclude list.
const isBun = typeof (process.versions as Record<string, string | undefined>).bun === "string";
const watchArgs = isBun
  ? ["--watch", "src/index.ts"]
  : [
      createRequire(import.meta.url).resolve("tsx/cli"),
      "watch",
      ...resolveServerDevWatchIgnorePaths(serverRoot).flatMap((ignorePath) => ["--exclude", ignorePath]),
      "src/index.ts",
    ];

const child = spawn(
  process.execPath,
  watchArgs,
  {
    cwd: serverRoot,
    env: process.env,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const envFile = process.argv[2];
process.loadEnvFile(envFile);
process.env.STORAGE_DIR ||= resolve(dirname(envFile), "storage");
process.env.NODE_ENV = "production";
for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const next = resolve("node_modules/next/dist/bin/next");
process.argv = [process.execPath, next, "start", "--hostname", "127.0.0.1", "--port", "3101"];
await import(pathToFileURL(next).href);

import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  utimes,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function removePath(targetPath) {
  await rm(targetPath, { recursive: true, force: true });
}

async function syncFile(sourcePath, destinationPath, sourceStat, counts) {
  const destinationStat = await lstat(destinationPath).catch(() => null);
  if (destinationStat?.isDirectory() || destinationStat?.isSymbolicLink()) {
    await removePath(destinationPath);
  }
  const currentStat = destinationStat?.isFile() ? destinationStat : null;
  const sourceMode = sourceStat.mode & 0o7777;
  const destinationMode = currentStat ? currentStat.mode & 0o7777 : null;
  if (currentStat && currentStat.size === sourceStat.size) {
    if (currentStat.mtimeMs === sourceStat.mtimeMs && destinationMode === sourceMode) {
      counts.unchanged += 1;
      return;
    }
    if (await hashFile(sourcePath) === await hashFile(destinationPath)) {
      if (destinationMode !== sourceMode) await chmod(destinationPath, sourceMode);
      await utimes(destinationPath, sourceStat.atime, sourceStat.mtime);
      counts.metadata += 1;
      return;
    }
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  if (currentStat) {
    await chmod(destinationPath, 0o600).catch(() => {});
    await rm(destinationPath, { force: true });
  }
  await copyFile(sourcePath, destinationPath);
  await chmod(destinationPath, sourceMode).catch(() => {});
  await utimes(destinationPath, sourceStat.atime, sourceStat.mtime).catch(() => {});
  counts.copied += 1;
}

async function syncNode(sourcePath, destinationPath, counts) {
  const sourceStat = await lstat(sourcePath);
  const destinationStat = await lstat(destinationPath).catch(() => null);

  if (sourceStat.isSymbolicLink()) {
    const sourceTarget = await readlink(sourcePath);
    if (destinationStat?.isSymbolicLink() && await readlink(destinationPath) === sourceTarget) {
      counts.unchanged += 1;
      return;
    }
    if (destinationStat) await removePath(destinationPath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    const targetIsDirectory = await stat(sourcePath).then((info) => info.isDirectory()).catch(() => false);
    await symlink(sourceTarget, destinationPath, process.platform === "win32"
      ? targetIsDirectory ? "junction" : "file"
      : undefined);
    counts.copied += 1;
    return;
  }

  if (sourceStat.isFile()) {
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await syncFile(sourcePath, destinationPath, sourceStat, counts);
    return;
  }

  if (!sourceStat.isDirectory()) throw new Error(`Unsupported build asset: ${sourcePath}`);
  if (destinationStat && !destinationStat.isDirectory()) await removePath(destinationPath);
  await mkdir(destinationPath, { recursive: true });
  const sourceEntries = await readdir(sourcePath);
  const sourceNames = new Set(sourceEntries);
  const destinationEntries = await readdir(destinationPath).catch(() => []);
  for (const name of destinationEntries) {
    if (sourceNames.has(name)) continue;
    await removePath(path.join(destinationPath, name));
    counts.removed += 1;
  }
  for (const name of sourceEntries) {
    await syncNode(path.join(sourcePath, name), path.join(destinationPath, name), counts);
  }
  await chmod(destinationPath, sourceStat.mode & 0o7777).catch(() => {});
  await utimes(destinationPath, sourceStat.atime, sourceStat.mtime).catch(() => {});
}

export async function syncBuildAssets(source, destination) {
  const sourcePath = path.resolve(source);
  const destinationPath = path.resolve(destination);
  if (sourcePath === destinationPath || destinationPath.startsWith(`${sourcePath}${path.sep}`)) {
    throw new Error("Build asset destination must not be the source or one of its descendants.");
  }
  const counts = { copied: 0, unchanged: 0, metadata: 0, removed: 0 };
  await syncNode(sourcePath, destinationPath, counts);
  console.log(`[build-assets] ${path.relative(process.cwd(), sourcePath)} -> ${path.relative(process.cwd(), destinationPath)}: ${counts.copied} copied, ${counts.metadata} metadata-only, ${counts.unchanged} unchanged, ${counts.removed} removed`);
  return counts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , source, destination] = process.argv;
  if (!source || !destination) {
    console.error("Usage: node scripts/sync-build-assets.mjs <source> <destination>");
    process.exitCode = 2;
  } else {
    await syncBuildAssets(source, destination);
  }
}

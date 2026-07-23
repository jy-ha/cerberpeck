import {createHash, randomUUID} from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {WorkspaceError} from "./errors.js";
import {
  type SnapshotEntry,
  type SnapshotManifest,
  SnapshotManifestSchema,
} from "./schemas.js";

const DEFAULT_EXCLUDES = new Set([".git", ".cerberpeck", "node_modules"]);
const TOOL_SKILL_PREFIXES = [".agents/skills/cerberpeck", ".claude/skills/cerberpeck"];

export async function captureSnapshot(
  sourceRoot: string,
  destination: string,
  options: {paths?: string[]; excludeWorkspaceState?: boolean; now?: string} = {},
): Promise<SnapshotManifest> {
  const root = path.resolve(sourceRoot);
  await rm(destination, {recursive: true, force: true});
  await mkdir(path.join(destination, "files"), {recursive: true});
  const relativePaths = options.paths
    ? [...new Set(options.paths.map(assertSafeRelativePath))].sort()
    : await walkFiles(root);
  const entries: SnapshotEntry[] = [];
  for (const relativePath of relativePaths) {
    const entry = await captureEntry(root, relativePath, destination);
    entries.push(entry);
  }
  const manifest = SnapshotManifestSchema.parse({
    schemaVersion: 1,
    createdAt: options.now ?? new Date().toISOString(),
    entries,
  });
  await atomicJson(path.join(destination, "manifest.json"), manifest);
  return manifest;
}

export async function readSnapshot(snapshotRoot: string): Promise<SnapshotManifest> {
  try {
    return SnapshotManifestSchema.parse(
      JSON.parse(await readFile(path.join(snapshotRoot, "manifest.json"), "utf8")) as unknown,
    );
  } catch (error) {
    throw new WorkspaceError("TRANSACTION_INVALID", `Invalid snapshot: ${snapshotRoot}`, {cause: error});
  }
}

export async function restoreSnapshot(
  targetRoot: string,
  snapshotRoot: string,
  providedManifest?: SnapshotManifest,
): Promise<void> {
  const manifest = providedManifest ?? await readSnapshot(snapshotRoot);
  const entries = [...manifest.entries].sort((left, right) => {
    if (left.kind === "absent" && right.kind !== "absent") return -1;
    if (right.kind === "absent" && left.kind !== "absent") return 1;
    return right.path.length - left.path.length;
  });
  for (const entry of entries) {
    await restoreEntry(path.resolve(targetRoot), snapshotRoot, entry);
  }
}

export async function resetAndRestoreDirectory(
  targetRoot: string,
  snapshotRoot: string,
  preserveNames: string[] = [],
): Promise<void> {
  await mkdir(targetRoot, {recursive: true});
  const preserved = new Set(preserveNames);
  for (const entry of await readdir(targetRoot)) {
    if (!preserved.has(entry)) {
      await rm(path.join(targetRoot, entry), {recursive: true, force: true});
    }
  }
  await restoreSnapshot(targetRoot, snapshotRoot);
}

export function snapshotMap(manifest: SnapshotManifest): Map<string, SnapshotEntry> {
  return new Map(manifest.entries.map((entry) => [entry.path, entry]));
}

export function entriesEqual(left: SnapshotEntry | undefined, right: SnapshotEntry | undefined): boolean {
  const a = left ?? {path: right?.path ?? "", kind: "absent" as const};
  const b = right ?? {path: left?.path ?? "", kind: "absent" as const};
  if (a.kind !== b.kind) return false;
  if (a.kind === "absent" || b.kind === "absent") return true;
  if (a.mode !== b.mode) return false;
  if (a.kind === "symlink" && b.kind === "symlink") return a.target === b.target;
  return a.kind === "file" && b.kind === "file" && a.sha256 === b.sha256;
}

export async function entryBytes(snapshotRoot: string, entry: SnapshotEntry): Promise<Buffer | undefined> {
  if (entry.kind !== "file") return undefined;
  return readFile(snapshotFile(snapshotRoot, entry.path));
}

export async function writeSnapshotFromEntries(
  destination: string,
  entries: Array<{entry: SnapshotEntry; bytes?: Buffer}>,
  now = new Date().toISOString(),
): Promise<SnapshotManifest> {
  await rm(destination, {recursive: true, force: true});
  await mkdir(path.join(destination, "files"), {recursive: true});
  const output: SnapshotEntry[] = [];
  for (const item of entries) {
    const relativePath = assertSafeRelativePath(item.entry.path);
    if (item.entry.kind === "file") {
      if (!item.bytes) throw new WorkspaceError("TRANSACTION_INVALID", `Missing bytes: ${relativePath}`);
      const bytes = item.bytes;
      const normalized: SnapshotEntry = {
        path: relativePath,
        kind: "file",
        mode: item.entry.mode,
        sha256: sha256(bytes),
        size: bytes.length,
      };
      const target = snapshotFile(destination, relativePath);
      await mkdir(path.dirname(target), {recursive: true});
      await writeFile(target, bytes, {mode: normalized.mode});
      output.push(normalized);
    } else {
      output.push({...item.entry, path: relativePath});
    }
  }
  const manifest = SnapshotManifestSchema.parse({schemaVersion: 1, createdAt: now, entries: output});
  await atomicJson(path.join(destination, "manifest.json"), manifest);
  return manifest;
}

export function assertSafeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new WorkspaceError("WORKSPACE_INVALID", `Unsafe workspace path: ${value}`);
  }
  return normalized;
}

async function walkFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(relativeDirectory: string): Promise<void> {
    const absolute = relativeDirectory ? path.join(root, relativeDirectory) : root;
    for (const item of await readdir(absolute, {withFileTypes: true})) {
      if (!relativeDirectory && DEFAULT_EXCLUDES.has(item.name)) continue;
      const relative = relativeDirectory ? `${relativeDirectory}/${item.name}` : item.name;
      if (TOOL_SKILL_PREFIXES.some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))) {
        continue;
      }
      if (item.isDirectory()) await visit(relative);
      else if (item.isFile() || item.isSymbolicLink()) found.push(assertSafeRelativePath(relative));
    }
  }
  await visit("");
  return found.sort();
}

async function captureEntry(root: string, relativePath: string, destination: string): Promise<SnapshotEntry> {
  await assertNoSymlinkAncestors(root, relativePath);
  const absolute = safeJoin(root, relativePath);
  try {
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) {
      return {path: relativePath, kind: "symlink", mode: info.mode & 0o777, target: await readlink(absolute)};
    }
    if (!info.isFile()) {
      throw new WorkspaceError("WORKSPACE_INVALID", `Unsupported workspace entry: ${relativePath}`);
    }
    const bytes = await readFile(absolute);
    const target = snapshotFile(destination, relativePath);
    await mkdir(path.dirname(target), {recursive: true});
    await copyFile(absolute, target);
    await chmod(target, info.mode & 0o777);
    return {
      path: relativePath,
      kind: "file",
      mode: info.mode & 0o777,
      sha256: sha256(bytes),
      size: bytes.length,
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return {path: relativePath, kind: "absent"};
    throw error;
  }
}

async function restoreEntry(root: string, snapshotRoot: string, entry: SnapshotEntry): Promise<void> {
  await assertNoSymlinkAncestors(root, entry.path);
  const target = safeJoin(root, entry.path);
  if (entry.kind === "absent") {
    await rm(target, {recursive: true, force: true});
    return;
  }
  await mkdir(path.dirname(target), {recursive: true});
  const temporary = path.join(path.dirname(target), `.cerberpeck-${randomUUID()}.tmp`);
  try {
    if (entry.kind === "file") {
      await copyFile(snapshotFile(snapshotRoot, entry.path), temporary);
      await chmod(temporary, entry.mode);
    } else {
      await symlink(entry.target, temporary);
    }
    await rm(target, {recursive: true, force: true});
    await rename(temporary, target);
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
}

async function assertNoSymlinkAncestors(root: string, relativePath: string): Promise<void> {
  const parts = assertSafeRelativePath(relativePath).split("/").slice(0, -1);
  let current = path.resolve(root);
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new WorkspaceError("WORKSPACE_INVALID", `Symlink ancestor is not supported: ${relativePath}`);
      }
      if (!info.isDirectory()) break;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") break;
      throw error;
    }
  }
}

function safeJoin(root: string, relativePath: string): string {
  const safe = assertSafeRelativePath(relativePath);
  const target = path.resolve(root, safe);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new WorkspaceError("WORKSPACE_INVALID", `Path escapes workspace: ${relativePath}`);
  }
  return target;
}

function snapshotFile(snapshotRoot: string, relativePath: string): string {
  return safeJoin(path.join(snapshotRoot, "files"), relativePath);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), {recursive: true});
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  await rename(temporary, filePath);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

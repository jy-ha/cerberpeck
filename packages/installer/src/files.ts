import {createHash, randomUUID} from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

export async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

export async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function relativeInside(root: string, target: string): string {
  const relative = path.relative(root, target);
  if (relative === "" || relative === "." || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Target escapes or equals installation root: ${target}`);
  }
  return relative.split(path.sep).join("/");
}

export function resolveInside(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  relativeInside(root, target);
  return target;
}

export async function atomicCopy(source: string, target: string, mode?: number): Promise<void> {
  await mkdir(path.dirname(target), {recursive: true});
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await copyFile(source, temporary);
    if (mode !== undefined) {
      await chmod(temporary, mode);
    }
    await rename(temporary, target);
  } finally {
    await rm(temporary, {force: true});
  }
}

export async function atomicWriteJson(target: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(target), {recursive: true});
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } finally {
    await rm(temporary, {force: true});
  }
}

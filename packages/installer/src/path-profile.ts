import {randomUUID} from "node:crypto";
import {lstat, readFile, rename, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {exists} from "./files.js";

const START = "# >>> cerberpeck PATH >>>";
const END = "# <<< cerberpeck PATH <<<";

export interface PathProfileChange {
  profilePath: string;
  previous?: Buffer;
  changed: boolean;
}

export async function ensureGlobalPath(input: {
  home: string;
  binDirectory: string;
  pathValue?: string;
  shell?: string;
}): Promise<PathProfileChange> {
  const currentPath = input.pathValue ?? process.env.PATH ?? "";
  if (currentPath.split(path.delimiter).some((entry) => path.resolve(entry) === path.resolve(input.binDirectory))) {
    return {profilePath: selectProfile(input.home, input.shell), changed: false};
  }
  const profilePath = selectProfile(input.home, input.shell);
  await rejectSymlink(profilePath);
  const previous = (await exists(profilePath)) ? await readFile(profilePath) : undefined;
  const content = previous?.toString("utf8") ?? "";
  if (content.includes(START) && content.includes(END)) {
    return {profilePath, ...(previous ? {previous} : {}), changed: false};
  }
  const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  const block = `${START}\nexport PATH="$HOME/.local/bin:$PATH"\n${END}\n`;
  await atomicProfileWrite(profilePath, Buffer.from(`${content}${separator}${block}`));
  return {profilePath, ...(previous ? {previous} : {}), changed: true};
}

export async function removeGlobalPathBlock(profilePath: string): Promise<boolean> {
  if (!(await exists(profilePath))) return false;
  await rejectSymlink(profilePath);
  const content = await readFile(profilePath, "utf8");
  const expression = new RegExp(`(?:^|\\n)${escapeRegex(START)}\\n[\\s\\S]*?${escapeRegex(END)}\\n?`, "m");
  if (!expression.test(content)) return false;
  await atomicProfileWrite(
    profilePath,
    Buffer.from(content.replace(expression, (match) => match.startsWith("\n") ? "\n" : "")),
  );
  return true;
}

export async function rollbackGlobalPath(change: PathProfileChange): Promise<void> {
  if (!change.changed) return;
  if (change.previous) await atomicProfileWrite(change.profilePath, change.previous);
  else {
    const {rm} = await import("node:fs/promises");
    await rm(change.profilePath, {force: true});
  }
}

async function rejectSymlink(profilePath: string): Promise<void> {
  try {
    if ((await lstat(profilePath)).isSymbolicLink()) {
      throw new Error(`Refusing to modify symlinked shell profile: ${profilePath}`);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

async function atomicProfileWrite(profilePath: string, bytes: Buffer): Promise<void> {
  const mode = (await exists(profilePath)) ? (await lstat(profilePath)).mode & 0o777 : 0o600;
  const temporary = `${profilePath}.cerberpeck-${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, {mode});
    await rename(temporary, profilePath);
  } finally {
    await rm(temporary, {force: true});
  }
}

function selectProfile(home: string, shell = process.env.SHELL ?? ""): string {
  const name = path.basename(shell);
  if (name === "zsh") return path.join(home, ".zshrc");
  if (name === "bash") return path.join(home, ".bashrc");
  return path.join(home, ".profile");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import {execFile} from "node:child_process";
import {rmdir, rm} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import {atomicWriteJson, exists, resolveInside, sha256} from "./files.js";
import {InstallerError} from "./errors.js";
import {readManifest} from "./install.js";
import type {InstallHost, InstallManifest, InstalledFile} from "./schemas.js";
import {resolveInstallTarget} from "./targets.js";
import {removeGlobalPathBlock} from "./path-profile.js";

export interface UninstallRequest {
  scope: "workspace" | "global";
  workspace: string;
  hosts?: InstallHost[];
  home?: string;
  xdgDataHome?: string;
  keepCli?: boolean;
  purge?: boolean;
}

export async function uninstall(request: UninstallRequest): Promise<{
  removed: string[];
  preserved: string[];
  remainingHosts: InstallHost[];
}> {
  const target = resolveInstallTarget(request);
  let manifest: InstallManifest | undefined;
  try {
    manifest = await readManifest(target.manifestPath);
  } catch (error) {
    if (!request.purge) throw error;
  }
  if (!manifest) {
    if (request.purge) return purgeInstallation(request, target);
    return {removed: [], preserved: [], remainingHosts: []};
  }
  if (request.purge) {
    return purgeInstallation(request, target, manifest);
  }
  const selected = new Set(request.hosts ?? manifest.hosts);
  const remainingHosts = manifest.hosts.filter((host) => !selected.has(host));
  const removeCli = remainingHosts.length === 0 && request.keepCli !== true;
  const removed: string[] = [];
  const preserved: string[] = [];
  const remainingFiles: InstalledFile[] = [];

  for (const file of manifest.files) {
    const selectedComponent =
      (file.component === "skill-codex" && selected.has("codex")) ||
      (file.component === "skill-claude" && selected.has("claude")) ||
      (file.component === "cli" && removeCli);
    if (!selectedComponent) {
      remainingFiles.push(file);
      continue;
    }
    const absolute = resolveInside(manifest.root, file.path);
    if (!(await exists(absolute))) {
      continue;
    }
    if ((await sha256(absolute)) !== file.sha256) {
      preserved.push(file.path);
      continue;
    }
    await rm(absolute, {force: true});
    removed.push(file.path);
    await removeEmptyParents(path.dirname(absolute), manifest.root);
  }

  if (remainingFiles.length > 0) {
    const updated: InstallManifest = {
      ...manifest,
      hosts: remainingHosts.length > 0 ? remainingHosts : manifest.hosts,
      files: remainingFiles,
    };
    await atomicWriteJson(target.manifestPath, updated);
  } else {
    for (const profile of manifest.path_changes) {
      const absolute = resolveInside(manifest.root, profile);
      if (await removeGlobalPathBlock(absolute)) removed.push(profile);
    }
    await rm(target.manifestPath, {force: true});
    await removeEmptyParents(path.dirname(target.manifestPath), manifest.root);
  }

  return {removed, preserved, remainingHosts};
}

async function purgeInstallation(
  request: UninstallRequest,
  target: ReturnType<typeof resolveInstallTarget>,
  manifest?: InstallManifest,
): Promise<{removed: string[]; preserved: string[]; remainingHosts: InstallHost[]}> {
  const removed: string[] = [];

  if (request.scope === "workspace") {
    await removeOwnedGitWorktrees(target.root);
  }

  const profiles = request.scope === "global"
    ? new Set([
        ...(manifest?.path_changes ?? []),
        ".profile",
        ".bashrc",
        ".zshrc",
      ])
    : new Set<string>();
  for (const profile of profiles) {
    const absolute = resolveInside(target.root, profile);
    if (await removeGlobalPathBlock(absolute)) removed.push(profile);
  }

  for (const host of ["codex", "claude"] as const) {
    const skillPath = target.skillPaths[host];
    resolveInside(target.root, path.relative(target.root, skillPath));
    if (await exists(skillPath)) {
      await rm(skillPath, {recursive: true, force: true});
      removed.push(path.relative(target.root, skillPath).split(path.sep).join("/"));
    }
    await removeEmptyParents(path.dirname(skillPath), target.root);
  }

  if (request.scope === "workspace") {
    const runtimeRoot = resolveInside(target.root, ".cerberpeck");
    if (await exists(runtimeRoot)) {
      await rm(runtimeRoot, {recursive: true, force: true});
      removed.push(".cerberpeck");
    }
    const configPath = resolveInside(target.root, "cerberpeck.toml");
    if (await exists(configPath)) {
      await rm(configPath, {force: true});
      removed.push("cerberpeck.toml");
    }
  } else {
    const cliPath = resolveInside(target.root, path.relative(target.root, target.cliPath));
    if (await exists(cliPath)) {
      await rm(cliPath, {force: true});
      removed.push(path.relative(target.root, cliPath).split(path.sep).join("/"));
    }
    await removeEmptyParents(path.dirname(cliPath), target.root);
    const dataRoot = path.dirname(target.manifestPath);
    if (await exists(dataRoot)) {
      await rm(dataRoot, {recursive: true, force: true});
      removed.push(dataRoot);
    }
  }

  return {removed, preserved: [], remainingHosts: []};
}

async function removeOwnedGitWorktrees(workspace: string): Promise<void> {
  const run = promisify(execFile);
  let stdout: string;
  try {
    ({stdout} = await run("git", ["worktree", "list", "--porcelain", "-z"], {
      cwd: workspace,
      encoding: "utf8",
    }));
  } catch {
    return;
  }
  const ownedRoot = path.resolve(workspace, ".cerberpeck", "worktrees");
  const worktrees = stdout
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => path.resolve(field.slice("worktree ".length)))
    .filter((candidate) => isInside(ownedRoot, candidate));

  for (const worktree of worktrees) {
    try {
      await run("git", ["worktree", "unlock", worktree], {cwd: workspace});
    } catch {
      // Most worktrees are not locked.
    }
    try {
      await run("git", ["worktree", "remove", "--force", worktree], {cwd: workspace});
    } catch (error) {
      throw new InstallerError("INSTALL_INVALID", "Could not remove a Cerberpeck Git worktree", {
        worktree,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function removeEmptyParents(directory: string, root: string): Promise<void> {
  let current = directory;
  while (current !== root && current.startsWith(`${root}${path.sep}`)) {
    try {
      await rmdir(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

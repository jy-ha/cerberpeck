import {randomUUID} from "node:crypto";
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {InstallerError} from "./errors.js";
import {atomicCopy, atomicWriteJson, exists, listFiles, relativeInside, sha256} from "./files.js";
import {
  type BrowserMode,
  type InstallHost,
  type InstallManifest,
  InstallManifestSchema,
  type InstallScope,
  type InstalledFile,
} from "./schemas.js";
import {detectBrowser, resolveInstallTarget} from "./targets.js";
import {ensureGlobalPath, rollbackGlobalPath, type PathProfileChange} from "./path-profile.js";

export type InstallStep = "inspect" | "stage" | "cli" | "skills" | "manifest" | "complete";

export interface InstallProgress {
  step: InstallStep;
  status: "running" | "done";
  message: string;
}

export interface InstallRequest {
  scope: InstallScope;
  workspace: string;
  hosts: InstallHost[];
  browser?: BrowserMode;
  version: string;
  cliSource: string;
  skillsSource: string;
  home?: string;
  xdgDataHome?: string;
  force?: boolean;
  modifyPath?: boolean;
  pathValue?: string;
  shell?: string;
  now?: string;
  onProgress?: (progress: InstallProgress) => void;
}

interface PlannedFile {
  source: string;
  target: string;
  path: string;
  component: InstalledFile["component"];
  mode?: number;
}

export async function install(request: InstallRequest): Promise<{
  manifest: InstallManifest;
  backupDirectory?: string;
}> {
  const target = resolveInstallTarget(request);
  request.onProgress?.({step: "inspect", status: "running", message: "Inspecting targets"});
  validateHosts(request.hosts);
  const previous = await readManifest(target.manifestPath);
  if (previous && (previous.scope !== target.scope || previous.root !== target.root)) {
    throw new InstallerError("INSTALL_CONFLICT", "Existing manifest belongs to another target", {
      manifest: target.manifestPath,
    });
  }

  const browser = await detectBrowser(request.browser);
  if (browser.mode === "managed") {
    throw new InstallerError(
      "INSTALL_MISSING",
      "Managed Chromium is not included in the portable v0.1 release; use --browser system or --browser none",
    );
  }
  await mkdir(path.dirname(target.manifestPath), {recursive: true});
  const stageRoot = await mkdtemp(path.join(path.dirname(target.manifestPath), ".install-staging-"));
  let backupDirectory: string | undefined;
  let profileChange: PathProfileChange | undefined;
  const applied: Array<{file: PlannedFile; existed: boolean; backup?: string}> = [];
  const previousManifestBytes = (await exists(target.manifestPath))
    ? await readFile(target.manifestPath)
    : undefined;

  try {
    const plan = await buildPlan(request, target.root, target.cliPath, target.skillPaths, stageRoot);
    const previouslyOwned = new Set(previous?.files.map((file) => file.path) ?? []);
    const conflicts: string[] = [];
    for (const file of plan) {
      if ((await exists(file.target)) && !previouslyOwned.has(file.path)) {
        conflicts.push(file.path);
      }
    }
    if (conflicts.length > 0 && !request.force) {
      throw new InstallerError("INSTALL_CONFLICT", "Installation target contains foreign files", {
        conflicts,
      });
    }
    request.onProgress?.({step: "inspect", status: "done", message: "Targets are safe"});
    request.onProgress?.({step: "stage", status: "done", message: "Staged installation files"});

    for (const file of plan) {
      const existed = await exists(file.target);
      if (existed && (await sha256(file.target)) === (await sha256(file.source))) {
        request.onProgress?.({
          step: file.component === "cli" ? "cli" : "skills",
          status: "done",
          message: `Unchanged ${file.path}`,
        });
        continue;
      }
      let backup: string | undefined;
      if (existed) {
        backupDirectory ??= path.join(
          target.backupRoot,
          `install-${(request.now ?? new Date().toISOString()).replaceAll(/[:.]/g, "-")}`,
        );
        backup = path.join(backupDirectory, file.path);
        await mkdir(path.dirname(backup), {recursive: true});
        await copyFile(file.target, backup);
      }
      await atomicCopy(file.source, file.target, file.mode);
      applied.push({file, existed, ...(backup ? {backup} : {})});
      request.onProgress?.({
        step: file.component === "cli" ? "cli" : "skills",
        status: "done",
        message: `Installed ${file.path}`,
      });
    }

    const files: InstalledFile[] = [];
    for (const file of plan) {
      files.push({
        path: file.path,
        sha256: await sha256(file.target),
        owner: "cerberpeck",
        component: file.component,
        ...(file.mode === undefined ? {} : {mode: file.mode}),
      });
    }
    const pathChanges = [...(previous?.path_changes ?? [])];
    if (request.scope === "global" && request.modifyPath !== false) {
      profileChange = await ensureGlobalPath({
        home: target.root,
        binDirectory: path.dirname(target.cliPath),
        ...(request.pathValue !== undefined ? {pathValue: request.pathValue} : {}),
        ...(request.shell !== undefined ? {shell: request.shell} : {}),
      });
      if (profileChange.changed) pathChanges.push(relativeInside(target.root, profileChange.profilePath));
    }
    const manifest = InstallManifestSchema.parse({
      schema_version: 1,
      installation_id: previous?.installation_id ?? `cpi_${randomUUID()}`,
      version: request.version,
      scope: request.scope,
      root: target.root,
      ...(target.workspace ? {workspace: target.workspace} : {}),
      hosts: [...new Set(request.hosts)],
      browser,
      files,
      path_changes: [...new Set(pathChanges)],
      installed_at: request.now ?? new Date().toISOString(),
    });
    await atomicWriteJson(target.manifestPath, manifest);
    request.onProgress?.({step: "manifest", status: "done", message: "Recorded install manifest"});
    request.onProgress?.({step: "complete", status: "done", message: "Installation complete"});
    return {manifest, ...(backupDirectory ? {backupDirectory} : {})};
  } catch (error) {
    if (profileChange) await rollbackGlobalPath(profileChange);
    for (const entry of applied.reverse()) {
      if (entry.existed && entry.backup) {
        await atomicCopy(entry.backup, entry.file.target, entry.file.mode);
      } else {
        await rm(entry.file.target, {force: true});
      }
    }
    if (previousManifestBytes) {
      await mkdir(path.dirname(target.manifestPath), {recursive: true});
      await writeFile(target.manifestPath, previousManifestBytes);
    } else {
      await rm(target.manifestPath, {force: true});
    }
    throw error;
  } finally {
    await rm(stageRoot, {recursive: true, force: true});
  }
}

async function buildPlan(
  request: InstallRequest,
  root: string,
  cliPath: string,
  skillPaths: Record<InstallHost, string>,
  stageRoot: string,
): Promise<PlannedFile[]> {
  if (!(await exists(request.cliSource))) {
    throw new InstallerError("INSTALL_MISSING", "CLI bundle is missing", {path: request.cliSource});
  }
  const stagedCli = path.join(stageRoot, "cerberpeck");
  await copyFile(request.cliSource, stagedCli);
  const plan: PlannedFile[] = [
    {
      source: stagedCli,
      target: cliPath,
      path: relativeInside(root, cliPath),
      component: "cli",
      mode: 0o755,
    },
  ];

  if (request.scope === "workspace") {
    const stagedGitignore = path.join(stageRoot, "cerberpeck.gitignore");
    await writeFile(stagedGitignore, "*\n!.gitignore\n", "utf8");
    const gitignoreTarget = path.join(root, ".cerberpeck", ".gitignore");
    plan.push({
      source: stagedGitignore,
      target: gitignoreTarget,
      path: relativeInside(root, gitignoreTarget),
      component: "cli",
    });
  }

  for (const host of request.hosts) {
    const sourceRoot = path.join(request.skillsSource, host, "cerberpeck");
    if (!(await exists(sourceRoot))) {
      throw new InstallerError("INSTALL_MISSING", `Skill bundle is missing for ${host}`, {
        path: sourceRoot,
      });
    }
    for (const source of await listFiles(sourceRoot)) {
      const relative = path.relative(sourceRoot, source);
      const staged = path.join(stageRoot, "skills", host, relative);
      await mkdir(path.dirname(staged), {recursive: true});
      await copyFile(source, staged);
      const fileTarget = path.join(skillPaths[host], relative);
      plan.push({
        source: staged,
        target: fileTarget,
        path: relativeInside(root, fileTarget),
        component: host === "codex" ? "skill-codex" : "skill-claude",
      });
    }
  }
  return plan;
}

export async function readManifest(manifestPath: string): Promise<InstallManifest | undefined> {
  if (!(await exists(manifestPath))) {
    return undefined;
  }
  try {
    return InstallManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
  } catch (error) {
    throw new InstallerError("INSTALL_INVALID", "Install manifest is invalid", {
      path: manifestPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function validateHosts(hosts: InstallHost[]): void {
  if (hosts.length === 0) {
    throw new InstallerError("INSTALL_INVALID", "At least one host must be selected");
  }
}

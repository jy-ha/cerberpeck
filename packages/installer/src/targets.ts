import {access, stat} from "node:fs/promises";
import {constants} from "node:fs";
import os from "node:os";
import path from "node:path";
import type {BrowserMode, InstallHost, InstallScope} from "./schemas.js";

export interface InstallTarget {
  scope: InstallScope;
  root: string;
  workspace?: string;
  cliPath: string;
  manifestPath: string;
  backupRoot: string;
  skillPaths: Record<InstallHost, string>;
}

export function resolveInstallTarget(input: {
  scope: InstallScope;
  workspace: string;
  home?: string;
  xdgDataHome?: string;
}): InstallTarget {
  if (input.scope === "workspace") {
    const workspace = path.resolve(input.workspace);
    return {
      scope: "workspace",
      root: workspace,
      workspace,
      cliPath: path.join(workspace, ".cerberpeck", "bin", "cerberpeck"),
      manifestPath: path.join(workspace, ".cerberpeck", "install-manifest.json"),
      backupRoot: path.join(workspace, ".cerberpeck", "backups"),
      skillPaths: {
        codex: path.join(workspace, ".agents", "skills", "cerberpeck"),
        claude: path.join(workspace, ".claude", "skills", "cerberpeck"),
      },
    };
  }

  const home = path.resolve(input.home ?? os.homedir());
  const dataHome = path.resolve(input.xdgDataHome ?? path.join(home, ".local", "share"));
  return {
    scope: "global",
    root: home,
    cliPath: path.join(home, ".local", "bin", "cerberpeck"),
    manifestPath: path.join(dataHome, "cerberpeck", "install-manifest.json"),
    backupRoot: path.join(dataHome, "cerberpeck", "backups"),
    skillPaths: {
      codex: path.join(home, ".agents", "skills", "cerberpeck"),
      claude: path.join(home, ".claude", "skills", "cerberpeck"),
    },
  };
}

export async function detectHosts(input: {
  workspace: string;
  home?: string;
  pathValue?: string;
}): Promise<InstallHost[]> {
  const home = input.home ?? os.homedir();
  const detected = new Set<InstallHost>();
  if (
    (await findExecutable("codex", input.pathValue)) ||
    (await exists(path.join(input.workspace, ".agents"))) ||
    (await exists(path.join(home, ".agents")))
  ) {
    detected.add("codex");
  }
  if (
    (await findExecutable("claude", input.pathValue)) ||
    (await exists(path.join(input.workspace, ".claude"))) ||
    (await exists(path.join(home, ".claude")))
  ) {
    detected.add("claude");
  }
  return detected.size > 0 ? [...detected] : ["codex", "claude"];
}

export async function detectBrowser(
  requested: BrowserMode | undefined,
  pathValue?: string,
): Promise<{mode: BrowserMode; path?: string}> {
  if (requested === "none" || requested === "managed") {
    return {mode: requested};
  }
  for (const name of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
    const executable = await findExecutable(name, pathValue);
    if (executable) {
      return {mode: "system", path: executable};
    }
  }
  return {mode: "none"};
}

export async function findExecutable(name: string, pathValue = process.env.PATH ?? ""): Promise<string | undefined> {
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next PATH entry.
    }
  }
  return undefined;
}

async function exists(target: string): Promise<boolean> {
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

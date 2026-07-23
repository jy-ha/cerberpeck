import {access} from "node:fs/promises";
import {constants} from "node:fs";
import {exists, resolveInside, sha256} from "./files.js";
import {readManifest} from "./install.js";
import type {InstallScope} from "./schemas.js";
import {findExecutable, resolveInstallTarget} from "./targets.js";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
}

export async function doctor(input: {
  scope: InstallScope;
  workspace: string;
  home?: string;
  xdgDataHome?: string;
}): Promise<DoctorCheck[]> {
  const target = resolveInstallTarget(input);
  const checks: DoctorCheck[] = [];
  const manifest = await readManifest(target.manifestPath);
  if (!manifest) {
    return [{name: "installation", status: "error", message: "No install manifest found"}];
  }
  checks.push({
    name: "installation",
    status: "ok",
    message: `${manifest.version} ${manifest.scope} installation`,
  });
  for (const file of manifest.files) {
    const absolute = resolveInside(manifest.root, file.path);
    if (!(await exists(absolute))) {
      checks.push({name: file.path, status: "error", message: "Installed file is missing"});
    } else if ((await sha256(absolute)) !== file.sha256) {
      checks.push({name: file.path, status: "warning", message: "Installed file was modified"});
    }
  }
  for (const host of manifest.hosts) {
    const executable = await findExecutable(host);
    checks.push({
      name: `${host}-cli`,
      status: executable ? "ok" : "warning",
      message: executable ?? `${host} CLI is not on PATH`,
    });
  }
  try {
    await access(target.cliPath, constants.X_OK);
    checks.push({name: "cerberpeck-cli", status: "ok", message: target.cliPath});
  } catch {
    checks.push({name: "cerberpeck-cli", status: "error", message: "CLI is not executable"});
  }
  if (manifest.browser.mode === "system") {
    if (manifest.browser.path) {
      try {
        await access(manifest.browser.path, constants.X_OK);
        checks.push({name: "browser", status: "ok", message: manifest.browser.path});
      } catch {
        checks.push({name: "browser", status: "error", message: `System browser is not executable: ${manifest.browser.path}`});
      }
    } else {
      checks.push({name: "browser", status: "error", message: "System browser path was not recorded"});
    }
  } else if (manifest.browser.mode === "managed") {
    checks.push({
      name: "browser",
      status: "error",
      message: "Managed Chromium download is not included in the portable v0.1 build; install system Chromium or reinstall with --browser none",
    });
  } else {
    checks.push({name: "browser", status: "warning", message: "Browser capture is disabled"});
  }
  return checks;
}

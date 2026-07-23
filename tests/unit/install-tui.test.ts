import {describe, expect, it} from "vitest";
import {
  reduceInstallTui,
  renderInstallOptions,
  shouldPromptInstall,
  type InstallTuiState,
} from "../../apps/cli/src/tui/install.js";
import {
  reduceUninstallTui,
  renderUninstallOptions,
  type UninstallTuiState,
} from "../../apps/cli/src/tui/uninstall.js";

function state(): InstallTuiState {
  return {
    cursor: 0,
    scope: "workspace",
    hosts: ["codex", "claude"],
    browser: "system",
    done: false,
    cancelled: false,
  };
}

describe("install TUI reducer", () => {
  it("changes scope, hosts, and browser without a confirmation state", () => {
    let current = reduceInstallTui(state(), "space");
    expect(current.scope).toBe("global");
    current = reduceInstallTui(current, "down");
    current = reduceInstallTui(current, "space");
    expect(current.hosts).toEqual(["claude"]);
    current = reduceInstallTui(current, "down");
    current = reduceInstallTui(current, "down");
    current = reduceInstallTui(current, "space");
    expect(current.browser).toBe("managed");
    current = reduceInstallTui(current, "enter");
    expect(current.done).toBe(true);
  });

  it("never allows the final host to be deselected", () => {
    const onlyCodex = {...state(), cursor: 1, hosts: ["codex"] as const};
    expect(reduceInstallTui({...onlyCodex, hosts: [...onlyCodex.hosts]}, "space").hosts).toEqual([
      "codex",
    ]);
  });

  it("renders without relying on color", () => {
    expect(renderInstallOptions(state(), "/tmp/work")).toContain("[x] Codex");
    expect(renderInstallOptions(state(), "/tmp/work")).toContain("Workspace: /tmp/work");
  });
});

describe("install TUI selection", () => {
  const terminalInstall = {
    command: "install" as const,
    interactive: false,
    yes: false,
    json: false,
    hasExplicitSelection: false,
    stdinTty: true,
    stdoutTty: true,
  };

  it("opens for an unconfigured install in a real terminal", () => {
    expect(shouldPromptInstall(terminalInstall)).toBe(true);
  });

  it("stays touchless for explicit selections, --yes, JSON, updates, and non-TTY hosts", () => {
    expect(shouldPromptInstall({...terminalInstall, hasExplicitSelection: true})).toBe(false);
    expect(shouldPromptInstall({...terminalInstall, yes: true})).toBe(false);
    expect(shouldPromptInstall({...terminalInstall, json: true})).toBe(false);
    expect(shouldPromptInstall({...terminalInstall, command: "update"})).toBe(false);
    expect(shouldPromptInstall({...terminalInstall, stdinTty: false})).toBe(false);
  });

  it("honors an explicit interactive request outside a terminal through line fallback", () => {
    expect(shouldPromptInstall({
      ...terminalInstall,
      interactive: true,
      stdinTty: false,
      stdoutTty: false,
    })).toBe(true);
  });
});

describe("uninstall TUI", () => {
  const initial: UninstallTuiState = {
    cursor: 0,
    scope: "workspace",
    hosts: ["codex", "claude"],
    purge: false,
    done: false,
    cancelled: false,
  };

  it("changes scope, hosts and purge without a confirm screen", () => {
    let state = reduceUninstallTui(initial, "space");
    state = reduceUninstallTui(state, "down");
    state = reduceUninstallTui(state, "space");
    state = reduceUninstallTui(state, "down");
    state = reduceUninstallTui(state, "down");
    state = reduceUninstallTui(state, "space");
    state = reduceUninstallTui(state, "enter");
    expect(state).toMatchObject({scope: "global", hosts: ["claude"], purge: true, done: true});
    expect(renderUninstallOptions(state, "/work")).toContain("Remove everything");
  });
});

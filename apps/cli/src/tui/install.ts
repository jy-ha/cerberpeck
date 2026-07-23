import readline from "node:readline";
import type {BrowserMode, InstallHost, InstallProgress, InstallScope} from "@cerberpeck/installer";

export interface InstallTuiState {
  cursor: number;
  scope: InstallScope;
  hosts: InstallHost[];
  browser: BrowserMode;
  done: boolean;
  cancelled: boolean;
}

export type InstallTuiKey = "up" | "down" | "space" | "enter" | "quit";

export interface InstallPromptContext {
  command: "install" | "update";
  interactive: boolean;
  yes: boolean;
  json: boolean;
  hasExplicitSelection: boolean;
  stdinTty: boolean;
  stdoutTty: boolean;
}

const ROWS = 4;

export function reduceInstallTui(state: InstallTuiState, key: InstallTuiKey): InstallTuiState {
  if (state.done || state.cancelled) {
    return state;
  }
  if (key === "up") {
    return {...state, cursor: (state.cursor - 1 + ROWS) % ROWS};
  }
  if (key === "down") {
    return {...state, cursor: (state.cursor + 1) % ROWS};
  }
  if (key === "quit") {
    return {...state, cancelled: true};
  }
  if (key === "enter") {
    return state.hosts.length > 0 ? {...state, done: true} : state;
  }
  if (key !== "space") {
    return state;
  }
  if (state.cursor === 0) {
    return {...state, scope: state.scope === "workspace" ? "global" : "workspace"};
  }
  if (state.cursor === 1 || state.cursor === 2) {
    const host: InstallHost = state.cursor === 1 ? "codex" : "claude";
    const selected = state.hosts.includes(host);
    const hosts = selected ? state.hosts.filter((item) => item !== host) : [...state.hosts, host];
    return hosts.length > 0 ? {...state, hosts} : state;
  }
  const modes: BrowserMode[] = ["system", "managed", "none"];
  return {...state, browser: modes[(modes.indexOf(state.browser) + 1) % modes.length]!};
}

export function shouldPromptInstall(context: InstallPromptContext): boolean {
  if (context.json) {
    return false;
  }
  if (context.interactive) {
    return true;
  }
  return context.command === "install"
    && !context.yes
    && !context.hasExplicitSelection
    && context.stdinTty
    && context.stdoutTty;
}

export function renderInstallOptions(state: InstallTuiState, workspace: string): string {
  const marker = (row: number) => (state.cursor === row ? ">" : " ");
  const checked = (host: InstallHost) => (state.hosts.includes(host) ? "x" : " ");
  return [
    "Cerberpeck installation options",
    "",
    `${marker(0)} Scope    ${state.scope}`,
    `${marker(1)} [${checked("codex")}] Codex`,
    `${marker(2)} [${checked("claude")}] Claude Code`,
    `${marker(3)} Browser  ${state.browser}`,
    "",
    `Workspace: ${workspace}`,
    "↑/↓ or j/k move · Space change · Enter install · q cancel",
  ].join("\n");
}

export async function promptInstallOptions(
  initial: Omit<InstallTuiState, "cursor" | "done" | "cancelled">,
  workspace: string,
): Promise<InstallTuiState> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {...initial, cursor: 0, done: true, cancelled: false};
  }
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  let state: InstallTuiState = {...initial, cursor: 0, done: false, cancelled: false};
  const draw = () => process.stdout.write(`\u001b[2J\u001b[H${renderInstallOptions(state, workspace)}\n`);
  draw();

  return new Promise((resolve) => {
    const onKey = (_text: string, key: readline.Key) => {
      const mapped = mapKey(key);
      if (!mapped) {
        return;
      }
      state = reduceInstallTui(state, mapped);
      draw();
      if (state.done || state.cancelled) {
        process.stdin.off("keypress", onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve(state);
      }
    };
    process.stdin.on("keypress", onKey);
  });
}

function mapKey(key: readline.Key): InstallTuiKey | undefined {
  if (key.name === "up" || key.name === "k") return "up";
  if (key.name === "down" || key.name === "j") return "down";
  if (key.name === "space") return "space";
  if (key.name === "return") return "enter";
  if (key.name === "q" || (key.ctrl === true && key.name === "c")) return "quit";
  return undefined;
}

export class InstallProgressRenderer {
  private readonly events = new Map<InstallProgress["step"], InstallProgress>();
  private readonly interactive: boolean;

  constructor(interactive = process.stderr.isTTY) {
    this.interactive = interactive;
  }

  update(event: InstallProgress): void {
    this.events.set(event.step, event);
    if (!this.interactive) {
      process.stderr.write(`${event.status === "done" ? "✓" : "●"} ${event.message}\n`);
      return;
    }
    const lines = ["Cerberpeck installation", ""];
    for (const step of ["inspect", "stage", "cli", "skills", "manifest", "complete"] as const) {
      const current = this.events.get(step);
      lines.push(`${current?.status === "done" ? "✓" : current ? "●" : "○"} ${current?.message ?? step}`);
    }
    process.stderr.write(`\u001b[2J\u001b[H${lines.join("\n")}\n`);
  }
}

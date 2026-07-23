import readline from "node:readline";
import type {InstallHost, InstallScope} from "@cerberpeck/installer";

export interface UninstallTuiState {
  cursor: number;
  scope: InstallScope;
  hosts: InstallHost[];
  purge: boolean;
  done: boolean;
  cancelled: boolean;
}

export type UninstallTuiKey = "up" | "down" | "space" | "enter" | "escape" | "quit";
const ROWS = 4;

export function reduceUninstallTui(state: UninstallTuiState, key: UninstallTuiKey): UninstallTuiState {
  if (state.done || state.cancelled) return state;
  if (key === "up") return {...state, cursor: (state.cursor - 1 + ROWS) % ROWS};
  if (key === "down") return {...state, cursor: (state.cursor + 1) % ROWS};
  if (key === "escape") return {...state, cursor: 0, purge: false};
  if (key === "quit") return {...state, cancelled: true};
  if (key === "enter") return state.hosts.length > 0 ? {...state, done: true} : state;
  if (key !== "space") return state;
  if (state.cursor === 0) return {...state, scope: state.scope === "workspace" ? "global" : "workspace"};
  if (state.cursor === 3) return {...state, purge: !state.purge};
  const host: InstallHost = state.cursor === 1 ? "codex" : "claude";
  const hosts = state.hosts.includes(host)
    ? state.hosts.filter((candidate) => candidate !== host)
    : [...state.hosts, host];
  return hosts.length > 0 ? {...state, hosts} : state;
}

export function renderUninstallOptions(state: UninstallTuiState, workspace: string): string {
  const marker = (row: number) => state.cursor === row ? ">" : " ";
  const checked = (value: boolean) => value ? "x" : " ";
  return [
    "Cerberpeck removal options",
    "",
    `${marker(0)} Scope    ${state.scope}`,
    `${marker(1)} [${checked(state.hosts.includes("codex"))}] Codex`,
    `${marker(2)} [${checked(state.hosts.includes("claude"))}] Claude Code`,
    `${marker(3)} [${checked(state.purge)}] Remove everything (irreversible)`,
    "",
    `Workspace: ${workspace}`,
    "↑/↓ or j/k move · Space change · Enter remove · q cancel",
  ].join("\n");
}

export async function promptUninstallOptions(
  initial: Pick<UninstallTuiState, "scope" | "hosts" | "purge">,
  workspace: string,
): Promise<UninstallTuiState> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return {...initial, cursor: 0, done: true, cancelled: false};
  }
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  let state: UninstallTuiState = {...initial, cursor: 0, done: false, cancelled: false};
  const draw = () => process.stdout.write(`\u001b[2J\u001b[H${renderUninstallOptions(state, workspace)}\n`);
  draw();
  return new Promise((resolve) => {
    const onKey = (_text: string, key: readline.Key) => {
      const mapped = mapKey(key);
      if (!mapped) return;
      state = reduceUninstallTui(state, mapped);
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

function mapKey(key: readline.Key): UninstallTuiKey | undefined {
  if (key.name === "up" || key.name === "k") return "up";
  if (key.name === "down" || key.name === "j") return "down";
  if (key.name === "space") return "space";
  if (key.name === "return") return "enter";
  if (key.name === "escape") return "escape";
  if (key.name === "q" || (key.ctrl === true && key.name === "c")) return "quit";
  return undefined;
}

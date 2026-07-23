import {spawn, type ChildProcess} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {WorkspaceError} from "../errors.js";
import type {RunRecipe} from "./schemas.js";

export interface RunningWebProcess {
  recipe: RunRecipe;
  pid: number;
  logs: () => {stdout: string; stderr: string};
  stop: () => Promise<void>;
}

export async function startWebProcess(recipe: RunRecipe): Promise<RunningWebProcess> {
  const [command, ...args] = recipe.start.argv;
  if (!command) throw new WorkspaceError("WORKSPACE_INVALID", "Run recipe has no executable");
  const child = spawn(command, args, {
    cwd: recipe.cwd,
    env: {...process.env, ...recipe.start.env, CERBERPECK_CHILD: "1"},
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => { stdout = appendBounded(stdout, chunk.toString("utf8")); });
  child.stderr?.on("data", (chunk: Buffer) => { stderr = appendBounded(stderr, chunk.toString("utf8")); });
  const exit = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({code, signal}));
  });
  if (!child.pid) throw new WorkspaceError("WORKSPACE_INVALID", `Failed to start: ${command}`);

  try {
    await waitForReadiness(recipe, exit);
  } catch (error) {
    await stopProcess(child, recipe.stop.timeoutSeconds);
    throw new WorkspaceError("WORKSPACE_INVALID", "Development server did not become ready", {
      details: {argv: recipe.start.argv, stdout: redact(stdout), stderr: redact(stderr)},
      cause: error,
    });
  }

  return {
    recipe,
    pid: child.pid,
    logs: () => ({stdout: redact(stdout), stderr: redact(stderr)}),
    stop: () => stopProcess(child, recipe.stop.timeoutSeconds),
  };
}

async function waitForReadiness(
  recipe: RunRecipe,
  exit: Promise<{code: number | null; signal: NodeJS.Signals | null}>,
): Promise<void> {
  const deadline = Date.now() + recipe.ready.timeoutSeconds * 1_000;
  while (Date.now() < deadline) {
    const result = await Promise.race([
      probe(recipe.ready.url, recipe.ready.expectedStatus).then((ready) => ({kind: "probe" as const, ready})),
      exit.then((status) => ({kind: "exit" as const, status})),
    ]);
    if (result.kind === "exit") {
      throw new Error(`Process exited before readiness: ${result.status.code ?? result.status.signal}`);
    }
    if (result.ready) return;
    await delay(100);
  }
  throw new Error(`HTTP readiness timed out: ${recipe.ready.url}`);
}

async function probe(url: string, expectedStatus: number): Promise<boolean> {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(1_000), redirect: "manual"});
    return response.status === expectedStatus;
  } catch {
    return false;
  }
}

async function stopProcess(child: ChildProcess, timeoutSeconds: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  signalTree(child.pid, "SIGTERM");
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => child.once("exit", () => resolve(true))),
    delay(timeoutSeconds * 1_000).then(() => false),
  ]);
  if (!exited && child.pid) {
    signalTree(child.pid, "SIGKILL");
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      delay(1_000),
    ]);
  }
}

function signalTree(pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform === "win32") process.kill(pid, signal);
    else process.kill(-pid, signal);
  } catch (error) {
    if (!(isNodeError(error) && error.code === "ESRCH")) throw error;
  }
}

function appendBounded(current: string, addition: string): string {
  return `${current}${addition}`.slice(-64 * 1024);
}

export function redact(value: string): string {
  return value
    .replace(/(authorization|cookie|token|secret|password)(["'=:\s]+)[^\s"'&]+/gi, "$1$2[REDACTED]")
    .replace(/([?&][^=&#]+)=([^&#\s]+)/g, "$1=[REDACTED]");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

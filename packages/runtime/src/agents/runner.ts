import {spawn} from "node:child_process";
import {createWriteStream} from "node:fs";
import {mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import type {ActionKind} from "@cerberpeck/core";
import {WorkspaceError} from "../errors.js";

export type AgentHost = "codex" | "claude";

export interface HostActionResult {
  host: AgentHost;
  result: Record<string, unknown>;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export async function runHostAction(input: {
  host: AgentHost;
  kind: ActionKind;
  prompt: string;
  cwd: string;
  actionDirectory: string;
  writeAccess: boolean;
  timeoutMs?: number;
  executable?: string;
}): Promise<HostActionResult> {
  await mkdir(input.actionDirectory, {recursive: true});
  const schema = actionJsonSchema(input.kind);
  const schemaPath = path.join(input.actionDirectory, "output-schema.json");
  const resultPath = path.join(input.actionDirectory, "result.json");
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  await writeFile(path.join(input.actionDirectory, "prompt.txt"), input.prompt, "utf8");
  const started = Date.now();
  const invocation = input.host === "codex"
    ? {
        command: input.executable ?? process.env.CERBERPECK_CODEX_BIN ?? "codex",
        args: [
          "exec",
          "--config",
          'model_reasoning_effort="xhigh"',
          "--ephemeral",
          "--skip-git-repo-check",
          "--json",
          "--color",
          "never",
          "--sandbox",
          input.writeAccess ? "workspace-write" : "read-only",
          "--cd",
          input.cwd,
          "--output-schema",
          schemaPath,
          "--output-last-message",
          resultPath,
          "-",
        ],
      }
    : {
        command: input.executable ?? process.env.CERBERPECK_CLAUDE_BIN ?? "claude",
        args: [
          "-p",
          "--effort",
          "max",
          "--output-format",
          "json",
          "--json-schema",
          JSON.stringify(schema),
          "--no-session-persistence",
          "--permission-mode",
          "dontAsk",
          "--tools",
          input.writeAccess ? "Read,Edit,Write,Bash,Glob,Grep" : "Read,Glob,Grep",
        ],
      };
  const executed = await runProcess({
    ...invocation,
    cwd: input.cwd,
    stdin: input.prompt,
    timeoutMs: input.timeoutMs ?? 30 * 60_000,
    stdoutPath: path.join(input.actionDirectory, "host.stdout.jsonl"),
    stderrPath: path.join(input.actionDirectory, "host.stderr.log"),
    processPath: path.join(input.actionDirectory, "process.json"),
  });
  let parsed: unknown;
  if (input.host === "codex") {
    try {
      parsed = JSON.parse(await readFile(resultPath, "utf8")) as unknown;
    } catch (error) {
      throw new WorkspaceError("WORKSPACE_INVALID", "Codex did not produce structured output", {
        details: {stderr: tail(executed.stderr)},
        cause: error,
      });
    }
  } else {
    parsed = parseClaudeOutput(executed.stdout);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkspaceError("WORKSPACE_INVALID", `${input.host} returned a non-object result`);
  }
  return {
    host: input.host,
    result: parsed as Record<string, unknown>,
    stdout: executed.stdout,
    stderr: executed.stderr,
    durationMs: Date.now() - started,
  };
}

function parseClaudeOutput(stdout: string): unknown {
  try {
    const envelope = JSON.parse(stdout) as Record<string, unknown>;
    if (envelope.structured_output && typeof envelope.structured_output === "object") {
      return envelope.structured_output;
    }
    if (typeof envelope.result === "string") {
      try {
        return JSON.parse(envelope.result) as unknown;
      } catch {
        // Fall through to a direct envelope if the mock/host already returned the schema object.
      }
    }
    return envelope;
  } catch (error) {
    throw new WorkspaceError("WORKSPACE_INVALID", "Claude did not produce valid JSON output", {
      details: {stdout: tail(stdout)},
      cause: error,
    });
  }
}

async function runProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  stdin: string;
  timeoutMs: number;
  stdoutPath: string;
  stderrPath: string;
  processPath: string;
}): Promise<{stdout: string; stderr: string}> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: {...process.env, CERBERPECK_CHILD: "1"},
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const stdoutLog = createWriteStream(input.stdoutPath, {flags: "a", mode: 0o600});
    const stderrLog = createWriteStream(input.stderrPath, {flags: "a", mode: 0o600});
    if (child.pid) {
      void writeFile(input.processPath, `${JSON.stringify({pid: child.pid, processGroup: process.platform !== "win32"})}\n`, "utf8");
    }
    const onSignal = (exitCode: number) => () => {
      if (child.pid) signalTree(child.pid, "SIGTERM");
      setTimeout(() => process.exit(exitCode), 50).unref();
    };
    const onInterrupt = onSignal(130);
    const onTerminate = onSignal(143);
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onTerminate);
    const timer = setTimeout(() => {
      if (child.pid) signalTree(child.pid, "SIGKILL");
      finish(new WorkspaceError("WORKSPACE_INVALID", `Host action timed out after ${input.timeoutMs}ms`));
    }, input.timeoutMs);
    timer.unref();
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutLog.write(chunk);
      stdout = bounded(stdout, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrLog.write(chunk);
      stderr = bounded(stderr, chunk.toString("utf8"));
    });
    child.once("error", finish);
    child.once("exit", (code, signal) => {
      if (code === 0) finish();
      else finish(new WorkspaceError("WORKSPACE_INVALID", `Host process failed: ${code ?? signal}`, {
        details: {command: input.command, stdout: tail(stdout), stderr: tail(stderr)},
      }));
    });
    child.stdin.end(input.stdin);

    function finish(error?: unknown): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
      stdoutLog.end();
      stderrLog.end();
      void rm(input.processPath, {force: true});
      if (error) reject(error);
      else resolve({stdout, stderr});
    }
  });
}

export async function cancelSessionProcesses(workspace: string, sessionId: string): Promise<number> {
  if (!/^cp_[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new WorkspaceError("WORKSPACE_INVALID", `Invalid session id: ${sessionId}`);
  }
  const actionsRoot = path.join(path.resolve(workspace), ".cerberpeck", "sessions", sessionId, "actions");
  return cancelProcessesUnder(actionsRoot);
}

export async function cancelWorkspaceProcesses(workspace: string): Promise<number> {
  const sessionsRoot = path.join(path.resolve(workspace), ".cerberpeck", "sessions");
  return cancelProcessesUnder(sessionsRoot);
}

async function cancelProcessesUnder(root: string): Promise<number> {
  let cancelled = 0;
  for (const processPath of await findProcessFiles(root)) {
    try {
      const record = JSON.parse(await readFile(processPath, "utf8")) as {pid?: unknown};
      if (typeof record.pid === "number" && Number.isInteger(record.pid) && record.pid > 1) {
        signalTree(record.pid, "SIGTERM");
        cancelled += 1;
      }
    } catch {
      // A stale or concurrently removed PID record is safe to ignore.
    }
    await rm(processPath, {force: true});
  }
  return cancelled;
}

async function findProcessFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  try {
    for (const entry of await readdir(root, {withFileTypes: true})) {
      const target = path.join(root, entry.name);
      if (entry.isDirectory()) found.push(...await findProcessFiles(target));
      else if (entry.isFile() && entry.name === "process.json") found.push(target);
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return found;
}

function signalTree(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(process.platform === "win32" ? pid : -pid, signal);
  } catch {
    // The process may have exited between timeout and signal delivery.
  }
}

function bounded(current: string, addition: string): string {
  return `${current}${addition}`.slice(-2 * 1024 * 1024);
}

function tail(value: string): string {
  return value.slice(-4_000);
}

export function actionJsonSchema(kind: ActionKind): Record<string, unknown> {
  const base = {type: "object", additionalProperties: false};
  switch (kind) {
    case "project.profile":
      return {...base, properties: {summary: {type: "string"}, detectedFramework: {type: ["string", "null"]}, runCommand: {type: ["array", "null"], items: {type: "string"}}}, required: ["summary", "detectedFramework", "runCommand"]};
    case "contract.create":
      return {...base, properties: {primaryOutcome: {type: "string"}, constraints: {type: "array", items: {type: "string"}}, maxRounds: {type: "integer", minimum: 1, maximum: 10}}, required: ["primaryOutcome", "constraints", "maxRounds"]};
    case "panel.create": {
      const persona = {type: "object", additionalProperties: false, properties: {id: {type: "string", pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]*$"}, label: {type: "string"}, role: {type: "string"}, context: {type: "string"}, focus: {type: "array", items: {type: "string"}, minItems: 1}}, required: ["id", "label", "role", "context", "focus"]};
      return {...base, properties: {experts: {type: "array", items: persona, minItems: 3, maxItems: 5}, customers: {type: "array", items: persona, minItems: 0, maxItems: 5}}, required: ["experts", "customers"]};
    }
    case "review.baseline":
      return {...base, properties: {summary: {type: "string"}, overallScore: scoreSchema(), strengths: {type: "array", items: {type: "string"}}, issues: {type: "array", items: {type: "object", additionalProperties: false, properties: {severity: {enum: ["low", "medium", "high", "critical"]}, evidence: {type: "string"}, finding: {type: "string"}, recommendedDirection: {type: "string"}}, required: ["severity", "evidence", "finding", "recommendedDirection"]}}}, required: ["summary", "overallScore", "strengths", "issues"]};
    case "synthesis.create":
      return {...base, properties: {title: {type: "string"}, rationale: {type: "string"}, changes: {type: "array", items: {type: "string"}, maxItems: 4}, stop: {type: "boolean"}}, required: ["title", "rationale", "changes", "stop"]};
    case "candidate.build":
      return {...base, properties: {summary: {type: "string"}, changedFiles: {type: "array", items: {type: "string"}}}, required: ["summary", "changedFiles"]};
    case "candidate.validate":
      return {...base, properties: {gatesPassed: {type: "boolean"}, summary: {type: "string"}, artifacts: {type: "array", items: {type: "string"}}}, required: ["gatesPassed", "summary", "artifacts"]};
    case "review.comparison":
      return {...base, properties: {personaId: {type: "string"}, preference: {enum: ["A", "B", "tie"]}, confidence: {type: "integer", minimum: 1, maximum: 5}, scores: {type: "object", additionalProperties: false, properties: {A: scoreSchema(), B: scoreSchema()}, required: ["A", "B"]}, summary: {type: "string"}, blockingIssue: {type: ["string", "null"]}, winnerStrengths: {type: "array", items: {type: "string"}}, regressions: {type: "array", items: {type: "string"}}, evidence: {type: "array", items: {type: "string"}}}, required: ["personaId", "preference", "confidence", "scores", "summary", "blockingIssue", "winnerStrengths", "regressions", "evidence"]};
    case "decision.make":
      return {...base, properties: {decision: {enum: ["promote", "reject", "stop"]}, summary: {type: "string"}, stopReason: {type: ["string", "null"]}}, required: ["decision", "summary", "stopReason"]};
  }
}

function scoreSchema(): Record<string, unknown> {
  return {type: "number", minimum: 1, maximum: 5, multipleOf: 0.5};
}

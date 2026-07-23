#!/usr/bin/env node

import {readFile} from "node:fs/promises";
import path from "node:path";
import {Command} from "commander";
import {
  CerberpeckError,
  createSession,
  createSessionId,
  failAction,
  getNextActions,
  SessionStore,
  submitActionResult,
} from "@cerberpeck/core";
import {
  detectBrowser,
  detectHosts,
  doctor,
  install,
  InstallerError,
  readManifest,
  resolveInstallTarget,
  type BrowserMode,
  type InstallHost,
  type InstallScope,
  uninstall,
} from "@cerberpeck/installer";
import {
  ApplyManager,
  captureWeb,
  cancelSessionProcesses,
  cancelWorkspaceProcesses,
  detectRunRecipes,
  readJourney,
  runAutonomousSession,
  RunRecipeSchema,
  serveStatic,
  WorkspaceDriver,
  WorkspaceError,
} from "@cerberpeck/runtime";
import {
  InstallProgressRenderer,
  promptInstallOptions,
  shouldPromptInstall,
} from "./tui/install.js";
import {RunProgressRenderer} from "./tui/run.js";
import {promptUninstallOptions} from "./tui/uninstall.js";

const VERSION = "0.1.1";

interface GlobalOptions {
  workspace: string;
  json?: boolean;
}

interface InstallCommandOptions {
  scope?: InstallScope;
  hosts?: InstallHost[];
  browser?: BrowserMode;
  interactive?: boolean;
  yes?: boolean;
  force?: boolean;
  modifyPath?: boolean;
  assetsDir?: string;
  cliSource?: string;
}

const program = new Command()
  .name("cerberpeck")
  .description("Iteratively improve web services through independent evaluation sessions")
  .version(VERSION)
  .option("--workspace <path>", "workspace containing .cerberpeck state", process.cwd())
  .option("--json", "emit machine-readable JSON");

program
  .command("install")
  .description("install the CLI and host skills; defaults to the current workspace")
  .option("--scope <scope>", "workspace or global", parseScope)
  .option("--hosts <hosts>", "comma-separated codex,claude hosts", parseHosts)
  .option("--browser <mode>", "system, managed, or none", parseBrowser)
  .option("--interactive", "open the installation options TUI")
  .option("--yes", "accept detected defaults without opening the options TUI")
  .option("--force", "backup and replace foreign target files")
  .option("--no-modify-path", "do not add the global bin directory to a shell profile")
  .option("--assets-dir <path>", "release skill bundle directory")
  .option("--cli-source <path>", "CLI bundle to install")
  .action(async (options: InstallCommandOptions) => {
    await runInstall(options, "install");
  });

program
  .command("update")
  .description("reinstall the current release while preserving scope and hosts")
  .option("--scope <scope>", "workspace or global", parseScope)
  .option("--hosts <hosts>", "comma-separated codex,claude hosts", parseHosts)
  .option("--browser <mode>", "system, managed, or none", parseBrowser)
  .option("--force")
  .option("--no-modify-path")
  .option("--assets-dir <path>")
  .option("--cli-source <path>")
  .action(async (options: InstallCommandOptions) => {
    await runInstall(options, "update");
  });

program
  .command("uninstall")
  .description("remove owned install files while preserving sessions")
  .option("--scope <scope>", "workspace or global", parseScope, "workspace")
  .option("--hosts <hosts>", "only remove selected hosts", parseHosts)
  .option("--keep-cli", "keep the common CLI after the last host is removed")
  .option("--interactive", "change removal scope, hosts, and data preservation in a terminal UI")
  .option("--purge", "remove all Cerberpeck files, skills, state, backups, and configuration")
  .option("--yes", "confirm non-interactive purge")
  .action(
    async (options: {
      scope: InstallScope;
      hosts?: InstallHost[];
      keepCli?: boolean;
      purge?: boolean;
      yes?: boolean;
      interactive?: boolean;
    }) => {
      const globals = globalOptions();
      let scope = options.scope;
      let hosts = options.hosts;
      let purge = options.purge === true;
      if (options.interactive === true) {
        const targetOptions = {
          scope,
          workspace: path.resolve(globals.workspace),
          ...(process.env.CERBERPECK_HOME ? {home: process.env.CERBERPECK_HOME} : {}),
          ...(process.env.XDG_DATA_HOME ? {xdgDataHome: process.env.XDG_DATA_HOME} : {}),
        };
        const manifest = await readManifest(resolveInstallTarget(targetOptions).manifestPath);
        const selected = await promptUninstallOptions({
          scope,
          hosts: hosts ?? manifest?.hosts ?? ["codex", "claude"],
          purge,
        }, path.resolve(globals.workspace));
        if (selected.cancelled) throw new CerberpeckError("INVALID_ARGUMENT", "Removal cancelled");
        scope = selected.scope;
        hosts = selected.hosts;
        purge = selected.purge;
      }
      if (purge && options.yes !== true && options.interactive !== true) {
        throw new CerberpeckError(
          "INVALID_ARGUMENT",
          "--purge is irreversible and requires --yes",
        );
      }
      const cancelledProcesses = purge
        ? await cancelWorkspaceProcesses(path.resolve(globals.workspace))
        : 0;
      const result = await uninstall({
        scope,
        workspace: path.resolve(globals.workspace),
        ...(hosts ? {hosts} : {}),
        ...(process.env.CERBERPECK_HOME ? {home: process.env.CERBERPECK_HOME} : {}),
        ...(process.env.XDG_DATA_HOME ? {xdgDataHome: process.env.XDG_DATA_HOME} : {}),
        keepCli: options.keepCli === true,
        purge,
      });
      output("uninstall", {...result, cancelled_processes: cancelledProcesses}, globals.json);
    },
  );

program
  .command("doctor")
  .description("diagnose the current Cerberpeck installation")
  .option("--scope <scope>", "workspace or global", parseScope, "workspace")
  .action(async (options: {scope: InstallScope}) => {
    const globals = globalOptions();
    const checks = await doctor({
      scope: options.scope,
      workspace: path.resolve(globals.workspace),
      ...(process.env.CERBERPECK_HOME ? {home: process.env.CERBERPECK_HOME} : {}),
      ...(process.env.XDG_DATA_HOME ? {xdgDataHome: process.env.XDG_DATA_HOME} : {}),
    });
    output("doctor", {checks}, globals.json);
    if (checks.some((check) => check.status === "error")) {
      process.exitCode = 3;
    }
  });

const session = program.command("session").description("low-level session workflow commands");

program
  .command("run")
  .description("run an autonomous iterative web improvement session")
  .requiredOption("--host <host>", "codex or claude", parseAgentHost)
  .option("--request <text>", "improvement goal")
  .option("--request-file <path>", "file containing the improvement goal")
  .option("--max-rounds <count>", "maximum challenger rounds", parseMaxRounds, 10)
  .option("--browser-executable <path>")
  .option("--host-executable <path>", "override host CLI, primarily for controlled automation")
  .action(async (options: {
    host: "codex" | "claude";
    request?: string;
    requestFile?: string;
    maxRounds: number;
    browserExecutable?: string;
    hostExecutable?: string;
  }) => {
    const globals = globalOptions();
    const workspace = path.resolve(globals.workspace);
    const request = options.request ?? (options.requestFile
      ? (await readFile(path.resolve(options.requestFile), "utf8")).trim()
      : undefined);
    if (!request) throw new CerberpeckError("INVALID_ARGUMENT", "Provide --request or --request-file");
    const now = new Date();
    const document = createSession({
      sessionId: createSessionId(now),
      workspace,
      request,
      host: options.host,
      maxRounds: options.maxRounds,
      now: now.toISOString(),
    });
    const created = await new SessionStore(workspace).create(document);
    await new WorkspaceDriver(workspace).snapshot(created.sessionId);
    const renderer = new RunProgressRenderer({
      sessionId: created.sessionId,
      maxRounds: options.maxRounds,
    });
    const completed = await runAutonomousSession({
      workspace,
      sessionId: created.sessionId,
      ...(process.argv[1] ? {cliExecutable: process.argv[1]} : {}),
      ...(options.browserExecutable ? {browserExecutable: path.resolve(options.browserExecutable)} : {}),
      ...(options.hostExecutable ? {hostExecutable: path.resolve(options.hostExecutable)} : {}),
      onEvent: (event) => globals.json ? outputRunEvent(event, true) : renderer.update(event),
    });
    if (globals.json) output("run", {session: completed}, true);
    else renderer.finish(completed);
  });

session
  .command("create")
  .requiredOption("--request <text>", "user improvement request")
  .option("--id <session-id>", "explicit session id for deterministic automation")
  .action(async (options: {request: string; id?: string}) => {
    const globals = globalOptions();
    const workspace = path.resolve(globals.workspace);
    const now = new Date();
    const document = createSession({
      sessionId: options.id ?? createSessionId(now),
      workspace,
      request: options.request,
      now: now.toISOString(),
    });
    const created = await new SessionStore(workspace).create(document);
    output("session.create", {session: created}, globals.json);
  });

session
  .command("inspect")
  .requiredOption("--id <session-id>")
  .action(async (options: {id: string}) => {
    const globals = globalOptions();
    const read = await store(globals).read(options.id);
    output("session.inspect", {session: read.session, source: read.source}, globals.json);
  });

session
  .command("next")
  .requiredOption("--id <session-id>")
  .option("--max-actions <count>", "maximum actions to return", parsePositiveInteger, 4)
  .action(async (options: {id: string; maxActions: number}) => {
    const globals = globalOptions();
    const read = await store(globals).read(options.id);
    const actions = getNextActions(read.session, options.maxActions);
    output(
      "session.next",
      {session_id: options.id, revision: read.session.revision, actions},
      globals.json,
    );
  });

session
  .command("submit")
  .requiredOption("--id <session-id>")
  .requiredOption("--action <action-id>")
  .requiredOption("--attempt <number>", "action attempt", parsePositiveInteger)
  .requiredOption("--result <path>", "JSON result file")
  .action(
    async (options: {id: string; action: string; attempt: number; result: string}) => {
      const globals = globalOptions();
      const result = await readJson(options.result);
      const updated = await store(globals).update(options.id, (current) => {
        const outcome = submitActionResult({
          session: current,
          actionId: options.action,
          attempt: options.attempt,
          result,
          now: new Date().toISOString(),
        });
        return {
          session: outcome.session,
          value: {duplicate: outcome.duplicate},
          changed: outcome.changed,
        };
      });
      output(
        "session.submit",
        {
          session_id: options.id,
          revision: updated.session.revision,
          status: updated.session.status,
          duplicate: updated.value.duplicate,
        },
        globals.json,
      );
    },
  );

session
  .command("fail")
  .requiredOption("--id <session-id>")
  .requiredOption("--action <action-id>")
  .requiredOption("--attempt <number>", "action attempt", parsePositiveInteger)
  .requiredOption("--message <text>")
  .option("--terminal", "mark the failure as non-recoverable")
  .action(
    async (options: {
      id: string;
      action: string;
      attempt: number;
      message: string;
      terminal?: boolean;
    }) => {
      const globals = globalOptions();
      const updated = await store(globals).update(options.id, (current) => {
        const outcome = failAction({
          session: current,
          actionId: options.action,
          attempt: options.attempt,
          message: options.message,
          recoverable: options.terminal !== true,
          now: new Date().toISOString(),
        });
        return {session: outcome.session, value: {}, changed: outcome.changed};
      });
      const action = updated.session.actions.find((candidate) => candidate.actionId === options.action);
      output(
        "session.fail",
        {
          session_id: options.id,
          revision: updated.session.revision,
          status: updated.session.status,
          action,
        },
        globals.json,
      );
    },
  );

session
  .command("recover")
  .requiredOption("--id <session-id>")
  .action(async (options: {id: string}) => {
    const globals = globalOptions();
    const recovered = await store(globals).recover(options.id);
    output("session.recover", {session: recovered}, globals.json);
  });

const sessions = program.command("sessions").description("inspect workspace sessions");

sessions.command("list").action(async () => {
  const globals = globalOptions();
  const documents = await store(globals).list();
  output(
    "sessions.list",
    {
      sessions: documents.map((document) => ({
        session_id: document.sessionId,
        status: document.status,
        revision: document.revision,
        request: document.request,
        updated_at: document.updatedAt,
      })),
    },
    globals.json,
  );
});

sessions
  .command("show")
  .argument("<session-id>")
  .action(async (sessionId: string) => {
    const globals = globalOptions();
    const read = await store(globals).read(sessionId);
    output("sessions.show", {session: read.session, source: read.source}, globals.json);
  });

sessions
  .command("resume")
  .argument("<session-id>")
  .option("--browser-executable <path>")
  .option("--host-executable <path>")
  .action(async (sessionId: string, options: {browserExecutable?: string; hostExecutable?: string}) => {
    const globals = globalOptions();
    const current = (await store(globals).read(sessionId)).session;
    const renderer = new RunProgressRenderer({
      sessionId,
      maxRounds: current.experiment?.maxRounds ?? 10,
      currentRound: current.experiment?.round ?? 0,
    });
    const completed = await runAutonomousSession({
      workspace: path.resolve(globals.workspace),
      sessionId,
      ...(process.argv[1] ? {cliExecutable: process.argv[1]} : {}),
      ...(options.browserExecutable ? {browserExecutable: path.resolve(options.browserExecutable)} : {}),
      ...(options.hostExecutable ? {hostExecutable: path.resolve(options.hostExecutable)} : {}),
      onEvent: (event) => globals.json ? outputRunEvent(event, true) : renderer.update(event),
    });
    if (globals.json) output("sessions.resume", {session: completed}, true);
    else renderer.finish(completed);
  });

sessions
  .command("cancel")
  .argument("<session-id>")
  .action(async (sessionId: string) => {
    const globals = globalOptions();
    await store(globals).read(sessionId);
    const cancelledProcesses = await cancelSessionProcesses(path.resolve(globals.workspace), sessionId);
    await setSessionStatus(globals, sessionId, "cancelled");
    output("sessions.cancel", {session_id: sessionId, cancelled_processes: cancelledProcesses}, globals.json);
  });

program
  .command("report")
  .argument("<session-id>")
  .action(async (sessionId: string) => {
    const globals = globalOptions();
    await store(globals).read(sessionId);
    const report = await readFile(path.join(path.resolve(globals.workspace), ".cerberpeck", "sessions", sessionId, "report.md"), "utf8");
    if (globals.json) output("report", {session_id: sessionId, report}, true);
    else process.stdout.write(report);
  });

const candidate = program.command("candidate").description("manage isolated candidate workspaces");

candidate
  .command("snapshot")
  .requiredOption("--session <session-id>")
  .action(async (options: {session: string}) => {
    const globals = globalOptions();
    await store(globals).read(options.session);
    const result = await new WorkspaceDriver(path.resolve(globals.workspace)).snapshot(options.session);
    output("candidate.snapshot", {session_id: options.session, ...result}, globals.json);
  });

candidate
  .command("create")
  .requiredOption("--session <session-id>")
  .requiredOption("--candidate <candidate-id>")
  .option("--from <candidate-id>", "start from another candidate instead of baseline")
  .action(async (options: {session: string; candidate: string; from?: string}) => {
    const globals = globalOptions();
    await store(globals).read(options.session);
    const result = await new WorkspaceDriver(path.resolve(globals.workspace)).createCandidate(
      options.session,
      options.candidate,
      options.from ? {fromCandidate: options.from} : {},
    );
    output("candidate.create", {candidate: result}, globals.json);
  });

candidate
  .command("diff")
  .requiredOption("--session <session-id>")
  .requiredOption("--candidate <candidate-id>")
  .action(async (options: {session: string; candidate: string}) => {
    const globals = globalOptions();
    const result = await new WorkspaceDriver(path.resolve(globals.workspace)).diffCandidate(
      options.session,
      options.candidate,
    );
    output("candidate.diff", result, globals.json);
  });

candidate
  .command("apply")
  .requiredOption("--session <session-id>")
  .requiredOption("--candidate <candidate-id>")
  .action(async (options: {session: string; candidate: string}) => {
    const globals = globalOptions();
    await store(globals).read(options.session);
    const result = await new ApplyManager(path.resolve(globals.workspace)).apply(
      options.session,
      options.candidate,
    );
    await setSessionStatus(globals, options.session, "completed");
    output("candidate.apply", result, globals.json);
  });

program
  .command("undo")
  .description("restore all paths touched by an applied session")
  .argument("[session-id]")
  .action(async (sessionId?: string) => {
    const globals = globalOptions();
    const manager = new ApplyManager(path.resolve(globals.workspace));
    let selected = sessionId;
    if (!selected) {
      try {
        selected = await manager.latestUndoableSession();
      } catch {
        selected = (await store(globals).list())[0]?.sessionId;
      }
    }
    if (!selected) throw new WorkspaceError("TRANSACTION_INVALID", "No session found to undo");
    let transaction: unknown = null;
    let cleanedProcesses = 0;
    if (await manager.hasTransaction(selected)) {
      transaction = await manager.undo(selected);
    } else {
      cleanedProcesses = await cancelSessionProcesses(path.resolve(globals.workspace), selected);
    }
    await setSessionStatus(globals, selected, "undone");
    output("undo", {transaction, cleaned_processes: cleanedProcesses}, globals.json);
  });

program
  .command("redo")
  .description("restore the state captured immediately before undo")
  .argument("<session-id>")
  .action(async (sessionId: string) => {
    const globals = globalOptions();
    const transaction = await new ApplyManager(path.resolve(globals.workspace)).redo(sessionId);
    await setSessionStatus(globals, sessionId, "completed");
    output("redo", {transaction}, globals.json);
  });

program
  .command("capture")
  .description("start a candidate web service and capture desktop/mobile evidence")
  .requiredOption("--session <session-id>")
  .requiredOption("--candidate <candidate-id>")
  .option("--route <path...>", "routes to capture")
  .option("--journey <json-path>", "restricted journey JSON")
  .option("--browser-executable <path>", "system Chromium, Chrome, or Edge executable")
  .option("--command <executable>", "explicit local development server executable")
  .option("--arg <value...>", "arguments for --command")
  .option("--port <number>", "local server port", parsePort)
  .action(async (options: {
    session: string;
    candidate: string;
    route?: string[];
    journey?: string;
    browserExecutable?: string;
    command?: string;
    arg?: string[];
    port?: number;
  }) => {
    const globals = globalOptions();
    await store(globals).read(options.session);
    const workspace = path.resolve(globals.workspace);
    const driver = new WorkspaceDriver(workspace);
    const selected = await driver.readCandidate(options.session, options.candidate);
    const routes = options.route ?? ["/"];
    const recipes = await detectRunRecipes({
      cwd: selected.candidatePath,
      cliExecutable: process.argv[1] ?? "cerberpeck",
      ...(options.port ? {port: options.port} : {}),
      ...(options.command ? {command: options.command} : {}),
      ...(options.arg ? {args: options.arg} : {}),
      route: routes[0] ?? "/",
    });
    const journey = options.journey ? await readJourney(path.resolve(options.journey)) : undefined;
    const artifactRoot = path.join(
      workspace,
      ".cerberpeck",
      "sessions",
      options.session,
      "candidates",
      options.candidate,
      "artifacts",
    );
    let lastError: unknown;
    for (const detected of recipes) {
      const recipe = RunRecipeSchema.parse({...detected, routes});
      try {
        const result = await captureWeb({
          recipe,
          artifactRoot,
          ...(options.browserExecutable ? {browserExecutable: path.resolve(options.browserExecutable)} : {}),
          ...(journey ? {journey} : {}),
        });
        await writeJsonFile(
          path.join(workspace, ".cerberpeck", "sessions", options.session, "run-recipe.json"),
          recipe,
        );
        output("capture", result, globals.json);
        if (!result.gatesPassed) process.exitCode = 6;
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  });

program
  .command("__serve-static", {hidden: true})
  .requiredOption("--root <path>")
  .requiredOption("--port <number>", "local port", parsePort)
  .action(async (options: {root: string; port: number}) => {
    await serveStatic({root: path.resolve(options.root), port: options.port});
  });

program.exitOverride();
void program.parseAsync(process.argv).catch(handleError);

function globalOptions(): GlobalOptions {
  return program.opts<GlobalOptions>();
}

async function runInstall(options: InstallCommandOptions, command: "install" | "update"): Promise<void> {
  const globals = globalOptions();
  const workspace = path.resolve(globals.workspace);
  let scope = options.scope ?? "workspace";
  const targetOptions = {
    workspace,
    ...(process.env.CERBERPECK_HOME ? {home: process.env.CERBERPECK_HOME} : {}),
    ...(process.env.XDG_DATA_HOME ? {xdgDataHome: process.env.XDG_DATA_HOME} : {}),
  };
  let previous = command === "update"
    ? await readManifest(resolveInstallTarget({scope, ...targetOptions}).manifestPath)
    : undefined;
  if (command === "update" && !previous && options.scope === undefined) {
    const globalTarget = resolveInstallTarget({scope: "global", ...targetOptions});
    previous = await readManifest(globalTarget.manifestPath);
    if (previous) {
      scope = "global";
    }
  }
  let hosts = options.hosts ?? previous?.hosts ?? (await detectHosts({
    workspace,
    ...(process.env.CERBERPECK_HOME ? {home: process.env.CERBERPECK_HOME} : {}),
  }));
  let browser = await detectBrowser(options.browser ?? previous?.browser.mode);

  const hasExplicitSelection = options.scope !== undefined
    || options.hosts !== undefined
    || options.browser !== undefined;
  if (shouldPromptInstall({
    command,
    interactive: options.interactive === true,
    yes: options.yes === true,
    json: globals.json === true,
    hasExplicitSelection,
    stdinTty: process.stdin.isTTY === true,
    stdoutTty: process.stdout.isTTY === true,
  })) {
    const selected = await promptInstallOptions(
      {scope, hosts, browser: browser.mode},
      workspace,
    );
    if (selected.cancelled) {
      throw new CerberpeckError("INVALID_ARGUMENT", "Installation cancelled");
    }
    scope = selected.scope;
    hosts = selected.hosts;
    browser = await detectBrowser(selected.browser);
  }

  const cliSource = path.resolve(options.cliSource ?? process.argv[1] ?? "dist/cerberpeck.cjs");
  const skillsSource = path.resolve(options.assetsDir ?? path.join(path.dirname(cliSource), "skills"));
  const renderer = new InstallProgressRenderer();
  const installed = await install({
    scope,
    workspace,
    hosts,
    browser: browser.mode,
    version: VERSION,
    cliSource,
    skillsSource,
    ...(process.env.CERBERPECK_HOME ? {home: process.env.CERBERPECK_HOME} : {}),
    ...(process.env.XDG_DATA_HOME ? {xdgDataHome: process.env.XDG_DATA_HOME} : {}),
    force: options.force === true,
    modifyPath: options.modifyPath !== false,
    onProgress: (progress) => renderer.update(progress),
  });
  output(command, installed, globals.json);
}

function store(options: GlobalOptions): SessionStore {
  return new SessionStore(path.resolve(options.workspace));
}

async function setSessionStatus(
  options: GlobalOptions,
  sessionId: string,
  status: "completed" | "undone" | "cancelled",
): Promise<void> {
  await store(options).update(sessionId, (current) => {
    if (current.status === status) return {session: current, value: {}, changed: false};
    return {
      session: {...current, status, updatedAt: new Date().toISOString()},
      value: {},
      changed: true,
    };
  });
}

function output(command: string, result: unknown, json = false): void {
  if (json) {
    process.stdout.write(`${JSON.stringify({schema_version: 1, command, result})}\n`);
    return;
  }
  process.stdout.write(`${command}\n${JSON.stringify(result, null, 2)}\n`);
}

function outputRunEvent(event: unknown, json = false): void {
  const line = json ? JSON.stringify({schema_version: 1, event}) : `cerberpeck · ${JSON.stringify(event)}`;
  (json ? process.stdout : process.stderr).write(`${line}\n`);
}

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path.resolve(filePath), "utf8")) as unknown;
  } catch (error) {
    throw new CerberpeckError("INVALID_ARGUMENT", `Cannot read JSON result: ${filePath}`, {
      cause: error,
    });
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const {mkdir, rename, writeFile} = await import("node:fs/promises");
  const temporary = `${filePath}.${process.pid}.tmp`;
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  await rename(temporary, filePath);
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CerberpeckError("INVALID_ARGUMENT", `Expected a positive integer, got: ${value}`);
  }
  return parsed;
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new CerberpeckError("INVALID_ARGUMENT", `Expected a TCP port, got: ${value}`);
  }
  return parsed;
}

function parseMaxRounds(value: string): number {
  const parsed = parsePositiveInteger(value);
  if (parsed > 10) throw new CerberpeckError("INVALID_ARGUMENT", "max rounds cannot exceed 10");
  return parsed;
}

function parseAgentHost(value: string): "codex" | "claude" {
  if (value === "codex" || value === "claude") return value;
  throw new CerberpeckError("INVALID_ARGUMENT", `Unknown agent host: ${value}`);
}

function parseScope(value: string): InstallScope {
  if (value === "workspace" || value === "global") {
    return value;
  }
  throw new CerberpeckError("INVALID_ARGUMENT", `Unknown install scope: ${value}`);
}

function parseBrowser(value: string): BrowserMode {
  if (value === "system" || value === "managed" || value === "none") {
    return value;
  }
  throw new CerberpeckError("INVALID_ARGUMENT", `Unknown browser mode: ${value}`);
}

function parseHosts(value: string): InstallHost[] {
  const hosts = [...new Set(value.split(",").map((host) => host.trim()).filter(Boolean))];
  if (hosts.length === 0 || hosts.some((host) => host !== "codex" && host !== "claude")) {
    throw new CerberpeckError("INVALID_ARGUMENT", `Invalid hosts: ${value}`);
  }
  return hosts as InstallHost[];
}

function handleError(error: unknown): never {
  if (error instanceof WorkspaceError) {
    process.stderr.write(
      `${JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        recoverable: error.code === "WORKSPACE_CONFLICT",
      })}\n`,
    );
    process.exit(error.code === "WORKSPACE_CONFLICT" ? 7 : 3);
  }
  if (error instanceof InstallerError) {
    process.stderr.write(
      `${JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        recoverable: error.code === "INSTALL_CONFLICT",
      })}\n`,
    );
    process.exit(error.code === "INSTALL_CONFLICT" ? 7 : 3);
  }
  if (error instanceof CerberpeckError) {
    process.stderr.write(
      `${JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        recoverable: error.recoverable,
      })}\n`,
    );
    process.exit(exitCodeFor(error.code));
  }

  if (isCommanderExit(error)) {
    process.exit(error.exitCode);
  }

  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({code: "INTERNAL", message, details: {}, recoverable: false})}\n`,
  );
  process.exit(1);
}

function exitCodeFor(code: CerberpeckError["code"]): number {
  switch (code) {
    case "INVALID_ARGUMENT":
    case "SCHEMA_INVALID":
      return 2;
    case "NOT_FOUND":
    case "SESSION_CORRUPT":
      return 3;
    case "STATE_CONFLICT":
    case "LOCK_TIMEOUT":
      return 4;
  }
}

function isCommanderExit(error: unknown): error is {exitCode: number; code: string} {
  return (
    typeof error === "object" &&
    error !== null &&
    "exitCode" in error &&
    typeof error.exitCode === "number" &&
    "code" in error
  );
}

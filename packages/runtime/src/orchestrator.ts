import {createHash} from "node:crypto";
import {copyFile, mkdir, readdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {
  failAction,
  getNextActions,
  type Action,
  type Session,
  SessionStore,
  submitActionResult,
} from "@cerberpeck/core";
import {WorkspaceError} from "./errors.js";
import {captureSnapshot} from "./files.js";
import {runHostAction} from "./agents/runner.js";
import {ApplyManager} from "./transaction.js";
import {WorkspaceDriver} from "./workspace.js";
import {captureWeb, findSystemBrowser} from "./web/capture.js";
import {detectRunRecipes} from "./web/detector.js";

export interface RunEvent {
  type: "action.started" | "action.completed" | "action.failed" | "session.finalized";
  sessionId: string;
  actionId?: string;
  kind?: string;
  message: string;
}

export async function runAutonomousSession(input: {
  workspace: string;
  sessionId: string;
  browserExecutable?: string;
  cliExecutable?: string;
  hostExecutable?: string;
  onEvent?: (event: RunEvent) => void;
  captureCandidate?: (session: Session, candidateId: string) => Promise<{gatesPassed: boolean; artifacts: string[]}>;
}): Promise<Session> {
  const workspace = path.resolve(input.workspace);
  const store = new SessionStore(workspace);
  const driver = new WorkspaceDriver(workspace);
  let session = (await store.read(input.sessionId)).session;
  if (!session.experiment) throw new WorkspaceError("WORKSPACE_INVALID", "Session is not autonomous");

  while (session.workflow.cursor !== "finalizing" && session.workflow.cursor !== "complete") {
    const actions = getNextActions(session, 4);
    if (actions.length === 0) {
      throw new WorkspaceError("TRANSACTION_INVALID", `Workflow has no executable action at ${session.workflow.cursor}`);
    }
    await prepareWave(input, session, actions, driver);
    const outcomes = await Promise.all(actions.map(async (action) => {
      emit(input, session, action, "action.started", `${action.kind} started`);
      try {
        const result = action.kind === "candidate.validate"
          ? await validateCandidate(input, session, action)
          : await executeAgentAction(input, session, action, driver);
        emit(input, session, action, "action.completed", `${action.kind} completed`);
        return {action, result};
      } catch (error) {
        emit(input, session, action, "action.failed", errorMessage(error));
        return {action, error};
      }
    }));

    for (const outcome of outcomes) {
      const updated = await store.update(input.sessionId, (current) => {
        if ("error" in outcome) {
          const next = failAction({
            session: current,
            actionId: outcome.action.actionId,
            attempt: outcome.action.attempt,
            message: errorMessage(outcome.error),
            recoverable: true,
            now: new Date().toISOString(),
          });
          return {session: next.session, value: {}, changed: next.changed};
        }
        let next;
        try {
          next = submitActionResult({
            session: current,
            actionId: outcome.action.actionId,
            attempt: outcome.action.attempt,
            result: outcome.result,
            now: new Date().toISOString(),
          });
        } catch (error) {
          throw new WorkspaceError("WORKSPACE_INVALID", `Invalid ${outcome.action.kind} result`, {
            details: {actionId: outcome.action.actionId, result: outcome.result},
            cause: error,
          });
        }
        return {session: next.session, value: {}, changed: next.changed};
      });
      session = updated.session;
    }
    if (session.status === "failed") throw new WorkspaceError("WORKSPACE_INVALID", "An Agent action failed after retries");
  }

  if (session.workflow.cursor === "finalizing") {
    session = await finalizeSession(workspace, session, store);
    emit(input, session, undefined, "session.finalized", `Session completed: ${session.experiment?.stopReason ?? "complete"}`);
  }
  return session;
}

async function prepareWave(
  input: Parameters<typeof runAutonomousSession>[0],
  session: Session,
  actions: Action[],
  driver: WorkspaceDriver,
): Promise<void> {
  if (!actions.some((action) => action.kind === "review.baseline")) return;
  await ensureBaselineCandidate(session, driver);
  const artifactRoot = candidateArtifactRoot(session, "baseline");
  try {
    await readFile(path.join(artifactRoot, "capture.json"));
    return;
  } catch (error) {
    if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
  }
  const validation = input.captureCandidate
    ? await input.captureCandidate(session, "baseline")
    : await captureCandidateDefault(input, session, "baseline") as {gatesPassed: boolean; artifacts: string[]};
  await mkdir(artifactRoot, {recursive: true});
  await writeFile(path.join(artifactRoot, "baseline-validation.json"), `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  if (!validation.gatesPassed) {
    throw new WorkspaceError("WORKSPACE_INVALID", "Baseline web validation failed");
  }
}

async function executeAgentAction(
  input: Parameters<typeof runAutonomousSession>[0],
  session: Session,
  action: Action,
  driver: WorkspaceDriver,
): Promise<Record<string, unknown>> {
  const prepared = await prepareActionContext(session, action, driver);
  const actionDirectory = path.join(session.workspace, ".cerberpeck", "sessions", session.sessionId, "actions", action.actionId, `attempt-${action.attempt}`);
  const result = await runHostAction({
    host: session.experiment!.host,
    kind: action.kind,
    prompt: prepared.prompt,
    cwd: prepared.cwd,
    actionDirectory,
    writeAccess: action.execution.writeAccess,
    ...(input.hostExecutable ? {executable: input.hostExecutable} : {}),
  });
  await writeFile(path.join(actionDirectory, "host-metadata.json"), `${JSON.stringify({
    host: result.host,
    durationMs: result.durationMs,
    stderr: result.stderr.slice(-4_000),
  }, null, 2)}\n`, "utf8");
  return result.result;
}

async function prepareActionContext(
  session: Session,
  action: Action,
  driver: WorkspaceDriver,
): Promise<{cwd: string; prompt: string}> {
  const sessionRoot = path.join(session.workspace, ".cerberpeck", "sessions", session.sessionId);
  const basePrompt = [
    "You are one isolated Cerberpeck action. Do not start Cerberpeck or delegate to subagents.",
    `User request: ${session.request}`,
    action.prompt,
    "Return only the requested structured result. Do not ask for confirmation.",
  ];
  if (action.kind === "contract.create") {
    basePrompt.push(`Project profile:\n${JSON.stringify(findAction(session, "project.profile")?.result, null, 2)}`);
  }
  if (action.kind === "panel.create") {
    basePrompt.push(`Evaluation contract:\n${JSON.stringify(findAction(session, "contract.create")?.result, null, 2)}`);
    basePrompt.push("Use 3 experts and 3 customers by default; expand only when materially necessary. Customers may be empty only for a truly expert-only product.");
  }
  if (action.kind === "candidate.build") {
    const candidateId = action.candidateId!;
    try {
      await driver.readCandidate(session.sessionId, candidateId);
    } catch {
      await driver.createCandidate(session.sessionId, candidateId, {
        fromCandidate: session.experiment!.championCandidateId,
      });
    }
    const candidate = await driver.readCandidate(session.sessionId, candidateId);
    const synthesis = findAction(session, "synthesis.create", action.round)?.result;
    basePrompt.push(`Improvement hypothesis:\n${JSON.stringify(synthesis, null, 2)}`);
    basePrompt.push("Edit the files in the current isolated workspace, run relevant local checks, and report changed files.");
    return {cwd: candidate.candidatePath, prompt: basePrompt.join("\n\n")};
  }
  if (action.kind === "review.baseline") {
    await ensureBaselineCandidate(session, driver);
    const bundle = await createBaselineBundle(session, action);
    basePrompt.push(`Act strictly as persona ${action.personaId}. Inspect only the files in this review bundle.`);
    basePrompt.push("Score from 1 (very poor) to 5 (excellent) in 0.5 steps and cite concrete visual evidence.");
    return {cwd: bundle, prompt: basePrompt.join("\n\n")};
  }
  if (action.kind === "review.comparison") {
    const bundle = await createComparisonBundle(session, action);
    basePrompt.push(`Act strictly as persona ${action.personaId}. A/B order is blinded; do not infer chronology.`);
    basePrompt.push("Scores run from 1 (very poor) to 5 (excellent) in 0.5 steps. Confidence runs from 1 (low) to 5 (high). Cite concrete evidence and identify regressions.");
    return {cwd: bundle, prompt: basePrompt.join("\n\n")};
  }
  if (action.kind === "synthesis.create" || action.kind === "decision.make") {
    const bundle = path.join(sessionRoot, "review-bundles", action.actionId);
    await mkdir(bundle, {recursive: true});
    let relevant: Array<Record<string, unknown>> = session.actions
      .filter((candidate) => candidate.status === "accepted")
      .filter((candidate) => action.kind === "synthesis.create"
        ? candidate.kind === "review.baseline" || candidate.kind === "review.comparison" || candidate.kind === "decision.make"
        : candidate.round === action.round && (candidate.kind === "review.comparison" || candidate.kind === "candidate.validate"))
      .map((candidate) => ({kind: candidate.kind, personaId: candidate.personaId, result: candidate.result}));
    if (action.kind === "decision.make") {
      relevant = await Promise.all(relevant.map(async (item) => {
        if (item.kind !== "review.comparison") return item;
        const comparison = session.actions.find((candidate) =>
          candidate.kind === "review.comparison" &&
          candidate.round === action.round &&
          candidate.personaId === item.personaId
        );
        if (!comparison) return item;
        const mappingPath = path.join(sessionRoot, "mappings", `${comparison.actionId}.json`);
        const mapping = JSON.parse(await readFile(mappingPath, "utf8")) as unknown;
        return {...item, privateMapping: mapping};
      }));
    }
    await writeFile(path.join(bundle, "evidence.json"), `${JSON.stringify(relevant, null, 2)}\n`, "utf8");
    basePrompt.push("Read evidence.json and preserve disagreements. Do not treat a simple score average as the decision.");
    if (action.kind === "decision.make") {
      basePrompt.push("Use each privateMapping to translate A/B preferences to champion/challenger before deciding.");
    }
    if (action.kind === "decision.make" && relevant.every((item) => item.kind !== "review.comparison")) {
      basePrompt.push("Objective validation failed, so reject the challenger.");
    }
    return {cwd: bundle, prompt: basePrompt.join("\n\n")};
  }
  return {cwd: session.workspace, prompt: basePrompt.join("\n\n")};
}

async function ensureBaselineCandidate(session: Session, driver: WorkspaceDriver): Promise<void> {
  try {
    await driver.readCandidate(session.sessionId, "baseline");
  } catch {
    await driver.createCandidate(session.sessionId, "baseline");
  }
}

async function validateCandidate(
  input: Parameters<typeof runAutonomousSession>[0],
  session: Session,
  action: Action,
): Promise<Record<string, unknown>> {
  const candidateId = action.candidateId!;
  if (input.captureCandidate) {
    const result = await input.captureCandidate(session, candidateId);
    return {gatesPassed: result.gatesPassed, summary: result.gatesPassed ? "All configured gates passed" : "Validation gates failed", artifacts: result.artifacts};
  }
  return captureCandidateDefault(input, session, candidateId);
}

async function captureCandidateDefault(
  input: Parameters<typeof runAutonomousSession>[0],
  session: Session,
  candidateId: string,
): Promise<Record<string, unknown>> {
  const driver = new WorkspaceDriver(session.workspace);
  const candidate = await driver.readCandidate(session.sessionId, candidateId);
  const artifactRoot = candidateArtifactRoot(session, candidateId);
  const recipes = await detectRunRecipes({
    cwd: candidate.candidatePath,
    cliExecutable: input.cliExecutable ?? process.argv[1] ?? "cerberpeck",
  });
  const executable = input.browserExecutable ?? await findSystemBrowser();
  let lastError: unknown;
  for (const recipe of recipes) {
    try {
      const capture = await captureWeb({
        recipe,
        artifactRoot,
        ...(executable ? {browserExecutable: executable} : {}),
      });
      return {
        gatesPassed: capture.gatesPassed,
        summary: capture.gatesPassed ? "All configured gates passed" : "Browser diagnostics failed",
        artifacts: capture.artifacts.map((artifact) => artifact.path),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function createBaselineBundle(session: Session, action: Action): Promise<string> {
  const bundle = bundleRoot(session, action);
  await mkdir(bundle, {recursive: true});
  await copyReviewVersion(session, "baseline", bundle);
  await writeContext(session, action, bundle);
  return bundle;
}

async function createComparisonBundle(session: Session, action: Action): Promise<string> {
  const bundle = bundleRoot(session, action);
  await mkdir(bundle, {recursive: true});
  const challenger = action.candidateId!;
  const champion = session.experiment!.championCandidateId;
  const swap = createHash("sha256").update(`${session.sessionId}:${action.round}:${action.personaId}`).digest()[0]! % 2 === 1;
  const mapping = swap ? {A: challenger, B: champion} : {A: champion, B: challenger};
  await copyReviewVersion(session, mapping.A, path.join(bundle, "A"));
  await copyReviewVersion(session, mapping.B, path.join(bundle, "B"));
  await writeContext(session, action, bundle);
  const privateRoot = path.join(session.workspace, ".cerberpeck", "sessions", session.sessionId, "mappings");
  await mkdir(privateRoot, {recursive: true});
  await writeFile(path.join(privateRoot, `${action.actionId}.json`), `${JSON.stringify(mapping, null, 2)}\n`, "utf8");
  return bundle;
}

async function writeContext(session: Session, action: Action, bundle: string): Promise<void> {
  const panel = findAction(session, "panel.create")?.result as {experts?: unknown[]; customers?: unknown[]} | undefined;
  const personas = [...(panel?.experts ?? []), ...(panel?.customers ?? [])];
  const persona = personas.find((item) => typeof item === "object" && item !== null && (item as {id?: string}).id === action.personaId) ?? action.personaId;
  await writeFile(path.join(bundle, "context.json"), `${JSON.stringify({
    request: session.request,
    contract: findAction(session, "contract.create")?.result,
    persona,
  }, null, 2)}\n`, "utf8");
}

async function copyReviewArtifacts(source: string, target: string): Promise<void> {
  try {
    await mkdir(target, {recursive: true});
    for (const entry of await readdir(source, {withFileTypes: true})) {
      if (entry.isFile() && entry.name.endsWith(".png")) {
        await copyFile(path.join(source, entry.name), path.join(target, entry.name));
      }
    }
    try {
      const capture = JSON.parse(await readFile(path.join(source, "capture.json"), "utf8")) as {
        consoleErrors?: unknown; networkErrors?: unknown; gatesPassed?: unknown;
      };
      await writeFile(path.join(target, "validation.json"), `${JSON.stringify({
        gatesPassed: capture.gatesPassed,
        consoleErrors: capture.consoleErrors,
        networkErrors: capture.networkErrors,
      }, null, 2)}\n`, "utf8");
    } catch (error) {
      if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
    }
  } catch (error) {
    if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
  }
}

async function copyReviewVersion(session: Session, candidateId: string, target: string): Promise<void> {
  const candidate = await new WorkspaceDriver(session.workspace).readCandidate(session.sessionId, candidateId);
  await copyReviewArtifacts(candidateArtifactRoot(session, candidateId), path.join(target, "artifacts"));
  await captureSnapshot(candidate.candidatePath, path.join(target, "source"));
}

async function finalizeSession(workspace: string, session: Session, store: SessionStore): Promise<Session> {
  const champion = session.experiment!.championCandidateId;
  const finalDiff = champion === "baseline"
    ? {added: [] as string[], modified: [] as string[], deleted: [] as string[]}
    : await new WorkspaceDriver(workspace).diffCandidate(session.sessionId, champion);
  if (champion !== "baseline") {
    await new ApplyManager(workspace).apply(session.sessionId, champion);
  }
  const reportPath = path.join(workspace, ".cerberpeck", "sessions", session.sessionId, "report.md");
  const contract = findAction(session, "contract.create")?.result;
  const panel = findAction(session, "panel.create")?.result;
  const roundSections: string[] = [];
  for (let round = 1; round <= session.experiment!.round; round += 1) {
    const synthesis = findAction(session, "synthesis.create", round)?.result;
    const build = findAction(session, "candidate.build", round)?.result;
    const validation = findAction(session, "candidate.validate", round)?.result;
    const decision = findAction(session, "decision.make", round)?.result;
    roundSections.push([
      `### Round ${round}`,
      "",
      `- Hypothesis: ${String(synthesis?.title ?? "none")}`,
      `- Build: ${String(build?.summary ?? "not built")}`,
      `- Validation: ${String(validation?.summary ?? "not run")}`,
      `- Decision: ${String(decision?.decision ?? "not reached")} — ${String(decision?.summary ?? "")}`,
      "",
    ].join("\n"));
  }
  await writeFile(reportPath, [
    `# Cerberpeck Session ${session.sessionId}`,
    "",
    "## Goal",
    "",
    session.request,
    "",
    "## Evaluation contract",
    "",
    `Primary outcome: ${String(contract?.primaryOutcome ?? "not recorded")}`,
    "",
    "```json",
    JSON.stringify(contract, null, 2),
    "```",
    "",
    "## Evaluation panel",
    "",
    "```json",
    JSON.stringify(panel, null, 2),
    "```",
    "",
    "## Experiment rounds",
    "",
    ...roundSections,
    "## Final result",
    "",
    `- Host: ${session.experiment!.host}`,
    `- Final champion: ${champion}`,
    `- Rounds attempted: ${session.experiment!.round}`,
    `- Stop reason: ${session.experiment!.stopReason ?? "completed"}`,
    `- Added: ${finalDiff.added.join(", ") || "none"}`,
    `- Modified: ${finalDiff.modified.join(", ") || "none"}`,
    `- Deleted: ${finalDiff.deleted.join(", ") || "none"}`,
    "",
    "### Evidence",
    "",
    champion === "baseline"
      ? "Baseline remained the champion."
      : `- [Desktop capture](candidates/${champion}/artifacts/desktop-root.png)\n- [Mobile capture](candidates/${champion}/artifacts/mobile-root.png)`,
    "",
    champion === "baseline" ? "No candidate was applied." : `Undo with \`cerberpeck undo ${session.sessionId}\`.`,
    "",
  ].join("\n"), "utf8");
  const updated = await store.update(session.sessionId, (current) => ({
    session: {
      ...current,
      status: "completed" as const,
      workflow: {cursor: "complete" as const},
      updatedAt: new Date().toISOString(),
    },
    value: {},
    changed: current.status !== "completed" || current.workflow.cursor !== "complete",
  }));
  return updated.session;
}

function findAction(session: Session, kind: Action["kind"], round?: number): Action | undefined {
  return [...session.actions].reverse().find((action) => action.kind === kind && (round === undefined || action.round === round));
}

function candidateArtifactRoot(session: Session, candidateId: string): string {
  return path.join(session.workspace, ".cerberpeck", "sessions", session.sessionId, "candidates", candidateId, "artifacts");
}

function bundleRoot(session: Session, action: Action): string {
  return path.join(session.workspace, ".cerberpeck", "sessions", session.sessionId, "review-bundles", action.actionId);
}

function emit(
  input: Parameters<typeof runAutonomousSession>[0],
  session: Session,
  action: Action | undefined,
  type: RunEvent["type"],
  message: string,
): void {
  input.onEvent?.({
    type,
    sessionId: session.sessionId,
    ...(action ? {actionId: action.actionId, kind: action.kind} : {}),
    message,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

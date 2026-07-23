import {CerberpeckError} from "./errors.js";
import {
  ActionResultSchemas,
  type Action,
  type ActionKind,
  type Session,
  SessionSchema,
  WORKFLOW_PROTOCOL_VERSION,
} from "./schemas.js";

type Clock = () => string;

const actionDefinitions: Record<
  ActionKind,
  Pick<Action, "role" | "prompt" | "outputSchema">
> = {
  "project.profile": {
    role: "profiler",
    prompt: "Inspect the workspace and return a concise project profile.",
    outputSchema: "project-profile-v1",
  },
  "contract.create": {
    role: "contractor",
    prompt: "Create an evaluation contract from the request and project profile.",
    outputSchema: "evaluation-contract-v1",
  },
  "panel.create": {
    role: "panelist",
    prompt: "Create a distinct expert and customer evaluation panel.",
    outputSchema: "evaluation-panel-v1",
  },
  "review.baseline": {
    role: "reviewer",
    prompt: "Review the baseline against the evaluation contract.",
    outputSchema: "baseline-review-v1",
  },
  "synthesis.create": {
    role: "synthesizer",
    prompt: "Synthesize the independent evidence into one coherent improvement hypothesis.",
    outputSchema: "synthesis-v1",
  },
  "candidate.build": {
    role: "builder",
    prompt: "Implement only the selected improvement hypothesis in this isolated candidate.",
    outputSchema: "candidate-build-v1",
  },
  "candidate.validate": {
    role: "validator",
    prompt: "Run objective web validation for the isolated candidate.",
    outputSchema: "candidate-validation-v1",
  },
  "review.comparison": {
    role: "reviewer",
    prompt: "Blindly compare versions A and B using only the supplied evaluation bundle.",
    outputSchema: "comparison-review-v1",
  },
  "decision.make": {
    role: "decision-maker",
    prompt: "Decide whether to promote or reject the challenger from evidence, not score totals alone.",
    outputSchema: "decision-v1",
  },
};

function actionId(
  sessionId: string,
  kind: ActionKind,
  options: {round?: number; personaId?: string} = {},
): string {
  const suffix = [options.round ? `r${options.round}` : undefined, options.personaId]
    .filter(Boolean)
    .join("_");
  return `act_${sessionId.slice(3)}_${kind.replaceAll(".", "_")}${suffix ? `_${suffix}` : ""}`;
}

function createAction(
  sessionId: string,
  kind: ActionKind,
  dependencies: string[] = [],
  options: {round?: number; personaId?: string; candidateId?: string; writeAccess?: boolean; parallelGroup?: string} = {},
): Action {
  return {
    protocolVersion: WORKFLOW_PROTOCOL_VERSION,
    actionId: actionId(sessionId, kind, options),
    sessionId,
    kind,
    role: actionDefinitions[kind].role,
    status: "pending",
    attempt: 1,
    dependencies,
    execution: {
      context: "isolated-process",
      writeAccess: options.writeAccess ?? false,
      ...(options.parallelGroup ? {parallelGroup: options.parallelGroup} : {}),
    },
    prompt: actionDefinitions[kind].prompt,
    outputSchema: actionDefinitions[kind].outputSchema,
    ...(options.round ? {round: options.round} : {}),
    ...(options.personaId ? {personaId: options.personaId} : {}),
    ...(options.candidateId ? {candidateId: options.candidateId} : {}),
  };
}

export function createSession(input: {
  sessionId: string;
  workspace: string;
  request: string;
  now: string;
  host?: "codex" | "claude";
  maxRounds?: number;
}): Session {
  return SessionSchema.parse({
    schemaVersion: 1,
    protocolVersion: WORKFLOW_PROTOCOL_VERSION,
    sessionId: input.sessionId,
    revision: 1,
    workspace: input.workspace,
    request: input.request,
    status: "profiling",
    workflow: {cursor: "profile"},
    actions: [createAction(input.sessionId, "project.profile")],
    ...(input.host ? {
      experiment: {
        host: input.host,
        maxRounds: input.maxRounds ?? 10,
        maxConsecutiveRejections: 3,
        round: 0,
        consecutiveRejections: 0,
        championCandidateId: "baseline",
      },
    } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function getNextActions(session: Session, maxActions = 4): Action[] {
  if (!Number.isInteger(maxActions) || maxActions < 1) {
    throw new CerberpeckError("INVALID_ARGUMENT", "maxActions must be a positive integer");
  }

  const accepted = new Set(
    session.actions.filter((action) => action.status === "accepted").map((action) => action.actionId),
  );

  return session.actions
    .filter(
      (action) =>
        action.status === "pending" &&
        action.dependencies.every((dependency) => accepted.has(dependency)),
    )
    .slice(0, maxActions);
}

export function submitActionResult(input: {
  session: Session;
  actionId: string;
  attempt: number;
  result: unknown;
  now: string;
}): {session: Session; changed: boolean; duplicate: boolean} {
  const session = structuredClone(input.session);
  const action = session.actions.find((candidate) => candidate.actionId === input.actionId);
  if (!action) {
    throw new CerberpeckError("NOT_FOUND", `Action not found: ${input.actionId}`);
  }
  if (action.attempt !== input.attempt) {
    throw new CerberpeckError("STATE_CONFLICT", "Action attempt does not match", {
      details: {expected: action.attempt, received: input.attempt},
      recoverable: true,
    });
  }
  if (action.status === "accepted") {
    return {session: input.session, changed: false, duplicate: true};
  }
  if (action.status !== "pending" && action.status !== "submitted") {
    throw new CerberpeckError("STATE_CONFLICT", `Action is ${action.status}, not pending`, {
      recoverable: action.status === "failed",
    });
  }

  const parsed = ActionResultSchemas[action.kind].safeParse(input.result);
  if (!parsed.success) {
    throw new CerberpeckError("SCHEMA_INVALID", "Action result does not match its schema", {
      details: {issues: parsed.error.issues},
      recoverable: true,
    });
  }

  action.status = "accepted";
  action.result = parsed.data as Record<string, unknown>;
  delete action.lastError;
  advanceWorkflow(session);
  session.updatedAt = input.now;
  return {session: SessionSchema.parse(session), changed: true, duplicate: false};
}

export function failAction(input: {
  session: Session;
  actionId: string;
  attempt: number;
  message: string;
  recoverable: boolean;
  now: string;
}): {session: Session; changed: boolean} {
  const session = structuredClone(input.session);
  const action = session.actions.find((candidate) => candidate.actionId === input.actionId);
  if (!action) {
    throw new CerberpeckError("NOT_FOUND", `Action not found: ${input.actionId}`);
  }
  if (action.attempt !== input.attempt || action.status === "accepted") {
    throw new CerberpeckError("STATE_CONFLICT", "Action cannot be failed in its current state", {
      recoverable: true,
    });
  }

  action.lastError = {
    message: input.message,
    recoverable: input.recoverable,
    at: input.now,
  };
  if (input.recoverable && action.attempt < 3) {
    action.attempt += 1;
    action.status = "pending";
  } else {
    action.status = "failed";
    session.status = "failed";
  }
  session.updatedAt = input.now;
  return {session: SessionSchema.parse(session), changed: true};
}

function advanceWorkflow(session: Session): void {
  const acceptedKinds = new Set(
    session.actions.filter((action) => action.status === "accepted").map((action) => action.kind),
  );

  if (session.workflow.cursor === "profile" && acceptedKinds.has("project.profile")) {
    const profileId = actionId(session.sessionId, "project.profile");
    session.actions.push(createAction(session.sessionId, "contract.create", [profileId]));
    session.workflow.cursor = "contract";
    session.status = "clarifying";
    return;
  }
  if (session.workflow.cursor === "contract" && acceptedKinds.has("contract.create")) {
    const contractId = actionId(session.sessionId, "contract.create");
    session.actions.push(createAction(session.sessionId, "panel.create", [contractId]));
    session.workflow.cursor = "panel";
    session.status = "contracted";
    return;
  }
  if (session.workflow.cursor === "panel" && acceptedKinds.has("panel.create")) {
    const panelId = actionId(session.sessionId, "panel.create");
    if (!session.experiment) {
      session.actions.push(createAction(session.sessionId, "review.baseline", [panelId]));
    } else {
      const panel = resultFor(session, "panel.create") as {experts: unknown[]; customers: unknown[]};
      for (const [index, persona] of [...panel.experts, ...panel.customers].entries()) {
        const personaId = typeof persona === "string" ? slug(persona, index) : String((persona as {id: string}).id);
        session.actions.push(createAction(session.sessionId, "review.baseline", [panelId], {
          personaId,
          parallelGroup: "baseline-reviews",
        }));
      }
    }
    session.workflow.cursor = "baseline-review";
    session.status = "baseline_reviewing";
    return;
  }
  if (session.workflow.cursor === "baseline-review") {
    const reviews = session.actions.filter((action) => action.kind === "review.baseline");
    if (reviews.length === 0 || reviews.some((action) => action.status !== "accepted")) return;
    if (!session.experiment) {
      session.workflow.cursor = "complete";
      session.status = "completed";
      return;
    }
    session.experiment.round = 1;
    session.actions.push(createAction(session.sessionId, "synthesis.create", reviews.map((action) => action.actionId), {round: 1}));
    session.workflow.cursor = "synthesis";
    session.status = "synthesizing";
    return;
  }
  if (!session.experiment) return;
  const round = session.experiment.round;
  if (session.workflow.cursor === "synthesis") {
    const synthesis = findRoundAction(session, "synthesis.create", round);
    if (synthesis?.status !== "accepted") return;
    if (synthesis.result?.stop === true) {
      finishExperiment(session, "no-meaningful-hypothesis");
      return;
    }
    const candidateId = `round-${round}`;
    session.actions.push(createAction(session.sessionId, "candidate.build", [synthesis.actionId], {
      round,
      candidateId,
      writeAccess: true,
    }));
    session.workflow.cursor = "build";
    session.status = "challenger_building";
    return;
  }
  if (session.workflow.cursor === "build") {
    const build = findRoundAction(session, "candidate.build", round);
    if (build?.status !== "accepted") return;
    session.actions.push(createAction(session.sessionId, "candidate.validate", [build.actionId], {
      round,
      ...(build.candidateId ? {candidateId: build.candidateId} : {}),
    }));
    session.workflow.cursor = "validate";
    session.status = "challenger_validating";
    return;
  }
  if (session.workflow.cursor === "validate") {
    const validation = findRoundAction(session, "candidate.validate", round);
    if (validation?.status !== "accepted") return;
    if (validation.result?.gatesPassed !== true) {
      session.actions.push(createAction(session.sessionId, "decision.make", [validation.actionId], {
        round,
        ...(validation.candidateId ? {candidateId: validation.candidateId} : {}),
      }));
      session.workflow.cursor = "decision";
      session.status = "deciding";
      return;
    }
    const personas = baselinePersonaIds(session);
    for (const personaId of personas) {
      session.actions.push(createAction(session.sessionId, "review.comparison", [validation.actionId], {
        round,
        personaId,
        ...(validation.candidateId ? {candidateId: validation.candidateId} : {}),
        parallelGroup: `round-${round}-comparison`,
      }));
    }
    session.workflow.cursor = "comparison-review";
    session.status = "comparison_reviewing";
    return;
  }
  if (session.workflow.cursor === "comparison-review") {
    const comparisons = session.actions.filter((action) => action.kind === "review.comparison" && action.round === round);
    if (comparisons.length === 0 || comparisons.some((action) => action.status !== "accepted")) return;
    session.actions.push(createAction(session.sessionId, "decision.make", comparisons.map((action) => action.actionId), {
      round,
      ...(comparisons[0]?.candidateId ? {candidateId: comparisons[0].candidateId} : {}),
    }));
    session.workflow.cursor = "decision";
    session.status = "deciding";
    return;
  }
  if (session.workflow.cursor === "decision") {
    const decision = findRoundAction(session, "decision.make", round);
    if (decision?.status !== "accepted") return;
    let choice = String(decision.result?.decision);
    const validation = findRoundAction(session, "candidate.validate", round);
    if (validation?.result?.gatesPassed === false && choice === "promote") {
      choice = "reject";
      const decisionSummary = String(decision.result?.summary ?? "");
      decision.result = {
        ...decision.result,
        decision: "reject",
        summary: `Promotion was mechanically rejected because objective gates failed. ${decisionSummary}`,
      };
    }
    if (choice === "promote" && decision.candidateId) {
      session.experiment.championCandidateId = decision.candidateId;
      session.experiment.consecutiveRejections = 0;
    } else {
      session.experiment.consecutiveRejections += 1;
    }
    if (choice === "stop") {
      finishExperiment(session, String(decision.result?.stopReason ?? "decision-stop"));
      return;
    }
    if (round >= session.experiment.maxRounds) {
      finishExperiment(session, "max-rounds");
      return;
    }
    if (session.experiment.consecutiveRejections >= session.experiment.maxConsecutiveRejections) {
      finishExperiment(session, "consecutive-rejections");
      return;
    }
    session.experiment.round += 1;
    session.actions.push(createAction(session.sessionId, "synthesis.create", [decision.actionId], {
      round: session.experiment.round,
    }));
    session.workflow.cursor = "synthesis";
    session.status = "synthesizing";
  }
}

function resultFor(session: Session, kind: ActionKind): Record<string, unknown> {
  const result = session.actions.find((action) => action.kind === kind)?.result;
  if (!result) throw new CerberpeckError("STATE_CONFLICT", `Missing result for ${kind}`);
  return result;
}

function findRoundAction(session: Session, kind: ActionKind, round: number): Action | undefined {
  return session.actions.find((action) => action.kind === kind && action.round === round);
}

function baselinePersonaIds(session: Session): string[] {
  return session.actions
    .filter((action) => action.kind === "review.baseline")
    .map((action) => action.personaId)
    .filter((value): value is string => Boolean(value));
}

function finishExperiment(session: Session, reason: string): void {
  if (!session.experiment) return;
  session.experiment.stopReason = reason;
  session.workflow.cursor = "finalizing";
  session.status = "finalizing";
}

function slug(value: string, index: number): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `persona-${index + 1}`;
}

export function defaultClock(): string {
  return new Date().toISOString();
}

export function createClock(now: Clock): Clock {
  return now;
}

import type {Session} from "@cerberpeck/core";
import type {RunEvent} from "@cerberpeck/runtime";

type RunActionStatus = "running" | "done" | "failed";

interface RunTuiAction {
  actionId: string;
  kind: string;
  status: RunActionStatus;
  message: string;
}

export interface RunTuiState {
  sessionId: string;
  maxRounds: number;
  currentRound: number;
  actions: RunTuiAction[];
  finalized: boolean;
}

const STAGES = [
  ["project.profile", "서비스와 실행 환경 분석"],
  ["contract.create", "목표 · 평가 기준 고정"],
  ["panel.create", "평가단 구성"],
  ["review.baseline", "초안 독립 비평"],
  ["synthesis.create", "개선 가설 합성"],
  ["candidate.build", "Challenger 구현"],
  ["candidate.validate", "브라우저 검증"],
  ["review.comparison", "블라인드 A/B 평가"],
  ["decision.make", "승격 판정"],
] as const;

export function createRunTuiState(input: {
  sessionId: string;
  maxRounds: number;
  currentRound?: number;
}): RunTuiState {
  return {
    sessionId: input.sessionId,
    maxRounds: input.maxRounds,
    currentRound: input.currentRound ?? 0,
    actions: [],
    finalized: false,
  };
}

export function reduceRunTui(state: RunTuiState, event: RunEvent): RunTuiState {
  if (event.type === "session.finalized") {
    return {...state, sessionId: event.sessionId, finalized: true};
  }
  if (!event.actionId || !event.kind) return state;

  const status: RunActionStatus = event.type === "action.started"
    ? "running"
    : event.type === "action.completed"
      ? "done"
      : "failed";
  const action: RunTuiAction = {
    actionId: event.actionId,
    kind: event.kind,
    status,
    message: event.message,
  };
  const existing = state.actions.findIndex((candidate) => candidate.actionId === event.actionId);
  const actions = [...state.actions];
  if (existing === -1) actions.push(action);
  else actions[existing] = action;
  const round = roundFromActionId(event.actionId);

  return {
    ...state,
    sessionId: event.sessionId,
    currentRound: Math.max(state.currentRound, round),
    actions,
  };
}

export function renderRunTui(state: RunTuiState): string {
  const complete = state.actions.filter((action) => action.status === "done").length;
  const running = state.actions.filter((action) => action.status === "running").length;
  const failed = state.actions.filter((action) => action.status === "failed").length;
  const lines = [
    `CERBERPECK  ·  ${state.sessionId}`,
    "세 머리로 보고, 한 부리로 쪼아, 더 나은 것만 남깁니다.",
    "",
  ];

  for (const [kind, label] of STAGES) {
    const actions = state.actions.filter((action) => action.kind === kind);
    const done = actions.filter((action) => action.status === "done").length;
    const active = actions.filter((action) => action.status === "running").length;
    const errors = actions.filter((action) => action.status === "failed").length;
    const marker = active > 0 ? "●" : errors > 0 ? "!" : actions.length > 0 && done === actions.length ? "✓" : "○";
    const progress = actions.length > 1 || kind.startsWith("review.")
      ? `  ${done} 완료${active > 0 ? ` · ${active} 실행 중` : ""}${errors > 0 ? ` · ${errors} 실패` : ""}`
      : "";
    lines.push(`${marker} ${label}${progress}`);
  }

  lines.push("");
  const round = state.currentRound === 0 ? "준비 중" : `Round ${state.currentRound} / ${state.maxRounds}`;
  lines.push(`${round}  ·  ${complete} actions 완료${running > 0 ? ` · ${running} 실행 중` : ""}${failed > 0 ? ` · ${failed} 실패` : ""}`);
  lines.push("원본은 최종 승격 전까지 변경되지 않습니다.");
  return lines.join("\n");
}

export function renderRunLine(event: RunEvent): string {
  if (event.type === "session.finalized") return `✓ 세션 완료 · ${event.message}`;
  const marker = event.type === "action.started" ? "●" : event.type === "action.completed" ? "✓" : "!";
  const label = STAGES.find(([kind]) => kind === event.kind)?.[1] ?? event.kind ?? "세션";
  const round = event.actionId ? roundFromActionId(event.actionId) : 0;
  return `${marker} ${round > 0 ? `Round ${round} · ` : ""}${label}${event.type === "action.failed" ? ` · ${event.message}` : ""}`;
}

export function renderRunSummary(session: Session): string {
  const experiment = session.experiment;
  const lines = [
    "",
    `✓ Cerberpeck 세션 완료 · ${session.sessionId}`,
    `  Champion  ${experiment?.championCandidateId ?? "baseline"}`,
    `  Rounds    ${experiment?.round ?? 0} / ${experiment?.maxRounds ?? 0}`,
    `  종료 이유  ${experiment?.stopReason ?? "complete"}`,
    `  보고서     .cerberpeck/sessions/${session.sessionId}/report.md`,
    "",
    "세션 전체 변경은 언제든 undo할 수 있습니다.",
  ];
  return lines.join("\n");
}

export function shouldUseRunTui(stderrTty: boolean, hosted: boolean): boolean {
  return stderrTty && !hosted;
}

export class RunProgressRenderer {
  private state: RunTuiState;
  private readonly interactive: boolean;
  private readonly write: (value: string) => void;

  constructor(input: {
    sessionId: string;
    maxRounds: number;
    currentRound?: number;
    interactive?: boolean;
    write?: (value: string) => void;
  }) {
    this.state = createRunTuiState(input);
    this.interactive = input.interactive
      ?? shouldUseRunTui(process.stderr.isTTY, process.env.CERBERPECK_HOSTED === "1");
    this.write = input.write ?? ((value) => process.stderr.write(value));
  }

  update(event: RunEvent): void {
    this.state = reduceRunTui(this.state, event);
    if (this.interactive) {
      this.write(`\u001b[2J\u001b[H${renderRunTui(this.state)}\n`);
      return;
    }
    this.write(`${renderRunLine(event)}\n`);
  }

  finish(session: Session): void {
    if (this.interactive) {
      this.write(`\u001b[2J\u001b[H${renderRunTui({...this.state, finalized: true})}\n`);
    }
    this.write(`${renderRunSummary(session)}\n`);
  }
}

function roundFromActionId(actionId: string): number {
  const match = /_r(\d+)(?:_|$)/.exec(actionId);
  return match ? Number(match[1]) : 0;
}

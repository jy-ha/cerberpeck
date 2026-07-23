import {describe, expect, it} from "vitest";
import type {RunEvent} from "@cerberpeck/runtime";
import {
  createRunTuiState,
  reduceRunTui,
  renderRunLine,
  renderRunTui,
  RunProgressRenderer,
  shouldUseRunTui,
} from "../../apps/cli/src/tui/run.js";

function event(
  type: RunEvent["type"],
  kind = "review.comparison",
  actionId = "act_demo_review_comparison_r2_customer",
): RunEvent {
  return {
    type,
    sessionId: "cp_demo",
    actionId,
    kind,
    message: `${kind} ${type}`,
  };
}

describe("run progress TUI", () => {
  it("uses full-screen output only in a direct terminal", () => {
    expect(shouldUseRunTui(true, false)).toBe(true);
    expect(shouldUseRunTui(true, true)).toBe(false);
    expect(shouldUseRunTui(false, false)).toBe(false);
  });

  it("reduces action events and derives the current round", () => {
    let state = createRunTuiState({sessionId: "cp_demo", maxRounds: 10});
    state = reduceRunTui(state, event("action.started"));
    expect(state.currentRound).toBe(2);
    expect(renderRunTui(state)).toContain("● 블라인드 A/B 평가");
    expect(renderRunTui(state)).toContain("Round 2 / 10");

    state = reduceRunTui(state, event("action.completed"));
    expect(renderRunTui(state)).toContain("✓ 블라인드 A/B 평가  1 완료");
  });

  it("renders concise non-TTY progress without ANSI controls", () => {
    const output: string[] = [];
    const renderer = new RunProgressRenderer({
      sessionId: "cp_demo",
      maxRounds: 10,
      interactive: false,
      write: (value) => output.push(value),
    });
    renderer.update(event("action.started", "candidate.build", "act_demo_candidate_build_r1"));
    expect(output.join("")).toContain("● Round 1 · Challenger 구현");
    expect(output.join("")).not.toContain("\u001b[2J");
  });

  it("keeps failed action details in line mode", () => {
    expect(renderRunLine(event("action.failed"))).toContain("review.comparison action.failed");
  });
});

import {describe, expect, it} from "vitest";
import {
  createSession,
  failAction,
  getNextActions,
  submitActionResult,
} from "../../packages/core/src/index.js";

const NOW = "2026-07-23T00:00:00.000Z";

function initialSession() {
  return createSession({
    sessionId: "cp_test_workflow",
    workspace: "/tmp/cerberpeck-test",
    request: "Improve this landing page",
    now: NOW,
  });
}

describe("workflow", () => {
  it("produces a deterministic minimal action sequence", () => {
    let session = initialSession();
    expect(getNextActions(session).map((action) => action.kind)).toEqual(["project.profile"]);

    session = submitActionResult({
      session,
      actionId: getNextActions(session)[0]!.actionId,
      attempt: 1,
      result: {summary: "Vite landing page", detectedFramework: "vite"},
      now: NOW,
    }).session;
    expect(getNextActions(session).map((action) => action.kind)).toEqual(["contract.create"]);

    session = submitActionResult({
      session,
      actionId: getNextActions(session)[0]!.actionId,
      attempt: 1,
      result: {primaryOutcome: "start trial", constraints: [], maxRounds: 10},
      now: NOW,
    }).session;
    expect(getNextActions(session).map((action) => action.kind)).toEqual(["panel.create"]);

    session = submitActionResult({
      session,
      actionId: getNextActions(session)[0]!.actionId,
      attempt: 1,
      result: {
        experts: ["ux", "frontend", "conversion"],
        customers: ["buyer", "user", "skeptic"],
      },
      now: NOW,
    }).session;
    expect(getNextActions(session).map((action) => action.kind)).toEqual(["review.baseline"]);

    session = submitActionResult({
      session,
      actionId: getNextActions(session)[0]!.actionId,
      attempt: 1,
      result: {summary: "Clear but generic", overallScore: 3.5},
      now: NOW,
    }).session;
    expect(session.status).toBe("completed");
    expect(getNextActions(session)).toEqual([]);
  });

  it("treats the same accepted attempt as an idempotent duplicate", () => {
    const session = initialSession();
    const action = getNextActions(session)[0]!;
    const first = submitActionResult({
      session,
      actionId: action.actionId,
      attempt: action.attempt,
      result: {summary: "Static site"},
      now: NOW,
    });
    const duplicate = submitActionResult({
      session: first.session,
      actionId: action.actionId,
      attempt: action.attempt,
      result: {summary: "Different duplicate payload"},
      now: NOW,
    });

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.changed).toBe(false);
    expect(duplicate.session).toBe(first.session);
  });

  it("requeues only a recoverable failed action with an incremented attempt", () => {
    const session = initialSession();
    const action = getNextActions(session)[0]!;
    const failed = failAction({
      session,
      actionId: action.actionId,
      attempt: action.attempt,
      message: "temporary host failure",
      recoverable: true,
      now: NOW,
    }).session;

    expect(failed.status).toBe("profiling");
    expect(getNextActions(failed)[0]).toMatchObject({attempt: 2, status: "pending"});
  });

  it("rejects a panel smaller than the default minimum", () => {
    let session = initialSession();
    session = submitActionResult({
      session,
      actionId: getNextActions(session)[0]!.actionId,
      attempt: 1,
      result: {summary: "Vite site"},
      now: NOW,
    }).session;
    session = submitActionResult({
      session,
      actionId: getNextActions(session)[0]!.actionId,
      attempt: 1,
      result: {primaryOutcome: "signup", constraints: []},
      now: NOW,
    }).session;

    expect(() =>
      submitActionResult({
        session,
        actionId: getNextActions(session)[0]!.actionId,
        attempt: 1,
        result: {experts: ["ux", "frontend"], customers: ["buyer"]},
        now: NOW,
      }),
    ).toThrow(/schema/i);
  });
});

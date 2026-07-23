import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  createSession,
  getNextActions,
  SessionStore,
  submitActionResult,
} from "../../packages/core/src/index.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => rm(workspace, {recursive: true, force: true})));
});

async function fixture() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "cerberpeck-store-"));
  workspaces.push(workspace);
  const store = new SessionStore(workspace);
  const session = createSession({
    sessionId: "cp_store_test",
    workspace,
    request: "Improve the app",
    now: "2026-07-23T00:00:00.000Z",
  });
  await store.create(session);
  return {workspace, store, session};
}

describe("SessionStore", () => {
  it("increments revisions and does not rewrite duplicate submissions", async () => {
    const {store, session} = await fixture();
    const action = getNextActions(session)[0]!;

    const first = await store.update(session.sessionId, (current) => {
      const outcome = submitActionResult({
        session: current,
        actionId: action.actionId,
        attempt: 1,
        result: {summary: "Vite app"},
        now: "2026-07-23T00:00:01.000Z",
      });
      return {session: outcome.session, value: outcome.duplicate, changed: outcome.changed};
    });
    expect(first.session.revision).toBe(2);

    const duplicate = await store.update(session.sessionId, (current) => {
      const outcome = submitActionResult({
        session: current,
        actionId: action.actionId,
        attempt: 1,
        result: {summary: "ignored"},
        now: "2026-07-23T00:00:02.000Z",
      });
      return {session: outcome.session, value: outcome.duplicate, changed: outcome.changed};
    });
    expect(duplicate.session.revision).toBe(2);
    expect(duplicate.value).toBe(true);
  });

  it("reads and restores the previous valid state when current state is corrupt", async () => {
    const {workspace, store, session} = await fixture();
    const action = getNextActions(session)[0]!;
    await store.update(session.sessionId, (current) => {
      const outcome = submitActionResult({
        session: current,
        actionId: action.actionId,
        attempt: 1,
        result: {summary: "Vite app"},
        now: "2026-07-23T00:00:01.000Z",
      });
      return {session: outcome.session, value: undefined, changed: true};
    });

    const statePath = path.join(
      workspace,
      ".cerberpeck",
      "sessions",
      session.sessionId,
      "session.json",
    );
    await writeFile(statePath, "{broken", "utf8");
    const fallback = await store.read(session.sessionId);
    expect(fallback.source).toBe("previous");
    expect(fallback.session.revision).toBe(1);

    await store.recover(session.sessionId);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({revision: 1});
  });

  it("rejects path traversal in session ids", async () => {
    const {store} = await fixture();
    await expect(store.read("../../outside")).rejects.toThrow(/invalid session id/i);
  });
});

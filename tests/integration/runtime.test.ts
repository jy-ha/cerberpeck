import {execFile} from "node:child_process";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {promisify} from "node:util";
import {afterEach, describe, expect, it} from "vitest";
import {
  ApplyManager,
  WorkspaceDriver,
  WorkspaceError,
} from "../../packages/runtime/src/index.js";

const run = promisify(execFile);
const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

async function gitFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "cerberpeck-runtime-git-"));
  fixtures.push(root);
  await run("git", ["init", "-q"], {cwd: root});
  await run("git", ["config", "user.email", "test@example.com"], {cwd: root});
  await run("git", ["config", "user.name", "Test"], {cwd: root});
  await writeFile(path.join(root, "app.txt"), "one\ntwo\nthree\n", "utf8");
  await writeFile(path.join(root, ".gitignore"), ".cerberpeck/\n", "utf8");
  await run("git", ["add", "."], {cwd: root});
  await run("git", ["commit", "-qm", "initial"], {cwd: root});
  return root;
}

describe("candidate workspace and apply transaction", () => {
  it("preserves dirty state, merges independent edits, then undo and redo the whole session", async () => {
    const workspace = await gitFixture();
    await writeFile(path.join(workspace, "dirty.txt"), "untracked at session start\n", "utf8");
    await writeFile(path.join(workspace, "app.txt"), "one\ntwo dirty\nthree\n", "utf8");
    const driver = new WorkspaceDriver(workspace);
    const sessionId = "cp_runtime_git";
    await driver.snapshot(sessionId, "2026-07-23T00:00:00.000Z");
    const candidate = await driver.createCandidate(sessionId, "challenger", {
      now: "2026-07-23T00:01:00.000Z",
    });

    expect(await readFile(path.join(candidate.candidatePath, "dirty.txt"), "utf8"))
      .toBe("untracked at session start\n");
    await writeFile(path.join(candidate.candidatePath, "app.txt"), "ONE\ntwo dirty\nthree\n", "utf8");
    await writeFile(path.join(candidate.candidatePath, "new.txt"), "candidate\n", "utf8");
    await writeFile(path.join(workspace, "app.txt"), "one\ntwo dirty\nTHREE\n", "utf8");

    const applied = await new ApplyManager(workspace).apply(
      sessionId,
      "challenger",
      "2026-07-23T00:02:00.000Z",
    );
    expect(applied.transaction.status).toBe("applied");
    expect(await readFile(path.join(workspace, "app.txt"), "utf8"))
      .toBe("ONE\ntwo dirty\nTHREE\n");
    expect(await readFile(path.join(workspace, "new.txt"), "utf8")).toBe("candidate\n");

    await writeFile(path.join(workspace, "new.txt"), "post-apply user edit\n", "utf8");
    const manager = new ApplyManager(workspace);
    expect((await manager.undo(sessionId, "2026-07-23T00:03:00.000Z")).status).toBe("undone");
    expect(await readFile(path.join(workspace, "app.txt"), "utf8"))
      .toBe("one\ntwo dirty\nTHREE\n");
    await expect(readFile(path.join(workspace, "new.txt"), "utf8")).rejects.toMatchObject({code: "ENOENT"});

    expect((await manager.redo(sessionId, "2026-07-23T00:04:00.000Z")).status).toBe("redone");
    expect(await readFile(path.join(workspace, "app.txt"), "utf8"))
      .toBe("ONE\ntwo dirty\nTHREE\n");
    expect(await readFile(path.join(workspace, "new.txt"), "utf8"))
      .toBe("post-apply user edit\n");
  });

  it("detects a same-line conflict before changing any original file", async () => {
    const workspace = await gitFixture();
    const driver = new WorkspaceDriver(workspace);
    const sessionId = "cp_runtime_conflict";
    await driver.snapshot(sessionId);
    const candidate = await driver.createCandidate(sessionId, "challenger");
    await writeFile(path.join(candidate.candidatePath, "app.txt"), "candidate\ntwo\nthree\n", "utf8");
    await writeFile(path.join(candidate.candidatePath, "new.txt"), "must not appear\n", "utf8");
    await writeFile(path.join(workspace, "app.txt"), "original edit\ntwo\nthree\n", "utf8");

    await expect(new ApplyManager(workspace).apply(sessionId, "challenger"))
      .rejects.toMatchObject<Partial<WorkspaceError>>({code: "WORKSPACE_CONFLICT"});
    expect(await readFile(path.join(workspace, "app.txt"), "utf8"))
      .toBe("original edit\ntwo\nthree\n");
    await expect(readFile(path.join(workspace, "new.txt"), "utf8")).rejects.toMatchObject({code: "ENOENT"});
  });

  it("uses the same transaction model outside Git", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cerberpeck-runtime-directory-"));
    fixtures.push(root);
    await mkdir(path.join(root, "src"), {recursive: true});
    await writeFile(path.join(root, "src", "index.html"), "before\n", "utf8");
    const driver = new WorkspaceDriver(root);
    const sessionId = "cp_runtime_plain";
    await driver.snapshot(sessionId);
    const candidate = await driver.createCandidate(sessionId, "challenger");
    expect(candidate.driver).toBe("directory-copy");
    await writeFile(path.join(candidate.candidatePath, "src", "index.html"), "after\n", "utf8");
    await new ApplyManager(root).apply(sessionId, "challenger");
    expect(await readFile(path.join(root, "src", "index.html"), "utf8")).toBe("after\n");
    await new ApplyManager(root).undo(sessionId);
    expect(await readFile(path.join(root, "src", "index.html"), "utf8")).toBe("before\n");
  });
});

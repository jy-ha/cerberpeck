import {chmod, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
  assertSafeRelativePath,
  captureSnapshot,
  restoreSnapshot,
} from "../../packages/runtime/src/index.js";

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("runtime snapshot files", () => {
  it("round-trips files, modes, symlinks and absent paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cerberpeck-snapshot-"));
    fixtures.push(root);
    const workspace = path.join(root, "workspace");
    const snapshot = path.join(root, "snapshot");
    await mkdir(path.join(workspace, "src"), {recursive: true});
    await writeFile(path.join(workspace, "src", "run.sh"), "#!/bin/sh\n", "utf8");
    await chmod(path.join(workspace, "src", "run.sh"), 0o755);
    await symlink("run.sh", path.join(workspace, "src", "current"));

    await captureSnapshot(workspace, snapshot, {paths: ["src/run.sh", "src/current", "missing.txt"]});
    await writeFile(path.join(workspace, "src", "run.sh"), "changed\n", "utf8");
    await writeFile(path.join(workspace, "missing.txt"), "remove me\n", "utf8");
    await rm(path.join(workspace, "src", "current"));
    await restoreSnapshot(workspace, snapshot);

    expect(await readFile(path.join(workspace, "src", "run.sh"), "utf8")).toBe("#!/bin/sh\n");
    expect((await lstat(path.join(workspace, "src", "run.sh"))).mode & 0o777).toBe(0o755);
    expect((await lstat(path.join(workspace, "src", "current"))).isSymbolicLink()).toBe(true);
    await expect(lstat(path.join(workspace, "missing.txt"))).rejects.toMatchObject({code: "ENOENT"});
  });

  it("rejects paths that escape the workspace", () => {
    expect(() => assertSafeRelativePath("../outside")).toThrow("Unsafe workspace path");
    expect(() => assertSafeRelativePath("/absolute")).toThrow("Unsafe workspace path");
  });
});

import {mkdtemp, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {detectRunRecipes} from "../../packages/runtime/src/index.js";

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "cerberpeck-detector-"));
  fixtures.push(root);
  return root;
}

describe("run recipe detector", () => {
  it("detects static HTML with an argv-only local recipe", async () => {
    const root = await fixture();
    await writeFile(path.join(root, "index.html"), "ok\n", "utf8");
    const [recipe] = await detectRunRecipes({cwd: root, cliExecutable: "/tmp/cerberpeck", port: 4567});
    expect(recipe?.detector).toBe("static-html");
    expect(recipe?.start.argv).toEqual([
      process.execPath,
      "/tmp/cerberpeck",
      "__serve-static",
      "--root",
      root,
      "--port",
      "4567",
    ]);
  });

  it.each([
    ["vite", "vite", ["--host", "127.0.0.1", "--port", "4567"]],
    ["next", "next", ["--hostname", "127.0.0.1", "--port", "4567"]],
  ] as const)("detects a %s development script", async (detector, dependency, expectedArgs) => {
    const root = await fixture();
    await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({scripts: {dev: `${dependency} dev`}, devDependencies: {[dependency]: "1.0.0"}}),
      "utf8",
    );
    const [recipe] = await detectRunRecipes({cwd: root, cliExecutable: "cli", port: 4567});
    expect(recipe?.detector).toBe(detector);
    expect(recipe?.start.argv).toEqual(["pnpm", "run", "dev", "--", ...expectedArgs]);
  });
});

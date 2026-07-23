import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {buildSkillBundles} from "../../packages/skill-builder/src/index.js";

const outputs: string[] = [];

afterEach(async () => {
  await Promise.all(outputs.splice(0).map((output) => rm(output, {recursive: true, force: true})));
});

describe("skill bundle builder", () => {
  it("builds host bundles with identical common references", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "cerberpeck-skills-"));
    outputs.push(output);
    const manifests = await buildSkillBundles({
      sourceRoot: path.resolve("skill-src"),
      outputRoot: output,
      version: "0.1.0-test",
    });

    expect(manifests).toHaveLength(2);
    const codexWorkflow = await readFile(
      path.join(output, "codex", "cerberpeck", "references", "workflow.md"),
      "utf8",
    );
    const claudeWorkflow = await readFile(
      path.join(output, "claude", "cerberpeck", "references", "workflow.md"),
      "utf8",
    );
    expect(codexWorkflow).toBe(claudeWorkflow);
    expect(await readFile(path.join(output, "codex", "cerberpeck", "agents", "openai.yaml"), "utf8"))
      .toContain("$cerberpeck");
    const codexSkill = await readFile(path.join(output, "codex", "cerberpeck", "SKILL.md"), "utf8");
    const claudeSkill = await readFile(path.join(output, "claude", "cerberpeck", "SKILL.md"), "utf8");
    expect(codexSkill).toContain("standalone shorthand cbp");
    expect(codexSkill).toContain("Remove that token");
    expect(claudeSkill).toContain("standalone shorthand cbp");
  });
});

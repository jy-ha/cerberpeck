import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {install, InstallerError, uninstall} from "../../packages/installer/src/index.js";

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => rm(fixture, {recursive: true, force: true})));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "cerberpeck-installer-"));
  fixtures.push(root);
  const workspace = path.join(root, "workspace");
  const assets = path.join(root, "assets");
  const cli = path.join(root, "cerberpeck.mjs");
  await mkdir(workspace, {recursive: true});
  await writeFile(cli, "#!/usr/bin/env node\nconsole.log('cerberpeck')\n", "utf8");
  for (const host of ["codex", "claude"] as const) {
    const skill = path.join(assets, host, "cerberpeck");
    await mkdir(path.join(skill, "references"), {recursive: true});
    await writeFile(
      path.join(skill, "SKILL.md"),
      `---\nname: cerberpeck\ndescription: test\n---\n${host}\n`,
      "utf8",
    );
    await writeFile(path.join(skill, "references", "workflow.md"), "workflow\n", "utf8");
  }
  return {root, workspace, assets, cli};
}

describe("installer", () => {
  it("installs both workspace skills and removes them by manifest", async () => {
    const {workspace, assets, cli} = await fixture();
    const installed = await install({
      scope: "workspace",
      workspace,
      hosts: ["codex", "claude"],
      browser: "none",
      version: "0.1.0",
      cliSource: cli,
      skillsSource: assets,
      now: "2026-07-23T00:00:00.000Z",
    });

    expect(installed.manifest.hosts).toEqual(["codex", "claude"]);
    expect((await stat(path.join(workspace, ".cerberpeck", "bin", "cerberpeck"))).mode & 0o111)
      .not.toBe(0);
    expect(await readFile(path.join(workspace, ".agents", "skills", "cerberpeck", "SKILL.md"), "utf8"))
      .toContain("codex");

    const partial = await uninstall({scope: "workspace", workspace, hosts: ["claude"]});
    expect(partial.remainingHosts).toEqual(["codex"]);
    await expect(stat(path.join(workspace, ".cerberpeck", "bin", "cerberpeck"))).resolves.toBeDefined();
    await expect(stat(path.join(workspace, ".claude", "skills", "cerberpeck", "SKILL.md"))).rejects
      .toMatchObject({code: "ENOENT"});

    const final = await uninstall({scope: "workspace", workspace});
    expect(final.remainingHosts).toEqual([]);
    await expect(stat(path.join(workspace, ".cerberpeck", "bin", "cerberpeck"))).rejects
      .toMatchObject({code: "ENOENT"});
  });

  it("backs up and replaces a modified owned file during reinstall", async () => {
    const {workspace, assets, cli} = await fixture();
    const request = {
      scope: "workspace" as const,
      workspace,
      hosts: ["codex"] as const,
      browser: "none" as const,
      version: "0.1.0",
      cliSource: cli,
      skillsSource: assets,
      now: "2026-07-23T00:00:00.000Z",
    };
    await install(request);
    const skill = path.join(workspace, ".agents", "skills", "cerberpeck", "SKILL.md");
    await writeFile(skill, "user modified\n", "utf8");
    const reinstalled = await install({...request, now: "2026-07-23T00:01:00.000Z"});

    expect(reinstalled.backupDirectory).toBeDefined();
    expect(await readFile(skill, "utf8")).toContain("codex");
    expect(await readFile(path.join(reinstalled.backupDirectory!, ".agents/skills/cerberpeck/SKILL.md"), "utf8"))
      .toBe("user modified\n");
  });

  it("purges every Cerberpeck workspace artifact including modified skills", async () => {
    const {workspace, assets, cli} = await fixture();
    await install({
      scope: "workspace",
      workspace,
      hosts: ["codex", "claude"],
      browser: "none",
      version: "0.1.0",
      cliSource: cli,
      skillsSource: assets,
    });
    const modifiedSkill = path.join(workspace, ".agents", "skills", "cerberpeck", "SKILL.md");
    await writeFile(modifiedSkill, "locally modified\n", "utf8");
    await mkdir(path.join(workspace, ".cerberpeck", "cache"), {recursive: true});
    await writeFile(path.join(workspace, ".cerberpeck", "cache", "artifact"), "cache\n", "utf8");
    await writeFile(path.join(workspace, "cerberpeck.toml"), "max_rounds = 10\n", "utf8");

    const result = await uninstall({scope: "workspace", workspace, purge: true});

    expect(result).toMatchObject({preserved: [], remainingHosts: []});
    await expect(stat(path.join(workspace, ".cerberpeck"))).rejects.toMatchObject({code: "ENOENT"});
    await expect(stat(path.join(workspace, ".agents", "skills", "cerberpeck"))).rejects
      .toMatchObject({code: "ENOENT"});
    await expect(stat(path.join(workspace, ".claude", "skills", "cerberpeck"))).rejects
      .toMatchObject({code: "ENOENT"});
    await expect(stat(path.join(workspace, "cerberpeck.toml"))).rejects.toMatchObject({code: "ENOENT"});
  });

  it("purges known workspace targets when the install manifest is missing", async () => {
    const {workspace, assets, cli} = await fixture();
    await install({
      scope: "workspace",
      workspace,
      hosts: ["codex"],
      browser: "none",
      version: "0.1.0",
      cliSource: cli,
      skillsSource: assets,
    });
    await rm(path.join(workspace, ".cerberpeck", "install-manifest.json"));

    await uninstall({scope: "workspace", workspace, purge: true});

    await expect(stat(path.join(workspace, ".cerberpeck"))).rejects.toMatchObject({code: "ENOENT"});
    await expect(stat(path.join(workspace, ".agents", "skills", "cerberpeck"))).rejects
      .toMatchObject({code: "ENOENT"});
  });

  it("rejects a foreign target unless force is explicit", async () => {
    const {workspace, assets, cli} = await fixture();
    const foreign = path.join(workspace, ".agents", "skills", "cerberpeck", "SKILL.md");
    await mkdir(path.dirname(foreign), {recursive: true});
    await writeFile(foreign, "foreign\n", "utf8");

    await expect(
      install({
        scope: "workspace",
        workspace,
        hosts: ["codex"],
        browser: "none",
        version: "0.1.0",
        cliSource: cli,
        skillsSource: assets,
      }),
    ).rejects.toBeInstanceOf(InstallerError);
    expect(await readFile(foreign, "utf8")).toBe("foreign\n");
  });

  it("owns and removes only its global PATH profile block", async () => {
    const {root, workspace, assets, cli} = await fixture();
    const home = path.join(root, "home");
    const data = path.join(root, "data");
    await mkdir(home, {recursive: true});
    await writeFile(path.join(home, ".profile"), "export USER_SETTING=1\n", "utf8");
    const installed = await install({
        scope: "global",
        workspace,
        home,
        xdgDataHome: data,
        hosts: ["codex"],
        browser: "none",
        version: "0.1.0",
        cliSource: cli,
        skillsSource: assets,
        shell: "/bin/sh",
        pathValue: "/usr/bin:/bin",
      });
      expect(installed.manifest.path_changes).toEqual([".profile"]);
      expect(await readFile(path.join(home, ".profile"), "utf8")).toContain("cerberpeck PATH");
      await uninstall({scope: "global", workspace, home, xdgDataHome: data});
      expect(await readFile(path.join(home, ".profile"), "utf8")).toBe("export USER_SETTING=1\n");
  });

  it("purges global skills, CLI, data, backups, and the owned PATH block", async () => {
    const {root, workspace, assets, cli} = await fixture();
    const home = path.join(root, "home");
    const data = path.join(root, "data");
    await mkdir(home, {recursive: true});
    await writeFile(path.join(home, ".profile"), "export USER_SETTING=1\n", "utf8");
    await install({
      scope: "global",
      workspace,
      home,
      xdgDataHome: data,
      hosts: ["codex", "claude"],
      browser: "none",
      version: "0.1.0",
      cliSource: cli,
      skillsSource: assets,
      shell: "/bin/sh",
      pathValue: "/usr/bin:/bin",
    });
    await mkdir(path.join(data, "cerberpeck", "backups", "old"), {recursive: true});
    await writeFile(path.join(data, "cerberpeck", "backups", "old", "file"), "backup\n", "utf8");
    await writeFile(path.join(home, ".claude", "skills", "cerberpeck", "SKILL.md"), "modified\n", "utf8");

    await uninstall({scope: "global", workspace, home, xdgDataHome: data, purge: true});

    await expect(stat(path.join(home, ".local", "bin", "cerberpeck"))).rejects
      .toMatchObject({code: "ENOENT"});
    await expect(stat(path.join(home, ".agents", "skills", "cerberpeck"))).rejects
      .toMatchObject({code: "ENOENT"});
    await expect(stat(path.join(home, ".claude", "skills", "cerberpeck"))).rejects
      .toMatchObject({code: "ENOENT"});
    await expect(stat(path.join(data, "cerberpeck"))).rejects.toMatchObject({code: "ENOENT"});
    expect(await readFile(path.join(home, ".profile"), "utf8")).toBe("export USER_SETTING=1\n");
  });
});

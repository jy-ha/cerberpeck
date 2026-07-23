import {createHash} from "node:crypto";
import {cp, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import path from "node:path";

export type SkillHost = "codex" | "claude";

export interface SkillBundleManifest {
  schema_version: 1;
  skill_version: string;
  protocol_version: 1;
  host: SkillHost;
  files: Array<{path: string; sha256: string}>;
}

export async function buildSkillBundles(input: {
  sourceRoot: string;
  outputRoot: string;
  version: string;
}): Promise<SkillBundleManifest[]> {
  const sourceRoot = path.resolve(input.sourceRoot);
  const outputRoot = path.resolve(input.outputRoot);
  await rm(outputRoot, {recursive: true, force: true});

  const manifests: SkillBundleManifest[] = [];
  for (const host of ["codex", "claude"] as const) {
    const target = path.join(outputRoot, host, "cerberpeck");
    await mkdir(target, {recursive: true});
    await cp(path.join(sourceRoot, "common", "references"), path.join(target, "references"), {
      recursive: true,
    });
    await cp(path.join(sourceRoot, host, "SKILL.md"), path.join(target, "SKILL.md"));
    if (host === "codex") {
      await cp(path.join(sourceRoot, host, "agents"), path.join(target, "agents"), {
        recursive: true,
      });
    }

    await validateSkill(path.join(target, "SKILL.md"));
    const files = await checksums(target);
    const manifest: SkillBundleManifest = {
      schema_version: 1,
      skill_version: input.version,
      protocol_version: 1,
      host,
      files,
    };
    await writeFile(
      path.join(target, "bundle-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    manifests.push(manifest);
  }
  return manifests;
}

async function validateSkill(skillPath: string): Promise<void> {
  const content = await readFile(skillPath, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) {
    throw new Error(`Missing YAML frontmatter: ${skillPath}`);
  }
  const keys = match[1]!
    .split("\n")
    .filter((line) => /^[a-zA-Z_][a-zA-Z0-9_-]*:/.test(line))
    .map((line) => line.slice(0, line.indexOf(":")));
  if (keys.length !== 2 || !keys.includes("name") || !keys.includes("description")) {
    throw new Error(`SKILL.md frontmatter must contain only name and description: ${skillPath}`);
  }
  if (!content.includes("CERBERPECK_CHILD=1")) {
    throw new Error(`SKILL.md is missing recursion guard: ${skillPath}`);
  }
}

async function checksums(root: string): Promise<Array<{path: string; sha256: string}>> {
  const files = await listFiles(root);
  return Promise.all(
    files.map(async (file) => ({
      path: path.relative(root, file).split(path.sep).join("/"),
      sha256: createHash("sha256").update(await readFile(file)).digest("hex"),
    })),
  );
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {withFileTypes: true});
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

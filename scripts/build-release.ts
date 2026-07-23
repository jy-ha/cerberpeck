import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {chmod, cp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";

const run = promisify(execFile);
const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {version: string};
const releaseRoot = path.join(root, "dist", "release");
const staging = path.join(releaseRoot, ".staging", "cerberpeck");
await rm(releaseRoot, {recursive: true, force: true});
await mkdir(staging, {recursive: true});
await cp(path.join(root, "dist", "cerberpeck.cjs"), path.join(staging, "cerberpeck.cjs"));
await cp(path.join(root, "dist", "skills"), path.join(staging, "skills"), {recursive: true});

const artifacts: Record<string, {file: string; sha256: string; runtime: "node24"}> = {};
const checksums: string[] = [];
for (const platform of ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]) {
  const file = `cerberpeck-${packageJson.version}-${platform}.tar.gz`;
  const target = path.join(releaseRoot, file);
  await run("tar", ["-czf", target, "-C", path.dirname(staging), path.basename(staging)]);
  const sha256 = createHash("sha256").update(await readFile(target)).digest("hex");
  artifacts[platform] = {file, sha256, runtime: "node24"};
  checksums.push(`${sha256}  ${file}`);
}
await writeFile(path.join(releaseRoot, "release-manifest.json"), `${JSON.stringify({
  schema_version: 1,
  version: packageJson.version,
  artifacts,
}, null, 2)}\n`, "utf8");
await writeFile(path.join(releaseRoot, "checksums.txt"), `${checksums.join("\n")}\n`, "utf8");
await cp(path.join(root, "install.sh"), path.join(releaseRoot, "install.sh"));
await chmod(path.join(releaseRoot, "install.sh"), 0o755);
await cp(path.join(root, "uninstall.sh"), path.join(releaseRoot, "uninstall.sh"));
await chmod(path.join(releaseRoot, "uninstall.sh"), 0o755);
await rm(path.join(releaseRoot, ".staging"), {recursive: true, force: true});
process.stdout.write(`Built ${Object.keys(artifacts).length} portable release artifacts in dist/release.\n`);

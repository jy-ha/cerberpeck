import {execFile} from "node:child_process";
import {randomUUID} from "node:crypto";
import {lstat, mkdir, readFile, rename, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import {WorkspaceError} from "./errors.js";
import {
  captureSnapshot,
  entriesEqual,
  readSnapshot,
  resetAndRestoreDirectory,
  snapshotMap,
} from "./files.js";
import {
  type CandidateManifest,
  CandidateManifestSchema,
  type SnapshotEntry,
} from "./schemas.js";

const execFileAsync = promisify(execFile);
const SESSION_ID_PATTERN = /^cp_[a-zA-Z0-9_-]+$/;
const CANDIDATE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export interface CandidateDiff {
  sessionId: string;
  candidateId: string;
  added: string[];
  modified: string[];
  deleted: string[];
  touchedPaths: string[];
}

export class WorkspaceDriver {
  readonly workspace: string;

  constructor(workspace: string) {
    this.workspace = path.resolve(workspace);
  }

  async snapshot(sessionId: string, now = new Date().toISOString()): Promise<{snapshotPath: string; files: number}> {
    assertSessionId(sessionId);
    const destination = this.baselinePath(sessionId);
    const manifest = await captureSnapshot(this.workspace, destination, {now});
    return {snapshotPath: destination, files: manifest.entries.length};
  }

  async createCandidate(
    sessionId: string,
    candidateId: string,
    options: {fromCandidate?: string; now?: string} = {},
  ): Promise<CandidateManifest> {
    assertSessionId(sessionId);
    assertCandidateId(candidateId);
    if (options.fromCandidate) assertCandidateId(options.fromCandidate);
    const baseline = this.baselinePath(sessionId);
    await readSnapshot(baseline);
    const sourceSnapshot = options.fromCandidate
      ? await this.refreshCandidateSnapshot(sessionId, options.fromCandidate)
      : baseline;
    const candidatePath = this.candidateWorktreePath(sessionId, candidateId);
    if (await pathExists(candidatePath)) {
      throw new WorkspaceError("WORKSPACE_INVALID", `Candidate already exists: ${candidateId}`);
    }

    const gitHead = await this.gitHead();
    let driver: CandidateManifest["driver"];
    if (gitHead) {
      driver = "git-worktree";
      await mkdir(path.dirname(candidatePath), {recursive: true});
      try {
        await execFileAsync("git", ["worktree", "add", "--detach", candidatePath, gitHead], {
          cwd: this.workspace,
        });
      } catch (error) {
        throw new WorkspaceError("GIT_FAILED", "Could not create isolated Git worktree", {cause: error});
      }
      await resetAndRestoreDirectory(candidatePath, sourceSnapshot, [".git"]);
    } else {
      driver = "directory-copy";
      await resetAndRestoreDirectory(candidatePath, sourceSnapshot);
    }

    const manifest = CandidateManifestSchema.parse({
      schemaVersion: 1,
      sessionId,
      candidateId,
      driver,
      workspace: this.workspace,
      candidatePath,
      baselineSnapshot: baseline,
      ...(gitHead ? {gitHead} : {}),
      createdAt: options.now ?? new Date().toISOString(),
    });
    await atomicJson(this.candidateManifestPath(sessionId, candidateId), manifest);
    return manifest;
  }

  async readCandidate(sessionId: string, candidateId: string): Promise<CandidateManifest> {
    assertSessionId(sessionId);
    assertCandidateId(candidateId);
    try {
      return CandidateManifestSchema.parse(
        JSON.parse(await readFile(this.candidateManifestPath(sessionId, candidateId), "utf8")) as unknown,
      );
    } catch (error) {
      throw new WorkspaceError("WORKSPACE_INVALID", `Candidate not found or invalid: ${candidateId}`, {
        cause: error,
      });
    }
  }

  async diffCandidate(sessionId: string, candidateId: string): Promise<CandidateDiff> {
    const candidateSnapshot = await this.refreshCandidateSnapshot(sessionId, candidateId);
    const baseline = await readSnapshot(this.baselinePath(sessionId));
    const candidate = await readSnapshot(candidateSnapshot);
    const baselineEntries = snapshotMap(baseline);
    const candidateEntries = snapshotMap(candidate);
    const allPaths = [...new Set([...baselineEntries.keys(), ...candidateEntries.keys()])].sort();
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    for (const relativePath of allPaths) {
      const before = baselineEntries.get(relativePath);
      const after = candidateEntries.get(relativePath);
      if (entriesEqual(before, after)) continue;
      if (!before || before.kind === "absent") added.push(relativePath);
      else if (!after || after.kind === "absent") deleted.push(relativePath);
      else modified.push(relativePath);
    }
    return {
      sessionId,
      candidateId,
      added,
      modified,
      deleted,
      touchedPaths: [...added, ...modified, ...deleted].sort(),
    };
  }

  baselinePath(sessionId: string): string {
    assertSessionId(sessionId);
    return path.join(this.workspace, ".cerberpeck", "sessions", sessionId, "workspace", "baseline");
  }

  candidateSnapshotPath(sessionId: string, candidateId: string): string {
    return path.join(this.candidateMetadataPath(sessionId, candidateId), "snapshot");
  }

  private async refreshCandidateSnapshot(sessionId: string, candidateId: string): Promise<string> {
    const candidate = await this.readCandidate(sessionId, candidateId);
    const destination = this.candidateSnapshotPath(sessionId, candidateId);
    await captureSnapshot(candidate.candidatePath, destination);
    return destination;
  }

  private candidateWorktreePath(sessionId: string, candidateId: string): string {
    assertSessionId(sessionId);
    assertCandidateId(candidateId);
    return path.join(this.workspace, ".cerberpeck", "worktrees", sessionId, candidateId);
  }

  private candidateMetadataPath(sessionId: string, candidateId: string): string {
    assertSessionId(sessionId);
    assertCandidateId(candidateId);
    return path.join(this.workspace, ".cerberpeck", "sessions", sessionId, "candidates", candidateId);
  }

  private candidateManifestPath(sessionId: string, candidateId: string): string {
    return path.join(this.candidateMetadataPath(sessionId, candidateId), "candidate.json");
  }

  private async gitHead(): Promise<string | undefined> {
    try {
      const {stdout} = await execFileAsync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd: this.workspace,
      });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }
}

export function entryOrAbsent(entry: SnapshotEntry | undefined, relativePath: string): SnapshotEntry {
  return entry ?? {path: relativePath, kind: "absent"};
}

function assertSessionId(value: string): void {
  if (!SESSION_ID_PATTERN.test(value)) {
    throw new WorkspaceError("WORKSPACE_INVALID", `Invalid session id: ${value}`);
  }
}

function assertCandidateId(value: string): void {
  if (!CANDIDATE_ID_PATTERN.test(value)) {
    throw new WorkspaceError("WORKSPACE_INVALID", `Invalid candidate id: ${value}`);
  }
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), {recursive: true});
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  await rename(temporary, filePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

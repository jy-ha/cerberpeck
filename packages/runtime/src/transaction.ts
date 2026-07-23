import {execFile} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdir, readFile, readdir, rename, rm, writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import {WorkspaceError} from "./errors.js";
import {
  captureSnapshot,
  entriesEqual,
  entryBytes,
  readSnapshot,
  restoreSnapshot,
  snapshotMap,
  writeSnapshotFromEntries,
} from "./files.js";
import {
  type ApplyTransaction,
  ApplyTransactionSchema,
  type SnapshotEntry,
} from "./schemas.js";
import {entryOrAbsent, WorkspaceDriver} from "./workspace.js";

const execFileAsync = promisify(execFile);

export interface ApplyResult {
  transaction: ApplyTransaction;
  conflicts: string[];
}

export class ApplyManager {
  readonly workspace: string;
  readonly driver: WorkspaceDriver;

  constructor(workspace: string) {
    this.workspace = path.resolve(workspace);
    this.driver = new WorkspaceDriver(this.workspace);
  }

  async apply(sessionId: string, candidateId: string, now = new Date().toISOString()): Promise<ApplyResult> {
    const diff = await this.driver.diffCandidate(sessionId, candidateId);
    if (diff.touchedPaths.length === 0) {
      throw new WorkspaceError("WORKSPACE_INVALID", "Candidate has no changes to apply");
    }
    const transactionRoot = this.transactionRoot(sessionId);
    if (await pathExists(path.join(transactionRoot, "transaction.json"))) {
      throw new WorkspaceError("TRANSACTION_INVALID", `Session already has an apply transaction: ${sessionId}`);
    }
    await mkdir(transactionRoot, {recursive: true});

    const beforeRoot = path.join(transactionRoot, "before");
    const afterRoot = path.join(transactionRoot, "after");
    const before = await captureSnapshot(this.workspace, beforeRoot, {
      paths: diff.touchedPaths,
      now,
    });
    const baselineRoot = this.driver.baselinePath(sessionId);
    const candidateRoot = this.driver.candidateSnapshotPath(sessionId, candidateId);
    const baseline = await readSnapshot(baselineRoot);
    const candidate = await readSnapshot(candidateRoot);
    const beforeEntries = snapshotMap(before);
    const baselineEntries = snapshotMap(baseline);
    const candidateEntries = snapshotMap(candidate);
    const planned: Array<{entry: SnapshotEntry; bytes?: Buffer}> = [];
    const conflicts: string[] = [];

    for (const relativePath of diff.touchedPaths) {
      const current = entryOrAbsent(beforeEntries.get(relativePath), relativePath);
      const base = entryOrAbsent(baselineEntries.get(relativePath), relativePath);
      const challenger = entryOrAbsent(candidateEntries.get(relativePath), relativePath);
      const resolved = await this.resolvePath({
        relativePath,
        current,
        base,
        challenger,
        beforeRoot,
        baselineRoot,
        candidateRoot,
      });
      if (!resolved) conflicts.push(relativePath);
      else planned.push(resolved);
    }

    if (conflicts.length > 0) {
      await rm(transactionRoot, {recursive: true, force: true});
      throw new WorkspaceError("WORKSPACE_CONFLICT", "Candidate conflicts with current workspace changes", {
        details: {conflicts},
      });
    }

    await writeSnapshotFromEntries(afterRoot, planned, now);
    let transaction = ApplyTransactionSchema.parse({
      schemaVersion: 1,
      sessionId,
      candidateId,
      workspace: this.workspace,
      status: "applied",
      touchedPaths: diff.touchedPaths,
      createdAt: now,
      updatedAt: now,
    });
    await atomicJson(path.join(transactionRoot, "transaction.json"), transaction);
    try {
      await restoreSnapshot(this.workspace, afterRoot);
    } catch (error) {
      try {
        await restoreSnapshot(this.workspace, beforeRoot);
      } catch (rollbackError) {
        throw new WorkspaceError("TRANSACTION_INVALID", "Apply and automatic rollback both failed", {
          details: {rollback: errorMessage(rollbackError)},
          cause: error,
        });
      }
      await rm(transactionRoot, {recursive: true, force: true});
      throw new WorkspaceError("TRANSACTION_INVALID", "Apply failed; original workspace was restored", {
        cause: error,
      });
    }
    transaction = await this.read(sessionId);
    return {transaction, conflicts: []};
  }

  async undo(sessionId: string, now = new Date().toISOString()): Promise<ApplyTransaction> {
    const transaction = await this.read(sessionId);
    if (transaction.status === "undone") return transaction;
    const root = this.transactionRoot(sessionId);
    const redoRoot = path.join(root, "redo");
    await captureSnapshot(this.workspace, redoRoot, {paths: transaction.touchedPaths, now});
    try {
      await restoreSnapshot(this.workspace, path.join(root, "before"));
    } catch (error) {
      try {
        await restoreSnapshot(this.workspace, redoRoot);
      } catch (rollbackError) {
        throw new WorkspaceError("TRANSACTION_INVALID", "Undo and automatic rollback both failed", {
          details: {rollback: errorMessage(rollbackError)},
          cause: error,
        });
      }
      throw new WorkspaceError("TRANSACTION_INVALID", "Undo failed; pre-undo state was restored", {cause: error});
    }
    const updated = ApplyTransactionSchema.parse({...transaction, status: "undone", updatedAt: now});
    await atomicJson(path.join(root, "transaction.json"), updated);
    return updated;
  }

  async redo(sessionId: string, now = new Date().toISOString()): Promise<ApplyTransaction> {
    const transaction = await this.read(sessionId);
    if (transaction.status !== "undone") return transaction;
    const root = this.transactionRoot(sessionId);
    const rollbackRoot = path.join(root, ".redo-rollback");
    await captureSnapshot(this.workspace, rollbackRoot, {paths: transaction.touchedPaths, now});
    try {
      await restoreSnapshot(this.workspace, path.join(root, "redo"));
    } catch (error) {
      try {
        await restoreSnapshot(this.workspace, rollbackRoot);
      } catch (rollbackError) {
        throw new WorkspaceError("TRANSACTION_INVALID", "Redo and automatic rollback both failed", {
          details: {rollback: errorMessage(rollbackError)},
          cause: error,
        });
      }
      throw new WorkspaceError("TRANSACTION_INVALID", "Redo failed; pre-redo state was restored", {cause: error});
    } finally {
      await rm(rollbackRoot, {recursive: true, force: true});
    }
    const updated = ApplyTransactionSchema.parse({...transaction, status: "redone", updatedAt: now});
    await atomicJson(path.join(root, "transaction.json"), updated);
    return updated;
  }

  async read(sessionId: string): Promise<ApplyTransaction> {
    try {
      return ApplyTransactionSchema.parse(
        JSON.parse(await readFile(path.join(this.transactionRoot(sessionId), "transaction.json"), "utf8")) as unknown,
      );
    } catch (error) {
      throw new WorkspaceError("TRANSACTION_INVALID", `Apply transaction not found or invalid: ${sessionId}`, {
        cause: error,
      });
    }
  }

  async hasTransaction(sessionId: string): Promise<boolean> {
    return pathExists(path.join(this.transactionRoot(sessionId), "transaction.json"));
  }

  async latestUndoableSession(): Promise<string> {
    const sessionsRoot = path.join(this.workspace, ".cerberpeck", "sessions");
    const candidates: ApplyTransaction[] = [];
    try {
      for (const entry of await readdir(sessionsRoot, {withFileTypes: true})) {
        if (!entry.isDirectory()) continue;
        try {
          const transaction = await this.read(entry.name);
          if (transaction.status === "applied" || transaction.status === "redone") candidates.push(transaction);
        } catch {
          // Sessions without an apply transaction are not undo candidates.
        }
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new WorkspaceError("TRANSACTION_INVALID", "No applied session found");
      }
      throw error;
    }
    candidates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const latest = candidates[0];
    if (!latest) throw new WorkspaceError("TRANSACTION_INVALID", "No applied session found");
    return latest.sessionId;
  }

  private transactionRoot(sessionId: string): string {
    if (!/^cp_[a-zA-Z0-9_-]+$/.test(sessionId)) {
      throw new WorkspaceError("WORKSPACE_INVALID", `Invalid session id: ${sessionId}`);
    }
    return path.join(this.workspace, ".cerberpeck", "sessions", sessionId, "apply");
  }

  private async resolvePath(input: {
    relativePath: string;
    current: SnapshotEntry;
    base: SnapshotEntry;
    challenger: SnapshotEntry;
    beforeRoot: string;
    baselineRoot: string;
    candidateRoot: string;
  }): Promise<{entry: SnapshotEntry; bytes?: Buffer} | undefined> {
    const {relativePath, current, base, challenger} = input;
    if (entriesEqual(current, base)) return this.cloneEntry(challenger, input.candidateRoot);
    if (entriesEqual(current, challenger)) return this.cloneEntry(current, input.beforeRoot);
    if (entriesEqual(base, challenger)) return this.cloneEntry(current, input.beforeRoot);
    if (current.kind !== "file" || base.kind !== "file" || challenger.kind !== "file") return undefined;

    const mode = mergeScalar(current.mode, base.mode, challenger.mode);
    if (mode === undefined) return undefined;
    const bytes = await mergeFiles(
      snapshotFile(input.beforeRoot, relativePath),
      snapshotFile(input.baselineRoot, relativePath),
      snapshotFile(input.candidateRoot, relativePath),
    );
    if (!bytes) return undefined;
    return {
      entry: {...challenger, mode, sha256: challenger.sha256, size: bytes.length},
      bytes,
    };
  }

  private async cloneEntry(
    entry: SnapshotEntry,
    snapshotRoot: string,
  ): Promise<{entry: SnapshotEntry; bytes?: Buffer}> {
    const bytes = await entryBytes(snapshotRoot, entry);
    return bytes ? {entry, bytes} : {entry};
  }
}

async function mergeFiles(current: string, base: string, challenger: string): Promise<Buffer | undefined> {
  try {
    const {stdout} = await execFileAsync("git", ["merge-file", "--stdout", current, base, challenger], {
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024,
    });
    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  } catch {
    return undefined;
  }
}

function mergeScalar<T>(current: T, base: T, challenger: T): T | undefined {
  if (current === base) return challenger;
  if (challenger === base || current === challenger) return current;
  return undefined;
}

function snapshotFile(root: string, relativePath: string): string {
  return path.join(root, "files", ...relativePath.split("/"));
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), {recursive: true});
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", mode: 0o600});
  await rename(temporary, filePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

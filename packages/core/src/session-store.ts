import {randomUUID} from "node:crypto";
import {
  appendFile,
  copyFile,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import {CerberpeckError} from "./errors.js";
import {type Session, SessionSchema} from "./schemas.js";

export interface SessionReadResult {
  session: Session;
  source: "current" | "previous";
}

export interface UpdateResult<T> {
  session: Session;
  value: T;
  changed: boolean;
}

const SESSION_ID_PATTERN = /^cp_[a-zA-Z0-9_-]+$/;

export class SessionStore {
  readonly workspace: string;
  readonly sessionsRoot: string;

  constructor(workspace: string) {
    this.workspace = path.resolve(workspace);
    this.sessionsRoot = path.join(this.workspace, ".cerberpeck", "sessions");
  }

  async create(session: Session): Promise<Session> {
    const parsed = SessionSchema.parse(session);
    const directory = this.sessionDirectory(parsed.sessionId);
    await mkdir(directory, {recursive: true});
    const currentPath = path.join(directory, "session.json");
    if (await exists(currentPath)) {
      throw new CerberpeckError("STATE_CONFLICT", `Session already exists: ${parsed.sessionId}`);
    }
    await this.writeState(parsed, false);
    await this.appendJournal(parsed.sessionId, {
      type: "session.created",
      revision: parsed.revision,
      at: parsed.createdAt,
      status: parsed.status,
    });
    return parsed;
  }

  async read(sessionId: string): Promise<SessionReadResult> {
    const directory = this.sessionDirectory(sessionId);
    const currentPath = path.join(directory, "session.json");
    const previousPath = path.join(directory, "session.json.prev");

    try {
      return {session: await readSessionFile(currentPath), source: "current"};
    } catch (currentError) {
      try {
        return {session: await readSessionFile(previousPath), source: "previous"};
      } catch (previousError) {
        if (!(await exists(currentPath)) && !(await exists(previousPath))) {
          throw new CerberpeckError("NOT_FOUND", `Session not found: ${sessionId}`);
        }
        throw new CerberpeckError("SESSION_CORRUPT", `Session state is corrupt: ${sessionId}`, {
          details: {
            current: errorMessage(currentError),
            previous: errorMessage(previousError),
          },
          cause: currentError,
        });
      }
    }
  }

  async recover(sessionId: string): Promise<Session> {
    return this.withLock(sessionId, async () => {
      const result = await this.read(sessionId);
      if (result.source === "current") {
        return result.session;
      }
      await this.writeState(result.session, false);
      await this.appendJournal(sessionId, {
        type: "session.recovered",
        revision: result.session.revision,
        at: new Date().toISOString(),
      });
      return result.session;
    });
  }

  async update<T>(
    sessionId: string,
    mutate: (session: Session) => Promise<{session: Session; value: T; changed: boolean}> | {
      session: Session;
      value: T;
      changed: boolean;
    },
  ): Promise<UpdateResult<T>> {
    return this.withLock(sessionId, async () => {
      const current = (await this.read(sessionId)).session;
      const outcome = await mutate(current);
      if (!outcome.changed) {
        return {session: current, value: outcome.value, changed: false};
      }
      const next = SessionSchema.parse({
        ...outcome.session,
        revision: current.revision + 1,
      });
      await this.writeState(next, true);
      await this.appendJournal(sessionId, {
        type: "session.updated",
        revision: next.revision,
        at: next.updatedAt,
        status: next.status,
      });
      return {session: next, value: outcome.value, changed: true};
    });
  }

  async list(): Promise<Session[]> {
    if (!(await exists(this.sessionsRoot))) {
      return [];
    }
    const entries = await readdir(this.sessionsRoot, {withFileTypes: true});
    const sessions: Session[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !SESSION_ID_PATTERN.test(entry.name)) {
        continue;
      }
      try {
        sessions.push((await this.read(entry.name)).session);
      } catch {
        // Corrupt sessions stay discoverable through doctor; list remains usable.
      }
    }
    return sessions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private sessionDirectory(sessionId: string): string {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new CerberpeckError("INVALID_ARGUMENT", "Invalid session id", {
        details: {sessionId},
      });
    }
    return path.join(this.sessionsRoot, sessionId);
  }

  private async writeState(session: Session, preserveCurrent: boolean): Promise<void> {
    const directory = this.sessionDirectory(session.sessionId);
    await mkdir(directory, {recursive: true});
    const currentPath = path.join(directory, "session.json");
    const previousPath = path.join(directory, "session.json.prev");
    const suffix = `${process.pid}-${randomUUID()}`;
    const nextPath = path.join(directory, `.session.${suffix}.tmp`);
    const previousTempPath = path.join(directory, `.session.prev.${suffix}.tmp`);
    const payload = `${JSON.stringify(session, null, 2)}\n`;

    const handle = await open(nextPath, "wx", 0o600);
    try {
      await handle.writeFile(payload, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      if (preserveCurrent && (await exists(currentPath))) {
        await copyFile(currentPath, previousTempPath);
        await rename(previousTempPath, previousPath);
      }
      await rename(nextPath, currentPath);
    } finally {
      await rm(nextPath, {force: true});
      await rm(previousTempPath, {force: true});
    }
  }

  private async appendJournal(sessionId: string, event: Record<string, unknown>): Promise<void> {
    const journalPath = path.join(this.sessionDirectory(sessionId), "journal.jsonl");
    try {
      await appendFile(journalPath, `${JSON.stringify(event)}\n`, {encoding: "utf8", mode: 0o600});
    } catch {
      // State is canonical. Journal failures are diagnostic warnings, not rollback triggers.
    }
  }

  private async withLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const directory = this.sessionDirectory(sessionId);
    await mkdir(directory, {recursive: true});
    const lockPath = path.join(directory, ".lock");
    const deadline = Date.now() + 5_000;
    let handle: Awaited<ReturnType<typeof open>> | undefined;

    while (!handle) {
      try {
        handle = await open(lockPath, "wx", 0o600);
      } catch (error) {
        if (!isAlreadyExists(error)) {
          throw error;
        }
        if (Date.now() >= deadline) {
          throw new CerberpeckError("LOCK_TIMEOUT", `Timed out waiting for session lock: ${sessionId}`, {
            recoverable: true,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    try {
      return await operation();
    } finally {
      await handle.close();
      await rm(lockPath, {force: true});
    }
  }
}

async function readSessionFile(filePath: string): Promise<Session> {
  const content = await readFile(filePath, "utf8");
  return SessionSchema.parse(JSON.parse(content) as unknown);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

function isAlreadyExists(error: unknown): boolean {
  return isNodeError(error) && error.code === "EEXIST";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

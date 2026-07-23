export type WorkspaceErrorCode =
  | "WORKSPACE_CONFLICT"
  | "WORKSPACE_INVALID"
  | "TRANSACTION_INVALID"
  | "GIT_FAILED";

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: WorkspaceErrorCode,
    message: string,
    options: {details?: Record<string, unknown>; cause?: unknown} = {},
  ) {
    super(message, {cause: options.cause});
    this.name = "WorkspaceError";
    this.code = code;
    this.details = options.details ?? {};
  }
}

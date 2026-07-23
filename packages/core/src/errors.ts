export type CerberpeckErrorCode =
  | "INVALID_ARGUMENT"
  | "NOT_FOUND"
  | "SCHEMA_INVALID"
  | "STATE_CONFLICT"
  | "LOCK_TIMEOUT"
  | "SESSION_CORRUPT";

export class CerberpeckError extends Error {
  readonly code: CerberpeckErrorCode;
  readonly details: Record<string, unknown>;
  readonly recoverable: boolean;

  constructor(
    code: CerberpeckErrorCode,
    message: string,
    options: {
      details?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, {cause: options.cause});
    this.name = "CerberpeckError";
    this.code = code;
    this.details = options.details ?? {};
    this.recoverable = options.recoverable ?? false;
  }
}

export class InstallerError extends Error {
  readonly code: "INSTALL_CONFLICT" | "INSTALL_INVALID" | "INSTALL_MISSING";
  readonly details: Record<string, unknown>;

  constructor(
    code: InstallerError["code"],
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "InstallerError";
    this.code = code;
    this.details = details;
  }
}

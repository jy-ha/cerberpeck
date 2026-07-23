import {z} from "zod";

export const SnapshotEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    path: z.string().min(1),
    kind: z.literal("file"),
    mode: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative(),
  }),
  z.object({
    path: z.string().min(1),
    kind: z.literal("symlink"),
    mode: z.number().int().nonnegative(),
    target: z.string(),
  }),
  z.object({path: z.string().min(1), kind: z.literal("absent")}),
]);

export const SnapshotManifestSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.string().datetime(),
  entries: z.array(SnapshotEntrySchema),
});

export const CandidateManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sessionId: z.string().regex(/^cp_[a-zA-Z0-9_-]+$/),
  candidateId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  driver: z.enum(["git-worktree", "directory-copy"]),
  workspace: z.string().min(1),
  candidatePath: z.string().min(1),
  baselineSnapshot: z.string().min(1),
  gitHead: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
});

export const ApplyTransactionSchema = z.object({
  schemaVersion: z.literal(1),
  sessionId: z.string().regex(/^cp_[a-zA-Z0-9_-]+$/),
  candidateId: z.string().min(1),
  workspace: z.string().min(1),
  status: z.enum(["applied", "undone", "redone"]),
  touchedPaths: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SnapshotEntry = z.infer<typeof SnapshotEntrySchema>;
export type SnapshotManifest = z.infer<typeof SnapshotManifestSchema>;
export type CandidateManifest = z.infer<typeof CandidateManifestSchema>;
export type ApplyTransaction = z.infer<typeof ApplyTransactionSchema>;

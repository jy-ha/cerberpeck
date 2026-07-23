import {z} from "zod";

export const SESSION_SCHEMA_VERSION = 1 as const;
export const WORKFLOW_PROTOCOL_VERSION = 1 as const;

export const SessionStatusSchema = z.enum([
  "draft",
  "profiling",
  "clarifying",
  "contracted",
  "baseline_preparing",
  "baseline_reviewing",
  "synthesizing",
  "challenger_building",
  "challenger_validating",
  "comparison_reviewing",
  "deciding",
  "finalizing",
  "applying",
  "completed",
  "undone",
  "interrupted",
  "failed",
  "cancelled",
  "blocked",
]);

export const ActionKindSchema = z.enum([
  "project.profile",
  "contract.create",
  "panel.create",
  "review.baseline",
  "synthesis.create",
  "candidate.build",
  "candidate.validate",
  "review.comparison",
  "decision.make",
]);

export const ActionStatusSchema = z.enum([
  "pending",
  "submitted",
  "accepted",
  "failed",
  "cancelled",
]);

export const ActionSchema = z.object({
  protocolVersion: z.literal(WORKFLOW_PROTOCOL_VERSION),
  actionId: z.string().min(1),
  sessionId: z.string().min(1),
  kind: ActionKindSchema,
  role: z.enum([
    "profiler",
    "contractor",
    "panelist",
    "reviewer",
    "synthesizer",
    "builder",
    "validator",
    "decision-maker",
  ]),
  status: ActionStatusSchema,
  attempt: z.number().int().positive(),
  dependencies: z.array(z.string()),
  execution: z.object({
    context: z.literal("isolated-process"),
    writeAccess: z.boolean(),
    parallelGroup: z.string().optional(),
  }),
  prompt: z.string().min(1),
  outputSchema: z.string().min(1),
  personaId: z.string().min(1).optional(),
  round: z.number().int().positive().optional(),
  candidateId: z.string().min(1).optional(),
  result: z.record(z.unknown()).optional(),
  lastError: z
    .object({
      message: z.string(),
      recoverable: z.boolean(),
      at: z.string().datetime(),
    })
    .optional(),
});

export const SessionSchema = z.object({
  schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
  protocolVersion: z.literal(WORKFLOW_PROTOCOL_VERSION),
  sessionId: z.string().regex(/^cp_[a-zA-Z0-9_-]+$/),
  revision: z.number().int().positive(),
  workspace: z.string().min(1),
  request: z.string().min(1),
  status: SessionStatusSchema,
  workflow: z.object({
    cursor: z.enum([
      "profile",
      "contract",
      "panel",
      "baseline-review",
      "synthesis",
      "build",
      "validate",
      "comparison-review",
      "decision",
      "finalizing",
      "complete",
    ]),
  }),
  experiment: z.object({
    host: z.enum(["codex", "claude"]),
    maxRounds: z.number().int().min(1).max(10).default(10),
    maxConsecutiveRejections: z.number().int().min(1).max(10).default(3),
    round: z.number().int().nonnegative().default(0),
    consecutiveRejections: z.number().int().nonnegative().default(0),
    championCandidateId: z.string().min(1).default("baseline"),
    stopReason: z.string().optional(),
  }).optional(),
  actions: z.array(ActionSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProjectProfileResultSchema = z.object({
  summary: z.string().min(1),
  detectedFramework: z.string().min(1).nullable().optional(),
  runCommand: z.array(z.string().min(1)).nullable().optional(),
});

export const ContractResultSchema = z.object({
  primaryOutcome: z.string().min(1),
  constraints: z.array(z.string()),
  maxRounds: z.number().int().min(1).max(10).default(10),
});

export const PersonaSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  label: z.string().min(1),
  role: z.string().min(1),
  context: z.string().min(1),
  focus: z.array(z.string().min(1)).min(1),
});

export const PanelResultSchema = z.object({
  experts: z.array(z.union([z.string().min(1), PersonaSchema])).min(3).max(5),
  customers: z.array(z.union([z.string().min(1), PersonaSchema])).max(5),
});

export const BaselineReviewResultSchema = z.object({
  summary: z.string().min(1),
  overallScore: z.number().min(1).max(5).multipleOf(0.5),
  strengths: z.array(z.string().min(1)).optional(),
  issues: z.array(z.object({
    severity: z.enum(["low", "medium", "high", "critical"]),
    evidence: z.string().min(1),
    finding: z.string().min(1),
    recommendedDirection: z.string().min(1),
  })).optional(),
});

export const SynthesisResultSchema = z.object({
  title: z.string().min(1),
  rationale: z.string().min(1),
  changes: z.array(z.string().min(1)).max(4),
  stop: z.boolean().default(false),
}).refine((value) => value.stop || value.changes.length > 0, "A continuing hypothesis needs changes");

export const CandidateBuildResultSchema = z.object({
  summary: z.string().min(1),
  changedFiles: z.array(z.string().min(1)),
});

export const CandidateValidateResultSchema = z.object({
  gatesPassed: z.boolean(),
  summary: z.string().min(1),
  artifacts: z.array(z.string()).default([]),
});

export const ComparisonReviewResultSchema = z.object({
  personaId: z.string().min(1),
  preference: z.enum(["A", "B", "tie"]),
  confidence: z.number().int().min(1).max(5),
  scores: z.object({
    A: z.number().min(1).max(5).multipleOf(0.5),
    B: z.number().min(1).max(5).multipleOf(0.5),
  }),
  summary: z.string().min(1),
  blockingIssue: z.string().nullable().default(null),
  winnerStrengths: z.array(z.string().min(1)).optional(),
  regressions: z.array(z.string().min(1)).optional(),
  evidence: z.array(z.string().min(1)).optional(),
});

export const DecisionResultSchema = z.object({
  decision: z.enum(["promote", "reject", "stop"]),
  summary: z.string().min(1),
  stopReason: z.string().nullable().optional(),
});

export const ActionResultSchemas = {
  "project.profile": ProjectProfileResultSchema,
  "contract.create": ContractResultSchema,
  "panel.create": PanelResultSchema,
  "review.baseline": BaselineReviewResultSchema,
  "synthesis.create": SynthesisResultSchema,
  "candidate.build": CandidateBuildResultSchema,
  "candidate.validate": CandidateValidateResultSchema,
  "review.comparison": ComparisonReviewResultSchema,
  "decision.make": DecisionResultSchema,
} satisfies Record<z.infer<typeof ActionKindSchema>, z.ZodTypeAny>;

export type Session = z.infer<typeof SessionSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type ActionKind = z.infer<typeof ActionKindSchema>;

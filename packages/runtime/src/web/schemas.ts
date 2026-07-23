import {z} from "zod";

export const RunRecipeSchema = z.object({
  schemaVersion: z.literal(1),
  detector: z.enum(["static-html", "vite", "next", "package-script", "explicit"]),
  cwd: z.string().min(1),
  start: z.object({
    argv: z.array(z.string()).min(1),
    env: z.record(z.string()).default({}),
  }),
  ready: z.object({
    url: z.string().url(),
    expectedStatus: z.number().int().min(100).max(599).default(200),
    timeoutSeconds: z.number().positive().max(300).default(90),
  }),
  stop: z.object({
    signal: z.literal("SIGTERM").default("SIGTERM"),
    timeoutSeconds: z.number().positive().max(60).default(10),
  }),
  routes: z.array(z.string().startsWith("/")).min(1).default(["/"]),
});

const SelectorSchema = z.string().min(1).max(500);
export const JourneyStepSchema = z.union([
  z.object({action: z.literal("goto"), path: z.string().startsWith("/")}),
  z.object({action: z.literal("click"), selector: SelectorSchema}),
  z.object({action: z.literal("fill"), selector: SelectorSchema, value: z.string().optional(), valueFromEnv: z.string().optional()})
    .refine((step) => (step.value === undefined) !== (step.valueFromEnv === undefined), "fill needs exactly one value source"),
  z.object({action: z.literal("select"), selector: SelectorSchema, value: z.string()}),
  z.object({action: z.literal("press"), selector: SelectorSchema, key: z.string().min(1)}),
  z.object({action: z.literal("wait_for"), selector: SelectorSchema, timeoutMs: z.number().int().positive().max(30_000).optional()}),
  z.object({action: z.literal("expect_visible"), selector: SelectorSchema}),
  z.object({action: z.literal("expect_text"), selector: SelectorSchema, text: z.string()}),
  z.object({action: z.literal("expect_url"), path: z.string().startsWith("/")}),
  z.object({action: z.literal("screenshot"), name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)}),
]);

export const JourneySchema = z.object({
  schemaVersion: z.literal(1).default(1),
  name: z.string().min(1),
  start: z.string().startsWith("/").default("/"),
  steps: z.array(JourneyStepSchema).max(50),
  maskSelectors: z.array(SelectorSchema).default([]),
});

export type RunRecipe = z.infer<typeof RunRecipeSchema>;
export type Journey = z.infer<typeof JourneySchema>;
export type JourneyStep = z.infer<typeof JourneyStepSchema>;

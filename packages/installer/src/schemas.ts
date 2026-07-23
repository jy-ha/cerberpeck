import {z} from "zod";

export const HostSchema = z.enum(["codex", "claude"]);
export const ScopeSchema = z.enum(["workspace", "global"]);
export const BrowserModeSchema = z.enum(["system", "managed", "none"]);

export const InstalledFileSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  owner: z.literal("cerberpeck"),
  component: z.enum(["cli", "skill-codex", "skill-claude"]),
  mode: z.number().int().optional(),
});

export const InstallManifestSchema = z.object({
  schema_version: z.literal(1),
  installation_id: z.string().min(1),
  version: z.string().min(1),
  scope: ScopeSchema,
  root: z.string().min(1),
  workspace: z.string().optional(),
  hosts: z.array(HostSchema).min(1),
  browser: z.object({
    mode: BrowserModeSchema,
    path: z.string().optional(),
  }),
  files: z.array(InstalledFileSchema),
  path_changes: z.array(z.string()),
  installed_at: z.string().datetime(),
});

export type InstallHost = z.infer<typeof HostSchema>;
export type InstallScope = z.infer<typeof ScopeSchema>;
export type BrowserMode = z.infer<typeof BrowserModeSchema>;
export type InstallManifest = z.infer<typeof InstallManifestSchema>;
export type InstalledFile = z.infer<typeof InstalledFileSchema>;
